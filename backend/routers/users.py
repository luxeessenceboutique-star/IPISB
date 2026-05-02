from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import RoleAction

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    profiles = (
        db.from_("profiles")
        .select("id, email, full_name, created_at")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    all_roles = db.from_("user_roles").select("user_id, role").execute().data or []
    role_map: dict[str, list[str]] = {}
    for r in all_roles:
        role_map.setdefault(r["user_id"], []).append(r["role"])
    return [{**p, "roles": role_map.get(p["id"], [])} for p in profiles]


@router.post("/{user_id}/roles")
async def update_role(
    user_id: str,
    body: RoleAction,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    if body.action == "add":
        try:
            db.from_("user_roles").insert({"user_id": user_id, "role": body.role}).execute()
        except Exception as e:
            raise HTTPException(400, str(e))
    elif body.action == "remove":
        if user_id == user.id and body.role == "admin":
            raise HTTPException(400, "Cannot remove your own admin role")
        db.from_("user_roles").delete().eq("user_id", user_id).eq("role", body.role).execute()
    else:
        raise HTTPException(400, "Invalid action. Use 'add' or 'remove'")
    return {"ok": True}
