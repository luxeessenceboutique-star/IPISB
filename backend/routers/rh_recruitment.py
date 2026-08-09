import logging
import secrets
from datetime import date, timedelta
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from openai import AsyncOpenAI
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    JobAdCreate, JobAdUpdate,
    CandidateCreate, CandidatePromote,
    InterviewCreate, InterviewUpdate,
    SlotCreate,
)
from utils.audit import log_audit
from utils.cv_extraction import extract_cv_content, build_cv_extraction_messages, parse_cv_extraction_response
from utils.email import send_email
from copilot.agent import BASE_URL, API_KEY, CHAT_MODEL
from routers.rh_onboarding import DEFAULT_PLAN_30, DEFAULT_PLAN_60, DEFAULT_PLAN_90

log = logging.getLogger(__name__)

router = APIRouter(prefix="/rh/recruitment", tags=["rh"])

VALID_INTERVIEW_STATUSES = {"pending", "confirmed", "completed", "cancelled"}

DEFAULT_REQUIRED_DOCUMENTS = [
    "Copie de la CIN (carte d'identité nationale)",
    "Copie(s) du/des diplôme(s)",
    "CV à jour",
    "2 photos d'identité",
    "RIB (relevé d'identité bancaire)",
    "Certificat médical d'aptitude au travail",
    "Numéro CNSS (si déjà affilié)",
    "Attestation(s) de travail des postes précédents (le cas échéant)",
]

BUCKET_CVS = "candidate-cvs"
CV_SIGNED_URL_TTL = 60 * 60  # 1 hour
MAX_CV_SIZE = 8 * 1024 * 1024  # 8 MB — tighter than student_files' 20MB since this is a public, unauthenticated endpoint
ALLOWED_CV_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


# ── Job ads ──────────────────────────────────────────────────────────────────

