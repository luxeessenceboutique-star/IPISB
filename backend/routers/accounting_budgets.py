from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import BudgetCreate, BudgetUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/budgets", tags=["accounting"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _shape(b: dict) -> dict:
    return {
        **{k: v for k, v in b.items() if k != "accounting_categories"},
        "category_name": (b.get("accounting_categories") or {}).get("name"),
    }


def _validate_month(month: Optional[int]) -> None:
    if month is not None and not (1 <= month <= 12):
        raise HTTPException(400, "month must be between 1 and 12")


@router.get("")
async def list_budgets(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    year: Optional[int] = None,
    category_id: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("budgets").select("*, accounting_categories(name)")
    if year is not None:
        query = query.eq("year", year)
    if category_id:
        query = query.eq("category_id", category_id)
    rows = query.order("year", desc=True).order("month").execute().data or []
    return [_shape(b) for b in rows]


@router.post("")
async def create_budget(
    body: BudgetCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    _validate_month(body.month)
    try:
        res = db.from_("budgets").insert({**body.model_dump(), "created_by": user.id}).execute()
    except Exception:
        # UNIQUE (category_id, year, month) violation
        raise HTTPException(409, "Un budget existe déjà pour cette catégorie/année/mois")
    new_budget = res.data[0]
    log_audit(db, user.id, "budget.create", "budget", new_budget["id"],
              {**body.model_dump(), "reference": new_budget.get("reference")})
    return _shape(new_budget)


@router.patch("/{budget_id}")
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "month" in updates:
        _validate_month(updates["month"])

    res = db.from_("budgets").update(updates).eq("id", budget_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "budget.update", "budget", budget_id, updates)
    return _shape(res.data[0])


@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("budgets").select("id").eq("id", budget_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    db.from_("budgets").delete().eq("id", budget_id).execute()
    log_audit(db, user.id, "budget.delete", "budget", budget_id)
    return {"ok": True}
