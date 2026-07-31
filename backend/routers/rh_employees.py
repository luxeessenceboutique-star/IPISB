from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import EmployeeCreate, EmployeeUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/employees", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_employees(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("employees").select("*", count="exact")
    if q:
        query = query.ilike("full_name", f"%{q}%")
    if status:
        query = query.eq("status", status)
    if department:
        query = query.eq("department", department)

    start = (page - 1) * page_size
    res = query.order("full_name").range(start, start + page_size - 1).execute()

    return {
        "items": res.data or [],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employees").select("*").eq("id", employee_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    return rows[0]


@router.post("")
async def create_employee(
    body: EmployeeCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.full_name.strip():
        raise HTTPException(400, "full_name is required")

    data = body.model_dump(exclude_none=True)
    data["created_by"] = user.id

    res = db.from_("employees").insert(data).execute()
    new_employee = res.data[0]
    log_audit(db, user.id, "employee.create", "employee", new_employee["id"], {"full_name": body.full_name})
    return new_employee


@router.patch("/{employee_id}")
async def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("employees").update(updates).eq("id", employee_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "employee.update", "employee", employee_id, updates)
    return res.data[0]


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("employees").select("id").eq("id", employee_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("employees").delete().eq("id", employee_id).execute()
    log_audit(db, user.id, "employee.delete", "employee", employee_id)
    return {"ok": True}
