import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import QuotationCreate, QuotationUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read

router = APIRouter(prefix="/accounting/quotations", tags=["accounting"])

MAX_QUOTES = 5
BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 heure
# Statuts où la saisie des devis est ouverte (après validation du besoin).
QUOTE_STAGES = ("besoin_valide", "en_consultation")


def _get_pr_or_404(db: Client, pr_id: str) -> dict:
    rows = db.from_("purchase_requests").select("*").eq("id", pr_id).execute().data
    if not rows:
        raise HTTPException(404, "Demande d'achat introuvable")
    return rows[0]


def _require_pr_owner_or_admin(user: CurrentUser, pr: dict) -> None:
    """L'admin gère tout ; sinon seul l'auteur de la DA saisit ses devis."""
    if not user.can_access_accounting_full() and pr.get("created_by") != user.id:
        raise HTTPException(403, "Accès réservé à l'auteur de la demande ou à l'administration.")


def _quote_or_404(db: Client, quotation_id: str) -> dict:
    rows = db.from_("quotations").select("*").eq("id", quotation_id).execute().data
    if not rows:
        raise HTTPException(404, "Devis introuvable")
    return rows[0]


def _shape(qt: dict) -> dict:
    return {
        **{k: v for k, v in qt.items() if k != "suppliers"},
        "supplier_name": (qt.get("suppliers") or {}).get("company_name"),
    }


def _notify_admins_new_quote(db: Client, user: CurrentUser, pr: dict) -> None:
    """Prévient l'administration qu'un demandeur a déposé un devis (décision attendue)."""
    if user.can_access_accounting_full():
        return
    try:
        from utils.notify import notify_users
        admin_rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
        admin_ids = list({r["user_id"] for r in admin_rows if r.get("user_id")})
        if admin_ids:
            notify_users(
                db, admin_ids,
                title="Nouveau devis déposé 📄",
                message=f"{user.email} a ajouté un devis à la demande {pr.get('request_number', '')}. Une décision est attendue.",
                type="info",
                link="/dashboard/accounting?tab=purchase_requests",
            )
    except Exception:
        pass


@router.get("")
async def list_quotations(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    purchase_request_id: Optional[str] = None,
):
    if purchase_request_id:
        _require_pr_owner_or_admin(user, _get_pr_or_404(db, purchase_request_id))
    elif not user.can_access_accounting_full():
        raise HTTPException(403, "Précisez la demande d'achat.")
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
    if not body.quote_number.strip():
        raise HTTPException(400, "Le numéro de devis est requis.")

    pr = _get_pr_or_404(db, body.purchase_request_id)
    _require_pr_owner_or_admin(user, pr)
    if pr["status"] not in QUOTE_STAGES:
        raise HTTPException(400, "Le besoin doit être validé avant de saisir des devis.")

    existing = (
        db.from_("quotations").select("rank").eq("purchase_request_id", body.purchase_request_id).execute().data or []
    )
    if len(existing) >= MAX_QUOTES:
        raise HTTPException(400, f"Maximum {MAX_QUOTES} devis par demande.")

    # Rang attribué automatiquement : premier créneau libre entre 1 et MAX_QUOTES
    # (évite toute collision, le client n'a plus à le choisir).
    used = {e.get("rank") for e in existing}
    next_rank = next((r for r in range(1, MAX_QUOTES + 1) if r not in used), None)
    if next_rank is None:
        raise HTTPException(400, f"Maximum {MAX_QUOTES} devis par demande.")

    data = body.model_dump()
    data["rank"] = next_rank
    data["created_by"] = user.id
    res = db.from_("quotations").insert(data).execute()
    quote = res.data[0]

    # Première consultation → la DA passe en 'en_consultation'
    if pr["status"] == "besoin_valide":
        db.from_("purchase_requests").update({"status": "en_consultation"}).eq("id", body.purchase_request_id).execute()

    _notify_admins_new_quote(db, user, pr)
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
    quote = _quote_or_404(db, quotation_id)
    _require_pr_owner_or_admin(user, _get_pr_or_404(db, quote["purchase_request_id"]))
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier")
    if "rank" in updates and not (1 <= updates["rank"] <= MAX_QUOTES):
        raise HTTPException(400, f"Le rang doit être entre 1 et {MAX_QUOTES}.")

    res = db.from_("quotations").update(updates).eq("id", quotation_id).execute()
    log_audit(db, user.id, "quotation.update", "quotation", quotation_id, updates)
    return _shape(res.data[0])


@router.delete("/{quotation_id}")
async def delete_quotation(
    quotation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    quote = _quote_or_404(db, quotation_id)
    _require_pr_owner_or_admin(user, _get_pr_or_404(db, quote["purchase_request_id"]))
    if quote.get("retenu"):
        raise HTTPException(400, "Impossible de supprimer le devis retenu.")
    if quote.get("attachment_path"):
        try:
            db.storage.from_(BUCKET).remove([quote["attachment_path"]])
        except Exception:
            pass
    db.from_("quotations").delete().eq("id", quotation_id).execute()
    log_audit(db, user.id, "quotation.delete", "quotation", quotation_id)
    return {"ok": True}


# ── Pièce jointe du devis ─────────────────────────────────────────────────────

@router.post("/{quotation_id}/attachment")
async def upload_quote_attachment(
    quotation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
):
    """Joint (ou remplace) la pièce du devis. Ouvert au demandeur et à l'admin."""
    quote = _quote_or_404(db, quotation_id)
    _require_pr_owner_or_admin(user, _get_pr_or_404(db, quote["purchase_request_id"]))

    data, ext = await validate_and_read(file)
    file_path = f"quotation/{quotation_id}/{uuid.uuid4().hex}.{ext}"
    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du fichier : {str(e)}")

    # Remplace l'ancienne pièce éventuelle.
    if quote.get("attachment_path"):
        try:
            db.storage.from_(BUCKET).remove([quote["attachment_path"]])
        except Exception:
            pass

    res = db.from_("quotations").update({
        "attachment_path": file_path,
        "attachment_name": file.filename or "devis",
    }).eq("id", quotation_id).execute()
    log_audit(db, user.id, "quotation.attachment.upload", "quotation", quotation_id,
              {"file_name": file.filename})
    return _shape(res.data[0])


@router.get("/{quotation_id}/attachment")
async def download_quote_attachment(
    quotation_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    quote = _quote_or_404(db, quotation_id)
    _require_pr_owner_or_admin(user, _get_pr_or_404(db, quote["purchase_request_id"]))
    if not quote.get("attachment_path"):
        raise HTTPException(404, "Aucune pièce jointe pour ce devis.")
    signed = db.storage.from_(BUCKET).create_signed_url(quote["attachment_path"], SIGNED_URL_TTL)
    return {
        "signed_url": signed.get("signedURL") or signed.get("signed_url"),
        "file_name": quote.get("attachment_name") or "devis",
    }
