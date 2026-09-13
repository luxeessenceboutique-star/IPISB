from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import AnnouncementCreate
from utils.audit import log_audit

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("")
async def list_announcements(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    rows = (
        db.from_("announcements_internal")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    my_roles = set(user.roles) | {"admin" if user.is_admin() else "", "professor" if user.is_prof() else ""}
    my_roles.discard("")
    return [r for r in rows if not r.get("audience_roles") or my_roles & set(r["audience_roles"])]


@router.post("")
async def create_announcement(
    body: AnnouncementCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    res = db.from_("announcements_internal").insert({
        "titre": body.titre,
        "corps": body.corps,
        "audience_roles": body.audience_roles,
        "created_by": user.id,
    }).execute()
    new_announcement = res.data[0]
    log_audit(db, user.id, "announcement.create", "announcement", new_announcement["id"])
    return new_announcement


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    db.from_("announcements_internal").delete().eq("id", announcement_id).execute()
    log_audit(db, user.id, "announcement.delete", "announcement", announcement_id)
    return {"ok": True}
