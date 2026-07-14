from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import QuotationCreate, QuotationUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/quotations", tags=["accounting"])

MAX_QUOTES = 5


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _shape(qt: dict) -> dict:
    return {
        **{k: v for k, v in qt.items() if k != "suppliers"},
        "supplier_name": (qt.get("suppliers") or {}).get("company_name"),
    }


@router.get("")
async def list_quotations(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    purchase_request_id: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("quotations").select("*, suppliers(company_name)")
    if purchase_request_id:
        query = query.eq("purchase_request_id", purchase_request_id)
    res = query.order("rank").execute()
    return [_shape(q) for q in (res.data or [])]


@router.post("")
async def create_quotation(
    body: QuotationCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.quote_number.strip():
        raise HTTPException(400, "Le numéro de devis est requis.")
    if not (1 <= body.rank <= MAX_QUOTES):
        raise HTTPException(400, f"Le rang doit être entre 1 et {MAX_QUOTES}.")

    pr = db.from_("purchase_requests").select("status").eq("id", body.purchase_request_id).execute().data
    if not pr:
        raise HTTPException(404, "Demande d'achat introuvable")
    if pr[0]["status"] in ("annulee", "commande_emise"):
        raise HTTPException(400, "Impossible d'ajouter un devis à cette demande.")

    existing = (
        db.from_("quotations").select("rank").eq("purchase_request_id", body.purchase_request_id).execute().data or []
    )
    if len(existing) >= MAX_QUOTES:
        raise HTTPException(400, f"Maximum {MAX_QUOTES} devis par demande.")
    if any(e.get("rank") == body.rank for e in existing):
        raise HTTPException(400, f"Le rang {body.rank} est déjà utilisé.")

    data = body.model_dump()
    data["created_by"] = user.id
    res = db.from_("quotations").insert(data).execute()
    quote = res.data[0]

    # Première consultation → la DA passe en 'en_consultation'
    if pr[0]["status"] == "besoin_valide":
        db.from_("purchase_requests").update({"status": "en_consultation"}).eq("id", body.purchase_request_id).execute()

    log_audit(db, user.id, "quotation.create", "quotation", quote["id"],
              {"purchase_request_id": body.purchase_request_id, "rank": body.rank})
    return _shape(quote)


@router.patch("/{quotation_id}")
async def update_quotation(
    quotation_id: str,
    body: QuotationUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier")
    if "rank" in updates and not (1 <= updates["rank"] <= MAX_QUOTES):
        raise HTTPException(400, f"Le rang doit être entre 1 et {MAX_QUOTES}.")

    res = db.from_("quotations").update(updates).eq("id", quotation_id).execute()
    if not res.data:
        raise HTTPException(404, "Devis introuvable")
    log_audit(db, user.id, "quotation.update", "quotation", quotation_id, updates)
    return _shape(res.data[0])


@router.delete("/{quotation_id}")
async def delete_quotation(
    quotation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("quotations").select("id, retenu").eq("id", quotation_id).execute().data
    if not existing:
        raise HTTPException(404, "Devis introuvable")
    if existing[0].get("retenu"):
        raise HTTPException(400, "Impossible de supprimer le devis retenu.")
    db.from_("quotations").delete().eq("id", quotation_id).execute()
    log_audit(db, user.id, "quotation.delete", "quotation", quotation_id)
    return {"ok": True}
