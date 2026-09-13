from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import SupplierCreate, SupplierUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/suppliers", tags=["accounting"])

# Factures « en instance » : ni payées ni annulées — même définition que
# l'export « Instances fournisseurs » (accounting_invoices.py).
PENDING_INVOICE_STATUSES = {"pending", "partially_paid"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_suppliers(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("suppliers").select("*")
    if q:
        query = query.or_(f"company_name.ilike.%{q}%,email.ilike.%{q}%")
    suppliers = query.order("company_name").execute().data or []

    supplier_ids = [s["id"] for s in suppliers]
    empty_stats = {
        "total_purchases": 0, "total_spent": 0.0, "last_purchase": None,
        "spent_last_12m": 0.0, "pending_invoices_count": 0, "pending_invoices_amount": 0.0,
    }
    stats_map: dict[str, dict] = {}
    if supplier_ids:
        cutoff = (datetime.now(timezone.utc).date() - timedelta(days=365)).isoformat()
        purchases = (
            db.from_("purchases")
            .select("supplier_id, total_incl_vat, purchase_date")
            .in_("supplier_id", supplier_ids)
            .execute()
            .data or []
        )
        for p in purchases:
            sid = p["supplier_id"]
            entry = stats_map.setdefault(sid, dict(empty_stats))
            entry["total_purchases"] += 1
            entry["total_spent"] += p["total_incl_vat"] or 0
            if (p.get("purchase_date") or "") >= cutoff:
                entry["spent_last_12m"] += p["total_incl_vat"] or 0
            if entry["last_purchase"] is None or p["purchase_date"] > entry["last_purchase"]:
                entry["last_purchase"] = p["purchase_date"]

        invoices = (
            db.from_("invoices")
            .select("supplier_id, amount, vat_percent, payment_status")
            .in_("supplier_id", supplier_ids)
            .in_("payment_status", list(PENDING_INVOICE_STATUSES))
            .execute()
            .data or []
        )
        for inv in invoices:
            sid = inv["supplier_id"]
            entry = stats_map.setdefault(sid, dict(empty_stats))
            ttc = float(inv.get("amount") or 0) * (1 + float(inv.get("vat_percent") or 0) / 100)
            entry["pending_invoices_count"] += 1
            entry["pending_invoices_amount"] += ttc

    def _rounded(stats: dict) -> dict:
        return {
            **stats,
            "total_spent": round(stats["total_spent"], 2),
            "spent_last_12m": round(stats["spent_last_12m"], 2),
            "pending_invoices_amount": round(stats["pending_invoices_amount"], 2),
        }

    return [
        {
            **s,
            **_rounded(stats_map.get(s["id"], empty_stats)),
        }
        for s in suppliers
    ]


@router.post("")
async def create_supplier(
    body: SupplierCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    # Création ouverte à tout utilisateur connecté (nécessaire pour la saisie de
    # devis par le demandeur). Édition / suppression restent réservées à l'admin.
    res = db.from_("suppliers").insert({**body.model_dump(), "created_by": user.id}).execute()
    new_supplier = res.data[0]
    log_audit(db, user.id, "supplier.create", "supplier", new_supplier["id"],
              {"reference": new_supplier.get("reference")})
    return new_supplier


@router.patch("/{supplier_id}")
async def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = db.from_("suppliers").update(updates).eq("id", supplier_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "supplier.update", "supplier", supplier_id, updates)
    return res.data[0]


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    in_use = db.from_("purchases").select("id").eq("supplier_id", supplier_id).limit(1).execute().data
    if in_use:
        raise HTTPException(409, "Supplier is in use by existing purchases")
    db.from_("suppliers").delete().eq("id", supplier_id).execute()
    log_audit(db, user.id, "supplier.delete", "supplier", supplier_id)
    return {"ok": True}
