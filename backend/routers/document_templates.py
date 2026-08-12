from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from deps import CurrentUser, FRONTEND_URL, get_current_user, get_db
from models import TemplateGenerate
from utils import institution
from utils.audit import log_audit
from utils.documents import current_academic_year, fr_date, new_verification_code, resolve_enrollment
from utils.templates import (
    FIELD_LABELS,
    detect_fields,
    detect_file_kind,
    generate_from_template,
)

router = APIRouter(prefix="/document-templates", tags=["document-templates"])

TEMPLATE_BUCKET = "document-templates"
DOCUMENT_BUCKET = "documents"
SIGNED_URL_TTL = 60 * 60  # 1 hour

MAX_TEMPLATE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.get("")
async def list_templates(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")

    rows = db.from_("document_templates").select("*").order("created_at", desc=True).execute().data or []
    return [
        {
            **row,
            "fields": [
                {**f, "label": FIELD_LABELS.get(f["key"], f["key"])}
                for f in (row.get("fields") or [])
            ],
        }
        for row in rows
    ]


@router.post("")
async def upload_template(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    name: str = Form(...),
    file: UploadFile = File(...),
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")

    content_type = file.content_type or ""
    try:
        file_kind = detect_file_kind(content_type)
    except ValueError as e:
        raise HTTPException(400, str(e))

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Fichier vide")
    if len(data) > MAX_TEMPLATE_SIZE:
        raise HTTPException(400, "Le fichier dépasse la limite de 20 Mo")

    # One-time LLM pass — never repeated for this template again.
    fields = detect_fields(data, file_kind, content_type)

    ext = {"docx": "docx", "pdf": "pdf", "image": "jpg" if content_type == "image/jpeg" else "png"}[file_kind]
    file_path = f"{new_verification_code()}.{ext}"

    try:
        db.storage.from_(TEMPLATE_BUCKET).upload(file_path, data, {"content-type": content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du modèle : {str(e)}")

    res = db.from_("document_templates").insert({
        "name": name.strip() or (file.filename or "Modèle sans nom"),
        "file_path": file_path,
        "file_kind": file_kind,
        "content_type": content_type,
        "fields": fields,
        "created_by": user.id,
    }).execute()
    new_template = res.data[0]

    log_audit(db, user.id, "document_template.create", "document_template", new_template["id"], {"name": new_template["name"]})

    return {
        **new_template,
        "fields": [{**f, "label": FIELD_LABELS.get(f["key"], f["key"])} for f in fields],
    }


@router.post("/{template_id}/redetect")
async def redetect_template_fields(
    template_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Re-run field detection on a stored template. Needed when the field
    vocabulary grows (e.g. cin/matricule added): templates detected before
    the change keep their old field map until re-detected here."""
    if not user.is_admin():
        raise HTTPException(403, "Admin only")

    rows = db.from_("document_templates").select("*").eq("id", template_id).execute().data
    if not rows:
        raise HTTPException(404, "Modèle introuvable")
    template = rows[0]

    try:
        data = db.storage.from_(TEMPLATE_BUCKET).download(template["file_path"])
    except Exception as e:
        raise HTTPException(500, f"Échec du chargement du modèle : {str(e)}")

    fields = detect_fields(data, template["file_kind"], template["content_type"])
    db.from_("document_templates").update({"fields": fields}).eq("id", template_id).execute()

    log_audit(db, user.id, "document_template.redetect", "document_template", template_id, {"fields": len(fields)})
    return {
        **template,
        "fields": [{**f, "label": FIELD_LABELS.get(f["key"], f["key"])} for f in fields],
    }


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.is_admin():
        raise HTTPException(403, "Admin only")

    rows = db.from_("document_templates").select("file_path").eq("id", template_id).execute().data
    if not rows:
        raise HTTPException(404, "Modèle introuvable")

    try:
        db.storage.from_(TEMPLATE_BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass  # storage cleanup is best-effort — don't block the row delete on it

    db.from_("document_templates").delete().eq("id", template_id).execute()
    log_audit(db, user.id, "document_template.delete", "document_template", template_id)
    return {"ok": True}




@router.post("/{template_id}/generate")
async def generate_document_from_template(
    template_id: str,
    body: TemplateGenerate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")

    templates = db.from_("document_templates").select("*").eq("id", template_id).execute().data
    if not templates:
        raise HTTPException(404, "Modèle introuvable")
    template = templates[0]

    students = db.from_("profiles").select("id, full_name, email, photo_url, created_by").eq("id", body.student_id).execute().data
    if not students:
        raise HTTPException(404, "Étudiant introuvable")
    student = students[0]
    if not user.is_admin() and student.get("created_by") != user.id:
        raise HTTPException(403, "Not authorized for this student")

    try:
        template_bytes = db.storage.from_(TEMPLATE_BUCKET).download(template["file_path"])
    except Exception as e:
        raise HTTPException(500, f"Échec du chargement du modèle : {str(e)}")

    details_rows = db.from_("student_details").select("nom, prenom, date_naissance, lieu_naissance, cin, matricule").eq("student_id", body.student_id).execute().data
    details = details_rows[0] if details_rows else {}
    # PostgREST returns the date column as ISO AAAA-MM-JJ.
    date_naissance = fr_date(details.get("date_naissance") or "")

    # Profile photo, falling back to the dossier's photo file — covers
    # students whose photo was uploaded before the profile wiring existed.
    photo_url = student.get("photo_url") or ""
    if not photo_url:
        photo_files = (
            db.from_("student_files").select("file_path")
            .eq("student_id", body.student_id).eq("type", "photo")
            .order("created_at", desc=True).limit(1).execute().data
        )
        if photo_files:
            try:
                signed = db.storage.from_("student-files").create_signed_url(photo_files[0]["file_path"], 3600)
                photo_url = signed.get("signedURL") or signed.get("signed_url") or ""
            except Exception:
                pass  # no photo is a visible-but-acceptable outcome; a crash is not

    code = new_verification_code()
    enrollment = resolve_enrollment(db, body.student_id)
    # The fiche administrative is the authoritative spelling of the name (the
    # profile's full_name is whatever was typed at account creation, casing
    # included) — fall back to it only when the fiche has no name on file.
    fiche_name = " ".join(p for p in (details.get("prenom"), details.get("nom")) if p)
    context = {
        "student_name": fiche_name or student.get("full_name") or "",
        # Split name for {{ nom }} / {{ prenom }} templates — the fiche is
        # authoritative; full_name backs up the family-name slot so machine
        # templates never print a blank where a name belongs.
        "last_name": details.get("nom") or student.get("full_name") or "",
        "first_name": details.get("prenom") or "",
        "student_email": student.get("email") or "",
        # Classe, filière, niveau and enrolment date all come from the class the
        # student currently belongs to.
        **enrollment,
        # Filled from the fiche administrative when it's been saved; blank
        # placeholder otherwise (the pre-details behaviour).
        "date_of_birth": date_naissance,
        "place_of_birth": details.get("lieu_naissance") or "",
        "cin": details.get("cin") or "",
        "matricule": details.get("matricule") or "",
        "issue_date": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
        "academic_year": current_academic_year(),
        "establishment_name": institution.NAME,
        "establishment_address": institution.ADDRESS,
        "city": institution.CITY,
        "establishment_phone": institution.PHONE,
        "establishment_legal_status": institution.LEGAL_STATUS,
        "establishment_authorization": institution.AUTHORIZATION,
        "establishment_website": institution.WEBSITE,
        "establishment_email": institution.EMAIL,
        "establishment_director_name": f"{institution.DIRECTOR_CIVILITY} {institution.DIRECTOR_NAME}",
        "establishment_director_title": institution.DIRECTOR_TITLE,
        "verification_code": code,
        # Image-zone replacements (student cards): the profile photo and a
        # fresh QR pointing at this document's public verification page.
        "student_photo_url": photo_url,
        "verify_url": f"{FRONTEND_URL}/verify/{code}",
    }

    try:
        output_bytes, output_content_type = generate_from_template(
            template_bytes, template["file_kind"], template.get("fields") or [], context
        )
    except Exception as e:
        raise HTTPException(500, f"Échec de la génération du document : {str(e)}")

    ext = "docx" if output_content_type.endswith("wordprocessingml.document") else "pdf"
    file_path = f"{code}.{ext}"
    try:
        db.storage.from_(DOCUMENT_BUCKET).upload(file_path, output_bytes, {"content-type": output_content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du document : {str(e)}")

    res = db.from_("documents").insert({
        "type": template["name"],
        "student_id": body.student_id,
        "template_id": template_id,
        "file_path": file_path,
        "statut": "valide",
        "verification_code": code,
        "generated_by": user.id,
    }).execute()
    new_doc = res.data[0]

    log_audit(db, user.id, "document.generate_from_template", "document", new_doc["id"], {
        "template_id": template_id, "student_id": body.student_id,
    })

    signed = db.storage.from_(DOCUMENT_BUCKET).create_signed_url(file_path, SIGNED_URL_TTL)
    return {**new_doc, "signed_url": signed.get("signedURL") or signed.get("signed_url")}
