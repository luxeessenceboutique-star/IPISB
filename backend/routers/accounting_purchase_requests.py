from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchaseRequestCreate, PurchaseRequestUpdate, DecisionInput, QuoteSelectInput, PurchaseInstallmentsReplace
from utils.audit import log_audit
from utils.pdf_generators import render_purchase_request_pdf

router = APIRouter(prefix="/accounting/purchase-requests", tags=["accounting"])

REQUEST_TYPES = {"nouveau_besoin", "renouvellement"}
ASSET_CATEGORIES = {"consommable", "equipement", "locaux", "service"}
# Critères de conformité standard (cases à cocher).
CONFORMITY_CRITERIA = {"frais", "congele", "scelle", "peremption", "certificat", "qhse"}
DECISIONS = {"validation", "retour", "annulation"}
# Statut résultant d'une décision (besoin ou devis)
_DECISION_STATUS = {"retour": "retournee", "annulation": "annulee"}
# Statuts « figés » : on n'édite plus la DA
LOCKED_STATUSES = {"commande_emise", "annulee"}
# Modes de règlement d'une échéance ; l'axe n\c en découle.
INSTALLMENT_MODES = {"ov_permanent", "ov_ponctuel", "cheque", "caisse_sociale", "autre"}
CASH_SOCIAL_MODES = {"caisse_sociale"}  # → caisse sociale ('noir')
# Le mode/échéancier se saisit APRÈS le choix du devis (devis retenu) et reste
# modifiable jusqu'à l'émission de la commande incluse.
INSTALLMENT_EDIT_ALLOWED = {"devis_valide", "commande_emise"}


# Barème par montant (permissions.py, entité "accounting.purchase_requests") :
# ≤500 MAD comptabilite décide seule (canal 1) ; 500–10 000 MAD admin décide
# en dernier ressort (canal 2, comptabilite ne peut plus valider elle-même) ;
# au-delà de 10 000 MAD, admin exclusivement (canal 3). La SOUMISSION (créer/
# voir/modifier/supprimer sa propre DA) reste ouverte à tout utilisateur quel
# que soit le montant — seule l'autorité de DÉCISION est bornée ici.
_ENTITY = "accounting.purchase_requests"


def _require_decide(user: CurrentUser, amount: float) -> None:
    if not user.can_act(_ENTITY, "validate_v2", amount=amount):
        raise HTTPException(
            403,
            "Ce montant nécessite une décision administrateur "
            "(comptabilité ne peut valider seule qu'en dessous de 500 MAD).",
        )


def _get_or_404(db: Client, pr_id: str) -> dict:
    rows = db.from_("purchase_requests").select("*").eq("id", pr_id).execute().data
    if not rows:
        raise HTTPException(404, "Demande d'achat introuvable")
    return rows[0]


def _require_owner_or_admin(user: CurrentUser, pr: dict) -> None:
    """L'admin voit/gère tout ; sinon l'utilisateur ne touche que ses propres DA."""
    if not user.can_access_accounting_full() and pr.get("created_by") != user.id:
        raise HTTPException(403, "Accès réservé à l'auteur de la demande ou à l'administration.")


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
    # Tout utilisateur connecté peut créer et suivre ses demandes ; l'admin voit tout.
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchase_requests").select("*", count="exact")
    if not user.can_access_accounting_full():
        query = query.eq("created_by", user.id)
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
    pr = _get_or_404(db, pr_id)
    _require_owner_or_admin(user, pr)
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
    # Ouverte à tout utilisateur connecté (la décision reste à l'admin).
    if body.request_type not in REQUEST_TYPES:
        raise HTTPException(400, "request_type invalide")
    if body.asset_category not in ASSET_CATEGORIES:
        raise HTTPException(400, "asset_category invalide")

    data = body.model_dump()
    data["created_by"] = user.id
    # Ne conserver que les critères de conformité connus.
    data["conformity_criteria"] = [c for c in (data.get("conformity_criteria") or []) if c in CONFORMITY_CRITERIA]
    res = db.from_("purchase_requests").insert(data).execute()
    pr = res.data[0]
    log_audit(db, user.id, "purchase_request.create", "purchase_request", pr["id"],
              {"request_number": pr["request_number"],
               "reference": pr.get("reference") or pr.get("request_number")})
    # Non-admin → prévenir l'administration qu'une DA attend une décision.
    if not user.can_access_accounting_full():
        try:
            from utils.notify import notify_users
            admin_rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
            admin_ids = list({r["user_id"] for r in admin_rows if r.get("user_id")})
            if admin_ids:
                notify_users(
                    db, admin_ids,
                    title="Nouvelle demande d'achat 🛒",
                    message=f"{user.email} a soumis la demande {pr.get('request_number', '')}. Une décision est attendue.",
                    type="info",
                    link="/dashboard/accounting?tab=purchase_requests",
                )
        except Exception:
            pass
    return pr


