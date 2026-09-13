import secrets
from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PayrollCreate, PayrollUpdate
from utils.audit import log_audit
from utils.pdf_generators import compute_moroccan_payroll, render_payslip_pdf

router = APIRouter(prefix="/rh/payroll", tags=["rh"])

BUCKET_PAYSLIPS = "payslips"
DOC_SIGNED_URL_TTL = 60 * 60  # 1 hour
MAX_DOC_SIZE = 8 * 1024 * 1024  # 8 MB
ALLOWED_DOC_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh_payroll():
        raise HTTPException(403, "RH (full) access only")


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


@router.post("/document")
async def upload_payroll_document(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: str = Form(...),
    year: int = Form(...),
    month: int = Form(..., ge=1, le=12),
    document: UploadFile = File(...),
):
    """Uploads the actual payslip file for an employee/month/year, creating
    the payroll_records row first if HR hasn't generated one yet — HR just
    picks the employee/year/month and drops the file, one folder per
    employee → year → month in storage."""
    _require_admin(user)

    ext = ALLOWED_DOC_TYPES.get(document.content_type)
    if not ext:
        raise HTTPException(400, "Type de fichier non supporté (PDF, JPG, PNG uniquement).")

    data = await document.read()
    if not data:
        raise HTTPException(400, "Fichier vide.")
    if len(data) > MAX_DOC_SIZE:
        raise HTTPException(400, "Fichier trop volumineux (8 Mo max).")

    existing = (
        db.from_("payroll_records").select("id")
        .eq("employee_id", employee_id).eq("year", year).eq("month", month)
        .execute().data
    )
    if existing:
        record_id = existing[0]["id"]
    else:
        emp = db.from_("employees").select("id, salary").eq("id", employee_id).execute().data
        if not emp:
            raise HTTPException(404, "Employé introuvable")
        salary = float(emp[0].get("salary") or 0)
        calcs = compute_moroccan_payroll(salary)
        created = db.from_("payroll_records").insert({
            "employee_id": employee_id, "month": month, "year": year,
            "base_salary": salary, "bonuses": 0, "deductions": 0,
            **calcs, "status": "draft", "created_by": user.id,
        }).execute()
        if not created.data:
            raise HTTPException(400, "Impossible de créer la fiche de paie")
        record_id = created.data[0]["id"]

    file_path = f"{employee_id}/{year}/{month:02d}/{secrets.token_hex(8)}.{ext}"
    db.storage.from_(BUCKET_PAYSLIPS).upload(file_path, data, {"content-type": document.content_type})

    try:
        res = db.from_("payroll_records").update(
            {"document_path": file_path, "document_filename": document.filename}
        ).eq("id", record_id).execute()
        if not res.data:
            raise HTTPException(400, "Impossible d'enregistrer le document")
    except Exception:
        db.storage.from_(BUCKET_PAYSLIPS).remove([file_path])
        raise

    log_audit(db, user.id, "payroll.document_upload", "payroll_record", record_id)
    return res.data[0]


@router.get("/{record_id}/document-url")
async def get_payroll_document_url(
    record_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("payroll_records").select("document_path").eq("id", record_id).execute().data
    if not rows or not rows[0].get("document_path"):
        raise HTTPException(404, "Aucun document pour cette fiche")
    signed = db.storage.from_(BUCKET_PAYSLIPS).create_signed_url(rows[0]["document_path"], DOC_SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.get("/documents/{employee_id}")
async def list_employee_documents(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Every uploaded payslip for one employee, for the folder browser
    (Employé → Année → Mois)."""
    _require_admin(user)
    rows = (
        db.from_("payroll_records")
        .select("id, year, month, document_filename")
        .eq("employee_id", employee_id)
        .not_.is_("document_path", "null")
        .order("year", desc=True).order("month", desc=True)
        .execute().data
    )
    return rows or []


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
