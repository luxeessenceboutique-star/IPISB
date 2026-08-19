from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    TrainingCreate, TrainingUpdate,
    TrainingAssignmentCreate, TrainingAssignmentUpdate,
    SkillCreate, SkillUpdate,
    EmployeeSkillUpsert,
)
from utils.audit import log_audit

router = APIRouter(prefix="/rh/training", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


# ── Catalog ──────────────────────────────────────────────────────────────────

@router.get("/catalog")
async def list_catalog(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    category: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("training_catalog").select("*").eq("is_active", True)
    if category:
        query = query.eq("category", category)
    res = query.order("created_at", desc=True).execute()
    return res.data or []


@router.post("/catalog")
async def create_training(
    body: TrainingCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("training_catalog").insert(body.model_dump()).execute()
    if not res.data:
        raise HTTPException(400, "Could not create training")
    training = res.data[0]
    log_audit(db, user.id, "training.create", "training_catalog", training["id"])
    return training


@router.patch("/catalog/{training_id}")
async def update_training(
    training_id: str,
    body: TrainingUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("training_catalog").update(updates).eq("id", training_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "training.update", "training_catalog", training_id, updates)
    return res.data[0]


@router.delete("/catalog/{training_id}")
async def deactivate_training(
    training_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("training_catalog").update({"is_active": False}).eq("id", training_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "training.deactivate", "training_catalog", training_id)
    return {"ok": True}


# ── Assignments ──────────────────────────────────────────────────────────────

@router.get("/assignments")
async def list_assignments(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("employee_trainings").select(
        "*, training_catalog(id, title, category, duration_hours, cost_dh), employees(id, full_name, department)"
    )
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if status:
        query = query.eq("status", status)

    res = query.order("assigned_at", desc=True).execute()
    items = []
    for row in res.data or []:
        tc = row.get("training_catalog") or {}
        emp = row.get("employees") or {}
        items.append({
            **{k: v for k, v in row.items() if k not in ("training_catalog", "employees")},
            "training_title": tc.get("title"),
            "employee_name": emp.get("full_name"),
        })
    return items


@router.post("/assignments")
async def create_assignment(
    body: TrainingAssignmentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("employee_trainings").insert(body.model_dump(exclude_none=True)).execute()
    if not res.data:
        raise HTTPException(400, "Could not create assignment")
    assignment = res.data[0]
    log_audit(db, user.id, "training_assignment.create", "employee_training", assignment["id"])
    return assignment


@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: TrainingAssignmentUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("employee_trainings").update(updates).eq("id", assignment_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "training_assignment.update", "employee_training", assignment_id, updates)
    return res.data[0]


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("employee_trainings").select("id").eq("id", assignment_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("employee_trainings").delete().eq("id", assignment_id).execute()
    log_audit(db, user.id, "training_assignment.delete", "employee_training", assignment_id)
    return {"ok": True}


@router.get("/stats")
async def training_stats(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("employee_trainings").select("status, training_catalog(cost_dh, duration_hours)").execute().data or []

    total = len(rows)
    completed = sum(1 for r in rows if r.get("status") == "completed")
    in_progress = sum(1 for r in rows if r.get("status") == "in_progress")
    planned = sum(1 for r in rows if r.get("status") == "planned")
    total_cost = sum(float((r.get("training_catalog") or {}).get("cost_dh") or 0) for r in rows)
    total_hours = sum(
        int((r.get("training_catalog") or {}).get("duration_hours") or 0)
        for r in rows if r.get("status") == "completed"
    )

    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "planned": planned,
        "completion_rate": round(completed / total * 100) if total else 0,
        "total_budget_dh": total_cost,
        "total_hours_completed": total_hours,
    }


# ── Skills referential ───────────────────────────────────────────────────────

@router.get("/skills")
async def list_skills(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    category: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("skills").select("*").eq("is_active", True)
    if category:
        query = query.eq("category", category)
    res = query.order("name").execute()
    return res.data or []


@router.post("/skills")
async def create_skill(
    body: SkillCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("skills").insert(body.model_dump()).execute()
    if not res.data:
        raise HTTPException(400, "Could not create skill")
    return res.data[0]


@router.patch("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    body: SkillUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("skills").update(updates).eq("id", skill_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.delete("/skills/{skill_id}")
async def deactivate_skill(
    skill_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("skills").update({"is_active": False}).eq("id", skill_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ── Employee x skill matrix ───────────────────────────────────────────────

@router.get("/employee-skills")
async def get_employee_skills(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("employee_skills").select("*, skills(id, name, category, description)")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    res = query.execute()

    items = []
    for row in res.data or []:
        sk = row.get("skills") or {}
        items.append({**{k: v for k, v in row.items() if k != "skills"}, "skill_name": sk.get("name"), "skill_category": sk.get("category")})
    return items


@router.post("/employee-skills")
async def upsert_employee_skill(
    body: EmployeeSkillUpsert,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("employee_skills").upsert(body.model_dump(), on_conflict="employee_id,skill_id").execute()
    if not res.data:
        raise HTTPException(400, "Could not save skill level")
    return res.data[0]


@router.delete("/employee-skills/{record_id}")
async def remove_employee_skill(
    record_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("employee_skills").select("id").eq("id", record_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("employee_skills").delete().eq("id", record_id).execute()
    return {"ok": True}