@router.patch("/{pr_id}")
async def update_request(
    pr_id: str,
    body: PurchaseRequestUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    pr = _get_or_404(db, pr_id)
    _require_owner_or_admin(user, pr)
    if pr["status"] in LOCKED_STATUSES:
        raise HTTPException(400, "Cette demande est verrouillée (commande émise ou annulée).")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier")
    if "request_type" in updates and updates["request_type"] not in REQUEST_TYPES:
        raise HTTPException(400, "request_type invalide")
    if "asset_category" in updates and updates["asset_category"] not in ASSET_CATEGORIES:
        raise HTTPException(400, "asset_category invalide")
    if "conformity_criteria" in updates:
        updates["conformity_criteria"] = [c for c in updates["conformity_criteria"] if c in CONFORMITY_CRITERIA]

    res = db.from_("purchase_requests").update(updates).eq("id", pr_id).execute()
    log_audit(db, user.id, "purchase_request.update", "purchase_request", pr_id, updates)
    return res.data[0]


@router.delete("/{pr_id}")
async def delete_request(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    pr = _get_or_404(db, pr_id)
    _require_owner_or_admin(user, pr)
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
    if body.decision not in DECISIONS:
        raise HTTPException(400, "Décision invalide")
    pr = _get_or_404(db, pr_id)
    _require_decide(user, pr.get("budget_estimate") or 0)
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
    # Prévenir le demandeur de la décision (et l'inviter à saisir les devis si validé).
    requester_id = pr.get("created_by")
    if requester_id and requester_id != user.id:
        try:
            from utils.notify import notify_users
            num = pr.get("request_number", "")
            if body.decision == "validation":
                title, msg, ntype = (
                    "Demande d'achat approuvée ✅",
                    f"Votre demande {num} a été approuvée. Vous pouvez maintenant saisir les devis (pièce jointe + commentaire).",
                    "success",
                )
            elif body.decision == "retour":
                title, msg, ntype = (
                    "Demande d'achat retournée ↩️",
                    f"Votre demande {num} a été retournée." + (f" Motif : {body.comment}" if body.comment else ""),
                    "warning",
                )
            else:
                title, msg, ntype = (
                    "Demande d'achat annulée ⛔",
                    f"Votre demande {num} a été annulée." + (f" Motif : {body.comment}" if body.comment else ""),
                    "error",
                )
            notify_users(db, [requester_id], title=title, message=msg, type=ntype,
                         link="/dashboard/purchase-requests")
        except Exception:
            pass
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
    if body.decision not in DECISIONS:
        raise HTTPException(400, "Décision invalide")
    pr = _get_or_404(db, pr_id)
    _require_decide(user, pr.get("budget_estimate") or 0)
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
    pr = _get_or_404(db, pr_id)
    _require_decide(user, pr.get("budget_estimate") or 0)
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


# ── Échéancier de paiement (proposition, en amont de la consultation) ─────────

def _installment_row(it, rank: int, user_id: str, pr_id: str) -> dict:
    if it.payment_mode not in INSTALLMENT_MODES:
        raise HTTPException(400, f"Mode de règlement invalide : {it.payment_mode}")
    return {
        "purchase_request_id": pr_id,
        "rank": rank,
        "label": (it.label or "").strip() or None,
        "amount": max(float(it.amount or 0), 0),
        "payment_mode": it.payment_mode,
        "nc": "noir" if it.payment_mode in CASH_SOCIAL_MODES else "comptable",
        "due_date": it.due_date or None,
        "created_by": user_id,
    }


@router.get("/{pr_id}/installments")
async def list_installments(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Échéancier prévisionnel (proposition de paiement) d'une DA — lecture ouverte
    aux utilisateurs authentifiés."""
    rows = (
        db.from_("purchase_installments").select("*")
        .eq("purchase_request_id", pr_id).order("rank").execute().data
    ) or []
    return rows


@router.put("/{pr_id}/installments")
async def replace_installments(
    pr_id: str,
    body: PurchaseInstallmentsReplace,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Remplace intégralement l'échéancier (admin). Saisi une fois le devis retenu,
    avant/à l'émission de la commande. Total libre : la somme des échéances peut
    différer du montant retenu (ex. avance « en noir » hors facture)."""
    pr = _get_or_404(db, pr_id)
    _require_decide(user, pr.get("budget_estimate") or 0)
    if pr["status"] not in INSTALLMENT_EDIT_ALLOWED:
        raise HTTPException(400, "Le mode de paiement se définit une fois le devis retenu.")

    to_insert = [
        _installment_row(it, i, user.id, pr_id)
        for i, it in enumerate(body.installments, start=1)
        if float(it.amount or 0) > 0 or (it.label or "").strip()
    ]

    db.from_("purchase_installments").delete().eq("purchase_request_id", pr_id).execute()
    if to_insert:
        db.from_("purchase_installments").insert(to_insert).execute()
    log_audit(db, user.id, "purchase_request.installments.replace", "purchase_request", pr_id,
              {"count": len(to_insert)})
    rows = (
        db.from_("purchase_installments").select("*")
        .eq("purchase_request_id", pr_id).order("rank").execute().data
    ) or []
    return rows


@router.get("/{pr_id}/pdf")
async def export_request_pdf(
    pr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    pr = _get_or_404(db, pr_id)
    _require_owner_or_admin(user, pr)

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

    # Échéancier de paiement prévisionnel (rattaché à la DA)
    installments = (
        db.from_("purchase_installments").select("*")
        .eq("purchase_request_id", pr_id).order("rank").execute().data
    ) or []

    pdf_bytes = render_purchase_request_pdf(pr, quotes, installments)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Demande_Achat_{pr.get('request_number', 'DA')}.pdf"
        }
    )

