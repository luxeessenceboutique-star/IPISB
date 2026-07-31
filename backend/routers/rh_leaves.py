from datetime import date, datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import LeaveRequestCreate, LeaveRequestUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/leaves", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _default_balance(db: Client, employee_id: str, year: int) -> dict:
    """Seniority-scaled default balance (used the first time an employee has no balance row)."""
    annual_total = 21
    try:
        emp = db.from_("employees").select("hire_date").eq("id", employee_id).execute().data
        hire_date = (emp[0] or {}).get("hire_date") if emp else None
        if hire_date:
            hd = date.fromisoformat(str(hire_date)[:10])
            seniority_years = (date.today() - hd).days // 365
            annual_total = min(21 + (seniority_years // 5), 30)
    except Exception:
        pass
    return {
        "employee_id": employee_id,
        "year": year,
        "annual_total": annual_total,
        "annual_used": 0,
        "sick_total": 12,
        "sick_used": 0,
        "personal_total": 5,
        "personal_used": 0,
    }


@router.get("")
async def list_leaves(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("leave_requests").select("*, employees(full_name)", count="exact")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if status:
        query = query.eq("status", status)

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for row in res.data or []:
        items.append({**{k: v for k, v in row.items() if k != "employees"}, "employee_name": (row.get("employees") or {}).get("full_name")})

    return {"items": items, "total": res.count or 0, "page": page, "page_size": page_size}


@router.get("/holidays")
async def list_holidays(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("holidays").select("*").order("date").execute()
    return res.data or []


@router.get("/balance/{employee_id}")
async def get_balance(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    year: Optional[int] = Query(default=None),
):
    _require_admin(user)
    y = year or datetime.now(timezone.utc).year

    existing = db.from_("leave_balances").select("*").eq("employee_id", employee_id).eq("year", y).execute().data
    if existing:
        return existing[0]

    default = _default_balance(db, employee_id, y)
    try:
        ins = db.from_("leave_balances").insert(default).execute()
        if ins.data:
            return ins.data[0]
    except Exception:
        pass
    return default


@router.post("")
async def create_leave(
    body: LeaveRequestCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.days <= 0:
        raise HTTPException(400, "days must be positive")

    data = body.model_dump()
    data["status"] = "pending"
    data["created_by"] = user.id

    res = db.from_("leave_requests").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create leave request")

    leave = res.data[0]
    log_audit(db, user.id, "leave.create", "leave_request", leave["id"], {"type": body.type})
    return leave


@router.patch("/{leave_id}/review")
async def review_leave(
    leave_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    status: str = Query(..., pattern="^(approved|rejected)$"),
):
    _require_admin(user)
    updates = {
        "status": status,
        "reviewed_by": user.id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    res = db.from_("leave_requests").update(updates).eq("id", leave_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")

    log_audit(db, user.id, f"leave.{status}", "leave_request", leave_id)
    return res.data[0]


@router.patch("/{leave_id}")
async def update_leave(
    leave_id: str,
    body: LeaveRequestUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("leave_requests").update(updates).eq("id", leave_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "leave.update", "leave_request", leave_id, updates)
    return res.data[0]


@router.delete("/{leave_id}")
async def delete_leave(
    leave_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("leave_requests").select("id").eq("id", leave_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("leave_requests").delete().eq("id", leave_id).execute()
    log_audit(db, user.id, "leave.delete", "leave_request", leave_id)
    return {"ok": True}
