import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client
from openai import AsyncOpenAI

from deps import get_current_user, get_db, CurrentUser
from copilot.agent import copilot_graph, LANG_SYSTEM, BASE_URL, API_KEY, CHAT_MODEL
from copilot.actions import (
    ACTIONS, build_tool_schemas, split_arguments, validate_body, summarize_action, execute_action,
)

router = APIRouter(prefix="/copilot", tags=["copilot"])
log = logging.getLogger(__name__)


class CopilotRequest(BaseModel):
    messages: list[dict]
    language: str = "fr"


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


@router.post("/stream")
async def copilot_stream(
    req: CopilotRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """SSE streaming endpoint for the in-app platform copilot, available to every
    authenticated role. Yields `data: {"text": "..."}` chunks, or a single
    `data: {"action_proposal": {...}}` when the user asked to perform a real
    action — nothing is ever executed here, only proposed (see /actions/{id}/confirm)."""
    try:
        state = await copilot_graph.ainvoke({
            "messages": req.messages,
            "roles": user.roles or ["student"],
            "language": req.language,
            "intent": "",
            "system_prompt": "",
        })
        system_prompt = state.get("system_prompt", "")
        intent = state.get("intent", "general")
    except Exception as exc:
        log.warning("Copilot graph failed: %s", exc)
        system_prompt = "Tu es le Copilote IPISB Connect, assistant d'aide à l'utilisation de la plateforme."
        intent = "general"

    lang_instr = LANG_SYSTEM.get(req.language, LANG_SYSTEM["fr"])
    full_system = f"{lang_instr}\n\n{system_prompt}"

    if intent == "action":
        return await _action_response(req, user, db, full_system)

    async def generate():
        client = _openai_client()
        try:
            stream = await client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "system", "content": full_system}] + req.messages,
                max_tokens=700,
                temperature=0.4,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield f"data: {json.dumps({'text': delta.content})}\n\n"
        except Exception as e:
            log.error("Copilot LLM stream error: %s", e)
            yield f"data: {json.dumps({'text': f'Erreur: {type(e).__name__}: {e}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _action_response(req: CopilotRequest, user: CurrentUser, db: Client, full_system: str):
    """Non-streaming tool-calling turn : le LLM choisit un outil (ou pose une
    question de clarification en texte libre) — aucune écriture n'a lieu
    ici, seulement la création d'une proposition en attente si un outil est
    appelé avec des arguments valides."""
    client = _openai_client()

    async def generate():
        try:
            resp = await client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "system", "content": full_system}] + req.messages,
                max_tokens=500,
                temperature=0.2,
                tools=build_tool_schemas(),
                tool_choice="auto",
            )
            choice = resp.choices[0]
            tool_calls = choice.message.tool_calls or []

            if not tool_calls:
                text = choice.message.content or "Je n'ai pas assez d'informations pour effectuer cette action — pouvez-vous préciser ?"
                yield f"data: {json.dumps({'text': text})}\n\n"
                yield "data: [DONE]\n\n"
                return

            call = tool_calls[0]
            spec = ACTIONS.get(call.function.name)
            if spec is None:
                yield f"data: {json.dumps({'text': 'Action inconnue — reformulez votre demande.'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            try:
                arguments: dict[str, Any] = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                yield f"data: {json.dumps({'text': 'Je n’ai pas pu interpréter les paramètres — reformulez votre demande.'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            path_params, body_fields = split_arguments(spec, arguments)
            try:
                validated = validate_body(spec, body_fields)
            except HTTPException as e:
                yield f"data: {json.dumps({'text': str(e.detail)})}\n\n"
                yield "data: [DONE]\n\n"
                return
            clean_body = validated.model_dump(mode="json") if validated is not None else {}

            missing_path = [p for p in spec.path_params if not path_params.get(p)]
            if missing_path:
                missing_text = f"Il me manque : {', '.join(missing_path)}. Pouvez-vous préciser ?"
                yield f"data: {json.dumps({'text': missing_text})}\n\n"
                yield "data: [DONE]\n\n"
                return

            summary = summarize_action(spec, path_params, clean_body)
            res = db.from_("copilot_pending_actions").insert({
                "user_id": user.id,
                "action_key": spec.key,
                "path_params": path_params,
                "payload": clean_body,
                "summary": summary,
            }).execute()
            pending = res.data[0]
            yield f"data: {json.dumps({'action_proposal': {'id': pending['id'], 'label': spec.label, 'summary': summary}})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            log.error("Copilot action proposal error: %s", e)
            yield f"data: {json.dumps({'text': f'Erreur: {type(e).__name__}: {e}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
