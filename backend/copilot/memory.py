"""Mémoire du Copilote.

Deux niveaux, tous deux propres à UN utilisateur :

- Mémoire de conversation : chaque conversation est isolée (table
  copilot_messages). Le modèle reçoit les derniers échanges du fil courant et,
  quand le fil devient long, un résumé glissant des plus anciens
  (copilot_conversations.summary) — jamais le contenu d'une autre conversation.
- Mémoire à long terme : faits durables appris sur l'utilisateur
  (copilot_memories), extraits après chaque réponse et injectés dans toutes
  ses conversations. L'utilisateur les voit et peut les supprimer.

Tout passe par le backend service-role (RLS sans policy, migration L90).
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from openai import AsyncOpenAI
from supabase import Client

log = logging.getLogger(__name__)

HISTORY_WINDOW = 20       # derniers messages envoyés tels quels au modèle
SUMMARIZE_AFTER = 30      # au-delà, les plus anciens sont résumés
MAX_MEMORIES = 60         # par utilisateur — les plus anciennes sont oubliées
MEMORY_MAX_CHARS = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Conversations ────────────────────────────────────────────────────────────

def get_conversation(db: Client, user_id: str, conversation_id: str) -> dict:
    rows = (
        db.from_("copilot_conversations").select("*")
        .eq("id", conversation_id).eq("user_id", user_id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Conversation introuvable.")
    return rows[0]


def create_conversation(db: Client, user_id: str, title: str, language: str) -> dict:
    return db.from_("copilot_conversations").insert({
        "user_id": user_id, "title": title[:80] or "Nouvelle conversation", "language": language,
    }).execute().data[0]


def add_message(db: Client, conversation_id: str, role: str, content: str, meta: Optional[dict] = None) -> dict:
    row = db.from_("copilot_messages").insert({
        "conversation_id": conversation_id, "role": role, "content": content, "meta": meta or {},
    }).execute().data[0]
    db.from_("copilot_conversations").update({"updated_at": now_iso()}).eq("id", conversation_id).execute()
    return row


def load_history(db: Client, conversation_id: str) -> tuple[list[dict], int]:
    """(derniers messages {role, content}, nombre total de messages du fil)."""
    res = (
        db.from_("copilot_messages").select("role, content, meta", count="exact")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True).limit(HISTORY_WINDOW).execute()
    )
    rows = list(reversed(res.data or []))
    history = []
    for r in rows:
        content = r["content"] or ""
        # Une proposition d'action n'a pas de texte : on garde sa trace pour le contexte.
        action = (r.get("meta") or {}).get("action")
        if not content and action:
            content = f"[Action proposée : {action.get('label', '')}]"
        if content:
            history.append({"role": r["role"], "content": content})
    return history, res.count or len(rows)


async def maybe_summarize(client: AsyncOpenAI, model: str, db: Client, conversation: dict, total: int) -> None:
    """Résumé glissant : quand le fil dépasse SUMMARIZE_AFTER messages, les
    messages hors fenêtre sont condensés dans copilot_conversations.summary."""
    if total <= SUMMARIZE_AFTER:
        return
    older = (
        db.from_("copilot_messages").select("role, content")
        .eq("conversation_id", conversation["id"])
        .order("created_at").limit(max(0, total - HISTORY_WINDOW)).execute().data or []
    )
    if not older:
        return
    transcript = "\n".join(f"{m['role']}: {m['content'][:600]}" for m in older)[-12000:]
    try:
        resp = await client.chat.completions.create(
            model=model, temperature=0, max_tokens=350,
            messages=[{"role": "system", "content": (
                "Résume cette conversation entre un utilisateur et le Copilote d'une plateforme "
                "administrative en 6 lignes maximum : sujets traités, décisions, informations utiles "
                "pour la suite. Pas de formule de politesse."
            )}, {"role": "user", "content": (conversation.get("summary") or "") + "\n" + transcript}],
        )
        summary = (resp.choices[0].message.content or "").strip()
        if summary:
            db.from_("copilot_conversations").update({"summary": summary[:2000]}).eq("id", conversation["id"]).execute()
    except Exception as e:
        log.warning("Copilot summarize failed: %s", e)


async def make_title(client: AsyncOpenAI, model: str, question: str, answer: str) -> Optional[str]:
    try:
        resp = await client.chat.completions.create(
            model=model, temperature=0.2, max_tokens=20,
            messages=[{"role": "system", "content": (
                "Donne un titre très court (2 à 6 mots) à cette conversation, dans la langue de "
                "l'utilisateur, sans guillemets ni point final."
            )}, {"role": "user", "content": f"Q: {question[:500]}\nR: {answer[:500]}"}],
        )
        title = (resp.choices[0].message.content or "").strip().strip('"«» .')
        return title[:80] or None
    except Exception as e:
        log.warning("Copilot title failed: %s", e)
        return None


# ── Mémoire à long terme ─────────────────────────────────────────────────────

def load_memories(db: Client, user_id: str) -> list[dict]:
    return (
        db.from_("copilot_memories").select("id, content, created_at")
        .eq("user_id", user_id).order("created_at", desc=True).limit(MAX_MEMORIES).execute().data or []
    )


def render_memories(memories: list[dict]) -> str:
    if not memories:
        return ""
    lines = "\n".join(f"- {m['content']}" for m in memories[:30])
    return (
        "CE QUE TU SAIS DÉJÀ SUR CET UTILISATEUR (mémoire à long terme, à utiliser avec tact, "
        "sans la réciter) :\n" + lines
    )


def save_memory(db: Client, user_id: str, content: str, conversation_id: Optional[str] = None) -> Optional[dict]:
    content = " ".join(content.split())[:MEMORY_MAX_CHARS]
    if not content:
        return None
    row = db.from_("copilot_memories").insert({
        "user_id": user_id, "content": content, "source_conversation_id": conversation_id,
    }).execute().data[0]
    # Plafond : on oublie les plus anciennes.
    ids = [m["id"] for m in (
        db.from_("copilot_memories").select("id").eq("user_id", user_id)
        .order("created_at", desc=True).execute().data or []
    )]
    stale = ids[MAX_MEMORIES:]
    if stale:
        db.from_("copilot_memories").delete().in_("id", stale).execute()
    return row


async def extract_memories(
    client: AsyncOpenAI, model: str, db: Client, user_id: str, conversation_id: str,
    question: str, answer: str,
) -> list[dict]:
    """Après une réponse : retient les faits DURABLES et personnels que
    l'utilisateur a donnés (préférences, rôle, service, habitudes de travail).
    Jamais de données sensibles (mots de passe, montants, santé, identifiants)."""
    existing = load_memories(db, user_id)
    known = "\n".join(f"- {m['content']}" for m in existing[:40]) or "(rien)"
    try:
        resp = await client.chat.completions.create(
            model=model, temperature=0, max_tokens=200,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": (
                "Tu gères la mémoire à long terme d'un assistant de plateforme administrative. "
                "À partir du dernier échange, extrais au plus 2 faits DURABLES sur l'utilisateur "
                "lui-même, utiles dans de futures conversations : préférences (langue, format de "
                "réponse), poste/service, tâches récurrentes, ou ce qu'il demande explicitement de "
                "retenir (« souviens-toi que… »). N'extrais RIEN de ponctuel (une question isolée), "
                "ni de sensible (mot de passe, code, montant, santé, données d'un tiers), ni ce qui "
                "est déjà connu. Formule chaque fait en une phrase courte en français, à la 3e "
                "personne (ex. « Préfère des réponses en darija »).\n"
                f"Déjà connu :\n{known}\n\n"
                'Réponds en JSON : {"facts": ["…"]} (liste vide si rien à retenir).'
            )}, {"role": "user", "content": f"Utilisateur : {question[:1500]}\nAssistant : {answer[:1500]}"}],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        facts = [f for f in (data.get("facts") or []) if isinstance(f, str) and f.strip()][:2]
    except Exception as e:
        log.warning("Copilot memory extraction failed: %s", e)
        return []
    saved = []
    lowered = {m["content"].lower() for m in existing}
    for fact in facts:
        if fact.strip().lower() in lowered:
            continue
        row = save_memory(db, user_id, fact, conversation_id)
        if row:
            saved.append(row)
    return saved
