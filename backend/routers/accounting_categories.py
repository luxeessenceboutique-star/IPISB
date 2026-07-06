from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import CategoryCreate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/categories", tags=["accounting"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_categories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    return db.from_("accounting_categories").select("*").order("name").execute().data or []


@router.post("")
async def create_category(
    body: CategoryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    try:
        res = db.from_("accounting_categories").insert({
            "name": body.name,
            "created_by": user.id,
        }).execute()
    except Exception as e:
        raise HTTPException(400, str(e))
    new_category = res.data[0]
    log_audit(db, user.id, "category.create", "accounting_category", new_category["id"], {"name": body.name})
    return new_category


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    in_use = db.from_("purchases").select("id").eq("category_id", category_id).limit(1).execute().data
    if in_use:
        raise HTTPException(409, "Category is in use by existing purchases")
    db.from_("accounting_categories").delete().eq("id", category_id).execute()
    log_audit(db, user.id, "category.delete", "accounting_category", category_id)
    return {"ok": True}
