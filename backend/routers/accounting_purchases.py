import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, Response
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchaseCreate, PurchaseUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read
from utils.pdf_generators import render_purchase_order_pdf

router = APIRouter(prefix="/accounting/purchases", tags=["accounting"])

BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 hour
ATTACHMENT_KINDS = {"quotation", "invoice", "receipt", "document"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_purchases(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = "purchase_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    allowed_sort = {"purchase_date", "total_incl_vat", "title", "created_at"}
    if sort_by not in allowed_sort:
        sort_by = "purchase_date"
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchases").select(
        "*, accounting_categories(name), suppliers(company_name)", count="exact"
    )
    if q:
        query = query.ilike("title", f"%{q}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if supplier_id:
        query = query.eq("supplier_id", supplier_id)
    if payment_status:
        query = query.eq("payment_status", payment_status)
    if date_from:
        query = query.gte("purchase_date", date_from)
    if date_to:
        query = query.lte("purchase_date", date_to)
    if min_amount is not None:
        query = query.gte("total_incl_vat", min_amount)
    if max_amount is not None:
        query = query.lte("total_incl_vat", max_amount)

    start = (page - 1) * page_size
    res = query.order(sort_by, desc=(sort_dir == "desc")).range(start, start + page_size - 1).execute()
    items = res.data or []

    return {
        "items": [
            {
                **{k: v for k, v in p.items() if k not in ("accounting_categories", "suppliers")},
                "category_name": (p.get("accounting_categories") or {}).get("name"),
                "supplier_name": (p.get("suppliers") or {}).get("company_name"),
            }
            for p in items
        ],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{purchase_id}")
async def get_purchase(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("purchases")
        .select("*, accounting_categories(name), suppliers(company_name)")
        .eq("id", purchase_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    p = rows[0]
    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", "purchase")
        .eq("entity_id", purchase_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    return {
        **{k: v for k, v in p.items() if k not in ("accounting_categories", "suppliers")},
        "category_name": (p.get("accounting_categories") or {}).get("name"),
        "supplier_name": (p.get("suppliers") or {}).get("company_name"),
        "attachments": attachments,
    }


@router.post("")
async def create_purchase(
    body: PurchaseCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.payment_status not in ("pending", "partially_paid", "paid"):
        raise HTTPException(400, "Invalid payment_status")

    data = body.model_dump(exclude={"purchase_date"})
    data["purchase_date"] = body.purchase_date or datetime.now(timezone.utc).date().isoformat()
    data["requested_by"] = user.id
    data["created_by"] = user.id

    res = db.from_("purchases").insert(data).execute()
    new_purchase = res.data[0]
    log_audit(db, user.id, "purchase.create", "purchase", new_purchase["id"],
              {"title": body.title, "reference": new_purchase.get("reference") or new_purchase.get("purchase_number")})
    return new_purchase


@router.patch("/{purchase_id}")
async def update_purchase(
    purchase_id: str,
    body: PurchaseUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "payment_status" in updates and updates["payment_status"] not in ("pending", "partially_paid", "paid"):
        raise HTTPException(400, "Invalid payment_status")

    res = db.from_("purchases").update(updates).eq("id", purchase_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "purchase.update", "purchase", purchase_id, updates)
    return res.data[0]


@router.delete("/{purchase_id}")
async def delete_purchase(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    attachments = (
        db.from_("accounting_attachments")
        .select("file_path")
        .eq("entity_type", "purchase")
        .eq("entity_id", purchase_id)
        .execute()
        .data or []
    )
    if attachments:
        try:
            db.storage.from_(BUCKET).remove([a["file_path"] for a in attachments])
        except Exception:
            pass
        db.from_("accounting_attachments").delete().eq("entity_type", "purchase").eq("entity_id", purchase_id).execute()

    db.from_("purchases").delete().eq("id", purchase_id).execute()
    log_audit(db, user.id, "purchase.delete", "purchase", purchase_id)
    return {"ok": True}


# ── Commande : validation unique (admin N+1) + alimentation du journal ───────

@router.post("/{purchase_id}/validate-order")
async def validate_order(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Validation UNIQUE de la commande (admin). Émet la commande et met la DA à
    'commande_emise'. La nature (caisse sociale / comptable) N'EST PLUS fixée ici :
    elle est décidée paiement par paiement dans l'onglet Paiements, où chaque
    décaissement réel est inscrit au journal de caisse avec sa propre nature. Le
    journal de caisse n'est donc PAS alimenté à l'émission (ce serait un engagement,
    pas un décaissement réel, et cela double-compterait les paiements)."""
    _require_admin(user)

    rows = (
        db.from_("purchases")
        .select("id, valide_responsable_at, purchase_request_id, total_incl_vat, supplier_id, title, purchase_number")
        .eq("id", purchase_id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    p = rows[0]
    if p.get("valide_responsable_at"):
        raise HTTPException(400, "Commande déjà validée.")

    now = datetime.now(timezone.utc).isoformat()
    # On pose les deux marqueurs en une fois (compat. avec l'affichage existant).
    res = db.from_("purchases").update({
        "valide_responsable_by": user.id, "valide_responsable_at": now,
        "valide_comptable_by": user.id, "valide_comptable_at": now,
    }).eq("id", purchase_id).execute()

    # DA liée → commande émise (sans axe n/c global : il est porté par chaque
    # jalon de l'échéancier et par chaque paiement effectif).
    pr_id = p.get("purchase_request_id")
    if pr_id:
        db.from_("purchase_requests").update({
            "status": "commande_emise",
        }).eq("id", pr_id).execute()
        log_audit(db, user.id, "purchase_request.order_emitted", "purchase_request", pr_id,
                  {"purchase_id": purchase_id})

    log_audit(db, user.id, "purchase.validate_order", "purchase", purchase_id, {})
    return res.data[0]


# ── Échéancier de paiement (lecture — rattaché à la DA) ─────────────────────
# La saisie/édition se fait sur la DA (accounting_purchase_requests, en amont de
# la consultation). Ce GET reste pour les vues indexées par bon de commande
# (onglet Paiements) : il résout la DA liée et renvoie son échéancier.

@router.get("/{purchase_id}/installments")
async def list_installments(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Échéancier prévisionnel du bon de commande, résolu via la DA liée
    (lecture ouverte aux utilisateurs authentifiés)."""
    p_rows = db.from_("purchases").select("purchase_request_id").eq("id", purchase_id).execute().data
    pr_id = p_rows[0].get("purchase_request_id") if p_rows else None
    if not pr_id:
        return []
    rows = (
        db.from_("purchase_installments").select("*")
        .eq("purchase_request_id", pr_id).order("rank").execute().data
    ) or []
    return rows


# ── Attachments ────────────────────────────────────────────────────────────

@router.post("/{purchase_id}/attachments")
async def upload_attachment(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "document",
):
    _require_admin(user)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Invalid kind. Use one of: {', '.join(ATTACHMENT_KINDS)}")

    purchase = db.from_("purchases").select("id").eq("id", purchase_id).execute().data
    if not purchase:
        raise HTTPException(404, "Purchase not found")

    data, ext = await validate_and_read(file)
    file_path = f"purchase/{purchase_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Failed to store file: {str(e)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": "purchase",
        "entity_id": purchase_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "purchase.attachment.upload", "purchase", purchase_id, {"kind": kind, "file_name": file.filename})
    return new_attachment


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("accounting_attachments").select("*").eq("id", attachment_id).execute().data
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
    rows = db.from_("accounting_attachments").select("*").eq("id", attachment_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass
    db.from_("accounting_attachments").delete().eq("id", attachment_id).execute()
    log_audit(db, user.id, "purchase.attachment.delete", "purchase", rows[0]["entity_id"])
    return {"ok": True}


# ── Dashboard summary ───────────────────────────────────────────────────────

@router.get("/dashboard/summary")
async def dashboard_summary(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)

    purchases = (
        db.from_("purchases").select("total_incl_vat, payment_status, purchase_date").execute().data or []
    )
    now = datetime.now(timezone.utc)
    month_prefix = now.strftime("%Y-%m")

    total_purchases = len(purchases)
    total_amount = sum(p["total_incl_vat"] or 0 for p in purchases)
    total_paid = sum(p["total_incl_vat"] or 0 for p in purchases if p["payment_status"] == "paid")
    total_unpaid = sum(
        p["total_incl_vat"] or 0 for p in purchases if p["payment_status"] in ("pending", "partially_paid")
    )
    monthly_amount = sum(
        p["total_incl_vat"] or 0 for p in purchases if (p["purchase_date"] or "").startswith(month_prefix)
    )

    supplier_count = len(db.from_("suppliers").select("id").execute().data or [])

    return {
        "total_purchases": total_purchases,
        "total_purchases_amount": total_amount,
        "total_paid": total_paid,
        "total_unpaid": total_unpaid,
        "monthly_expenses": monthly_amount,
        "supplier_count": supplier_count,
        "purchase_request_count": total_purchases,
    }


@router.get("/{purchase_id}/pdf")
async def export_purchase_pdf(
    purchase_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    p_rows = db.from_("purchases").select("*").eq("id", purchase_id).execute().data
    if not p_rows:
        raise HTTPException(404, "Achat introuvable")
    purchase = p_rows[0]

    supplier = {}
    if purchase.get("supplier_id"):
        s_rows = db.from_("suppliers").select("*").eq("id", purchase["supplier_id"]).execute().data
        if s_rows:
            supplier = s_rows[0]

    # Toutes les informations du bon de commande proviennent de la DA liée.
    pr = None
    if purchase.get("purchase_request_id"):
        pr_rows = (
            db.from_("purchase_requests").select("*")
            .eq("id", purchase["purchase_request_id"]).execute().data
        )
        if pr_rows:
            pr = pr_rows[0]

    # Devis retenu → sert à reporter la livraison sur le bon de commande.
    quote = None
    if purchase.get("purchase_request_id"):
        q_rows = (
            db.from_("quotations").select("*")
            .eq("purchase_request_id", purchase["purchase_request_id"])
            .eq("retenu", True).limit(1).execute().data
        )
        if q_rows:
            quote = q_rows[0]

    # Échéancier prévisionnel (rattaché à la DA) → reporté sur le bon de commande.
    installments = []
    if purchase.get("purchase_request_id"):
        installments = (
            db.from_("purchase_installments").select("*")
            .eq("purchase_request_id", purchase["purchase_request_id"]).order("rank").execute().data
        ) or []

    pdf_bytes = render_purchase_order_pdf(purchase, supplier, pr, quote, installments)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Bon_de_commande_{purchase.get('purchase_number', 'CMD')}.pdf"
        }
    )

