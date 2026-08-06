import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchasePaymentCreate
from utils.audit import log_audit
from utils.uploads import validate_and_read

router = APIRouter(prefix="/accounting/payments", tags=["accounting"])

PAYMENT_METHODS = {"ov_permanent", "ov_ponctuel", "cheque", "caisse_sociale", "autre"}

# ── Pièces justificatives (scan) du paiement ──────────────────────────────
ENTITY_TYPE = "purchase_payment"
BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 heure
ATTACHMENT_KINDS = {"invoice", "receipt", "document"}


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
    purchase_exists = db.from_("purchases").select("id, purchase_request_id").eq("id", body.purchase_id).execute().data
    if not purchase_exists:
        raise HTTPException(404, "Purchase not found")

    # Échéance planifiée éventuelle → doit appartenir à la DA de ce bon de commande.
    installment = None
    if body.installment_id:
        inst = db.from_("purchase_installments").select("id, purchase_request_id, label").eq("id", body.installment_id).execute().data
        if not inst:
            raise HTTPException(400, "Échéance introuvable.")
        pr_id = purchase_exists[0].get("purchase_request_id")
        if not pr_id or inst[0].get("purchase_request_id") != pr_id:
            raise HTTPException(400, "Échéance invalide pour ce bon de commande.")
        installment = inst[0]

    data = body.model_dump(exclude={"payment_date", "nc"})  # nc = colonne du journal de caisse, pas du paiement
    data["payment_date"] = body.payment_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    # DÉCAISSEMENT BANCAIRE (chèque, versement, virement, OV) → validation N+1
    # obligatoire (migrations l37, l38) : ni le paiement ni l'écriture de journal
    # ne sont créés avant approbation.
    from routers.accounting_cheques import validation_mode, defer_bank_payment
    mode = validation_mode(body.payment_method)
    if mode:
        return defer_bank_payment(
            db,
            user=user,
            kind="purchase_payment",
            mode=mode,
            data=data,
            amount=body.amount,
            counterparty=_supplier_name(db, body.purchase_id),
            label="Paiement achat" + (f" — {(installment or {}).get('label')}" if (installment or {}).get("label") else ""),
            cheque_number=body.reference,
            issue_date=data["payment_date"],
        )

    return await commit_payment(db, data, user.id)


def _supplier_name(db: Client, purchase_id: str) -> Optional[str]:
    """Raison sociale du fournisseur du bon de commande (None si introuvable)."""
    p_rows = db.from_("purchases").select("supplier_id").eq("id", purchase_id).execute().data or []
    if p_rows and p_rows[0].get("supplier_id"):
        s_rows = db.from_("suppliers").select("company_name").eq("id", p_rows[0]["supplier_id"]).execute().data or []
        if s_rows and s_rows[0].get("company_name"):
            return s_rows[0]["company_name"]
    return None


async def commit_payment(db: Client, data: dict, user_id: str) -> dict:
    """Enregistre effectivement le paiement : insertion, recalcul du statut de
    l'achat et écriture au journal.

    Chemin UNIQUE de comptabilisation — appelé directement pour les modes hors
    chèque, et rejoué à l'identique par la validation N+1 des décaissements bancaires
    (cf. routers/accounting_cheques.execute_pending_payment)."""
    purchase_id = data["purchase_id"]
    payment_method = data.get("payment_method")

    res = db.from_("purchase_payments").insert(data).execute()
    new_payment = res.data[0]

    # Recalculate payment status of purchase
    new_status = await _recalculate_purchase_status(db, purchase_id)

    log_audit(db, user_id, "purchase_payment.create", "purchase_payment", new_payment["id"], {
        "purchase_id": purchase_id,
        "amount": data.get("amount"),
        "new_status": new_status,
        "reference": new_payment.get("recu_number"),   # n° de reçu auto (RCU-AAAA-NNNN)
        "bank_reference": new_payment.get("reference"),  # réf bancaire/chèque saisie
    })

    # Journal : décaissement RÉEL (une ligne par paiement), ventilé selon le MODE de
    # règlement — chèque / OV → Journal des comptes (banque), caisse sociale ou autre
    # → Journal de caisse. La NATURE (n/c) en découle : 'caisse_sociale' → 'noir'
    # (caisse sociale), sinon 'comptable'. Le scan éventuel ne change que le
    # justificatif, jamais la nature (cf. sync_source_piece(..., update_nc=False)).
    try:
        from routers.accounting_cash_journal import create_cash_entry
        reference = new_payment.get("recu_number") or new_payment.get("reference")
        prestataire = _supplier_name(db, purchase_id) or reference
        jalon = None
        if data.get("installment_id"):
            inst = db.from_("purchase_installments").select("label").eq("id", data["installment_id"]).execute().data or []
            jalon = inst[0].get("label") if inst else None
        detail = jalon or reference
        create_cash_entry(
            db,
            user_id=user_id,
            type="sortie",
            amount=data.get("amount") or 0,
            prestataire=prestataire,
            action="Paiement achat" + (f" — {detail}" if detail else ""),
            justificatif="Sans pièce",   # aucun scan à la création ; justificatif re-synchronisé à l'upload
            nc="noir" if payment_method == "caisse_sociale" else "comptable",
            source_type="purchase_payment",
            source_id=new_payment["id"],
            payment_method=payment_method,
            payment_ref=new_payment.get("reference"),
        )
    except Exception:
        pass

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


# ── Pièces justificatives (scan) du paiement ──────────────────────────────
@router.get("/{payment_id}/attachments")
async def list_attachments(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", ENTITY_TYPE).eq("entity_id", payment_id)
        .order("created_at", desc=True).execute().data or []
    )
    return rows


@router.post("/{payment_id}/attachments")
async def upload_attachment(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "receipt",
):
    _require_admin(user)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Invalid kind. Use one of: {', '.join(ATTACHMENT_KINDS)}")

    payment = db.from_("purchase_payments").select("id").eq("id", payment_id).execute().data
    if not payment:
        raise HTTPException(404, "Payment not found")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{payment_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Failed to store file: {str(e)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": payment_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "purchase_payment.attachment.upload", "purchase_payment", payment_id,
              {"kind": kind, "file_name": file.filename})
    # Journal de caisse : le paiement a désormais un scan → comptable + type de pièce.
    try:
        from routers.accounting_cash_journal import sync_source_piece
        # update_nc=False : la nature (caisse sociale / comptable) vient du mode de
        # règlement, pas du scan ; le scan ne met à jour que le justificatif.
        sync_source_piece(db, source_type=ENTITY_TYPE, source_id=payment_id, update_nc=False)
    except Exception:
        pass
    return new_attachment


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).eq("entity_type", ENTITY_TYPE)
        .execute().data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    signed = db.storage.from_(BUCKET).create_signed_url(rows[0]["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url"), "file_name": rows[0]["file_name"]}


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).eq("entity_type", ENTITY_TYPE)
        .execute().data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass
    db.from_("accounting_attachments").delete().eq("id", attachment_id).execute()
    log_audit(db, user.id, "purchase_payment.attachment.delete", "purchase_payment", rows[0]["entity_id"])
    # Journal de caisse : re-synchronise (repasse en 'noir' s'il ne reste plus de scan).
    try:
        from routers.accounting_cash_journal import sync_source_piece
        sync_source_piece(db, source_type=ENTITY_TYPE, source_id=rows[0]["entity_id"], update_nc=False)
    except Exception:
        pass
    return {"ok": True}
