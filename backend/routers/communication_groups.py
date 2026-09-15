from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import GroupMessageCreate
from utils.notify import notify_users

router = APIRouter(prefix="/communication/groups", tags=["communication"])

# Ces groupes sont créés automatiquement dès qu'une tâche compte 2 assignés
# ou plus (voir routers/tasks.py::_sync_communication_group) — pas de
# création manuelle ici, uniquement consultation et discussion.


def _require_member_or_admin(user: CurrentUser, db: Client, group_id: str) -> dict:
    rows = db.from_("communication_groups").select("*").eq("id", group_id).execute().data
    if not rows:
        raise HTTPException(404, "Groupe introuvable")
    group = rows[0]
    if user.is_admin():
        return group
    is_member = bool(
        db.from_("communication_group_members").select("user_id")
        .eq("group_id", group_id).eq("user_id", user.id).execute().data
    )
    if not is_member:
        raise HTTPException(403, "Réservé aux membres de ce groupe.")
    return group


@router.get("")
async def list_groups(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Groupes dont je suis membre — l'admin voit tous les groupes (accès de
    supervision, comme le reste du module Tâches dont ils dérivent)."""
    if user.is_admin():
        groups = db.from_("communication_groups").select("*").order("created_at", desc=True).execute().data or []
    else:
        member_rows = db.from_("communication_group_members").select("group_id").eq("user_id", user.id).execute().data or []
        ids = list({m["group_id"] for m in member_rows})
        if not ids:
            return []
        groups = db.from_("communication_groups").select("*").in_("id", ids).order("created_at", desc=True).execute().data or []
    if not groups:
        return []

    group_ids = [g["id"] for g in groups]
    task_ids = list({g["task_id"] for g in groups if g.get("task_id")})
    tasks_by_id = {
        t["id"]: t for t in (db.from_("tasks").select("id, title, status").in_("id", task_ids).execute().data or [])
    } if task_ids else {}

    member_rows = db.from_("communication_group_members").select("group_id, user_id").in_("group_id", group_ids).execute().data or []
    user_ids = list({m["user_id"] for m in member_rows})
    profiles_by_id = {
        p["id"]: p for p in (db.from_("profiles").select("id, full_name, email").in_("id", user_ids).execute().data or [])
    } if user_ids else {}
    members_by_group: dict[str, list] = {}
    for m in member_rows:
        members_by_group.setdefault(m["group_id"], []).append(profiles_by_id.get(m["user_id"]) or {"id": m["user_id"]})

    last_msg_rows = (
        db.from_("communication_group_messages").select("group_id, text, created_at")
        .in_("group_id", group_ids).order("created_at", desc=True).execute().data or []
    )
    last_msg_by_group: dict[str, dict] = {}
    for m in last_msg_rows:
        last_msg_by_group.setdefault(m["group_id"], m)  # desc order -> premier vu = le plus récent

    result = []
    for g in groups:
        task = tasks_by_id.get(g.get("task_id"), {})
        result.append({
            **g,
            "task_title": task.get("title"),
            "task_status": task.get("status"),
            "members": members_by_group.get(g["id"], []),
            "last_message": last_msg_by_group.get(g["id"]),
        })
    return result


@router.get("/{group_id}/messages")
async def list_group_messages(
    group_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_member_or_admin(user, db, group_id)
    rows = db.from_("communication_group_messages").select("*").eq("group_id", group_id).order("created_at").execute().data or []
    author_ids = list({r["author_id"] for r in rows if r.get("author_id")})
    profiles_by_id = {
        p["id"]: p for p in (db.from_("profiles").select("id, full_name, email").in_("id", author_ids).execute().data or [])
    } if author_ids else {}
    return [
        {**r, "author_name": (profiles_by_id.get(r["author_id"]) or {}).get("full_name") or (profiles_by_id.get(r["author_id"]) or {}).get("email")}
        for r in rows
    ]


@router.post("/{group_id}/messages")
async def create_group_message(
    group_id: str,
    body: GroupMessageCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    group = _require_member_or_admin(user, db, group_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Le message ne peut pas être vide.")

    res = db.from_("communication_group_messages").insert({
        "group_id": group_id, "author_id": user.id, "text": text,
    }).execute()
    if not res.data:
        raise HTTPException(400, "Impossible d'envoyer le message")
    message = res.data[0]

    member_rows = db.from_("communication_group_members").select("user_id").eq("group_id", group_id).execute().data or []
    notify_ids = [m["user_id"] for m in member_rows if m["user_id"] != user.id]
    if notify_ids:
        notify_users(
            db, notify_ids,
            title="Nouveau message 💬",
            message=f"{group['name']} : {text[:80]}",
            type="info",
            link=f"/dashboard/communication?tab=groups&focus={group_id}",
        )
    return message
