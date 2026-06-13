from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import RoleAction, CreateUserRequest
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin() and not user.is_prof():
        raise HTTPException(403, "Admin or professor only")

    if user.is_admin():
        # Admins see all users
        profiles = (
            db.from_("profiles")
            .select("id, email, full_name, created_at, created_by")
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
    else:
        # Professors see only students they created
        profiles = (
            db.from_("profiles")
            .select("id, email, full_name, created_at, created_by")
            .eq("created_by", user.id)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )

    all_roles = db.from_("user_roles").select("user_id, role").execute().data or []
    role_map: dict[str, list[str]] = {}
    for r in all_roles:
        role_map.setdefault(r["user_id"], []).append(r["role"])
    return [{**p, "roles": role_map.get(p["id"], [])} for p in profiles]


@router.post("/create")
async def create_user(
    body: CreateUserRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    assigned_role = user.can_create_role()
    if assigned_role is None:
        raise HTTPException(403, "Students cannot create accounts")

    # Create the auth user via admin API
    try:
        res = db.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {"full_name": body.full_name},
        })
    except Exception as e:
        raise HTTPException(400, f"Failed to create auth user: {str(e)}")

    new_user = res.user
    if new_user is None:
        raise HTTPException(500, "User creation returned no user object")

    uid = str(new_user.id)

    # Force-confirm email regardless of project auth settings — without this,
    # "Confirm email" enabled on the Supabase project causes login to return
    # "Invalid login credentials" even for admin-created accounts.
    try:
        db.auth.admin.update_user_by_id(uid, {"email_confirm": True})
    except Exception:
        pass
    now = datetime.now(timezone.utc).isoformat()

    # Profile: update if trigger already created the row, otherwise insert.
    try:
        updated = db.from_("profiles").update({
            "full_name": body.full_name,
            "created_by": user.id,
        }).eq("id", uid).execute()
        if not updated.data:
            # Trigger hadn't fired yet — insert manually
            db.from_("profiles").insert({
                "id": uid,
                "email": body.email,
                "full_name": body.full_name,
                "created_at": now,
                "created_by": user.id,
            }).execute()
    except Exception as e:
        try:
            db.auth.admin.delete_user(uid)
        except Exception:
            pass
        raise HTTPException(500, f"Failed to create profile: {str(e)}")

    # Assign role — upsert in case a trigger already inserted the default role
    try:
        db.from_("user_roles").upsert({
            "user_id": uid,
            "role": assigned_role,
        }, on_conflict="user_id,role").execute()
    except Exception as e:
        try:
            db.auth.admin.delete_user(uid)
        except Exception:
            pass
        raise HTTPException(500, f"Failed to assign role: {str(e)}")

    return {
        "id": uid,
        "email": body.email,
        "full_name": body.full_name,
        "role": assigned_role,
        "temporary_password": body.password,
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    if user_id == user.id:
        raise HTTPException(400, "Cannot delete your own account")

    # Remove roles and profile first, then delete the auth user
    db.from_("user_roles").delete().eq("user_id", user_id).execute()
    db.from_("profiles").delete().eq("id", user_id).execute()
    try:
        db.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to delete auth user: {str(e)}")

    return {"ok": True}


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
