import logging
from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import EmployeeCreate, EmployeeUpdate
from utils.audit import log_audit
from utils.employee_dossier import analyze_employee_dossier
from routers.employee_files import BUCKET as EMPLOYEE_FILES_BUCKET

log = logging.getLogger(__name__)

router = APIRouter(prefix="/rh/employees", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


def _redact_salary(row: dict, user: CurrentUser) -> dict:
    """assistant_rh has full RH access except payroll/salary data."""
    if user.can_access_rh_payroll() or "salary" not in row:
        return row
    return {k: v for k, v in row.items() if k != "salary"}


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
        "items": [_redact_salary(r, user) for r in (res.data or [])],
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
    return _redact_salary(rows[0], user)


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
    if not user.can_access_rh_payroll():
        data.pop("salary", None)
    data["created_by"] = user.id

    res = db.from_("employees").insert(data).execute()
    new_employee = res.data[0]
    log_audit(db, user.id, "employee.create", "employee", new_employee["id"], {"full_name": body.full_name})
    return _redact_salary(new_employee, user)


@router.patch("/{employee_id}")
async def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not user.can_access_rh_payroll():
        updates.pop("salary", None)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("employees").update(updates).eq("id", employee_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "employee.update", "employee", employee_id, updates)
    return _redact_salary(res.data[0], user)


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


# ─────────────────────────────────────────────────────────────────────────
# AI dossier analysis — the LLM reads every dossier file (Fichiers tab) and
# extracts the employee's info. Result is stored per employee; GET serves
# the stored one (with a staleness flag when the file set changed), POST
# re-runs it. Nothing is written to the employee row until the separate
# /apply endpoint is called (the "Enregistrer dans la fiche" button) — HR
# reviews the analysis first.
# ─────────────────────────────────────────────────────────────────────────

def _analysis_payload(db: Client, employee_id: str, row: dict) -> dict:
    current = db.from_("employee_files").select("id").eq("employee_id", employee_id).execute().data or []
    current_ids = sorted(f["id"] for f in current)
    stored_ids = sorted(row.get("file_ids") or [])
    return {
        "analysis": row["data"],
        "analyzed_at": row["analyzed_at"],
        "file_count": len(stored_ids),
        "stale": current_ids != stored_ids,
    }


@router.get("/{employee_id}/analysis")
async def get_employee_analysis(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employee_analyses").select("*").eq("employee_id", employee_id).execute().data
    if not rows:
        return {"analysis": None}
    return _analysis_payload(db, employee_id, rows[0])


@router.post("/{employee_id}/analysis")
async def run_employee_analysis(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not db.from_("employees").select("id").eq("id", employee_id).execute().data:
        raise HTTPException(404, "Employé introuvable")

    file_rows = (
        db.from_("employee_files")
        .select("id, type, filename, file_path, content_type")
        .eq("employee_id", employee_id)
        .order("created_at")
        .execute()
        .data or []
    )
    if not file_rows:
        raise HTTPException(400, "Aucun document à analyser — ajoutez d'abord des fichiers au dossier (CIN, diplôme, contrat…).")

    # Photos are analyzed too — HR often uploads a CIN/ID scan under
    # "Photo d'identité" precisely because it has a face on it, and that
    # scan usually carries real identity text the AI should read.
    files = []
    for f in file_rows:
        try:
            data = db.storage.from_(EMPLOYEE_FILES_BUCKET).download(f["file_path"])
        except Exception:
            continue  # a missing storage object shouldn't sink the whole run
        files.append({"filename": f["filename"], "type": f["type"], "content_type": f["content_type"], "data": data})
    if not files:
        raise HTTPException(500, "Impossible de télécharger les fichiers du dossier.")

    emp = db.from_("employees").select("full_name, position, email").eq("id", employee_id).execute().data
    employee = emp[0] if emp else {}

    try:
        result = await run_in_threadpool(analyze_employee_dossier, files, employee)
    except Exception as e:
        raise HTTPException(500, f"L'analyse IA a échoué : {str(e)}")

    row = {
        "employee_id": employee_id,
        "data": result,
        "file_ids": [f["id"] for f in file_rows],
        "analyzed_by": user.id,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    res = db.from_("employee_analyses").upsert(row).execute()
    saved = res.data[0]

    log_audit(db, user.id, "employee.analyze", "employee", employee_id, {
        "files": len(files), "infos": len(result.get("infos") or []),
    })
    return _analysis_payload(db, employee_id, saved)


@router.post("/{employee_id}/analysis/apply")
async def apply_employee_analysis(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Writes the last analysis's extracted fields into the employee's
    fiche — a separate, explicit step (the "Enregistrer dans la fiche"
    button) so HR sees the results before anything gets saved. Each field
    is applied on its own so one value Postgres rejects (bad type, bad
    format) can't silently drop every other field with it."""
    _require_admin(user)
    rows = db.from_("employee_analyses").select("data").eq("employee_id", employee_id).execute().data
    if not rows:
        raise HTTPException(404, "Aucune analyse à enregistrer — lancez d'abord l'analyse.")

    details = (rows[0].get("data") or {}).get("details") or {}
    applied = 0
    for key, val in details.items():
        try:
            db.from_("employees").update({key: val}).eq("id", employee_id).execute()
            applied += 1
        except Exception:
            log.exception("Could not apply analyzed field %s=%r to employee %s", key, val, employee_id)

    # If the profile still has no photo, use the newest "photo" file already
    # sitting in this dossier — covers the case where the direct upload's
    # photo-linking step didn't run (e.g. an older upload).
    try:
        current = db.from_("employees").select("photo_url").eq("id", employee_id).execute().data
        if current and not current[0].get("photo_url"):
            photo_files = (
                db.from_("employee_files").select("file_path")
                .eq("employee_id", employee_id).eq("type", "photo")
                .order("created_at", desc=True).limit(1).execute().data
            )
            if photo_files:
                signed = db.storage.from_(EMPLOYEE_FILES_BUCKET).create_signed_url(
                    photo_files[0]["file_path"], 60 * 60 * 24 * 365 * 10
                )
                photo_url = signed.get("signedURL") or signed.get("signed_url")
                if photo_url:
                    db.from_("employees").update({"photo_url": photo_url}).eq("id", employee_id).execute()
    except Exception:
        log.exception("Could not backfill profile photo for employee %s", employee_id)

    log_audit(db, user.id, "employee.analyze.apply", "employee", employee_id, {"applied": applied})
    return {"applied": applied}
