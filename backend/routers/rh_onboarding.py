import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import OnboardingUpdate, PulseSurveyCreate, ProbationDecision
from utils.audit import log_audit

log = logging.getLogger(__name__)

router = APIRouter(prefix="/rh/onboarding", tags=["rh"])

VALID_PROBATION_DECISIONS = {"passed", "failed", "extended"}
PROBATION_DECISION_LABELS = {
    "passed": "Confirmé(e) dans le poste",
    "failed": "Non confirmé(e) — fin de collaboration",
    "extended": "Période d'essai prolongée",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


DEFAULT_PLAN_30 = [
    {"id": "p30_1", "label": "Rencontre avec le manager direct", "done": False},
    {"id": "p30_2", "label": "Formation onboarding RH", "done": False},
    {"id": "p30_3", "label": "Accès outils et systèmes configurés", "done": False},
    {"id": "p30_4", "label": "Présentation aux équipes", "done": False},
    {"id": "p30_5", "label": "Lecture documentation interne", "done": False},
    {"id": "p30_6", "label": "Premier point formel avec le manager", "done": False},
    {"id": "p30_7", "label": "Signature contrat de travail", "done": False},
]
DEFAULT_PLAN_60 = [
    {"id": "p60_1", "label": "Première mission/livraison réalisée", "done": False},
    {"id": "p60_2", "label": "Maîtrise des processus internes", "done": False},
    {"id": "p60_3", "label": "Évaluation mi-période (30j) complétée", "done": False},
    {"id": "p60_4", "label": "Plan de développement individuel défini", "done": False},
    {"id": "p60_5", "label": "Intégration culture d'entreprise", "done": False},
    {"id": "p60_6", "label": "Buddy / mentor rencontré régulièrement", "done": False},
]
DEFAULT_PLAN_90 = [
    {"id": "p90_1", "label": "Objectifs 90j atteints", "done": False},
    {"id": "p90_2", "label": "Autonomie opérationnelle confirmée", "done": False},
    {"id": "p90_3", "label": "Évaluation finale onboarding", "done": False},
    {"id": "p90_4", "label": "Plan de formation identifié", "done": False},
    {"id": "p90_5", "label": "Feedback 360° collecté", "done": False},
    {"id": "p90_6", "label": "Objectifs N+1 définis", "done": False},
]


@router.get("")
async def list_onboarding(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("employee_onboarding")
        .select("*, employees(id, full_name, email, position, department, hire_date)")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{employee_id}")
async def get_onboarding(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employee_onboarding").select("*").eq("employee_id", employee_id).execute().data
    if rows:
        row = rows[0]
        row["plan_30"] = row.get("plan_30") or DEFAULT_PLAN_30
        row["plan_60"] = row.get("plan_60") or DEFAULT_PLAN_60
        row["plan_90"] = row.get("plan_90") or DEFAULT_PLAN_90
        return row

    record = {
        "employee_id": employee_id,
        "phase": "day30",
        "plan_30": DEFAULT_PLAN_30,
        "plan_60": DEFAULT_PLAN_60,
        "plan_90": DEFAULT_PLAN_90,
    }
    res = db.from_("employee_onboarding").insert(record).execute()
    if res.data:
        return res.data[0]
    raise HTTPException(400, "Could not initialize onboarding")


@router.patch("/{employee_id}")
async def update_onboarding(
    employee_id: str,
    body: OnboardingUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    existing = db.from_("employee_onboarding").select("id").eq("employee_id", employee_id).execute().data
    if existing:
        res = db.from_("employee_onboarding").update(updates).eq("employee_id", employee_id).execute()
    else:
        record = {
            "employee_id": employee_id,
            "phase": "day30",
            "plan_30": DEFAULT_PLAN_30,
            "plan_60": DEFAULT_PLAN_60,
            "plan_90": DEFAULT_PLAN_90,
            **updates,
        }
        res = db.from_("employee_onboarding").insert(record).execute()

    if not res.data:
        raise HTTPException(400, "Could not save onboarding")
    log_audit(db, user.id, "onboarding.update", "employee_onboarding", employee_id)
    return res.data[0]


@router.post("/{employee_id}/sign-contract")
async def sign_contract(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    now = datetime.now(timezone.utc).isoformat()
    existing = db.from_("employee_onboarding").select("id").eq("employee_id", employee_id).execute().data

    if existing:
        res = (
            db.from_("employee_onboarding")
            .update({"contract_signed": True, "contract_signed_at": now})
            .eq("employee_id", employee_id)
            .execute()
        )
    else:
        record = {
            "employee_id": employee_id,
            "phase": "day30",
            "contract_signed": True,
            "contract_signed_at": now,
            "plan_30": DEFAULT_PLAN_30,
            "plan_60": DEFAULT_PLAN_60,
            "plan_90": DEFAULT_PLAN_90,
        }
        res = db.from_("employee_onboarding").insert(record).execute()

    if not res.data:
        raise HTTPException(400, "Could not sign contract")
    log_audit(db, user.id, "onboarding.sign_contract", "employee_onboarding", employee_id)
    return res.data[0]


@router.get("/{employee_id}/pulse")
async def list_pulse_surveys(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("pulse_surveys")
        .select("*")
        .eq("employee_id", employee_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{employee_id}/pulse")
async def create_pulse_survey(
    employee_id: str,
    body: PulseSurveyCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump(exclude_none=True)
    data["employee_id"] = employee_id

    res = db.from_("pulse_surveys").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create pulse survey")
    return res.data[0]


@router.delete("/{employee_id}/pulse/{pulse_id}")
async def delete_pulse_survey(
    employee_id: str,
    pulse_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("pulse_surveys").select("id").eq("id", pulse_id).eq("employee_id", employee_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("pulse_surveys").delete().eq("id", pulse_id).execute()
    return {"ok": True}


@router.post("/{employee_id}/probation/decide")
async def decide_probation(
    employee_id: str,
    body: ProbationDecision,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """End-of-probation decision: confirm the hire, end the collaboration,
    or extend the trial period. Records a performance_reviews entry as a
    paper trail (best-effort — the decision itself must still succeed)."""
    _require_admin(user)
    if body.decision not in VALID_PROBATION_DECISIONS:
        raise HTTPException(400, f"decision must be one of: {', '.join(sorted(VALID_PROBATION_DECISIONS))}")

    rows = db.from_("employees").select("id, probation_end_date").eq("id", employee_id).execute().data
    if not rows:
        raise HTTPException(404, "Employee not found")
    employee = rows[0]

    updates: dict = {"probation_status": body.decision}
    if body.decision == "extended":
        if not body.extend_days or body.extend_days <= 0:
            raise HTTPException(400, "extend_days (positive integer) is required when decision is 'extended'")
        base = date.fromisoformat(employee["probation_end_date"]) if employee.get("probation_end_date") else date.today()
        updates["probation_end_date"] = (base + timedelta(days=body.extend_days)).isoformat()
        updates["probation_status"] = "in_progress"  # stays active, just pushes the end date out
    elif body.decision == "failed":
        updates["status"] = "inactive"

    res = db.from_("employees").update(updates).eq("id", employee_id).execute()
    if not res.data:
        raise HTTPException(400, "Could not update probation status")

    try:
        db.from_("performance_reviews").insert({
            "employee_id": employee_id,
            "reviewer_id": user.id,
            "period": "Fin de période d'essai",
            "objectives": f"Décision : {PROBATION_DECISION_LABELS.get(body.decision, body.decision)}",
            "feedback": body.feedback,
            "status": "submitted",
        }).execute()
    except Exception:
        log.exception("Could not record probation review for employee %s", employee_id)

    log_audit(db, user.id, f"probation.{body.decision}", "employee", employee_id, {"feedback": body.feedback})
    return res.data[0]
