import os
import json
import logging
import uuid
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from openai import AsyncOpenAI

from chatbot.agent import chat_graph, CHAT_MODEL, BASE_URL, API_KEY
from chatbot.airtable_client import extract_lead, save_candidature

router = APIRouter()
log    = logging.getLogger(__name__)

LANG_SYSTEM: dict[str, str] = {
    "fr":     "Tu réponds UNIQUEMENT en français, avec un ton chaleureux et professionnel.",
    "en":     "You respond ONLY in English, with a warm and professional tone.",
    "ar":     "تجيب فقط باللغة العربية الفصحى، بأسلوب دافئ ومهني.",
    "darija": (
        "Katjaweb GHIR b-darija maghribiya (l-lahja lmaghribiya). "
        "Kteb b-7roof latinia (style Franco-arabe) aw b-3arabia. "
        "Ista3mel expressions tab3iya dyal lmaghrib. Koun wdoud o mhtrafi."
    ),
}


class ChatRequest(BaseModel):
    messages:   list[dict]
    session_id: str = ""
    language:   str = "fr"
    stage:      str = "chat"
    slots:      Optional[dict] = {}
    docs:       Optional[dict] = {}

    @field_validator("slots", "docs", mode="before")
    @classmethod
    def coerce_none_to_empty_dict(cls, v):
        """Accept null/None from frontend and treat it as an empty dict."""
        return v if v is not None else {}


class ChatResponse(BaseModel):
    stage:      str
    slots:      dict
    docs:       dict
    session_id: str


def _openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)


def _try_save_lead(messages: list[dict]) -> None:
    try:
        data = extract_lead(messages)
        if data:
            record_id = save_candidature(data)
            log.info("Lead saved to Airtable: %s — %s", record_id, data.get("nom"))
    except Exception as e:
        log.warning("Airtable save failed: %s", e)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/chat/stream — SSE streaming endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, background: BackgroundTasks):
    """
    SSE streaming endpoint.
    Yields: data: {"text": "..."} chunks then data: [DONE]
    Also emits: data: {"meta": {"stage": ..., "slots": ..., "docs": ..., "session_id": ...}}
    before the first text chunk so the frontend can update its state.
    """
    # Ensure a session ID exists
    session_id = req.session_id or str(uuid.uuid4())

    # Try to restore session from Supabase if session_id is provided but no stage/slots
    restored_stage = req.stage
    restored_slots = dict(req.slots)
    restored_docs  = dict(req.docs)
    airtable_record_id = ""

    # Don't restore if user is explicitly starting a new registration
    _reg_kw = ["inscr", "candidat", "sejjel", "تسجيل", "سجل", "سجّل", "أسجل", "dossier", "admission"]
    _last_msg = (req.messages[-1]["content"] if req.messages else "").lower()
    _is_new_reg = any(k in _last_msg for k in _reg_kw)

    if req.session_id and req.stage == "chat" and not req.slots and not _is_new_reg:
        try:
            from chatbot.supabase_client import get_session
            saved = get_session(req.session_id)
            if saved:
                saved_stage = saved.get("stage", "chat")
                # Don't restore a completed session — treat it as fresh chat
                if saved_stage != "confirmed":
                    restored_stage = saved_stage
                    restored_slots = saved.get("slots", {}) or {}
                    restored_docs  = saved.get("docs", {}) or {}
                    airtable_record_id = saved.get("airtable_record_id", "") or ""
                    log.info("Restored session %s (stage=%s)", req.session_id, restored_stage)
                else:
                    log.info("Session %s already confirmed — starting fresh chat", req.session_id)
        except Exception as e:
            log.warning("Session restore failed: %s", e)

    log.info("LANG_DEBUG req.language=%r stage=%r", req.language, restored_stage)

    # Run LangGraph to get the system prompt + updated stage/slots
    intent = "general"
    system_prompt = ""
    out_stage = restored_stage
    out_slots  = restored_slots
    out_docs   = restored_docs

    try:
        state_in = {
            "messages":           req.messages,
            "intent":             "",
            "system_prompt":      "",
            "language":           req.language,
            "stage":              restored_stage,
            "slots":              restored_slots,
            "docs":               restored_docs,
            "session_id":         session_id,
            "airtable_record_id": airtable_record_id,
        }
        state = await chat_graph.ainvoke(state_in)
        system_prompt    = state.get("system_prompt", "")
        hardcoded_reply  = state.get("hardcoded_reply", "")
        intent           = state.get("intent", "general")
        out_stage        = state.get("stage", restored_stage)
        out_slots        = state.get("slots", restored_slots) or {}
        out_docs         = state.get("docs", restored_docs) or {}
    except Exception as exc:
        log.warning("LangGraph failed: %s", exc)
        from chatbot.knowledge import GENERAL_SYSTEM
        system_prompt   = GENERAL_SYSTEM
        hardcoded_reply = ""

    # Prepend language instruction
    lang_instr  = LANG_SYSTEM.get(req.language, LANG_SYSTEM["fr"])
    full_system = f"{lang_instr}\n\n{system_prompt}"

    # Persist session asynchronously if in registration flow
    if out_stage not in ("chat", "") and session_id:
        def _save_session_bg():
            try:
                from chatbot.supabase_client import save_session
                save_session(
                    session_id=session_id,
                    phone=out_slots.get("telephone", ""),
                    messages=req.messages,
                    slots=out_slots,
                    stage=out_stage,
                    docs=out_docs,
                )
            except Exception as e:
                log.warning("Background session save failed: %s", e)
        background.add_task(_save_session_bg)

    async def generate():
        # First chunk: metadata so the frontend can update its local state
        meta = {
            "meta": {
                "stage":      out_stage,
                "slots":      out_slots,
                "docs":       out_docs,
                "session_id": session_id,
            }
        }
        yield f"data: {json.dumps(meta)}\n\n"

        # Hardcoded reply (collect_docs) — stream directly without calling the LLM.
        # Prevents the LLM from going off-script on predictable document request messages.
        if hardcoded_reply:
            yield f"data: {json.dumps({'text': hardcoded_reply})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Stream the LLM response
        client = _openai_client()
        try:
            stream = await client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "system", "content": full_system}] + req.messages,
                max_tokens=800,
                temperature=0.7,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield f"data: {json.dumps({'text': delta.content})}\n\n"
        except Exception as e:
            import traceback
            log.error("LLM stream error: %s\n%s", e, traceback.format_exc())
            yield f"data: {json.dumps({'text': f'Erreur: {type(e).__name__}: {e}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/chat/upload — document upload
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_DOC_TYPES = {"cin", "bac", "photo", "motivation"}
MAX_FILE_SIZE_MB   = 10


