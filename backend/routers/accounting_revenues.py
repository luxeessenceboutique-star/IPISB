import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import RevenueCreate, RevenueUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read
from utils.excel import make_xlsx

router = APIRouter(prefix="/accounting/revenues", tags=["accounting"])

# Modes de règlement passant par la banque (≠ espèces) → « versements bancaires ».
BANK_METHODS = ["versement", "ov_permanent", "ov_ponctuel", "cheque"]
_METHOD_LABELS = {
    "ov_permanent": "OV permanent", "ov_ponctuel": "OV ponctuel", "cheque": "Chèque",
    "versement": "Versement", "espece": "Espèces", "autre": "Autre",
}

BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 hour
ENTITY_TYPE = "revenue"
ATTACHMENT_KINDS = {"invoice", "receipt", "document"}
REVENUE_TYPES = {"tuition", "subsidy", "donation", "service", "other"}
STATUSES = {"expected", "received", "cancelled"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _shape(rev: dict) -> dict:
    return {
        **{k: v for k, v in rev.items() if k != "accounting_categories"},
        "category_name": (rev.get("accounting_categories") or {}).get("name"),
    }


@router.get("")
async def list_revenues(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    revenue_type: Optional[str] = None,
    status: Optional[str] = None,
    payment_method: Optional[str] = None,
    bank: bool = False,
    class_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "revenue_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    allowed_sort = {"revenue_date", "amount", "total_incl_vat", "title", "created_at"}
    if sort_by not in allowed_sort:
        sort_by = "revenue_date"
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("revenues").select("*, accounting_categories(name)", count="exact")
    if q:
        query = query.ilike("title", f"%{q}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if revenue_type:
        query = query.eq("revenue_type", revenue_type)
    if status:
        query = query.eq("status", status)
    if payment_method:
        query = query.eq("payment_method", payment_method)
    if bank:  # versements bancaires : uniquement les règlements passant par la banque
        query = query.in_("payment_method", BANK_METHODS)
    if class_id:  # recettes rattachées à une promo (vue groupée par classe)
        query = query.eq("class_id", class_id) if class_id != "none" else query.is_("class_id", "null")
    if date_from:
        query = query.gte("revenue_date", date_from)
    if date_to:
        query = query.lte("revenue_date", date_to)

    start = (page - 1) * page_size
    res = query.order(sort_by, desc=(sort_dir == "desc")).range(start, start + page_size - 1).execute()

    return {
        "items": [_shape(r) for r in (res.data or [])],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/export/xlsx")
async def export_revenues_xlsx(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    bank: bool = True,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Export Excel. Par défaut (bank=true) : « Versements Bancaires » — les
    recettes réglées via la banque (virement / OV / chèque). bank=false exporte
    toutes les recettes."""
    _require_admin(user)

    query = db.from_("revenues").select("*")
    if bank:
        query = query.in_("payment_method", BANK_METHODS)
    if status:
        query = query.eq("status", status)
    if date_from:
        query = query.gte("revenue_date", date_from)
    if date_to:
        query = query.lte("revenue_date", date_to)
    revenues = query.order("revenue_date", desc=True).execute().data or []

    rows = [
        {
            "revenue_date": r.get("revenue_date") or "",
            "source": r.get("title") or "—",
            "amount": float(r.get("total_incl_vat") or r.get("amount") or 0),
            "method": _METHOD_LABELS.get(r.get("payment_method"), r.get("payment_method") or "—"),
            "reference": r.get("revenue_number") or "",
        }
        for r in revenues
    ]

    today = datetime.now(timezone.utc).date()
    total = sum(r["amount"] for r in rows)
    is_bank = bank
    return make_xlsx(
        filename=f"{'Versements_bancaires' if is_bank else 'Recettes'}_{today.isoformat()}.xlsx",
        title="VERSEMENTS BANCAIRES AWB — IPISB" if is_bank else "RECETTES IPISB",
        subtitle=f"Édité le {today.strftime('%d/%m/%Y')} — {len(rows)} ligne(s) — Total payé actualisé : {total:,.2f} MAD".replace(",", " "),
        theme="green",
        sheet_name="Versements bancaires" if is_bank else "Recettes",
        columns=[
            {"key": "revenue_date", "label": "Date", "type": "date", "width": 13},
            {"key": "source", "label": "Source", "width": 34},
            {"key": "amount", "label": "Montant", "type": "money", "width": 16},
            {"key": "method", "label": "Type de virement", "width": 18},
            {"key": "reference", "label": "Référence", "width": 16},
        ],
        rows=rows,
    )


@router.get("/by-class")
async def revenues_by_class(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    revenue_type: Optional[str] = None,
    status: Optional[str] = None,
    payment_method: Optional[str] = None,
    bank: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Recettes agrégées par promo : un total (+ nb + encaissé) par classe.
    Applique les mêmes filtres que la liste. La classe « none » regroupe les
    recettes sans rattachement de promo."""
    _require_admin(user)

    query = db.from_("revenues").select("class_id, amount, total_incl_vat, status")
    if q:
        query = query.ilike("title", f"%{q}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if revenue_type:
        query = query.eq("revenue_type", revenue_type)
    if status:
        query = query.eq("status", status)
    if payment_method:
        query = query.eq("payment_method", payment_method)
    if bank:
        query = query.in_("payment_method", BANK_METHODS)
    if date_from:
        query = query.gte("revenue_date", date_from)
    if date_to:
        query = query.lte("revenue_date", date_to)
    rows = query.execute().data or []

    groups: dict = {}
    for r in rows:
        cid = r.get("class_id") or "none"
        g = groups.setdefault(cid, {"class_id": cid, "count": 0, "total": 0.0, "received_total": 0.0})
        amt = float(r.get("total_incl_vat") or r.get("amount") or 0)
        g["count"] += 1
        g["total"] += amt
        if r.get("status") == "received":
            g["received_total"] += amt

    real_ids = [c for c in groups if c != "none"]
    names: dict = {}
    if real_ids:
        cls = db.from_("classes").select("id, name").in_("id", real_ids).execute().data or []
        names = {c["id"]: c["name"] for c in cls}

    out = []
    for cid, g in groups.items():
        out.append({**g, "class_name": (None if cid == "none" else names.get(cid))})
    # Classes nommées d'abord (alpha), « Sans promo » en dernier.
    out.sort(key=lambda x: (x["class_name"] is None, (x["class_name"] or "").lower()))

    return {
        "groups": out,
        "total": sum(g["total"] for g in out),
        "grand_count": sum(g["count"] for g in out),
    }


@router.get("/{revenue_id}")
async def get_revenue(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("revenues").select("*, accounting_categories(name)").eq("id", revenue_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")

    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", revenue_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    return {**_shape(rows[0]), "attachments": attachments}


@router.post("")
async def create_revenue(
    body: RevenueCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.title.strip():
        raise HTTPException(400, "title is required")
    if body.revenue_type not in REVENUE_TYPES:
        raise HTTPException(400, "Invalid revenue_type")
    if body.status not in STATUSES:
        raise HTTPException(400, "Invalid status")

    data = body.model_dump(exclude={"revenue_date"})
    data["revenue_date"] = body.revenue_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    res = db.from_("revenues").insert(data).execute()
    new_revenue = res.data[0]
    log_audit(db, user.id, "revenue.create", "revenue", new_revenue["id"],
              {"title": body.title, "reference": new_revenue.get("reference") or new_revenue.get("revenue_number")})

    # Journal : encaissement (uniquement si la recette est réellement encaissée),
    # ventilé selon le mode d'encaissement (virement / chèque / versement / carte
    # → Journal des comptes, espèces ou mode non précisé → Journal de caisse).
    if new_revenue.get("status") == "received":
        try:
            from routers.accounting_cash_journal import create_cash_entry
            create_cash_entry(
                db,
                user_id=user.id,
                type="entree",
                amount=new_revenue.get("total_incl_vat") or new_revenue.get("amount") or 0,
                prestataire=new_revenue.get("title"),
                action="Recette — " + (new_revenue.get("description") or new_revenue.get("title") or ""),
                justificatif="Sans pièce",   # aucune pièce à la création ; re-synchronisé à l'upload
                nc="noir",                    # pas de pièce justificative → hors comptabilité
                source_type="revenue",
                source_id=new_revenue["id"],
                payment_method=new_revenue.get("payment_method"),
            )
            # Chèque REÇU → inscrit au registre et suivi jusqu'à l'encaissement.
            # Pas de validation N+1 : l'encaissement n'est pas une décision.
            from routers.accounting_cheques import is_cheque, register_instrument, RECU
            if is_cheque(new_revenue.get("payment_method")):
                register_instrument(
                    db,
                    direction=RECU,
                    amount=new_revenue.get("total_incl_vat") or new_revenue.get("amount") or 0,
                    counterparty=new_revenue.get("title"),
                    label=f"Recette {new_revenue.get('revenue_number') or ''}".strip(),
                    issue_date=new_revenue.get("revenue_date"),
                    status="remis",
                    source_type="revenue",
                    source_id=new_revenue["id"],
                    created_by=user.id,
                )
        except Exception:
            pass

    return _shape(new_revenue)


@router.patch("/{revenue_id}")
async def update_revenue(
    revenue_id: str,
    body: RevenueUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "revenue_type" in updates and updates["revenue_type"] not in REVENUE_TYPES:
        raise HTTPException(400, "Invalid revenue_type")
    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(400, "Invalid status")

    res = db.from_("revenues").update(updates).eq("id", revenue_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "revenue.update", "revenue", revenue_id, updates)
    return _shape(res.data[0])


@router.delete("/{revenue_id}")
async def delete_revenue(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("revenues").select("id").eq("id", revenue_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    attachments = (
        db.from_("accounting_attachments")
        .select("file_path")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", revenue_id)
        .execute()
        .data or []
    )
    if attachments:
        try:
            db.storage.from_(BUCKET).remove([a["file_path"] for a in attachments])
        except Exception:
            pass
        db.from_("accounting_attachments").delete().eq("entity_type", ENTITY_TYPE).eq("entity_id", revenue_id).execute()

    # La recette avait été portée au journal (et, si chèque, au registre) : on la
    # retire des deux, sinon le solde garde un encaissement qui n'existe plus.
    from routers.accounting_cash_journal import delete_cash_entry
    from routers.accounting_cheques import unregister_source
    delete_cash_entry(db, source_type=ENTITY_TYPE, source_id=revenue_id, user_id=user.id)
    unregister_source(db, source_type=ENTITY_TYPE, source_id=revenue_id, user_id=user.id)

    db.from_("revenues").delete().eq("id", revenue_id).execute()
    log_audit(db, user.id, "revenue.delete", "revenue", revenue_id)
    return {"ok": True}


# ── Attachments (pièces justificatives) ──────────────────────────────────────

@router.post("/{revenue_id}/attachments")
async def upload_attachment(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "invoice",
):
    _require_admin(user)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Invalid kind. Use one of: {', '.join(ATTACHMENT_KINDS)}")

    revenue = db.from_("revenues").select("id").eq("id", revenue_id).execute().data
    if not revenue:
        raise HTTPException(404, "Revenue not found")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{revenue_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Failed to store file: {str(e)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": revenue_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "revenue.attachment.upload", "revenue", revenue_id, {"kind": kind, "file_name": file.filename})
    # Journal de caisse : la recette a désormais une pièce → comptable + type de pièce.
    try:
        from routers.accounting_cash_journal import sync_source_piece
        sync_source_piece(db, source_type="revenue", source_id=revenue_id)
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
    log_audit(db, user.id, "revenue.attachment.delete", "revenue", rows[0]["entity_id"])
    # Journal de caisse : re-synchronise (repasse en 'noir' s'il ne reste plus de pièce).
    try:
        from routers.accounting_cash_journal import sync_source_piece
        sync_source_piece(db, source_type="revenue", source_id=rows[0]["entity_id"])
    except Exception:
        pass
    return {"ok": True}
