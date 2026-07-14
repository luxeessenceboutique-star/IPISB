import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchasePaymentCreate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/payments", tags=["accounting"])

PAYMENT_METHODS = {"ov_permanent", "ov_ponctuel", "cheque", "versement", "espece", "autre"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


async def _recalculate_purchase_status(db: Client, purchase_id: str) -> str:
    # Get total incl vat of the purchase
    p_rows = db.from_("purchases").select("total_incl_vat").eq("id", purchase_id).execute().data
    if not p_rows:
        return "pending"
    total_incl_vat = float(p_rows[0].get("total_incl_vat") or 0)

    # Sum all payments for this purchase
    pay_rows = db.from_("purchase_payments").select("amount").eq("purchase_id", purchase_id).execute().data or []
    total_paid = sum(float(pay.get("amount") or 0) for pay in pay_rows)

    if total_paid >= total_incl_vat:
        status = "paid"
    elif total_paid > 0:
        status = "partially_paid"
    else:
        status = "pending"

    db.from_("purchases").update({"payment_status": status}).eq("id", purchase_id).execute()
    return status


@router.get("")
async def list_payments(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    purchase_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchase_payments").select("*, purchases(title, purchase_number)", count="exact")
    if purchase_id:
        query = query.eq("purchase_id", purchase_id)

    start = (page - 1) * page_size
    res = query.order("payment_date", desc=True).range(start, start + page_size - 1).execute()

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
async def create_payment(
    body: PurchasePaymentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.payment_method not in PAYMENT_METHODS:
        raise HTTPException(400, "Invalid payment_method")
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")

    # Verify purchase exists
    purchase_exists = db.from_("purchases").select("id").eq("id", body.purchase_id).execute().data
    if not purchase_exists:
        raise HTTPException(404, "Purchase not found")

    data = body.model_dump(exclude={"payment_date"})
    data["payment_date"] = body.payment_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    res = db.from_("purchase_payments").insert(data).execute()
    new_payment = res.data[0]

    # Recalculate payment status of purchase
    new_status = await _recalculate_purchase_status(db, body.purchase_id)

    log_audit(db, user.id, "purchase_payment.create", "purchase_payment", new_payment["id"], {
        "purchase_id": body.purchase_id,
        "amount": body.amount,
        "new_status": new_status,
    })

    return new_payment


@router.delete("/{payment_id}")
async def delete_payment(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("purchase_payments").select("id, purchase_id").eq("id", payment_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    purchase_id = existing[0]["purchase_id"]

    db.from_("purchase_payments").delete().eq("id", payment_id).execute()

    # Recalculate payment status of purchase
    await _recalculate_purchase_status(db, purchase_id)

    log_audit(db, user.id, "purchase_payment.delete", "purchase_payment", payment_id, {
        "purchase_id": purchase_id,
    })

    return {"ok": True}
