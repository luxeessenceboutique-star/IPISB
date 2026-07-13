from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from deps import CurrentUser, FRONTEND_URL, get_current_user, get_db
from models import TemplateGenerate
from utils.audit import log_audit
from utils.documents import new_verification_code
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


def _resolve_class_name(db: Client, student_id: str) -> str:
    rows = (
        db.from_("class_students")
        .select("classes(name)")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
        .data or []
    )
    if rows and rows[0].get("classes"):
        return rows[0]["classes"]["name"] or ""
    return ""


# Institution constants — same facts already hardcoded in chatbot/knowledge.py.
ESTABLISHMENT_NAME = "IPISB"
ESTABLISHMENT_ADDRESS = "El Jadida, Maroc"


def _current_academic_year() -> str:
    """Morocco's school year runs Sept-June — before September, we're still
    in the year that started the previous September."""
    now = datetime.now(timezone.utc)
    start_year = now.year if now.month >= 9 else now.year - 1
    return f"{start_year}-{start_year + 1}"


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

    code = new_verification_code()
    context = {
        "student_name": student.get("full_name") or "",
        "student_email": student.get("email") or "",
        "class_name": _resolve_class_name(db, body.student_id),
        # Not collected anywhere in the system today (no column on `profiles`) —
        # always resolves to the visible blank placeholder until that changes.
        "date_of_birth": "",
        "issue_date": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
        "academic_year": _current_academic_year(),
        "establishment_name": ESTABLISHMENT_NAME,
        "establishment_address": ESTABLISHMENT_ADDRESS,
        "verification_code": code,
        # Image-zone replacements (student cards): the profile photo and a
        # fresh QR pointing at this document's public verification page.
        "student_photo_url": student.get("photo_url") or "",
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
