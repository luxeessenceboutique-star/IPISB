from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PerformanceReviewCreate, PerformanceReviewUpdate, GoalCreate, GoalUpdate
from utils.audit import log_audit
from utils.pdf_generators import compute_moroccan_payroll

router = APIRouter(prefix="/rh/performance", tags=["rh"])

VALID_GOAL_STATUSES = {"pending", "in_progress", "done"}
REVIEW_TYPES = {"monthly", "semestrial", "annual"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


@router.get("")
async def list_reviews(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    period: Optional[str] = None,
    review_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("performance_reviews").select("*, employees(full_name)", count="exact")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if period:
        query = query.eq("period", period)
    if review_type:
        query = query.eq("review_type", review_type)

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()
    rows = res.data or []

    # Évolution (annuel uniquement) : delta vs la note de l'année précédente
    # pour le même employé — calculé à la volée plutôt que stocké, pour
    # toujours refléter l'état courant même si une revue passée est éditée.
    annual_rows = [r for r in rows if r.get("review_type") == "annual" and r.get("score") is not None]
    evolution_by_id: dict[str, Optional[float]] = {}
    if annual_rows:
        for r in annual_rows:
            try:
                prev_period = str(int(r["period"]) - 1)
            except (TypeError, ValueError):
                evolution_by_id[r["id"]] = None
                continue
            prev = (
                db.from_("performance_reviews").select("score")
                .eq("employee_id", r["employee_id"]).eq("review_type", "annual").eq("period", prev_period)
                .execute().data
            )
            if prev and prev[0].get("score") is not None:
                evolution_by_id[r["id"]] = round(float(r["score"]) - float(prev[0]["score"]), 2)
            else:
                evolution_by_id[r["id"]] = None

    items = []
    for row in rows:
        items.append({
            **{k: v for k, v in row.items() if k != "employees"},
            "employee_name": (row.get("employees") or {}).get("full_name"),
            "evolution": evolution_by_id.get(row["id"]),
        })

    return {"items": items, "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("")
async def create_review(
    body: PerformanceReviewCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.review_type not in REVIEW_TYPES:
        raise HTTPException(400, "Invalid review_type")
    data = body.model_dump()
    data["reviewer_id"] = user.id

    try:
        res = db.from_("performance_reviews").insert(data).execute()
    except Exception as ex:
        if "does not exist" in str(ex) or "review_type" in str(ex) or "score_check" in str(ex):
            raise HTTPException(400, "Migration L63 requise (barème /20 et types d'évaluation).")
        raise
    if not res.data:
        raise HTTPException(400, "Could not create review")

    review = res.data[0]
    log_audit(db, user.id, "performance_review.create", "performance_review", review["id"])
    return review


@router.patch("/{review_id}")
async def update_review(
    review_id: str,
    body: PerformanceReviewUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("performance_reviews").update(updates).eq("id", review_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "performance_review.update", "performance_review", review_id, updates)
    return res.data[0]


@router.post("/{review_id}/apply-bonus")
async def apply_bonus_to_payroll(
    review_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Applique la prime de rendement décidée (bonus_decided, ou à défaut la
    suggestion automatique bonus_suggested) sur la fiche de paie du mois
    concerné — crée la fiche si elle n'existe pas encore. `period` d'une
    revue mensuelle est au format 'YYYY-MM'."""
    if not user.can_access_rh_payroll():
        raise HTTPException(403, "RH (paie) uniquement")

    rows = db.from_("performance_reviews").select("*").eq("id", review_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    review = rows[0]
    if review.get("review_type") != "monthly":
        raise HTTPException(400, "Seule une évaluation mensuelle peut alimenter une prime.")

    amount = review.get("bonus_decided")
    if amount is None:
        amount = review.get("bonus_suggested")
    if amount is None:
        raise HTTPException(400, "Aucun montant de prime à appliquer.")

    try:
        year_str, month_str = review["period"].split("-")
        year, month = int(year_str), int(month_str)
    except (ValueError, AttributeError):
        raise HTTPException(400, "period doit être au format 'YYYY-MM' pour une revue mensuelle.")

    existing = (
        db.from_("payroll_records").select("*")
        .eq("employee_id", review["employee_id"]).eq("year", year).eq("month", month)
        .execute().data
    )
    if existing:
        record = existing[0]
        calcs = compute_moroccan_payroll(record["base_salary"], amount, record.get("deductions") or 0)
        res = db.from_("payroll_records").update({"bonuses": amount, **calcs}).eq("id", record["id"]).execute()
        payroll_record = res.data[0]
    else:
        emp = db.from_("employees").select("salary").eq("id", review["employee_id"]).execute().data
        if not emp:
            raise HTTPException(404, "Employé introuvable")
        base_salary = float(emp[0].get("salary") or 0)
        calcs = compute_moroccan_payroll(base_salary, amount, 0)
        res = db.from_("payroll_records").insert({
            "employee_id": review["employee_id"], "month": month, "year": year,
            "base_salary": base_salary, "bonuses": amount, "deductions": 0,
            **calcs, "status": "draft", "created_by": user.id,
        }).execute()
        payroll_record = res.data[0]

    db.from_("performance_reviews").update({
        "bonus_decided": amount, "payroll_record_id": payroll_record["id"],
    }).eq("id", review_id).execute()
    log_audit(db, user.id, "performance_review.apply_bonus", "performance_review", review_id,
              {"amount": amount, "payroll_record_id": payroll_record["id"]})
    return {"ok": True, "amount": amount, "payroll_record": payroll_record}


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("performance_reviews").select("id").eq("id", review_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("performance_reviews").delete().eq("id", review_id).execute()
    log_audit(db, user.id, "performance_review.delete", "performance_review", review_id)
    return {"ok": True}


# ── Goals / objectives (used for probation objectives + ongoing goals) ──────

@router.get("/goals")
async def list_goals(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
):
    _require_admin(user)
    query = db.from_("performance_goals").select("*")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if year:
        query = query.eq("year", year)
    res = query.order("due_date").order("created_at", desc=True).execute()
    return res.data or []


@router.post("/goals")
async def create_goal(
    body: GoalCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump(exclude_none=True)
    res = db.from_("performance_goals").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create goal")
    goal = res.data[0]
    log_audit(db, user.id, "goal.create", "performance_goal", goal["id"])
    return goal


@router.patch("/goals/{goal_id}")
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "status" in updates and updates["status"] not in VALID_GOAL_STATUSES:
        raise HTTPException(400, f"Invalid status. Use one of: {', '.join(sorted(VALID_GOAL_STATUSES))}")
    if "progress" in updates and updates["progress"] is not None:
        updates["progress"] = max(0, min(100, updates["progress"]))

    res = db.from_("performance_goals").update(updates).eq("id", goal_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "goal.update", "performance_goal", goal_id, updates)
    return res.data[0]


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("performance_goals").select("id").eq("id", goal_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("performance_goals").delete().eq("id", goal_id).execute()
    log_audit(db, user.id, "goal.delete", "performance_goal", goal_id)
    return {"ok": True}
