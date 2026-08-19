from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import AssetCreate, AssetUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/assets", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


@router.get("")
async def list_assets(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    category: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("assets").select("*, employees(full_name, department)")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if category:
        query = query.eq("category", category)

    res = query.order("created_at", desc=True).execute()
    items = []
    for row in res.data or []:
        emp = row.get("employees") or {}
        items.append({**{k: v for k, v in row.items() if k != "employees"}, "employee_name": emp.get("full_name")})
    return items


@router.post("")
async def create_asset(
    body: AssetCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.name.strip():
        raise HTTPException(400, "name is required")

    data = body.model_dump(exclude_none=True)
    if data.get("employee_id"):
        data["status"] = "assigned"
        data["assigned_at"] = datetime.now(timezone.utc).isoformat()

    res = db.from_("assets").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create asset")

    asset = res.data[0]
    log_audit(db, user.id, "asset.create", "asset", asset["id"])
    return asset


@router.patch("/{asset_id}")
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "employee_id" in updates:
        if updates["employee_id"]:
            updates["status"] = "assigned"
            updates["assigned_at"] = datetime.now(timezone.utc).isoformat()
        else:
            updates["status"] = "available"
            updates["assigned_at"] = None

    res = db.from_("assets").update(updates).eq("id", asset_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "asset.update", "asset", asset_id, updates)
    return res.data[0]


@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("assets").select("id").eq("id", asset_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("assets").delete().eq("id", asset_id).execute()
    log_audit(db, user.id, "asset.delete", "asset", asset_id)
    return {"ok": True}
