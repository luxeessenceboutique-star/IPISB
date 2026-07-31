from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PerformanceReviewCreate, PerformanceReviewUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/performance", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_reviews(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    period: Optional[str] = None,
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

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for row in res.data or []:
        items.append({**{k: v for k, v in row.items() if k != "employees"}, "employee_name": (row.get("employees") or {}).get("full_name")})

    return {"items": items, "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("")
async def create_review(
    body: PerformanceReviewCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump()
    data["reviewer_id"] = user.id

    res = db.from_("performance_reviews").insert(data).execute()
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
