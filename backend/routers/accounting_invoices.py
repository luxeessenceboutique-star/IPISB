from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import InvoiceCreate, InvoiceUpdate
from utils.audit import log_audit
from utils.excel import make_xlsx
from routers.accounting_purchases import _delivery_status, _receptions_by_purchase, DELIVERY_LABELS

router = APIRouter(prefix="/accounting/invoices", tags=["accounting"])

PAYMENT_STATUSES = {"pending", "partially_paid", "paid"}

# Champs ajoutés par la migration L59 — envoyés seulement quand renseignés
# pour ne pas casser la création/mise à jour si la migration n'est pas passée.
_L59_FIELDS = ("payment_date", "payment_method")

_STATUS_LABELS = {
    "pending": "À payer", "partially_paid": "Partiellement payée", "paid": "Payée",
}
_METHOD_LABELS = {
    "ov_permanent": "OV permanent", "ov_ponctuel": "OV ponctuel", "cheque": "Chèque",
    "versement": "Versement", "espece": "Espèces", "autre": "Autre",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _migration_error(ex: Exception) -> HTTPException:
    msg = str(ex)
    if any(f in msg for f in _L59_FIELDS) or "does not exist" in msg or "Could not find" in msg:
        return HTTPException(400, "Migration L59 requise (colonnes payment_date / payment_method des factures).")
    return HTTPException(500, "Écriture de la facture impossible.")


def _shape(inv: dict, student_names: dict[str, str] | None = None, reception_agg: dict | None = None) -> dict:
    student_names = student_names or {}
    sid = inv.get("student_id")
    purchase = inv.get("purchases") or {}
    pid = inv.get("purchase_id")
    agg = (reception_agg or {}).get(pid) if pid else None
    reception_status = None
    if pid:
        reception_status = _delivery_status(float(purchase.get("quantity") or 0), float((agg or {}).get("received_quantity") or 0))
    return {
        **{k: v for k, v in inv.items() if k not in ("suppliers", "classes", "purchases")},
        "supplier_name": (inv.get("suppliers") or {}).get("company_name"),
        "class_name": (inv.get("classes") or {}).get("name"),
        "student_name": student_names.get(sid) if sid else None,
        "purchase_number": purchase.get("purchase_number"),
        "reception_status": reception_status,
        "reception_status_label": DELIVERY_LABELS.get(reception_status) if reception_status else None,
        "reception_date": (agg or {}).get("last_reception_at") if agg else None,
    }


def _student_names(db: Client, student_ids: list) -> dict[str, str]:
    """Map student_id -> display name (profiles live in a separate table from
    auth.users, so names are fetched in a second query)."""
    ids = list({s for s in student_ids if s})
    if not ids:
        return {}
    profs = db.from_("profiles").select("id, full_name, email").in_("id", ids).execute().data or []
    return {p["id"]: (p.get("full_name") or p.get("email") or "—") for p in profs}


_SELECT = "*, suppliers(company_name), classes(name), purchases(purchase_number, quantity, payment_method)"


@router.get("")
async def list_invoices(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    supplier_id: Optional[str] = None,
    class_id: Optional[str] = None,
    student_id: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "invoice_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    allowed_sort = {"invoice_date", "due_date", "amount", "total_incl_vat", "created_at"}
    if sort_by not in allowed_sort:
        sort_by = "invoice_date"
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("invoices").select(_SELECT, count="exact")
    if q:
        query = query.ilike("invoice_number", f"%{q}%")
    if supplier_id:
        query = query.eq("supplier_id", supplier_id)
    if class_id:
        query = query.eq("class_id", class_id)
    if student_id:
        query = query.eq("student_id", student_id)
    if payment_status:
        query = query.eq("payment_status", payment_status)
    if date_from:
        query = query.gte("invoice_date", date_from)
    if date_to:
        query = query.lte("invoice_date", date_to)

    start = (page - 1) * page_size
    res = query.order(sort_by, desc=(sort_dir == "desc")).range(start, start + page_size - 1).execute()

    rows = res.data or []
    names = _student_names(db, [r.get("student_id") for r in rows])
    agg = _receptions_by_purchase(db, [r["purchase_id"] for r in rows if r.get("purchase_id")])
    return {
        "items": [_shape(i, names, agg) for i in rows],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/export/xlsx")
async def export_invoices_xlsx(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    status: str = "unpaid",
):
    """Export Excel « Suivi des factures » : échéancier + réception + paiement.
    Par défaut (status=unpaid) : uniquement les factures restant à régler
    (pending + partially_paid). status=all pour tout exporter."""
    _require_admin(user)

    query = db.from_("invoices").select(_SELECT)
    if status == "unpaid":
        query = query.in_("payment_status", ["pending", "partially_paid"])
    elif status in PAYMENT_STATUSES:
        query = query.eq("payment_status", status)
    invoices = query.order("due_date", desc=False).execute().data or []

    agg = _receptions_by_purchase(db, [i["purchase_id"] for i in invoices if i.get("purchase_id")])

    rows = []
    for inv in invoices:
        shaped = _shape(inv, reception_agg=agg)
        amount = float(inv.get("amount") or 0)
        vat = float(inv.get("vat_percent") or 0)
        # Mode de paiement : celui saisi sur la facture ; à défaut (anciennes
        # lignes), celui déclaré sur la commande liée.
        method = shaped.get("payment_method") or (inv.get("purchases") or {}).get("payment_method")
        rows.append({
            "invoice_date": inv.get("invoice_date") or "",
            "invoice_number": inv.get("invoice_number") or "",
            "supplier": (inv.get("suppliers") or {}).get("company_name") or "—",
            "amount_ttc": round(amount * (1 + vat / 100), 2),
            "purchase_number": shaped.get("purchase_number") or "—",
            "reception_status": shaped.get("reception_status_label") or "—",
            "reception_date": shaped.get("reception_date") or "",
            "due_date": inv.get("due_date") or "",
            "status": _STATUS_LABELS.get(inv.get("payment_status"), inv.get("payment_status")),
            "payment_date": inv.get("payment_date") or "",
            "method": _METHOD_LABELS.get(method, method or "—"),
            "comment": inv.get("comment") or "",
        })

    today = datetime.now(timezone.utc).date()
    total = sum(r["amount_ttc"] for r in rows)
    return make_xlsx(
        filename=f"Suivi_factures_{today.isoformat()}.xlsx",
        title="SUIVI DES FACTURES",
        subtitle=f"Édité le {today.strftime('%d/%m/%Y')} — {len(rows)} facture(s) — Total TTC : {total:,.2f} MAD".replace(",", " "),
        theme="yellow",
        sheet_name="Factures",
        columns=[
            {"key": "invoice_date", "label": "Date", "type": "date", "width": 12},
            {"key": "invoice_number", "label": "N° Facture", "width": 16},
            {"key": "supplier", "label": "Fournisseur", "width": 26},
            {"key": "amount_ttc", "label": "Montant TTC", "type": "money", "width": 15},
            {"key": "purchase_number", "label": "N° Commande", "width": 14},
            {"key": "reception_status", "label": "État réception", "width": 16},
            {"key": "reception_date", "label": "Date réception", "type": "date", "width": 14},
            {"key": "due_date", "label": "Échéance", "type": "date", "width": 12},
            {"key": "status", "label": "État paiement", "width": 16},
            {"key": "payment_date", "label": "Date paiement", "type": "date", "width": 14},
            {"key": "method", "label": "Mode paiement", "width": 15},
            {"key": "comment", "label": "Commentaire", "width": 30},
        ],
        rows=rows,
    )


@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    return _shape_by_id(db, invoice_id)


def _shape_by_id(db: Client, invoice_id: str) -> dict:
    """Recharge la facture avec ses jointures (fournisseur/commande/réception) —
    un insert()/update() ne renvoie que les colonnes propres de la ligne, pas
    les relations, donc create/update rechargent par ce chemin plutôt que de
    façonner directement leur résultat brut."""
    rows = db.from_("invoices").select(_SELECT).eq("id", invoice_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    names = _student_names(db, [rows[0].get("student_id")])
    pid = rows[0].get("purchase_id")
    agg = _receptions_by_purchase(db, [pid] if pid else [])
    return _shape(rows[0], names, agg)


@router.post("")
async def create_invoice(
    body: InvoiceCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.invoice_number.strip():
        raise HTTPException(400, "invoice_number is required")
    if body.payment_status not in PAYMENT_STATUSES:
        raise HTTPException(400, "Invalid payment_status")

    data = body.model_dump(exclude={"invoice_date", *_L59_FIELDS})
    data["invoice_date"] = body.invoice_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id
    for f in _L59_FIELDS:
        v = getattr(body, f)
        if v is not None:
            data[f] = v

    try:
        res = db.from_("invoices").insert(data).execute()
    except Exception as ex:
        raise _migration_error(ex)
    new_invoice = res.data[0]
    log_audit(db, user.id, "invoice.create", "invoice", new_invoice["id"],
              {"invoice_number": body.invoice_number, "reference": new_invoice.get("reference")})
    return _shape_by_id(db, new_invoice["id"])


@router.patch("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    raw = body.model_dump(exclude_unset=True)
    # class_id / student_id / payment_date / payment_method / comment peuvent
    # être explicitement effacés (mis à null) — ex. changer la classe
    # réinitialise l'élève côté UI ; changer de mode de règlement peut vider
    # la date le temps de la resaisir.
    nullable = {"class_id", "student_id", "payment_date", "payment_method", "comment"}
    updates = {k: v for k, v in raw.items() if k in nullable or v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "payment_status" in updates and updates["payment_status"] not in PAYMENT_STATUSES:
        raise HTTPException(400, "Invalid payment_status")

    try:
        res = db.from_("invoices").update(updates).eq("id", invoice_id).execute()
    except Exception as ex:
        raise _migration_error(ex)
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "invoice.update", "invoice", invoice_id, updates)
    return _shape_by_id(db, invoice_id)


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("invoices").select("id").eq("id", invoice_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    db.from_("invoices").delete().eq("id", invoice_id).execute()
    log_audit(db, user.id, "invoice.delete", "invoice", invoice_id)
    return {"ok": True}
