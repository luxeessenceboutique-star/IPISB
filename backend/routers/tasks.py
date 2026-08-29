from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskAssign, TaskCommentCreate,
    TASK_STATUSES, TASK_PRIORITIES, TASK_DOMAINS,
)
from utils.audit import log_audit
from utils.notify import notify_users
from permissions import ENTITY_CHANNELS

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Canal 1 (SELF_VALIDATED, voir permissions.py) : tout rôle staff (V1) crée,
# assigne et fait évoluer une tâche librement jusqu'à "Terminé" — aucune
# validation V2 requise. V2 (admin) garde un accès de supervision sur tout
# via can_act(). Seule la suppression ajoute une restriction de propriété
# au-delà du canal (voir _require_owner_or_admin) : un membre du staff ne
# doit pas pouvoir supprimer la tâche de quelqu'un d'autre juste parce que
# le canal l'autorise en général.
_ENTITY = "tasks.tasks"


def _require_view(user: CurrentUser) -> None:
    if not user.can_act(_ENTITY, "view"):
        raise HTTPException(403, "Accès aux tâches non autorisé")


def _require_write(user: CurrentUser) -> None:
    if not user.can_act(_ENTITY, "create"):
        raise HTTPException(403, "Accès aux tâches non autorisé")


def _require_edit(user: CurrentUser) -> None:
    if not user.can_act(_ENTITY, "edit"):
        raise HTTPException(403, "Accès aux tâches non autorisé")


def _require_owner_or_admin(user: CurrentUser, task: dict) -> None:
    """Suppression : réservée au créateur, à l'assigné, ou à l'admin —
    au-delà de ce que le canal autoriserait seul (Canal 1 = tout le staff)."""
    if user.is_admin():
        return
    if task.get("created_by") == user.id or task.get("assignee_id") == user.id:
        return
    raise HTTPException(403, "Seuls le créateur, l'assigné ou un administrateur peuvent supprimer cette tâche.")


