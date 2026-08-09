from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import InvoiceCreate, InvoiceUpdate
from utils.audit import log_audit
from utils.excel import make_xlsx

router = APIRouter(prefix="/accounting/invoices", tags=["accounting"])

PAYMENT_STATUSES = {"pending", "partially_paid", "paid"}

_STATUS_LABELS = {
    "pending": "À payer", "partially_paid": "Partiellement payée", "paid": "Payée",
}
_METHOD_LABELS = {
    "ov_permanent": "OV permanent", "ov_ponctuel": "OV ponctuel", "cheque": "Chèque",
    "versement": "Versement", "espece": "Espèces", "autre": "Autre",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _shape(inv: dict, student_names: dict[str, str] | None = None) -> dict:
    student_names = student_names or {}
    sid = inv.get("student_id")
    return {
        **{k: v for k, v in inv.items() if k not in ("suppliers", "classes")},
        "supplier_name": (inv.get("suppliers") or {}).get("company_name"),
        "class_name": (inv.get("classes") or {}).get("name"),
        "student_name": student_names.get(sid) if sid else None,
    }


def _student_names(db: Client, student_ids: list) -> dict[str, str]:
    """Map student_id -> display name (profiles live in a separate table from
    auth.users, so names are fetched in a second query)."""
    ids = list({s for s in student_ids if s})
    if not ids:
        return {}
    profs = db.from_("profiles").select("id, full_name, email").in_("id", ids).execute().data or []
    return {p["id"]: (p.get("full_name") or p.get("email") or "—") for p in profs}


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

    query = db.from_("invoices").select("*, suppliers(company_name), classes(name)", count="exact")
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
    return {
        "items": [_shape(i, names) for i in rows],
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
    """Export Excel « Instances fournisseurs » — échéancier des factures
    fournisseurs. Par défaut (status=unpaid) : uniquement les factures restant à
    régler (pending + partially_paid). status=all pour tout exporter."""
    _require_admin(user)

    query = db.from_("invoices").select(
        "*, suppliers(company_name), purchases(title, payment_method)"
    )
    if status == "unpaid":
        query = query.in_("payment_status", ["pending", "partially_paid"])
    elif status in PAYMENT_STATUSES:
        query = query.eq("payment_status", status)
    invoices = query.order("due_date", desc=False).execute().data or []

    rows = []
    for inv in invoices:
        purchase = inv.get("purchases") or {}
        amount = float(inv.get("amount") or 0)
        vat = float(inv.get("vat_percent") or 0)
        method = purchase.get("payment_method")
        rows.append({
            "invoice_date": inv.get("invoice_date") or "",
            "prestation": purchase.get("title") or "—",
            "supplier": (inv.get("suppliers") or {}).get("company_name") or "—",
            "amount_ttc": round(amount * (1 + vat / 100), 2),
            "invoice_number": inv.get("invoice_number") or "",
            "due_date": inv.get("due_date") or "",
            "status": _STATUS_LABELS.get(inv.get("payment_status"), inv.get("payment_status")),
            "method": _METHOD_LABELS.get(method, method or "—"),
        })

    today = datetime.now(timezone.utc).date()
    total = sum(r["amount_ttc"] for r in rows)
    return make_xlsx(
        filename=f"Instances_fournisseurs_{today.isoformat()}.xlsx",
        title="INSTANCES FOURNISSEURS — ÉCHÉANCIER",
        subtitle=f"Édité le {today.strftime('%d/%m/%Y')} — {len(rows)} facture(s) — Total TTC : {total:,.2f} MAD".replace(",", " "),
        theme="yellow",
        sheet_name="Instances fournisseurs",
        columns=[
            {"key": "invoice_date", "label": "Date", "type": "date", "width": 13},
            {"key": "prestation", "label": "Prestation", "width": 32},
            {"key": "supplier", "label": "Prestataire", "width": 26},
            {"key": "amount_ttc", "label": "Montant TTC", "type": "money", "width": 16},
            {"key": "invoice_number", "label": "N° de Facture", "width": 18},
            {"key": "due_date", "label": "Échéance", "type": "date", "width": 13},
            {"key": "status", "label": "Planification", "width": 18},
            {"key": "method", "label": "Mode Paiement", "width": 16},
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
    rows = db.from_("invoices").select("*, suppliers(company_name), classes(name)").eq("id", invoice_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    names = _student_names(db, [rows[0].get("student_id")])
    return _shape(rows[0], names)


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

    data = body.model_dump(exclude={"invoice_date"})
    data["invoice_date"] = body.invoice_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    res = db.from_("invoices").insert(data).execute()
    new_invoice = res.data[0]
    log_audit(db, user.id, "invoice.create", "invoice", new_invoice["id"],
              {"invoice_number": body.invoice_number, "reference": new_invoice.get("reference")})
    return _shape(new_invoice)


@router.patch("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    raw = body.model_dump(exclude_unset=True)
    updates = {k: v for k, v in raw.items() if v is not None}
    # class_id / student_id peuvent être explicitement effacés (mis à null) — ex.
    # changer la classe réinitialise l'élève côté UI.
    for nullable in ("class_id", "student_id"):
        if nullable in raw:
            updates[nullable] = raw[nullable]
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "payment_status" in updates and updates["payment_status"] not in PAYMENT_STATUSES:
        raise HTTPException(400, "Invalid payment_status")

    res = db.from_("invoices").update(updates).eq("id", invoice_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "invoice.update", "invoice", invoice_id, updates)
    return _shape(res.data[0])


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