@router.post("/chat/upload")
async def chat_upload(
    session_id:    str       = Form(...),
    document_type: str       = Form(...),
    file:          UploadFile = File(...),
):
    """
    Upload a registration document to Supabase Storage.

    Form fields:
      - session_id:    current chat session ID
      - document_type: cin | bac | photo | motivation
      - file:          the file to upload

    Returns: {url, filename, document_type}
    """
    if document_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document_type. Must be one of: {', '.join(ALLOWED_DOC_TYPES)}",
        )

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB} MB.",
        )

    original_filename = file.filename or f"{document_type}_upload"
    # Prefix with doc type to avoid collisions in the same session folder
    safe_filename = f"{document_type}_{original_filename}"

    try:
        from chatbot.supabase_client import upload_document
        public_url = upload_document(
            file_bytes=file_bytes,
            filename=safe_filename,
            session_id=session_id,
        )
    except RuntimeError as e:
        log.error("Upload failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    log.info("Document uploaded: %s → %s", safe_filename, public_url)
    return {
        "url":           public_url,
        "filename":      safe_filename,
        "document_type": document_type,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/chat/session/{session_id} — retrieve session state
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/chat/session/{session_id}")
async def get_chat_session(session_id: str):
    """Return current session state: stage, slots, docs."""
    try:
        from chatbot.supabase_client import get_session
        data = get_session(session_id)
        if not data:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "session_id": session_id,
            "stage":      data.get("stage", "chat"),
            "slots":      data.get("slots", {}),
            "docs":       data.get("docs", {}),
            "airtable_record_id": data.get("airtable_record_id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        log.warning("get_chat_session(%s) failed: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Failed to retrieve session")


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/chat/health
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/chat/health")
async def chat_health():
    return {"ok": True, "model": CHAT_MODEL}