@router.get("/ads")
async def list_ads(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("recruitment_ads").select("*").order("created_at", desc=True).execute()
    return res.data or []


@router.post("/ads")
async def create_ad(
    body: JobAdCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump()
    data["created_by"] = user.id

    res = db.from_("recruitment_ads").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create ad")
    ad = res.data[0]
    log_audit(db, user.id, "recruitment_ad.create", "recruitment_ad", ad["id"])
    return ad


@router.patch("/ads/{ad_id}")
async def update_ad(
    ad_id: str,
    body: JobAdUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("recruitment_ads").update(updates).eq("id", ad_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "recruitment_ad.update", "recruitment_ad", ad_id, updates)
    return res.data[0]


@router.delete("/ads/{ad_id}")
async def delete_ad(
    ad_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("recruitment_ads").select("id").eq("id", ad_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("recruitment_ads").delete().eq("id", ad_id).execute()
    log_audit(db, user.id, "recruitment_ad.delete", "recruitment_ad", ad_id)
    return {"ok": True}


@router.get("/ads/{ad_id}/public")
async def get_public_ad(
    ad_id: str,
    db: Annotated[Client, Depends(get_db)],
):
    """Public endpoint — no auth. Powers the /apply/{ad_id} landing page."""
    rows = (
        db.from_("recruitment_ads")
        .select("id, poste, description, competences, experience, contenu, image_url, is_active")
        .eq("id", ad_id)
        .execute()
        .data
    )
    if not rows or not rows[0]["is_active"]:
        raise HTTPException(404, "Offre introuvable ou expirée")
    return rows[0]


async def _process_cv(db: Client, cv: UploadFile, storage_prefix: str) -> tuple[dict, str]:
    """Validates, extracts, and stores a CV. Returns (extracted_fields, file_path).
    extracted_fields keys: education, experience_summary, skills, languages,
    years_experience, raw. Raises HTTPException on validation/storage failure;
    the LLM extraction step itself is best-effort and never raises."""
    content_type = cv.content_type or ""
    ext = ALLOWED_CV_TYPES.get(content_type)
    if not ext:
        raise HTTPException(400, "Seuls les fichiers PDF, DOCX, JPG et PNG sont acceptés pour le CV")

    data = await cv.read()
    if not data:
        raise HTTPException(400, "Le fichier CV est vide")
    if len(data) > MAX_CV_SIZE:
        raise HTTPException(400, "Le CV dépasse la limite de 8 Mo")

    # 1. Extract raw content — CPU-bound (pdfplumber/docx/PIL), off the event loop.
    text, image_urls = await run_in_threadpool(extract_cv_content, content_type, data)

    # 2. LLM structured extraction — best-effort, must never block the caller.
    extracted: dict = {}
    try:
        client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
        completion = await client.chat.completions.create(
            model=CHAT_MODEL,
            messages=build_cv_extraction_messages(text, image_urls),
            temperature=0,
            max_tokens=1200,
        )
        extracted = parse_cv_extraction_response(completion.choices[0].message.content or "{}")
    except Exception:
        pass

    # 3. Store the CV (only after validation passed).
    file_path = f"{storage_prefix}/{secrets.token_hex(8)}.{ext}"
    try:
        db.storage.from_(BUCKET_CVS).upload(file_path, data, {"content-type": content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du CV : {str(e)}")

    return extracted, file_path


@router.post("/ads/{ad_id}/apply")
async def apply_to_ad(
    ad_id: str,
    db: Annotated[Client, Depends(get_db)],
    full_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    message: Optional[str] = Form(None),
    cv: UploadFile = File(...),
):
    """Public endpoint — no auth. Candidate self-service application: creates
    a status='candidate' employees row, stores the CV, and best-effort
    enriches it via AI extraction (never blocks submission on AI failure)."""
    ad = (
        db.from_("recruitment_ads").select("id, poste, is_active")
        .eq("id", ad_id).execute().data
    )
    if not ad or not ad[0]["is_active"]:
        raise HTTPException(404, "Offre introuvable ou expirée")

    full_name, email, phone = full_name.strip(), email.strip(), phone.strip()
    if not full_name or not email or "@" not in email or not phone:
        raise HTTPException(400, "Nom, email et téléphone valides sont requis")

    extracted, file_path = await _process_cv(db, cv, ad_id)

    row = {
        "full_name": full_name, "email": email, "phone": phone,
        "position": ad[0]["poste"], "status": "candidate",
        "source": "public_application", "applied_ad_id": ad_id,
        "cv_path": file_path, "cv_filename": cv.filename,
        "education": extracted.get("education"),
        "experience_summary": extracted.get("experience_summary"),
        "skills": extracted.get("skills"),
        "languages": extracted.get("languages"),
        "years_experience": extracted.get("years_experience"),
        "ai_extracted": extracted.get("raw"),
        "notes": message.strip() if message else None,
    }
    try:
        res = db.from_("employees").insert({k: v for k, v in row.items() if v is not None}).execute()
    except Exception:
        db.storage.from_(BUCKET_CVS).remove([file_path])
        raise
    if not res.data:
        db.storage.from_(BUCKET_CVS).remove([file_path])
        raise HTTPException(400, "Impossible d'enregistrer la candidature")
    candidate = res.data[0]
    log_audit(db, None, "candidate.apply_public", "employee", candidate["id"], {"ad_id": ad_id})
    return {"ok": True}


AD_CHAT_SYSTEM = (
    "Tu es un expert en recrutement RH pour l'IPISB (Institut Privé d'Innovation "
    "en Santé et Bien-être, El Jadida, Maroc).\n"
    "Ton but est d'aider l'utilisateur à rédiger une annonce de poste perfectionnée.\n\n"
    "Processus :\n"
    "1. Si l'utilisateur donne peu d'infos, demande des précisions (missions, compétences, avantages).\n"
    "2. Si les infos sont suffisantes, génère une annonce structurée avec :\n"
    "   - Titre du poste\n"
    "   - Présentation de l'établissement (IPISB)\n"
    "   - Missions\n"
    "   - Profil recherché\n"
    "   - Ce que nous offrons\n"
    "   - Un appel à candidature.\n\n"
    "Réponds toujours en français. Quand tu génères l'annonce finale, fais-la précéder "
    "d'une ligne contenant seulement '---' pour la séparer du reste de ta réponse."
)


class AdChatGenerateRequest(BaseModel):
    messages: list[dict]


@router.post("/ads/chat-generate")
async def chat_generate_ad(
    body: AdChatGenerateRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    _require_admin(user)
    client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
    try:
        completion = await client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "system", "content": AD_CHAT_SYSTEM}] + body.messages,
            max_tokens=900,
            temperature=0.6,
        )
        reply = completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"reply": reply}


# ── Candidates (employees rows with status='candidate') ──────────────────────

@router.get("/candidates")
async def list_candidates(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("employees").select("*")
        .eq("status", "candidate")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/candidates")
async def create_candidate(
    body: CandidateCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.full_name.strip():
        raise HTTPException(400, "full_name is required")

    data = body.model_dump(exclude_none=True)
    data["status"] = "candidate"
    data["created_by"] = user.id

    res = db.from_("employees").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create candidate")
    candidate = res.data[0]
    log_audit(db, user.id, "candidate.create", "employee", candidate["id"])
    return candidate


def _onboarding_email_html(full_name: str, position: str | None, hire_date: str | None, documents: list[str]) -> str:
    doc_items = "".join(f"<li>{d}</li>" for d in documents)
    when = f" à partir du <b>{hire_date}</b>" if hire_date else ""
    role = f" en tant que <b>{position}</b>" if position else ""
    return (
        f"<h2>Bienvenue chez IPISB, {full_name} !</h2>"
        f"<p>Nous sommes ravis de vous accueillir{role}{when}.</p>"
        f"<p>Avant votre prise de poste, merci de nous transmettre les documents suivants "
        f"à l'accueil ou par retour d'email :</p>"
        f"<ul>{doc_items}</ul>"
        f"<p>Notre équipe RH reviendra vers vous prochainement pour organiser votre intégration "
        f"(rencontre avec votre manager, présentation des équipes, accès aux outils internes).</p>"
        f"<p>À très bientôt,<br/>L'équipe RH — IPISB</p>"
    )


@router.post("/candidates/{candidate_id}/promote")
async def promote_candidate(
    candidate_id: str,
    body: CandidatePromote,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.probation_duration_days not in (30, 60, 90):
        raise HTTPException(400, "probation_duration_days must be 30, 60, or 90")

    start_date = date.fromisoformat(body.hire_date) if body.hire_date else date.today()
    probation_end_date = start_date + timedelta(days=body.probation_duration_days)

    updates = {
        "status": "active",
        "probation_duration_days": body.probation_duration_days,
        "probation_end_date": probation_end_date.isoformat(),
        "probation_status": "in_progress",
    }
    if body.hire_date:
        updates["hire_date"] = body.hire_date
    if body.position:
        updates["position"] = body.position

    res = db.from_("employees").update(updates).eq("id", candidate_id).eq("status", "candidate").execute()
    if not res.data:
        raise HTTPException(404, "Candidate not found")
    employee = res.data[0]
    log_audit(db, user.id, "candidate.promote", "employee", candidate_id, updates)

    # Move them into the onboarding tracker (best-effort — promotion must succeed either way).
    try:
        existing = db.from_("employee_onboarding").select("id").eq("employee_id", candidate_id).execute().data
        if not existing:
            db.from_("employee_onboarding").insert({
                "employee_id": candidate_id, "phase": "day30",
                "plan_30": DEFAULT_PLAN_30, "plan_60": DEFAULT_PLAN_60, "plan_90": DEFAULT_PLAN_90,
            }).execute()
    except Exception:
        log.exception("Could not initialize onboarding for employee %s", candidate_id)

    # Confirmation email with next steps + required documents (best-effort — send_email never raises).
    if employee.get("email"):
        documents = body.required_documents or DEFAULT_REQUIRED_DOCUMENTS
        send_email(
            employee["email"],
            "Bienvenue chez IPISB — Prochaines étapes",
            _onboarding_email_html(employee["full_name"], employee.get("position"), employee.get("hire_date"), documents),
        )

    return employee


@router.get("/candidates/{candidate_id}/cv-url")
async def get_candidate_cv_url(
    candidate_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("employees").select("cv_path")
        .eq("id", candidate_id).eq("status", "candidate").execute().data
    )
    if not rows or not rows[0].get("cv_path"):
        raise HTTPException(404, "Aucun CV pour ce candidat")
    signed = db.storage.from_(BUCKET_CVS).create_signed_url(rows[0]["cv_path"], CV_SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.post("/candidates/{candidate_id}/cv")
async def upload_candidate_cv(
    candidate_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    cv: UploadFile = File(...),
):
    """Admin-only manual CV upload — for candidates added directly by HR
    (not through the public apply link). Runs the same AI extraction
    pipeline so HR gets the same at-a-glance summary either way."""
    _require_admin(user)
    existing = db.from_("employees").select("id").eq("id", candidate_id).eq("status", "candidate").execute().data
    if not existing:
        raise HTTPException(404, "Candidat introuvable")

    extracted, file_path = await _process_cv(db, cv, candidate_id)

    updates = {
        "cv_path": file_path, "cv_filename": cv.filename,
        "education": extracted.get("education"),
        "experience_summary": extracted.get("experience_summary"),
        "skills": extracted.get("skills"),
        "languages": extracted.get("languages"),
        "years_experience": extracted.get("years_experience"),
        "ai_extracted": extracted.get("raw"),
    }
    try:
        res = db.from_("employees").update({k: v for k, v in updates.items() if v is not None}).eq("id", candidate_id).execute()
    except Exception:
        db.storage.from_(BUCKET_CVS).remove([file_path])
        raise
    if not res.data:
        db.storage.from_(BUCKET_CVS).remove([file_path])
        raise HTTPException(400, "Impossible d'enregistrer le CV")
    log_audit(db, user.id, "candidate.cv_upload", "employee", candidate_id)
    return res.data[0]


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(
    candidate_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("employees").select("id").eq("id", candidate_id).eq("status", "candidate").execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("employees").delete().eq("id", candidate_id).execute()
    log_audit(db, user.id, "candidate.delete", "employee", candidate_id)
    return {"ok": True}


# ── Interviews ─────────────────────────────────────────────────────────────

@router.get("/interviews")
async def list_interviews(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    candidate_id: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("interviews").select("*, employees(full_name)")
    if candidate_id:
        query = query.eq("candidate_id", candidate_id)

    res = query.order("date").order("start_time").execute()
    items = []
    for row in res.data or []:
        emp = row.get("employees") or {}
        items.append({**{k: v for k, v in row.items() if k != "employees"}, "candidate_name": emp.get("full_name")})
    return items


@router.post("/interviews")
async def schedule_interview(
    body: InterviewCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)

    if body.slot_id:
        slot = db.from_("hr_slots").select("id, status").eq("id", body.slot_id).execute().data
        if not slot:
            raise HTTPException(404, "Créneau introuvable")
        if slot[0]["status"] == "reserved":
            raise HTTPException(409, "Ce créneau est déjà réservé")

    data = body.model_dump(exclude={"slot_id"}, exclude_none=True)
    data["status"] = "pending"
    data["created_by"] = user.id

    res = db.from_("interviews").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create interview")
    interview = res.data[0]

    if body.slot_id:
        db.from_("hr_slots").update({"status": "reserved", "interview_id": interview["id"]}).eq("id", body.slot_id).execute()

    log_audit(db, user.id, "interview.create", "interview", interview["id"])
    return interview


@router.patch("/interviews/{interview_id}/status")
async def update_interview_status(
    interview_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    status: str = Query(...),
):
    _require_admin(user)
    if status not in VALID_INTERVIEW_STATUSES:
        raise HTTPException(400, f"Invalid status. Use one of: {', '.join(sorted(VALID_INTERVIEW_STATUSES))}")

    res = db.from_("interviews").update({"status": status}).eq("id", interview_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, f"interview.status.{status}", "interview", interview_id)
    return res.data[0]


@router.patch("/interviews/{interview_id}")
async def update_interview(
    interview_id: str,
    body: InterviewUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("interviews").update(updates).eq("id", interview_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "interview.update", "interview", interview_id, updates)
    return res.data[0]


@router.delete("/interviews/{interview_id}")
async def delete_interview(
    interview_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("interviews").select("id").eq("id", interview_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("hr_slots").update({"status": "free", "interview_id": None}).eq("interview_id", interview_id).execute()
    db.from_("interviews").delete().eq("id", interview_id).execute()
    log_audit(db, user.id, "interview.delete", "interview", interview_id)
    return {"ok": True}


# ── Interview time slots ──────────────────────────────────────────────────

@router.get("/slots")
async def list_slots(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    ad_id: Optional[str] = None,
    slot_date: Optional[str] = Query(default=None, alias="date"),
):
    _require_admin(user)
    query = db.from_("hr_slots").select("*")
    if ad_id:
        query = query.or_(f"ad_id.eq.{ad_id},ad_id.is.null")
    if slot_date:
        query = query.eq("date", slot_date)

    res = query.order("date").order("start_time").execute()
    slots = res.data or []

    reserved_times_by_date: dict[str, list[str]] = {}
    for s in slots:
        if s.get("status") == "reserved":
            reserved_times_by_date.setdefault(s.get("date", ""), []).append(s.get("start_time", ""))
    for s in slots:
        s["reserved_times"] = reserved_times_by_date.get(s.get("date", ""), [])
    return slots


@router.post("/slots")
async def create_slots(
    body: List[SlotCreate],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body:
        return []

    records = [{**s.model_dump(exclude_none=True), "status": "free"} for s in body]
    res = db.from_("hr_slots").insert(records).execute()
    if not res.data:
        raise HTTPException(400, "Could not create slots")
    log_audit(db, user.id, "slots.create", "hr_slots", None, {"count": len(records)})
    return res.data


@router.delete("/slots/{slot_id}")
async def delete_slot(
    slot_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("hr_slots").select("id").eq("id", slot_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("hr_slots").delete().eq("id", slot_id).execute()
    return {"ok": True}
