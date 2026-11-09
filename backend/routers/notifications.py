from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from utils.audit import log_audit

router = APIRouter(prefix="/notifications", tags=["notifications"])

# PostgREST exige un filtre sur DELETE : « id ≠ uuid nul » sélectionne toutes les lignes.
_ALL_ROWS = "00000000-0000-0000-0000-000000000000"


@router.get("")
async def list_notifications(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    return (
        db.from_("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )


@router.put("/read-all")
async def mark_all_read(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    db.from_("notifications").update({"read": True}).eq("user_id", user.id).eq("read", False).execute()
    return {"ok": True}


@router.put("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    db.from_("notifications").update({"read": True}).eq("id", notification_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.delete("")
async def delete_notifications(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    scope: Annotated[str, Query(pattern="^(mine|read|all)$")] = "mine",
):
    """Suppression en masse.

    - `mine` (défaut) : toutes MES notifications.
    - `read` : mes notifications déjà lues.
    - `all` : les notifications de TOUS les utilisateurs — réservé aux admins (journalisé).
    """
    if scope == "all":
        if not user.is_admin():
            raise HTTPException(403, "Réservé aux administrateurs")
        res = db.from_("notifications").delete().neq("id", _ALL_ROWS).execute()
    elif scope == "read":
        res = db.from_("notifications").delete().eq("user_id", user.id).eq("read", True).execute()
    else:
        res = db.from_("notifications").delete().eq("user_id", user.id).execute()
    deleted = len(res.data or [])
    if scope == "all":
        log_audit(db, user.id, "notifications.purge_all", "notifications", None, {"deleted": deleted})
    return {"ok": True, "deleted": deleted}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Un utilisateur supprime SA notification ; un admin peut supprimer n'importe laquelle."""
    q = db.from_("notifications").delete().eq("id", notification_id)
    if not user.is_admin():
        q = q.eq("user_id", user.id)
    q.execute()
    return {"ok": True}
