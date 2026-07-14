from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchaseRequestCreate, PurchaseRequestUpdate, DecisionInput, QuoteSelectInput
from utils.audit import log_audit
from utils.pdf_generators import render_purchase_request_pdf

router = APIRouter(prefix="/accounting/purchase-requests", tags=["accounting"])

REQUEST_TYPES = {"nouveau_besoin", "renouvellement"}
ASSET_CATEGORIES = {"consommable", "equipement", "locaux", "service"}
DECISIONS = {"validation", "retour", "annulation"}
# Statut résultant d'une décision (besoin ou devis)
_DECISION_STATUS = {"retour": "retournee", "annulation": "annulee"}
# Statuts « figés » : on n'édite plus la DA
LOCKED_STATUSES = {"commande_emise", "annulee"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _get_or_404(db: Client, pr_id: str) -> dict:
    rows = db.from_("purchase_requests").select("*").eq("id", pr_id).execute().data
    if not rows:
        raise HTTPException(404, "Demande d'achat introuvable")
    return rows[0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_requests(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    asset_category: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchase_requests").select("*", count="exact")
    if q:
        query = query.or_(f"request_number.ilike.%{q}%,justification.ilike.%{q}%")
    if status:
        query = query.eq("status", status)
    if request_type:
        query = query.eq("request_type", request_type)
    if asset_category:
        query = query.eq("asset_category", asset_category)

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()
    return {"items": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


@router.get("/{pr_id}")
async def get_request(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    pr = _get_or_404(db, pr_id)
    quotes = (
        db.from_("quotations")
        .select("*, suppliers(company_name)")
        .eq("purchase_request_id", pr_id)
        .order("rank")
        .execute()
        .data or []
    )
    quotes = [
        {**{k: v for k, v in qt.items() if k != "suppliers"},
         "supplier_name": (qt.get("suppliers") or {}).get("company_name")}
        for qt in quotes
    ]
    purchase = (
        db.from_("purchases")
        .select("*, suppliers(company_name)")
        .eq("purchase_request_id", pr_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data or []
    )
    order = None
    if purchase:
        p = purchase[0]
        order = {**{k: v for k, v in p.items() if k != "suppliers"},
                 "supplier_name": (p.get("suppliers") or {}).get("company_name")}
    return {**pr, "quotations": quotes, "order": order}


@router.post("")
async def create_request(
    body: PurchaseRequestCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.request_type not in REQUEST_TYPES:
        raise HTTPException(400, "request_type invalide")
    if body.asset_category not in ASSET_CATEGORIES:
        raise HTTPException(400, "asset_category invalide")

    data = body.model_dump()
    data["created_by"] = user.id
    res = db.from_("purchase_requests").insert(data).execute()
    pr = res.data[0]
    log_audit(db, user.id, "purchase_request.create", "purchase_request", pr["id"],
              {"request_number": pr["request_number"]})
    return pr


@router.patch("/{pr_id}")
async def update_request(
    pr_id: str,
    body: PurchaseRequestUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    pr = _get_or_404(db, pr_id)
    if pr["status"] in LOCKED_STATUSES:
        raise HTTPException(400, "Cette demande est verrouillée (commande émise ou annulée).")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier")
    if "request_type" in updates and updates["request_type"] not in REQUEST_TYPES:
        raise HTTPException(400, "request_type invalide")
    if "asset_category" in updates and updates["asset_category"] not in ASSET_CATEGORIES:
        raise HTTPException(400, "asset_category invalide")

    res = db.from_("purchase_requests").update(updates).eq("id", pr_id).execute()
    log_audit(db, user.id, "purchase_request.update", "purchase_request", pr_id, updates)
    return res.data[0]


@router.delete("/{pr_id}")
async def delete_request(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    pr = _get_or_404(db, pr_id)
    linked = db.from_("purchases").select("id").eq("purchase_request_id", pr_id).execute().data or []
    if linked:
        raise HTTPException(400, "Impossible de supprimer : une commande est liée à cette demande.")
    db.from_("quotations").delete().eq("purchase_request_id", pr_id).execute()
    db.from_("purchase_requests").delete().eq("id", pr_id).execute()
    log_audit(db, user.id, "purchase_request.delete", "purchase_request", pr_id)
    return {"ok": True}


@router.post("/{pr_id}/need-decision")
async def need_decision(
    pr_id: str,
    body: DecisionInput,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Décision sur l'expression de besoin : validation / retour / annulation."""
    _require_admin(user)
    if body.decision not in DECISIONS:
        raise HTTPException(400, "Décision invalide")
    pr = _get_or_404(db, pr_id)
    if pr["status"] not in ("brouillon", "retournee"):
        raise HTTPException(400, "La décision de besoin n'est possible qu'au stade brouillon.")

    new_status = "besoin_valide" if body.decision == "validation" else _DECISION_STATUS[body.decision]
    updates = {
        "need_decision": body.decision,
        "need_decision_comment": body.comment,
        "need_decided_by": user.id,
        "need_decided_at": _now(),
        "status": new_status,
    }
    res = db.from_("purchase_requests").update(updates).eq("id", pr_id).execute()
    log_audit(db, user.id, "purchase_request.need_decision", "purchase_request", pr_id,
              {"decision": body.decision})
    return res.data[0]


@router.post("/{pr_id}/quote-decision")
async def quote_decision(
    pr_id: str,
    body: QuoteSelectInput,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Décision sur les devis : retient un devis (validation) ou retourne/annule la DA."""
    _require_admin(user)
    if body.decision not in DECISIONS:
        raise HTTPException(400, "Décision invalide")
    pr = _get_or_404(db, pr_id)
    if pr["status"] not in ("besoin_valide", "en_consultation"):
        raise HTTPException(400, "Le besoin doit être validé et en consultation avant de décider du devis.")

    quotes = db.from_("quotations").select("id").eq("purchase_request_id", pr_id).execute().data or []
    quote_ids = {qt["id"] for qt in quotes}
    if body.quotation_id not in quote_ids:
        raise HTTPException(400, "Ce devis n'appartient pas à cette demande.")

    if body.decision == "validation":
        # Marque le devis retenu, déverrouille les autres.
        for qid in quote_ids:
            db.from_("quotations").update({"retenu": qid == body.quotation_id}).eq("id", qid).execute()
        new_status = "devis_valide"
    else:
        new_status = _DECISION_STATUS[body.decision]

    updates = {
        "quote_decision": body.decision,
        "quote_decision_comment": body.comment,
        "quote_decided_by": user.id,
        "quote_decided_at": _now(),
        "status": new_status,
    }
    res = db.from_("purchase_requests").update(updates).eq("id", pr_id).execute()
    log_audit(db, user.id, "purchase_request.quote_decision", "purchase_request", pr_id,
              {"decision": body.decision, "quotation_id": body.quotation_id})
    return res.data[0]


@router.post("/{pr_id}/create-order")
async def create_order(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Crée la commande (ligne purchases) à partir du devis retenu. Garde-fou :
    la DA doit être 'devis_valide' avec un devis retenu, et sans commande existante."""
    _require_admin(user)
    pr = _get_or_404(db, pr_id)
    if pr["status"] != "devis_valide":
        raise HTTPException(400, "La DA doit être au statut 'devis validé' pour émettre une commande.")

    retained = (
        db.from_("quotations").select("*").eq("purchase_request_id", pr_id).eq("retenu", True).execute().data or []
    )
    if not retained:
        raise HTTPException(400, "Aucun devis retenu.")
    existing = db.from_("purchases").select("id").eq("purchase_request_id", pr_id).execute().data or []
    if existing:
        raise HTTPException(400, "Une commande existe déjà pour cette demande.")

    quote = retained[0]
    title = (pr.get("justification") or pr["request_number"])[:200]
    data = {
        "title": title,
        "supplier_id": quote.get("supplier_id"),
        "quantity": 1,
        "unit_price": float(quote.get("amount") or 0),
        "vat_percent": 0,  # le montant du devis est pris tel quel
        "currency": quote.get("currency") or "MAD",
        "purchase_date": datetime.now(timezone.utc).date().isoformat(),
        "payment_method": pr.get("payment_mode"),
        "purchase_request_id": pr_id,
        "quotation_id": quote["id"],
        "edited_by": user.id,
        "edited_at": _now(),
        "requested_by": user.id,
        "created_by": user.id,
    }
    res = db.from_("purchases").insert(data).execute()
    purchase = res.data[0]
    log_audit(db, user.id, "purchase_request.create_order", "purchase_request", pr_id,
              {"purchase_id": purchase["id"], "purchase_number": purchase.get("purchase_number")})
    return purchase


@router.get("/{pr_id}/pdf")
async def export_request_pdf(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    pr = _get_or_404(db, pr_id)
    
    # Fetch quotes
    quotes = (
        db.from_("quotations")
        .select("*, suppliers(company_name)")
        .eq("purchase_request_id", pr_id)
        .order("rank")
        .execute()
        .data or []
    )
    quotes = [
        {**{k: v for k, v in qt.items() if k != "suppliers"},
         "supplier_name": (qt.get("suppliers") or {}).get("company_name")}
        for qt in quotes
    ]
    
    pdf_bytes = render_purchase_request_pdf(pr, quotes)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Demande_Achat_{pr.get('request_number', 'DA')}.pdf"
        }
    )

