import secrets
from datetime import date, datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import LeaveRequestCreate, LeaveRequestUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/leaves", tags=["rh"])

# Codes officiels : R, M, CS, P, A, AJ (voir la migration phase6 pour le détail
# du mapping type → solde). "Travail" (T) n'est pas une demande — juste un
# marqueur calendrier côté frontend — et "Annulé" (C) est un statut, pas un type.
VALID_LEAVE_TYPES = {"recovery", "sick", "unpaid", "permission", "other", "unjustified_absence"}

BUCKET_LEAVE_DOCS = "leave-documents"
DOC_SIGNED_URL_TTL = 60 * 60  # 1 hour
MAX_DOC_SIZE = 8 * 1024 * 1024  # 8 MB
ALLOWED_DOC_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _months_worked(contract_start: date, year: int) -> int:
    """Number of calendar months worked under the contract within `year`, from
    contract_start (or Jan 1 if the contract predates this year) through today
    (or Dec 31 if `year` has already ended). Both the start and end month count
    as full months worked. Capped to [0, 12]."""
    today = date.today()
    if year > today.year:
        return 0
    period_start = max(contract_start, date(year, 1, 1))
    period_end = date(year, 12, 31) if year < today.year else today
    if period_start > period_end:
        return 0
    months = (period_end.year - period_start.year) * 12 + (period_end.month - period_start.month) + 1
    return max(0, min(12, months))


def _default_balance(db: Client, employee_id: str, year: int) -> dict:
    """Annual leave accrues at 1.5 days per month worked under the contract
    (used the first time an employee has no balance row for `year`)."""
    annual_total = 0.0
    try:
        emp = db.from_("employees").select("contract_start, hire_date").eq("id", employee_id).execute().data
        row = emp[0] if emp else {}
        start = row.get("contract_start") or row.get("hire_date")
        if start:
            contract_start = date.fromisoformat(str(start)[:10])
            annual_total = round(_months_worked(contract_start, year) * 1.5, 1)
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
    if body.type not in VALID_LEAVE_TYPES:
        raise HTTPException(400, f"type must be one of: {', '.join(sorted(VALID_LEAVE_TYPES))}")

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


@router.patch("/{leave_id}/cancel")
async def cancel_leave(
    leave_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Calls off a previously approved leave — a status, not a leave type.
    The approval trigger reverses the balance usage and employee status
    when it sees this transition."""
    _require_admin(user)
    existing = db.from_("leave_requests").select("status").eq("id", leave_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    if existing[0]["status"] != "approved":
        raise HTTPException(400, "Seule une demande approuvée peut être annulée")

    updates = {
        "status": "cancelled",
        "reviewed_by": user.id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    res = db.from_("leave_requests").update(updates).eq("id", leave_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")

    log_audit(db, user.id, "leave.cancel", "leave_request", leave_id)
    return res.data[0]


@router.get("/{leave_id}/document-url")
async def get_leave_document_url(
    leave_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("leave_requests").select("document_path").eq("id", leave_id).execute().data
    if not rows or not rows[0].get("document_path"):
        raise HTTPException(404, "Aucun document pour cette demande")
    signed = db.storage.from_(BUCKET_LEAVE_DOCS).create_signed_url(rows[0]["document_path"], DOC_SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.post("/{leave_id}/document")
async def upload_leave_document(
    leave_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    document: UploadFile = File(...),
):
    """Attaches (or replaces) the supporting document for a leave request —
    required for every type except unjustified_absence."""
    _require_admin(user)
    existing = db.from_("leave_requests").select("id").eq("id", leave_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    ext = ALLOWED_DOC_TYPES.get(document.content_type)
    if not ext:
        raise HTTPException(400, "Type de fichier non supporté (PDF, JPG, PNG uniquement).")

    data = await document.read()
    if not data:
        raise HTTPException(400, "Fichier vide.")
    if len(data) > MAX_DOC_SIZE:
        raise HTTPException(400, "Fichier trop volumineux (8 Mo max).")

    file_path = f"{leave_id}/{secrets.token_hex(8)}.{ext}"
    db.storage.from_(BUCKET_LEAVE_DOCS).upload(file_path, data, {"content-type": document.content_type})

    try:
        res = db.from_("leave_requests").update(
            {"document_path": file_path, "document_filename": document.filename}
        ).eq("id", leave_id).execute()
        if not res.data:
            raise HTTPException(400, "Impossible d'enregistrer le document")
    except Exception:
        db.storage.from_(BUCKET_LEAVE_DOCS).remove([file_path])
        raise

    log_audit(db, user.id, "leave.document_upload", "leave_request", leave_id)
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
