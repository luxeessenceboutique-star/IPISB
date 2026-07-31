from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PayrollCreate, PayrollUpdate
from utils.audit import log_audit
from utils.pdf_generators import compute_moroccan_payroll, render_payslip_pdf

router = APIRouter(prefix="/rh/payroll", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_payroll(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    month: Optional[int] = None,
    year: Optional[int] = None,
    employee_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("payroll_records").select("*, employees(full_name, position, department)", count="exact")
    if month:
        query = query.eq("month", month)
    if year:
        query = query.eq("year", year)
    if employee_id:
        query = query.eq("employee_id", employee_id)

    start = (page - 1) * page_size
    res = query.order("year", desc=True).order("month", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for row in res.data or []:
        emp = row.get("employees") or {}
        items.append({**{k: v for k, v in row.items() if k != "employees"}, "employee_name": emp.get("full_name")})

    return {"items": items, "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("")
async def create_payroll(
    body: PayrollCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    calcs = compute_moroccan_payroll(body.base_salary, body.bonuses, body.deductions)
    data = body.model_dump()
    data.update(calcs)
    data["created_by"] = user.id
    data["status"] = "draft"

    try:
        res = db.from_("payroll_records").insert(data).execute()
    except Exception as e:
        raise HTTPException(400, f"Could not create payroll record (may already exist for this month/year): {e}")
    if not res.data:
        raise HTTPException(400, "Could not create payroll record")

    record = res.data[0]
    log_audit(db, user.id, "payroll.create", "payroll_record", record["id"])
    return record


@router.patch("/{record_id}")
async def update_payroll(
    record_id: str,
    body: PayrollUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "No fields to update")

    if "bonuses" in data or "deductions" in data:
        existing = db.from_("payroll_records").select("base_salary, bonuses, deductions").eq("id", record_id).execute().data
        if existing:
            base = existing[0]["base_salary"]
            bonuses = data.get("bonuses", existing[0]["bonuses"])
            deductions = data.get("deductions", existing[0]["deductions"])
            data.update(compute_moroccan_payroll(base, bonuses, deductions))

    if data.get("status") == "paid":
        data["paid_at"] = datetime.now(timezone.utc).isoformat()

    res = db.from_("payroll_records").update(data).eq("id", record_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")

    log_audit(db, user.id, "payroll.update", "payroll_record", record_id, data)
    return res.data[0]


@router.delete("/{record_id}")
async def delete_payroll(
    record_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("payroll_records").select("id").eq("id", record_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("payroll_records").delete().eq("id", record_id).execute()
    log_audit(db, user.id, "payroll.delete", "payroll_record", record_id)
    return {"ok": True}


@router.post("/generate-bulk")
async def generate_bulk_payroll(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
):
    """Create a draft payroll record for every active employee for a given month/year."""
    _require_admin(user)
    employees = db.from_("employees").select("id, salary").eq("status", "active").execute().data or []

    created, skipped, no_salary = 0, 0, []
    for emp in employees:
        salary = float(emp.get("salary") or 0)
        if salary == 0:
            no_salary.append(emp["id"])

        calcs = compute_moroccan_payroll(salary)
        record = {
            "employee_id": emp["id"],
            "month": month,
            "year": year,
            "base_salary": salary,
            "bonuses": 0,
            "deductions": 0,
            **calcs,
            "status": "draft",
            "created_by": user.id,
        }
        try:
            db.from_("payroll_records").insert(record).execute()
            created += 1
        except Exception:
            skipped += 1  # already exists for this employee/month/year

    log_audit(db, user.id, "payroll.generate_bulk", "payroll_records", f"{year}-{month}")
    return {"created": created, "skipped": skipped, "no_salary_count": len(no_salary), "month": month, "year": year}


@router.get("/{record_id}/pdf")
async def get_payroll_pdf(
    record_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("payroll_records").select("*, employees(*)").eq("id", record_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")

    record = rows[0]
    employee = record.get("employees") or {}
    pdf_bytes = render_payslip_pdf(record, employee)
    filename = f"Bulletin_Paie_{record['year']}_{record['month']}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
