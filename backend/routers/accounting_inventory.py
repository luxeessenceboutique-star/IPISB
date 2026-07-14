import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import InventoryItemCreate, InventoryItemUpdate, InventoryMovementCreate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/inventory", tags=["accounting"])

ASSET_CATEGORIES = {"consommable", "equipement", "locaux", "service"}
MOVEMENT_TYPES = {"entree", "sortie", "ajustement"}
ITEM_STATUSES = {"actif", "hors_service", "vendu", "perdu"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _calculate_amortization(item: dict) -> dict:
    initial_val = float(item.get("initial_value") or 0)
    duration = item.get("amortissement_duree_annees")
    p_date_str = item.get("purchase_date")

    amortized_amount = 0.0
    vnc = initial_val
    amortization_percentage = 0.0
    yearly_amortization = 0.0

    if duration and duration > 0 and p_date_str:
        try:
            p_date = date.fromisoformat(p_date_str)
            today = date.today()
            days_elapsed = (today - p_date).days
            if days_elapsed < 0:
                days_elapsed = 0
            
            total_days = duration * 365.25
            ratio = min(1.0, days_elapsed / total_days)

            amortized_amount = round(initial_val * ratio, 2)
            vnc = round(initial_val - amortized_amount, 2)
            amortization_percentage = round(ratio * 100, 2)
            yearly_amortization = round(initial_val / duration, 2)
        except Exception:
            pass

    return {
        **item,
        "amortized_amount": amortized_amount,
        "vnc": vnc,
        "amortization_percentage": amortization_percentage,
        "yearly_amortization": yearly_amortization,
    }


@router.get("")
async def list_inventory(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    asset_category: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("inventory_items").select("*", count="exact")
    if q:
        query = query.ilike("name", f"%{q}%")
    if asset_category:
        query = query.eq("asset_category", asset_category)
    if status:
        query = query.eq("status", status)

    start = (page - 1) * page_size
    res = query.order("code_unique", desc=False).range(start, start + page_size - 1).execute()

    items = [_calculate_amortization(item) for item in (res.data or [])]

    return {
        "items": items,
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/alerts")
async def list_alerts(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # Get all items where quantity <= niveau_alerte
    # Supabase/Postgres syntax: quantity <= niveau_alerte
    # Since filter syntax for column-to-column compare is limited in Supabase simple client,
    # we can fetch all active items and filter in-memory since volume is small.
    rows = db.from_("inventory_items").select("*").eq("status", "actif").not_.is_("niveau_alerte", "null").execute().data or []
    alerts = [
        _calculate_amortization(r) for r in rows
        if float(r.get("quantity") or 0) <= float(r.get("niveau_alerte") or 0)
    ]
    return alerts


@router.get("/{item_id}")
async def get_inventory_item(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("inventory_items").select("*, purchases(purchase_number)").eq("id", item_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    
    item = rows[0]
    p = item.get("purchases") or {}
    shaped = {
        **{k: v for k, v in item.items() if k != "purchases"},
        "purchase_number": p.get("purchase_number"),
    }
    
    # Calculate amortization
    shaped = _calculate_amortization(shaped)

    # Fetch attachments
    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", "inventory_item")
        .eq("entity_id", item_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    shaped["attachments"] = attachments
    return shaped


@router.post("")
async def create_inventory_item(
    body: InventoryItemCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.asset_category not in ASSET_CATEGORIES:
        raise HTTPException(400, "Invalid asset_category")
    if body.status not in ITEM_STATUSES:
        raise HTTPException(400, "Invalid status")

    data = body.model_dump(exclude={"purchase_date"})
    data["purchase_date"] = body.purchase_date or date.today().isoformat()
    data["created_by"] = user.id

    res = db.from_("inventory_items").insert(data).execute()
    new_item = res.data[0]

    # Create initial entree movement if quantity > 0
    if body.quantity > 0:
        db.from_("inventory_movements").insert({
            "inventory_item_id": new_item["id"],
            "movement_type": "entree",
            "quantity": body.quantity,
            "movement_date": data["purchase_date"],
            "description": "Création initiale de l'article d'inventaire",
            "created_by": user.id,
        }).execute()

    log_audit(db, user.id, "inventory_item.create", "inventory_item", new_item["id"], {"name": body.name})
    return _calculate_amortization(new_item)


@router.patch("/{item_id}")
async def update_inventory_item(
    item_id: str,
    body: InventoryItemUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "asset_category" in updates and updates["asset_category"] not in ASSET_CATEGORIES:
        raise HTTPException(400, "Invalid asset_category")
    if "status" in updates and updates["status"] not in ITEM_STATUSES:
        raise HTTPException(400, "Invalid status")

    res = db.from_("inventory_items").update(updates).eq("id", item_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    
    log_audit(db, user.id, "inventory_item.update", "inventory_item", item_id, updates)
    return _calculate_amortization(res.data[0])


@router.delete("/{item_id}")
async def delete_inventory_item(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("inventory_items").select("id").eq("id", item_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("inventory_items").delete().eq("id", item_id).execute()
    log_audit(db, user.id, "inventory_item.delete", "inventory_item", item_id)
    return {"ok": True}


# ── Inventory movements ─────────────────────────────────────────────────────

@router.get("/{item_id}/movements")
async def list_movements(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # Check item exists
    item_exists = db.from_("inventory_items").select("id").eq("id", item_id).execute().data
    if not item_exists:
        raise HTTPException(404, "Inventory item not found")

    res = db.from_("inventory_movements").select("*").eq("inventory_item_id", item_id).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/{item_id}/movements")
async def create_movement(
    item_id: str,
    body: InventoryMovementCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.movement_type not in MOVEMENT_TYPES:
        raise HTTPException(400, "Invalid movement_type")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")

    # Fetch current item quantity
    item_rows = db.from_("inventory_items").select("quantity").eq("id", item_id).execute().data
    if not item_rows:
        raise HTTPException(404, "Inventory item not found")
    
    current_quantity = float(item_rows[0].get("quantity") or 0)
    qty_diff = float(body.quantity)

    if body.movement_type == "entree":
        new_quantity = current_quantity + qty_diff
    elif body.movement_type == "sortie":
        new_quantity = current_quantity - qty_diff
        if new_quantity < 0:
            raise HTTPException(400, "Stock insuffisant pour cette sortie")
    else:  # ajustement (we treat it as setting the absolute quantity to quantity)
        new_quantity = qty_diff

    # Insert movement
    data = body.model_dump(exclude={"movement_date"})
    data["inventory_item_id"] = item_id
    data["movement_date"] = body.movement_date or date.today().isoformat()
    data["created_by"] = user.id

    res = db.from_("inventory_movements").insert(data).execute()
    new_movement = res.data[0]

    # Update item quantity
    db.from_("inventory_items").update({"quantity": new_quantity}).eq("id", item_id).execute()

    log_audit(db, user.id, "inventory_item.movement", "inventory_item", item_id, {
        "movement_type": body.movement_type,
        "quantity": body.quantity,
        "new_quantity": new_quantity,
    })

    return new_movement
