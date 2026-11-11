import json
import logging
import os
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from supabase import Client
from openai import AsyncOpenAI

from deps import get_current_user, get_db, CurrentUser
from security import validate_chat_messages
from copilot.agent import LANG_SYSTEM, BASE_URL, API_KEY, CHAT_MODEL, FAST_MODEL
from copilot.actions import ACTIONS, execute_action
from copilot.memory import (
    add_message, create_conversation, extract_memories, get_conversation, load_history,
    load_memories, make_title, maybe_summarize, render_memories, save_memory,
)
from copilot.multi_agent import fallback_stream, stream_team

router = APIRouter(prefix="/copilot", tags=["copilot"])
log = logging.getLogger(__name__)


class CopilotRequest(BaseModel):
    # Mode conversation (persisté) : `message` + `conversation_id` optionnel
    # (absent → nouvelle conversation). Ancien mode sans état : `messages`.
    message: Optional[str] = Field(None, max_length=4000)
    conversation_id: Optional[str] = None
    messages: Optional[list[dict]] = None
    language: str = Field("fr", max_length=8)
    deep: bool = False                      # « Analyse approfondie » → Deep Agent
    voice: bool = False                     # message dicté à la voix (affichage)
    call: bool = False                      # appel vocal temps réel : réponses courtes, à l'oral

    @field_validator("messages")
    @classmethod
    def _check_messages(cls, v):
        return validate_chat_messages(v) if v is not None else None

    @field_validator("language")
    @classmethod
    def _check_lang(cls, v):
        return v if v in LANG_SYSTEM else "fr"


def _openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)


def _load_pending(db: Client, user: CurrentUser, action_id: str) -> dict:
    rows = db.from_("copilot_pending_actions").select("*").eq("id", action_id).eq("user_id", user.id).execute().data
    if not rows:
        raise HTTPException(404, "Action introuvable.")
    row = rows[0]
    if row["status"] != "pending":
        raise HTTPException(400, f"Cette action est déjà « {row['status']} ».")
    expires_at = row.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
        db.from_("copilot_pending_actions").update({"status": "expired"}).eq("id", action_id).execute()
        raise HTTPException(400, "Cette proposition d'action a expiré — reformulez votre demande.")
    return row


def _err_detail(e: Exception) -> str:
    return f"{type(e).__name__}: {str(e)[:180]}"


async def _run_team(state: dict, user: CurrentUser, db: Client):
    """Équipe d'agents ; si elle échoue avant d'avoir répondu, repli sur une
    réponse directe. Ne lève jamais : l'erreur finale est renvoyée en texte."""
    produced = False
    try:
        async for ev in stream_team(state, user, db):
            if ev.get("text"):
                produced = True
            yield ev
        return
    except Exception as e:
        log.error("Copilot team error: %s", e, exc_info=True)
        if produced:
            yield {"text": f"\n\n⚠️ Réponse interrompue ({_err_detail(e)})."}
            return
        first = e
    try:
        yield {"reset": True}
        async for ev in fallback_stream(state):
            yield ev
    except Exception as e:
        log.error("Copilot fallback error: %s", e, exc_info=True)
        yield {"text": "Désolé, le service d'IA ne répond pas pour le moment.\n\n"
                       f"Détail technique : {_err_detail(first)} — puis {_err_detail(e)}"}


