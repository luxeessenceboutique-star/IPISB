import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from deps import CurrentUser, get_current_user, get_db
from utils.audit import log_audit

router = APIRouter(prefix="/rh/employees/{employee_id}/files", tags=["rh"])

BUCKET = "employee-files"
SIGNED_URL_TTL = 60 * 60  # 1 hour
# Profile photos are displayed directly (employee header, list rows), so
# their stored URL must not expire in practice — mirrors student_files.py.
PHOTO_URL_TTL = 60 * 60 * 24 * 365 * 10
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
}

FILE_TYPES = {"cin", "diplome", "photo", "cv", "contrat", "autre"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _check_employee(db: Client, employee_id: str) -> None:
    if not db.from_("employees").select("id").eq("id", employee_id).execute().data:
        raise HTTPException(404, "Employé introuvable")


@router.get("")
async def list_employee_files(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    _check_employee(db, employee_id)
    return (
        db.from_("employee_files")
        .select("*")
        .eq("employee_id", employee_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )


@router.post("")
async def upload_employee_file(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    type: str = Form("autre"),
    file: UploadFile = File(...),
):
    _require_admin(user)
    _check_employee(db, employee_id)

    if type not in FILE_TYPES:
        raise HTTPException(400, f"Type invalide. Utilisez : {', '.join(sorted(FILE_TYPES))}")
    content_type = file.content_type or ""
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise HTTPException(400, "Seuls les fichiers PDF, DOCX, JPG et PNG sont acceptés")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Fichier vide")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "Le fichier dépasse la limite de 20 Mo")

    file_path = f"{employee_id}/{secrets.token_hex(8)}.{ext}"
    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage : {str(e)}")

    try:
        res = db.from_("employee_files").insert({
            "employee_id": employee_id,
            "type": type,
            "filename": file.filename or f"fichier.{ext}",
            "file_path": file_path,
            "content_type": content_type,
            "uploaded_by": user.id,
        }).execute()
        if not res.data:
            raise HTTPException(400, "Impossible d'enregistrer le fichier")
    except Exception:
        db.storage.from_(BUCKET).remove([file_path])
        raise
    new_file = res.data[0]

    # A dossier photo becomes the profile photo — shown on the employee
    # header and in the Employés list.
    if type == "photo":
        try:
            signed = db.storage.from_(BUCKET).create_signed_url(file_path, PHOTO_URL_TTL)
            photo_url = signed.get("signedURL") or signed.get("signed_url")
            if photo_url:
                db.from_("employees").update({"photo_url": photo_url}).eq("id", employee_id).execute()
        except Exception:
            pass  # photo linking is best-effort — the file itself is saved

    log_audit(db, user.id, "employee_file.upload", "employee_file", new_file["id"], {
        "employee_id": employee_id, "type": type, "filename": new_file["filename"],
    })
    return new_file


@router.get("/{file_id}/download")
async def download_employee_file(
    employee_id: str,
    file_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employee_files").select("file_path").eq("id", file_id).eq("employee_id", employee_id).execute().data
    if not rows:
        raise HTTPException(404, "Fichier introuvable")
    signed = db.storage.from_(BUCKET).create_signed_url(rows[0]["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.delete("/{file_id}")
async def delete_employee_file(
    employee_id: str,
    file_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employee_files").select("file_path, type").eq("id", file_id).eq("employee_id", employee_id).execute().data
    if not rows:
        raise HTTPException(404, "Fichier introuvable")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass  # storage cleanup is best-effort — don't block the row delete on it
    db.from_("employee_files").delete().eq("id", file_id).execute()

    # If the deleted file was backing the profile photo, clear it so the
    # header/list fall back to the initials avatar instead of a dead URL.
    if rows[0]["type"] == "photo":
        try:
            emp = db.from_("employees").select("photo_url").eq("id", employee_id).execute().data
            if emp and rows[0]["file_path"] in (emp[0].get("photo_url") or ""):
                db.from_("employees").update({"photo_url": None}).eq("id", employee_id).execute()
        except Exception:
            pass

    log_audit(db, user.id, "employee_file.delete", "employee_file", file_id, {"employee_id": employee_id})
    return {"ok": True}
