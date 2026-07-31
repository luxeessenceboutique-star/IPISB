from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import DepartmentCreate, DepartmentUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/departments", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_departments(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("departments").select("*").order("name").execute()
    return res.data or []


@router.post("")
async def create_department(
    body: DepartmentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.name.strip():
        raise HTTPException(400, "name is required")

    res = db.from_("departments").insert(body.model_dump(exclude_none=True)).execute()
    if not res.data:
        raise HTTPException(400, "Could not create department")

    dept = res.data[0]
    log_audit(db, user.id, "department.create", "department", dept["id"])
    return dept


@router.patch("/{dept_id}")
async def update_department(
    dept_id: str,
    body: DepartmentUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("departments").update(updates).eq("id", dept_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "department.update", "department", dept_id, updates)
    return res.data[0]


@router.delete("/{dept_id}")
async def delete_department(
    dept_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("departments").select("id").eq("id", dept_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("departments").delete().eq("id", dept_id).execute()
    log_audit(db, user.id, "department.delete", "department", dept_id)
    return {"ok": True}
