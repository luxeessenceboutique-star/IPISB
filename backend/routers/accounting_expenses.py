import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ExpenseCreate, ExpenseUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read

router = APIRouter(prefix="/accounting/expenses", tags=["accounting"])

BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 hour
ENTITY_TYPE = "expense"
ATTACHMENT_KINDS = {"invoice", "receipt", "document"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _shape(exp: dict) -> dict:
    return {
        **{k: v for k, v in exp.items() if k not in ("accounting_categories", "suppliers")},
        "category_name": (exp.get("accounting_categories") or {}).get("name"),
        "supplier_name": (exp.get("suppliers") or {}).get("company_name"),
    }


@router.get("")
async def list_expenses(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "expense_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    allowed_sort = {"expense_date", "amount", "title", "created_at"}
    if sort_by not in allowed_sort:
        sort_by = "expense_date"
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("expenses").select(
        "*, accounting_categories(name), suppliers(company_name)", count="exact"
    )
    if q:
        query = query.ilike("title", f"%{q}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if supplier_id:
        query = query.eq("supplier_id", supplier_id)
    if date_from:
        query = query.gte("expense_date", date_from)
    if date_to:
        query = query.lte("expense_date", date_to)

    start = (page - 1) * page_size
    res = query.order(sort_by, desc=(sort_dir == "desc")).range(start, start + page_size - 1).execute()

    return {
        "items": [_shape(e) for e in (res.data or [])],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{expense_id}")
async def get_expense(
    expense_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("expenses")
        .select("*, accounting_categories(name), suppliers(company_name)")
        .eq("id", expense_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", expense_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    return {**_shape(rows[0]), "attachments": attachments}


@router.post("")
async def create_expense(
    body: ExpenseCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.title.strip():
        raise HTTPException(400, "title is required")

    data = body.model_dump(exclude={"expense_date"})
    data["expense_date"] = body.expense_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    # Dépense réglée par DÉCAISSEMENT BANCAIRE (chèque, versement, virement, OV)
    # → validation N+1 obligatoire (migrations l37, l38) : ni la dépense ni
    # l'écriture de journal ne sont créées avant approbation.
    from routers.accounting_cheques import validation_mode, defer_bank_payment
    mode = validation_mode(body.payment_method)
    if mode:
        return defer_bank_payment(
            db,
            user=user,
            kind="expense",
            mode=mode,
            data=data,
            amount=body.amount,
            counterparty=_supplier_name(db, body.supplier_id) or body.title,
            label="Dépense — " + body.title,
            issue_date=data["expense_date"],
        )

    return _shape(commit_expense(db, data, user.id))


def _supplier_name(db: Client, supplier_id: Optional[str]) -> Optional[str]:
    """Raison sociale du fournisseur (None si non renseigné ou introuvable)."""
    if not supplier_id:
        return None
    rows = db.from_("suppliers").select("company_name").eq("id", supplier_id).execute().data or []
    return rows[0].get("company_name") if rows else None


def commit_expense(db: Client, data: dict, user_id: str) -> dict:
    """Enregistre effectivement la dépense et l'écriture de journal associée.

    Chemin UNIQUE de comptabilisation — appelé directement hors décaissement bancaire, et rejoué
    à l'identique par la validation N+1 des décaissements bancaires (cf.
    routers/accounting_cheques.execute_pending_payment)."""
    res = db.from_("expenses").insert(data).execute()
    new_expense = res.data[0]
    log_audit(db, user_id, "expense.create", "expense", new_expense["id"],
              {"title": data.get("title"), "reference": new_expense.get("reference")})

    # Journal : décaissement automatique, ventilé selon le mode de paiement
    # (virement / chèque / carte → Journal des comptes, sinon Journal de caisse).
    try:
        from routers.accounting_cash_journal import create_cash_entry
        prestataire = _supplier_name(db, new_expense.get("supplier_id"))
        create_cash_entry(
            db,
            user_id=user_id,
            type="sortie",
            amount=new_expense.get("amount") or 0,
            prestataire=prestataire or new_expense.get("title"),
            action="Dépense — " + (new_expense.get("title") or new_expense.get("description") or ""),
            justificatif="Sans pièce",   # aucune pièce à la création ; re-synchronisé à l'upload
            nc="noir",                    # pas de pièce justificative → hors comptabilité
            source_type="expense",
            source_id=new_expense["id"],
            payment_method=new_expense.get("payment_method"),
        )
    except Exception:
        pass

    return new_expense


@router.patch("/{expense_id}")
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("expenses").update(updates).eq("id", expense_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "expense.update", "expense", expense_id, updates)
    return _shape(res.data[0])


@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("expenses").select("id").eq("id", expense_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    attachments = (
        db.from_("accounting_attachments")
        .select("file_path")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", expense_id)
        .execute()
        .data or []
    )
    if attachments:
        try:
            db.storage.from_(BUCKET).remove([a["file_path"] for a in attachments])
        except Exception:
            pass
        db.from_("accounting_attachments").delete().eq("entity_type", ENTITY_TYPE).eq("entity_id", expense_id).execute()

    # Le décaissement avait été porté au journal (et au registre s'il était
    # bancaire) : on le retire des deux, sinon le solde reste amputé d'une
    # dépense supprimée.
    from routers.accounting_cash_journal import delete_cash_entry
    from routers.accounting_cheques import unregister_source
    delete_cash_entry(db, source_type=ENTITY_TYPE, source_id=expense_id, user_id=user.id)
    unregister_source(db, source_type=ENTITY_TYPE, source_id=expense_id, user_id=user.id)

    db.from_("expenses").delete().eq("id", expense_id).execute()
    log_audit(db, user.id, "expense.delete", "expense", expense_id)
    return {"ok": True}


# ── Attachments (pièces justificatives) ──────────────────────────────────────

@router.post("/{expense_id}/attachments")
async def upload_attachment(
    expense_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "invoice",
):
    _require_admin(user)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Invalid kind. Use one of: {', '.join(ATTACHMENT_KINDS)}")

    expense = db.from_("expenses").select("id").eq("id", expense_id).execute().data
    if not expense:
        raise HTTPException(404, "Expense not found")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{expense_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Failed to store file: {str(e)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": expense_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "expense.attachment.upload", "expense", expense_id, {"kind": kind, "file_name": file.filename})
    # Journal de caisse : la dépense a désormais une pièce → comptable + type de pièce.
    try:
        from routers.accounting_cash_journal import sync_source_piece
        sync_source_piece(db, source_type="expense", source_id=expense_id)
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
    log_audit(db, user.id, "expense.attachment.delete", "expense", rows[0]["entity_id"])
    # Journal de caisse : re-synchronise (repasse en 'noir' s'il ne reste plus de pièce).
    try:
        from routers.accounting_cash_journal import sync_source_piece
        sync_source_piece(db, source_type="expense", source_id=rows[0]["entity_id"])
    except Exception:
        pass
    return {"ok": True}