def _get_or_404(db: Client, task_id: str) -> dict:
    rows = db.from_("tasks").select("*").eq("id", task_id).execute().data
    if not rows:
        raise HTTPException(404, "Tâche introuvable")
    return rows[0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/assignable-users")
async def list_assignable_users(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Comptes staff pouvant être assignés (tout rôle V1 du module Tâches).
    Indépendant de GET /users (réservé à admin/professor/cashier) — ce
    module doit rester utilisable par rh/assistant_rh/comptabilite/accountant
    aussi, sans élargir l'accès de la gestion des comptes elle-même."""
    _require_view(user)
    _, v1_roles = ENTITY_CHANNELS[_ENTITY]
    role_rows = db.from_("user_roles").select("user_id, role").in_("role", v1_roles).execute().data or []
    ids = list({r["user_id"] for r in role_rows if r.get("user_id")})
    if not ids:
        return []
    profiles = db.from_("profiles").select("id, full_name, email").in_("id", ids).execute().data or []
    return sorted(profiles, key=lambda p: (p.get("full_name") or p.get("email") or ""))


@router.get("")
async def list_tasks(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    domain: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_view(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("tasks").select("*", count="exact")
    if assignee_id:
        query = query.eq("assignee_id", assignee_id)
    if status:
        query = query.eq("status", status)
    if priority:
        query = query.eq("priority", priority)
    if domain:
        query = query.eq("domain", domain)

    start = (page - 1) * page_size
    res = query.order("position").order("created_at", desc=True).range(start, start + page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_view(user)
    return _get_or_404(db, task_id)


@router.post("")
async def create_task(
    body: TaskCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_write(user)
    if body.priority not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority invalide (valeurs possibles : {', '.join(sorted(TASK_PRIORITIES))})")
    if body.domain is not None and body.domain not in TASK_DOMAINS:
        raise HTTPException(400, f"domain invalide (valeurs possibles : {', '.join(sorted(TASK_DOMAINS))})")

    data = body.model_dump()
    data["status"] = "todo"
    data["created_by"] = user.id

    res = db.from_("tasks").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Impossible de créer la tâche")
    task = res.data[0]

    log_audit(db, user.id, "task.create", "task", task["id"], {"title": task["title"]})
    if task.get("assignee_id") and task["assignee_id"] != user.id:
        notify_users(
            db, [task["assignee_id"]],
            title="Nouvelle tâche assignée 📋",
            message=f"« {task['title']} » vous a été assignée.",
            type="info",
            link=f"/dashboard/tasks?focus={task['id']}",
        )
    return task


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_edit(user)
    _get_or_404(db, task_id)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier")
    if "priority" in updates and updates["priority"] not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority invalide (valeurs possibles : {', '.join(sorted(TASK_PRIORITIES))})")
    if "domain" in updates and updates["domain"] is not None and updates["domain"] not in TASK_DOMAINS:
        raise HTTPException(400, f"domain invalide (valeurs possibles : {', '.join(sorted(TASK_DOMAINS))})")

    res = db.from_("tasks").update(updates).eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(404, "Tâche introuvable")
    log_audit(db, user.id, "task.update", "task", task_id, updates)
    return res.data[0]


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    body: TaskStatusUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_edit(user)
    if body.status not in TASK_STATUSES:
        raise HTTPException(400, f"status invalide (valeurs possibles : {', '.join(sorted(TASK_STATUSES))})")
    task = _get_or_404(db, task_id)

    res = db.from_("tasks").update({"status": body.status}).eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(404, "Tâche introuvable")
    log_audit(db, user.id, f"task.status.{body.status}", "task", task_id)

    notify_ids = {task.get("created_by"), task.get("assignee_id")} - {user.id, None}
    if notify_ids:
        notify_users(
            db, list(notify_ids),
            title="Statut de tâche modifié",
            message=f"« {task['title']} » est passée à « {body.status} ».",
            type="info",
            link=f"/dashboard/tasks?focus={task_id}",
        )
    return res.data[0]


@router.patch("/{task_id}/assign")
async def assign_task(
    task_id: str,
    body: TaskAssign,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_edit(user)
    task = _get_or_404(db, task_id)

    res = db.from_("tasks").update({"assignee_id": body.assignee_id}).eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(404, "Tâche introuvable")
    log_audit(db, user.id, "task.assign", "task", task_id, {"assignee_id": body.assignee_id})

    if body.assignee_id and body.assignee_id != user.id:
        notify_users(
            db, [body.assignee_id],
            title="Tâche assignée 📋",
            message=f"« {task['title']} » vous a été assignée.",
            type="info",
            link=f"/dashboard/tasks?focus={task_id}",
        )
    return res.data[0]


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_edit(user)
    task = _get_or_404(db, task_id)
    _require_owner_or_admin(user, task)

    db.from_("tasks").delete().eq("id", task_id).execute()
    log_audit(db, user.id, "task.delete", "task", task_id)
    return {"ok": True}


# ── Commentaires ─────────────────────────────────────────────────────────────

@router.get("/{task_id}/comments")
async def list_comments(
    task_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_view(user)
    _get_or_404(db, task_id)
    res = db.from_("task_comments").select("*").eq("task_id", task_id).order("created_at").execute()
    return res.data or []


@router.post("/{task_id}/comments")
async def create_comment(
    task_id: str,
    body: TaskCommentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_view(user)
    _get_or_404(db, task_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Le commentaire ne peut pas être vide")

    res = db.from_("task_comments").insert({
        "task_id": task_id, "author_id": user.id, "text": text,
    }).execute()
    if not res.data:
        raise HTTPException(400, "Impossible d'ajouter le commentaire")
    log_audit(db, user.id, "task.comment.create", "task", task_id)
    return res.data[0]


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    rows = db.from_("task_comments").select("*").eq("id", comment_id).execute().data
    if not rows:
        raise HTTPException(404, "Commentaire introuvable")
    comment = rows[0]
    if comment["author_id"] != user.id and not user.is_admin():
        raise HTTPException(403, "Seul l'auteur du commentaire ou un administrateur peut le supprimer")

    db.from_("task_comments").delete().eq("id", comment_id).execute()
    log_audit(db, user.id, "task.comment.delete", "task", comment["task_id"])
    return {"ok": True}


# ── Historique (réutilise audit_log — pas de table dédiée) ───────────────────

@router.get("/{task_id}/history")
async def get_task_history(
    task_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_view(user)
    _get_or_404(db, task_id)
    res = (
        db.from_("audit_log").select("*")
        .eq("entity_type", "task").eq("entity_id", task_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []
