from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    JobAdCreate, JobAdUpdate,
    CandidateCreate, CandidatePromote,
    InterviewCreate, InterviewUpdate,
    SlotCreate,
)
from utils.audit import log_audit

router = APIRouter(prefix="/rh/recruitment", tags=["rh"])

VALID_INTERVIEW_STATUSES = {"pending", "confirmed", "completed", "cancelled"}


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


@router.post("/candidates/{candidate_id}/promote")
async def promote_candidate(
    candidate_id: str,
    body: CandidatePromote,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {"status": "active"}
    if body.hire_date:
        updates["hire_date"] = body.hire_date
    if body.position:
        updates["position"] = body.position

    res = db.from_("employees").update(updates).eq("id", candidate_id).eq("status", "candidate").execute()
    if not res.data:
        raise HTTPException(404, "Candidate not found")
    log_audit(db, user.id, "candidate.promote", "employee", candidate_id, updates)
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
