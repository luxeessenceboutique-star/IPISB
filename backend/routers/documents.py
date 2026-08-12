from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser, FRONTEND_URL
from models import DocumentGenerate
from utils.audit import log_audit
from utils.documents import (
    DOCUMENT_LABELS, fr_date, new_verification_code, render_document_pdf, resolve_enrollment,
)
from utils.pdf_generators import render_transcript_pdf
from routers.grades import compute_course_grade

router = APIRouter(prefix="/documents", tags=["documents"])


def _build_transcript_pdf(db: Client, student: dict) -> bytes:
    class_rows = (
        db.from_("class_students").select("classes(id, name)")
        .eq("student_id", student["id"]).limit(1).execute().data or []
    )
    class_info = class_rows[0].get("classes") if class_rows else None
    class_name = class_info.get("name") if class_info else None

    course_ids: list[str] = []
    if class_info:
        cc = db.from_("class_courses").select("course_id").eq("class_id", class_info["id"]).execute().data or []
        course_ids = [r["course_id"] for r in cc]

    courses_out = []
    if course_ids:
        courses = db.from_("courses").select("id, title, credits").in_("id", course_ids).execute().data or []
        for course in courses:
            grade_info = compute_course_grade(db, course["id"], student["id"])
            courses_out.append({**course, "grade": grade_info["grade"]})

    return render_transcript_pdf({**student, "class_name": class_name}, courses_out)

BUCKET = "documents"
SIGNED_URL_TTL = 60 * 60  # 1 hour


@router.get("")
async def list_documents(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")

    query = db.from_("documents").select("*")
    if not user.is_admin():
        query = query.eq("generated_by", user.id)
    docs = query.order("created_at", desc=True).execute().data or []

    student_ids = list({d["student_id"] for d in docs if d.get("student_id")})
    name_map: dict[str, str] = {}
    if student_ids:
        profiles = db.from_("profiles").select("id, full_name").in_("id", student_ids).execute().data or []
        name_map = {p["id"]: p["full_name"] or "—" for p in profiles}

    return [
        {**d, "student_name": name_map.get(d.get("student_id", ""), "—"), "label": DOCUMENT_LABELS.get(d["type"], d["type"])}
        for d in docs
    ]


@router.post("/generate")
async def generate_document(
    body: DocumentGenerate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")
    if body.type not in DOCUMENT_LABELS:
        raise HTTPException(400, f"Unknown document type. Use one of: {', '.join(DOCUMENT_LABELS)}")

    student = (
        db.from_("profiles").select("id, full_name, created_by").eq("id", body.student_id).execute().data
    )
    if not student:
        raise HTTPException(404, "Student not found")
    if not user.is_admin() and student[0].get("created_by") != user.id:
        raise HTTPException(403, "Not authorized for this student")

    code = new_verification_code()
    verify_url = f"{FRONTEND_URL}/verify/{code}"
    if body.type == "releve_notes":
        pdf_bytes = _build_transcript_pdf(db, student[0])
    else:
        # Same fiche-administrative-is-authoritative preference as the
        # uploaded-template flow (routers/document_templates.py) — the
        # fiche's spelling wins over whatever was typed at account creation,
        # and only when it's actually been filled in.
        details_rows = (
            db.from_("student_details").select("nom, prenom, date_naissance, matricule")
            .eq("student_id", body.student_id).execute().data
        )
        details = details_rows[0] if details_rows else {}
        fiche_name = " ".join(p for p in (details.get("prenom"), details.get("nom")) if p)
        enrollment = resolve_enrollment(db, body.student_id)

        pdf_bytes = render_document_pdf(
            doc_type=body.type,
            student_name=fiche_name or student[0]["full_name"] or "—",
            verification_code=code,
            verify_url=verify_url,
            filiere=enrollment["filiere"],
            niveau=enrollment["niveau"],
            date_naissance=fr_date(details.get("date_naissance") or ""),
            enrollment_date=enrollment["enrollment_date"],
            matricule=details.get("matricule") or "",
            class_name=enrollment["class_name"],
        )

    file_path = f"{code}.pdf"
    try:
        db.storage.from_(BUCKET).upload(
            file_path, pdf_bytes, {"content-type": "application/pdf"}
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to store document: {str(e)}")

    res = db.from_("documents").insert({
        "type": body.type,
        "student_id": body.student_id,
        "file_path": file_path,
        "statut": "valide",
        "verification_code": code,
        "generated_by": user.id,
    }).execute()
    new_doc = res.data[0]

    log_audit(db, user.id, "document.generate", "document", new_doc["id"], {"type": body.type, "student_id": body.student_id})

    signed = db.storage.from_(BUCKET).create_signed_url(file_path, SIGNED_URL_TTL)
    return {**new_doc, "signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.get("/{document_id}/download")
async def get_download_url(
    document_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    rows = db.from_("documents").select("*").eq("id", document_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    doc = rows[0]
    if not user.is_admin() and doc.get("generated_by") != user.id:
        raise HTTPException(403, "Not authorized")

    signed = db.storage.from_(BUCKET).create_signed_url(doc["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.post("/{document_id}/revoke")
async def revoke_document(
    document_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Mark invalid but keep the registry row — the public QR check must keep
    answering 'revoked' for codes already printed on paper."""
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    res = db.from_("documents").update({"statut": "revoque"}).eq("id", document_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "document.revoke", "document", document_id)
    return {"ok": True}


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Hard delete: removes the row AND the stored file. The QR code (if any
    was distributed) will verify as 'invalid' with no trace — prefer revoke
    for documents that actually left the building."""
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    rows = db.from_("documents").select("file_path").eq("id", document_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass  # storage cleanup is best-effort — don't block the row delete on it
    db.from_("documents").delete().eq("id", document_id).execute()
    log_audit(db, user.id, "document.delete", "document", document_id)
    return {"ok": True}


@router.get("/verify/{code}")
async def verify_document(
    code: str,
    db: Annotated[Client, Depends(get_db)],
):
    """Public endpoint — no auth. Powers the QR-code authenticity check.
    Returns only enough to confirm authenticity, never the file itself."""
    rows = (
        db.from_("documents")
        .select("type, statut, created_at, student_id")
        .eq("verification_code", code)
        .execute()
        .data
    )
    if not rows:
        return {"valid": False}
    doc = rows[0]

    student_name = "—"
    if doc.get("student_id"):
        profile = db.from_("profiles").select("full_name").eq("id", doc["student_id"]).execute().data
        if profile:
            student_name = profile[0]["full_name"] or "—"

    return {
        "valid": doc["statut"] == "valide",
        "type": doc["type"],
        "label": DOCUMENT_LABELS.get(doc["type"], doc["type"]),
        "student_name": student_name,
        "issued_at": doc["created_at"],
        "institution": "IPISB",
    }