def _sse(obj: Any) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@router.post("/stream")
async def copilot_stream(
    req: CopilotRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """SSE du Copilote multi-agents. Événements : conversation, agent, step,
    todos, text, reset, action_proposal, title, memory, done, puis [DONE].
    Rien n'est jamais exécuté ici : une action est seulement proposée."""
    roles = user.roles or ["student"]

    # ── Mode sans état (compatibilité) ──
    if not req.message:
        if not req.messages:
            raise HTTPException(422, "message requis")
        state = {"history": req.messages, "roles": roles, "language": req.language,
                 "memory": "", "summary": "", "force_agent": "analyste" if req.deep else None, "voice_mode": req.call}

        async def legacy():
            async for ev in _run_team(state, user, db):
                yield _sse(ev)
            yield "data: [DONE]\n\n"
        return StreamingResponse(legacy(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # ── Mode conversation (persisté, isolé par conversation) ──
    text = req.message.strip()
    if not text:
        raise HTTPException(422, "message vide")
    is_new = not req.conversation_id
    persist, warning = True, None
    try:
        conversation = (create_conversation(db, user.id, text[:60], req.language) if is_new
                        else get_conversation(db, user.id, req.conversation_id))
        add_message(db, conversation["id"], "user", text, {"voice": True} if req.voice else {})
        history, total = load_history(db, conversation["id"])
        memories = load_memories(db, user.id)
    except HTTPException:
        raise
    except Exception as e:
        # Tables L90 absentes (migration non exécutée) ou base indisponible :
        # le Copilote répond quand même, sans historique ni mémoire.
        log.error("Copilot persistence unavailable: %s", e)
        persist = False
        warning = ("Historique et mémoire indisponibles — exécutez la migration "
                   "sql/supabase_l90_copilot_conversations_memory.sql dans Supabase.")
        conversation = {"id": None, "title": text[:60], "summary": ""}
        history, total, memories = [{"role": "user", "content": text}], 1, []
    state = {
        "history": history, "roles": roles, "language": req.language,
        "memory": render_memories(memories), "summary": conversation.get("summary") or "",
        "force_agent": "analyste" if req.deep else None,
        "voice_mode": req.call,
    }

    async def generate():
        client = _openai_client()
        if persist:
            yield _sse({"conversation": {"id": conversation["id"], "title": conversation["title"], "new": is_new}})
        if warning:
            yield _sse({"warning": warning})
        answer, meta = "", {"steps": []}
        async for ev in _run_team(state, user, db):
            if "text" in ev:
                answer += ev["text"]
            elif ev.get("reset"):
                answer = ""
            elif "agent" in ev:
                meta["agent"] = ev["agent"]
            elif "step" in ev:
                meta["steps"].append(ev["step"])
            elif "todos" in ev:
                meta["todos"] = ev["todos"]
            elif "action_proposal" in ev:
                meta["action"] = ev["action_proposal"]
            yield _sse(ev)

        if not persist:
            yield _sse({"done": {"message_id": None}})
            yield "data: [DONE]\n\n"
            return
        try:
            saved = add_message(db, conversation["id"], "assistant", answer, meta)
            yield _sse({"done": {"message_id": saved["id"]}})
        except Exception as e:
            log.error("Copilot save answer failed: %s", e)
            yield _sse({"done": {"message_id": None}})

        if is_new and answer:
            title = await make_title(client, FAST_MODEL, text, answer)
            if title:
                db.from_("copilot_conversations").update({"title": title}).eq("id", conversation["id"]).execute()
                yield _sse({"title": {"id": conversation["id"], "title": title}})
        if answer:
            new_facts = await extract_memories(client, FAST_MODEL, db, user.id, conversation["id"], text, answer)
            if new_facts:
                yield _sse({"memory": [{"id": m["id"], "content": m["content"]} for m in new_facts]})
        await maybe_summarize(client, FAST_MODEL, db, conversation, total + 1)
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Historique des conversations ─────────────────────────────────────────────

class ConversationPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=80)
    pinned: Optional[bool] = None


@router.get("/conversations")
async def list_conversations(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
):
    query = (db.from_("copilot_conversations").select("id, title, language, pinned, created_at, updated_at")
             .eq("user_id", user.id))
    if q:
        query = query.ilike("title", f"%{q.strip()[:60]}%")
    return query.order("pinned", desc=True).order("updated_at", desc=True).limit(200).execute().data or []


@router.get("/conversations/{conversation_id}/messages")
async def conversation_messages(
    conversation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    conv = get_conversation(db, user.id, conversation_id)
    rows = (db.from_("copilot_messages").select("id, role, content, meta, created_at")
            .eq("conversation_id", conv["id"]).order("created_at").limit(500).execute().data or [])
    # Statut à jour des actions proposées (confirmées/annulées depuis).
    ids = [r["meta"]["action"]["id"] for r in rows if (r.get("meta") or {}).get("action")]
    if ids:
        st = {a["id"]: a["status"] for a in (db.from_("copilot_pending_actions").select("id, status")
                                              .in_("id", ids).eq("user_id", user.id).execute().data or [])}
        for r in rows:
            act = (r.get("meta") or {}).get("action")
            if act:
                act["status"] = st.get(act["id"], "pending")
    return {"conversation": conv, "messages": rows}


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    body: ConversationPatch,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    get_conversation(db, user.id, conversation_id)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "Rien à modifier.")
    return db.from_("copilot_conversations").update(patch).eq("id", conversation_id).execute().data[0]


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    get_conversation(db, user.id, conversation_id)
    db.from_("copilot_conversations").delete().eq("id", conversation_id).execute()
    return {"ok": True}


# ── Mémoire à long terme ─────────────────────────────────────────────────────

class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=2, max_length=300)


@router.get("/memories")
async def list_memories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    return load_memories(db, user.id)


@router.post("/memories")
async def add_memory(
    body: MemoryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    return save_memory(db, user.id, body.content)


@router.delete("/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    db.from_("copilot_memories").delete().eq("id", memory_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.delete("/memories")
async def clear_memories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    db.from_("copilot_memories").delete().eq("user_id", user.id).execute()
    return {"ok": True}


# ── Voix : dictée (darija, français, anglais, arabe) et lecture à voix haute ─

STT_MODEL = os.environ.get("COPILOT_STT_MODEL", "whisper-1")
TTS_MODEL = os.environ.get("COPILOT_TTS_MODEL", "gpt-4o-mini-tts")
TTS_VOICE = os.environ.get("COPILOT_TTS_VOICE", "nova")
STT_HINT = {
    "darija": ("ar", "Darija marocaine (dialecte marocain), mélange possible avec du français : "
                     "salam, wakha, bghit, chno, kifach, dyal, l'congé, la paie, la comptabilité."),
    "ar": ("ar", None), "fr": ("fr", None), "en": ("en", None),
}
MAX_AUDIO_BYTES = 10 * 1024 * 1024


@router.post("/transcribe")
async def transcribe(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    audio: UploadFile = File(...),
    language: str = Form("fr"),
):
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Enregistrement vide.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Enregistrement trop long (10 Mo maximum).")
    lang, hint = STT_HINT.get(language, STT_HINT["fr"])
    try:
        res = await _openai_client().audio.transcriptions.create(
            model=STT_MODEL, file=(audio.filename or "voice.webm", data, audio.content_type or "audio/webm"),
            language=lang, **({"prompt": hint} if hint else {}),
        )
        return {"text": (getattr(res, "text", "") or "").strip()}
    except Exception as e:
        log.warning("Copilot transcription failed: %s", e)
        raise HTTPException(503, "Transcription indisponible.")


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    language: str = Field("fr", max_length=8)


TTS_STYLE = {
    "darija": "Parle en darija marocaine, avec un accent marocain naturel, chaleureux et posé.",
    "ar": "تحدث بالعربية الفصحى بوضوح وهدوء.",
    "fr": "Parle en français, ton clair, chaleureux et professionnel.",
    "en": "Speak in English with a clear, warm and professional tone.",
}


@router.post("/speech")
async def speech(
    body: SpeechRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    text = body.text.replace("**", "").replace("#", "")[:1500]
    try:
        kwargs = {"model": TTS_MODEL, "voice": TTS_VOICE, "input": text, "response_format": "mp3"}
        if "tts-1" not in TTS_MODEL:
            kwargs["instructions"] = TTS_STYLE.get(body.language, TTS_STYLE["fr"])
        res = await _openai_client().audio.speech.create(**kwargs)
        return Response(content=res.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
    except Exception as e:
        log.warning("Copilot speech failed: %s", e)
        raise HTTPException(503, "Synthèse vocale indisponible.")


@router.post("/actions/{action_id}/confirm")
async def confirm_action(
    action_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Exécute réellement l'action proposée — seul point d'entrée qui écrit
    quoi que ce soit, jamais appelé automatiquement par le LLM."""
    row = _load_pending(db, user, action_id)
    spec = ACTIONS.get(row["action_key"])
    if spec is None:
        raise HTTPException(400, "Action inconnue (registre modifié depuis la proposition).")

    try:
        result = await execute_action(spec, row.get("path_params") or {}, row.get("payload") or {}, user, db)
        result_json = jsonable(result)
        db.from_("copilot_pending_actions").update({
            "status": "confirmed",
            "result": result_json,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", action_id).execute()
        return {"ok": True, "result": result_json}
    except HTTPException as e:
        db.from_("copilot_pending_actions").update({
            "status": "failed",
            "error": str(e.detail),
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", action_id).execute()
        raise
    except Exception as e:
        db.from_("copilot_pending_actions").update({
            "status": "failed",
            "error": str(e),
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", action_id).execute()
        raise HTTPException(500, f"Échec de l'exécution : {e}")


@router.post("/actions/{action_id}/cancel")
async def cancel_action(
    action_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    row = _load_pending(db, user, action_id)
    db.from_("copilot_pending_actions").update({
        "status": "cancelled",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", row["id"]).execute()
    return {"ok": True}


def jsonable(value: Any) -> Any:
    """Rend le résultat d'un routeur (souvent un dict brut Supabase, parfois
    un modèle Pydantic) sérialisable tel quel pour la colonne jsonb `result`."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


@router.get("/health")
async def copilot_health():
    return {"ok": True, "model": CHAT_MODEL}
