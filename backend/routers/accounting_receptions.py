import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchaseReceptionCreate, PurchaseReceptionUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/receptions", tags=["accounting"])

QUALITY_STATUSES = {"conforme", "non_conforme_partiel", "non_conforme_total", "retourne"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_receptions(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    purchase_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchase_receptions").select("*, purchases(title, purchase_number)", count="exact")
    if purchase_id:
        query = query.eq("purchase_id", purchase_id)

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for r in (res.data or []):
        p = r.get("purchases") or {}
        items.append({
            **{k: v for k, v in r.items() if k != "purchases"},
            "purchase_title": p.get("title"),
            "purchase_number": p.get("purchase_number"),
        })

    return {
        "items": items,
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.post("")
async def create_reception(
    body: PurchaseReceptionCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.quality_status not in QUALITY_STATUSES:
        raise HTTPException(400, "Invalid quality_status")

    # Fetch related purchase
    purchase_rows = db.from_("purchases").select("*, purchase_requests(asset_category)").eq("id", body.purchase_id).execute().data
    if not purchase_rows:
        raise HTTPException(404, "Purchase not found")
    purchase = purchase_rows[0]

    data = body.model_dump()
    data["received_by"] = user.id
    data["created_by"] = user.id
    data["received_at"] = datetime.now(timezone.utc).isoformat()

    res = db.from_("purchase_receptions").insert(data).execute()
    new_reception = res.data[0]

    # Auto-create inventory item if status is conforme / non_conforme_partiel
    if body.quality_status in ("conforme", "non_conforme_partiel"):
        # Resolve category
        asset_category = "consommable"
        pr = purchase.get("purchase_requests")
        if pr and pr.get("asset_category"):
            asset_category = pr.get("asset_category")

        # Initial value of the inventory asset: price per unit * received quantity
        initial_val = float(purchase.get("unit_price") or 0) * float(body.received_quantity)

        inv_data = {
            "name": purchase.get("title") or "Article sans titre",
            "asset_category": asset_category,
            "purchase_id": purchase["id"],
            "reception_id": new_reception["id"],
            "initial_value": initial_val,
            "purchase_date": purchase.get("purchase_date"),
            "status": "actif",
            "quantity": body.received_quantity,
            "created_by": user.id,
        }
        inv_res = db.from_("inventory_items").insert(inv_data).execute()
        if inv_res.data:
            new_item = inv_res.data[0]
            # Create entree movement
            db.from_("inventory_movements").insert({
                "inventory_item_id": new_item["id"],
                "movement_type": "entree",
                "quantity": body.received_quantity,
                "movement_date": datetime.now(timezone.utc).date().isoformat(),
                "description": f"Réception automatique de l'achat {purchase.get('purchase_number')}",
                "created_by": user.id,
            }).execute()

    log_audit(db, user.id, "purchase_reception.create", "purchase_reception", new_reception["id"], {
        "purchase_id": body.purchase_id,
        "received_quantity": body.received_quantity,
    })

    return new_reception


@router.patch("/{reception_id}")
async def update_reception(
    reception_id: str,
    body: PurchaseReceptionUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Édition d'une réception : essentiellement les contrôles QHSE / CG et le
    statut qualité après coup. La quantité liée à un article d'inventaire déjà
    créé n'est pas resynchronisée ici (édition ciblée sur le contrôle)."""
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "quality_status" in updates and updates["quality_status"] not in QUALITY_STATUSES:
        raise HTTPException(400, "Invalid quality_status")

    res = db.from_("purchase_receptions").update(updates).eq("id", reception_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "purchase_reception.update", "purchase_reception", reception_id, updates)
    return res.data[0]


@router.delete("/{reception_id}")
async def delete_reception(
    reception_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("purchase_receptions").select("id").eq("id", reception_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    # Delete related inventory items if created
    items = db.from_("inventory_items").select("id").eq("reception_id", reception_id).execute().data or []
    for item in items:
        # Cascade will delete movements
        db.from_("inventory_items").delete().eq("id", item["id"]).execute()

    db.from_("purchase_receptions").delete().eq("id", reception_id).execute()
    log_audit(db, user.id, "purchase_reception.delete", "purchase_reception", reception_id)
    return {"ok": True}
