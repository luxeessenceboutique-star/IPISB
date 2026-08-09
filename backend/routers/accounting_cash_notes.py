from datetime import datetime, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import CashNoteCreate, CashNoteUpdate, CashNotePay, ApprovalReject
from utils.audit import log_audit
from utils.notify import notify_users
from utils.pdf_generators import render_cash_note_pdf

router = APIRouter(prefix="/accounting/cash-notes", tags=["accounting"])

NC_VALUES = {"noir", "comptable"}
# Modes de règlement à l'exécution du paiement (mêmes valeurs que les paiements d'achat).
PAYMENT_METHODS = {"ov_permanent", "ov_ponctuel", "cheque", "caisse_sociale", "autre"}
# Statuts du circuit : saisie → approbation N+1 → exécution paiement.
STATUS_VALUES = {"pending", "approved", "rejected", "paid"}
# source_type de la ligne de journal de caisse générée par une note.
CASH_SOURCE = "cash_note"


def _require_read(user: CurrentUser) -> None:
    """Lecture des notes de caisse : admin, comptable ou caissier."""
    if not user.can_read_accounting():
        raise HTTPException(403, "Accès comptabilité requis")


def _require_write(user: CurrentUser) -> None:
    """Saisie/modification : admin ou caissier (le comptable est en lecture seule)."""
    if not (user.is_admin() or user.is_cashier()):
        raise HTTPException(403, "Saisie non autorisée")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_items(items) -> tuple[list[dict], float]:
    """Normalise les lignes du tableau et calcule le total. Les lignes vides
    (aucun article, aucun prestataire, montant nul) sont ignorées."""
    cleaned: list[dict] = []
    total = 0.0
    for it in (items or []):
        d = it.model_dump() if hasattr(it, "model_dump") else dict(it)
        article = (d.get("article") or "").strip()
        prestataire = (d.get("prestataire") or "").strip()
        try:
            montant = float(d.get("montant") or 0)
        except Exception:
            montant = 0.0
        if not article and not prestataire and montant == 0:
            continue
        cleaned.append({
            "article": article or None,
            "prestataire": prestataire or None,
            "montant": round(montant, 2),
        })
        total += montant
    return cleaned, round(total, 2)


def _enrich_authors(db: Client, rows: list[dict]) -> None:
    actor_ids = list({
        pid
        for r in rows
        for pid in (r.get("created_by"), r.get("approved_by"), r.get("paid_by"))
        if pid
    })
    names: dict[str, str] = {}
    if actor_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", actor_ids).execute().data or []
        names = {p["id"]: (p.get("full_name") or p.get("email") or "—") for p in profs}
    for r in rows:
        r["created_by_name"] = names.get(r.get("created_by"))
        r["approved_by_name"] = names.get(r.get("approved_by"))
        r["paid_by_name"] = names.get(r.get("paid_by"))


def _admin_ids(db: Client) -> list[str]:
    """Tous les comptes admin — destinataires des demandes d'approbation N+1."""
    rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    return list({r["user_id"] for r in rows if r.get("user_id")})


# ── Liaison au journal de caisse ─────────────────────────────────────────────
# Une note de caisse est un décaissement réel : on maintient une ligne 'sortie'
# au journal, clé sur (source_type='cash_note', source_id = id de la note).

def _cash_entry_fields(note: dict) -> dict:
    """Champs de la ligne de journal (sortie) dérivés d'une note de caisse.
    Le registre découle du MODE de règlement : chèque / OV → Journal des comptes,
    caisse sociale ou autre → Journal de caisse (cf. migration l36)."""
    from routers.accounting_cash_journal import resolve_channel, BANK

    presta = note.get("beneficiary_name") or None
    objet = (note.get("objet") or "").strip()
    action = f"Note de caisse — {presta}" if presta else "Note de caisse"
    if objet:
        action = f"{action} · {objet}"
    nc = note.get("nc") if note.get("nc") in NC_VALUES else "comptable"
    channel, mode = resolve_channel(note.get("payment_method"))
    return {
        # Comptabilisée à la date effective du décaissement (défaut : date de la note).
        "entry_date": note.get("payment_date") or note.get("note_date") or _today(),
        "type": "sortie",
        "action": action[:200],
        "prestataire": presta,
        "amount": float(note.get("total") or 0),
        "justificatif": note.get("reference"),
        # Une opération bancaire est déclarée par construction.
        "nc": "comptable" if channel == BANK else nc,
        "channel": channel,
        "payment_mode": mode,
        "payment_ref": note.get("payment_reference"),
    }


def _sync_cash_entry(db: Client, note: dict, user_id: str) -> None:
    """Crée ou met à jour la ligne de journal de caisse liée à la note.
    Best-effort : une défaillance du journal ne doit pas bloquer la note
    (l'upsert idempotent se rattrapera à la prochaine modification)."""
    try:
        fields = _cash_entry_fields(note)
        existing = (
            db.from_("cash_journal").select("id")
            .eq("source_type", CASH_SOURCE).eq("source_id", note["id"])
            .execute().data
        )
        if existing:
            db.from_("cash_journal").update(fields).eq("id", existing[0]["id"]).execute()
        else:
            db.from_("cash_journal").insert({
                **fields,
                "source_type": CASH_SOURCE,
                "source_id": note["id"],
                "created_by": user_id,
            }).execute()
    except Exception:
        pass


def _remove_cash_entry(db: Client, note_id: str) -> None:
    """Retire la ligne de journal de caisse liée à la note (à sa suppression)."""
    try:
        db.from_("cash_journal").delete().eq("source_type", CASH_SOURCE).eq("source_id", note_id).execute()
    except Exception:
        pass


@router.get("")
async def list_notes(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    status: Optional[str] = None,
):
    """Historique des notes de caisse (plus récentes d'abord).
    `status` (optionnel) filtre le circuit : pending | approved | rejected | paid.
    L'onglet Paiements interroge `status=approved` (avances à régler)."""
    _require_read(user)
    query = db.from_("cash_notes").select("*")
    if status:
        if status not in STATUS_VALUES:
            raise HTTPException(400, "Statut invalide")
        query = query.eq("status", status)
    rows = (
        query
        .order("note_date", desc=True)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    _enrich_authors(db, rows)
    total = sum(float(r.get("total") or 0) for r in rows)
    return {"items": rows, "count": len(rows), "total": round(total, 2)}


@router.post("")
async def create_note(
    body: CashNoteCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Crée une note de caisse (admin ou caissier)."""
    _require_write(user)
    if not (body.beneficiary_name or "").strip():
        raise HTTPException(400, "Le nom du bénéficiaire est obligatoire.")
    if body.nc not in NC_VALUES:
        raise HTTPException(400, "n/c invalide (noir | comptable)")
    items, total = _clean_items(body.items)
    row = {
        "note_date": body.note_date or _today(),
        "beneficiary_name": body.beneficiary_name.strip(),
        "beneficiary_cin": (body.beneficiary_cin or "").strip() or None,
        "objet": (body.objet or "").strip() or None,
        "period_from": body.period_from or None,
        "period_to": body.period_to or None,
        "accorded_by": (body.accorded_by or "").strip() or None,
        "items": items,
        "total": total,
        "nc": body.nc,
        "comment": (body.comment or "").strip() or None,
        "created_by": user.id,
    }
    res = db.from_("cash_notes").insert(row).execute()
    note = res.data[0] if res.data else row
    # Nouveau circuit : la note naît « en attente » d'approbation N+1. AUCUNE ligne
    # de journal de caisse n'est créée ici — la comptabilisation n'a lieu qu'à
    # l'exécution du paiement (endpoint /pay), une fois la note approuvée.
    amount_str = f"{total:,.2f} MAD".replace(",", " ").replace(".", ",")
    admins = _admin_ids(db)
    notify_users(
        db, admins,
        title="Avance de caisse à approuver 🧾",
        message=f"{note.get('reference') or 'Note'} — {row['beneficiary_name']} · {amount_str} en attente de validation N+1.",
        type="info",
        link="/dashboard/accounting",
    )
    log_audit(db, user.id, "cash_note.create", "cash_note", note.get("id"),
              {"reference": note.get("reference"), "total": total, "nc": body.nc, "status": "pending"})
    return note


@router.patch("/{note_id}")
async def update_note(
    note_id: str,
    body: CashNoteUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Modifie une note de caisse (admin ou caissier), tant qu'elle est en attente."""
    _require_write(user)
    rows = db.from_("cash_notes").select("id, status").eq("id", note_id).execute().data
    if not rows:
        raise HTTPException(404, "Note introuvable")
    if rows[0].get("status") not in (None, "pending"):
        raise HTTPException(400, "Note déjà traitée (approuvée / rejetée / payée) : modification impossible.")

    data = body.model_dump(exclude_unset=True)
    updates: dict = {}
    for k in ("note_date", "period_from", "period_to"):
        if k in data:
            updates[k] = data[k] or None
    for k in ("beneficiary_cin", "objet", "accorded_by", "comment"):
        if k in data:
            updates[k] = (data[k] or "").strip() or None
    if "beneficiary_name" in data:
        name = (data["beneficiary_name"] or "").strip()
        if not name:
            raise HTTPException(400, "Le nom du bénéficiaire est obligatoire.")
        updates["beneficiary_name"] = name
    if "nc" in data:
        if data["nc"] not in NC_VALUES:
            raise HTTPException(400, "n/c invalide (noir | comptable)")
        updates["nc"] = data["nc"]
    if "items" in data:
        items, total = _clean_items(body.items)
        updates["items"] = items
        updates["total"] = total

    if not updates:
        return db.from_("cash_notes").select("*").eq("id", note_id).execute().data[0]

    updates["updated_at"] = _now()
    res = db.from_("cash_notes").update(updates).eq("id", note_id).execute()
    note = res.data[0] if res.data else None
    # Pas de ligne de journal tant que la note n'est pas payée : rien à répercuter ici.
    log_audit(db, user.id, "cash_note.update", "cash_note", note_id, {"fields": list(updates.keys())})
    return note or {"id": note_id, **updates}


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Supprime une note de caisse. Le caissier ne peut supprimer qu'une note
    en attente ou rejetée ; l'admin peut supprimer une note payée (la ligne de
    journal de caisse liée est alors retirée)."""
    _require_write(user)
    rows = db.from_("cash_notes").select("id, status").eq("id", note_id).execute().data
    if not rows:
        raise HTTPException(404, "Note introuvable")
    status = rows[0].get("status") or "pending"
    if status in ("approved", "paid") and not user.is_admin():
        raise HTTPException(403, "Seul un administrateur peut supprimer une note approuvée ou payée.")
    db.from_("cash_notes").delete().eq("id", note_id).execute()
    # Retirer la ligne de journal de caisse liée (présente uniquement si payée),
    # ainsi que la pièce au registre des règlements si la note a été réglée par
    # chèque ou virement — sinon un règlement fantôme resterait à suivre.
    _remove_cash_entry(db, note_id)
    from routers.accounting_cheques import unregister_source
    unregister_source(db, source_type=CASH_SOURCE, source_id=note_id, user_id=user.id)
    log_audit(db, user.id, "cash_note.delete", "cash_note", note_id, {"status": status})
    return {"ok": True}


# ── Circuit d'approbation N+1 + exécution du paiement ────────────────────────

def _load_note(db: Client, note_id: str) -> dict:
    rows = db.from_("cash_notes").select("*").eq("id", note_id).execute().data
    if not rows:
        raise HTTPException(404, "Note introuvable")
    return rows[0]


@router.post("/{note_id}/approve")
async def approve_note(
    note_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Approbation N+1 (admin) : la note passe « approuvée », prête à être payée
    dans l'onglet Paiements. Aucune comptabilisation encore (au paiement)."""
    if not user.is_admin():
        raise HTTPException(403, "Approbation réservée à l'administration (N+1).")
    note = _load_note(db, note_id)
    if (note.get("status") or "pending") != "pending":
        raise HTTPException(400, f"Note déjà {note.get('status')}.")
    updates = {
        "status": "approved",
        "approved_by": user.id,
        "approved_at": _now(),
        "rejection_reason": None,
        "updated_at": _now(),
    }
    res = db.from_("cash_notes").update(updates).eq("id", note_id).execute()
    if note.get("created_by"):
        notify_users(
            db, [note["created_by"]],
            title="Avance de caisse approuvée ✅",
            message=f"{note.get('reference') or 'Votre note de caisse'} a été validée. Elle peut être réglée.",
            type="success",
            link="/dashboard/accounting",
        )
    log_audit(db, user.id, "cash_note.approve", "cash_note", note_id, {"reference": note.get("reference")})
    return res.data[0] if res.data else {"id": note_id, **updates}


@router.post("/{note_id}/reject")
async def reject_note(
    note_id: str,
    body: ApprovalReject,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Rejet N+1 (admin) avec motif obligatoire ; notifie l'initiateur."""
    if not user.is_admin():
        raise HTTPException(403, "Rejet réservé à l'administration (N+1).")
    comment = (body.comment or "").strip()
    if not comment:
        raise HTTPException(400, "Le motif du rejet est obligatoire.")
    note = _load_note(db, note_id)
    if (note.get("status") or "pending") != "pending":
        raise HTTPException(400, f"Note déjà {note.get('status')}.")
    updates = {
        "status": "rejected",
        "rejection_reason": comment,
        "approved_by": user.id,
        "approved_at": _now(),
        "updated_at": _now(),
    }
    res = db.from_("cash_notes").update(updates).eq("id", note_id).execute()
    if note.get("created_by"):
        notify_users(
            db, [note["created_by"]],
            title="Avance de caisse rejetée ⛔",
            message=f"{note.get('reference') or 'Votre note de caisse'} a été rejetée. Motif : {comment}",
            type="error",
            link="/dashboard/accounting",
        )
    log_audit(db, user.id, "cash_note.reject", "cash_note", note_id, {"comment": comment})
    return res.data[0] if res.data else {"id": note_id, **updates}


@router.post("/{note_id}/pay")
async def pay_note(
    note_id: str,
    body: CashNotePay,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Exécution du paiement (admin) d'une avance APPROUVÉE : enregistre le
    décaissement et le COMPTABILISE (ligne 'sortie' au journal de caisse)."""
    if not user.is_admin():
        raise HTTPException(403, "L'exécution du paiement est réservée à l'administration.")
    if body.payment_method not in PAYMENT_METHODS:
        raise HTTPException(400, "Mode de règlement invalide.")
    note = _load_note(db, note_id)
    status = note.get("status") or "pending"
    if status == "paid":
        raise HTTPException(400, "Note déjà payée.")
    if status != "approved":
        raise HTTPException(400, "La note doit être approuvée (N+1) avant paiement.")
    updates = {
        "status": "paid",
        "paid_by": user.id,
        "payment_method": body.payment_method,
        "payment_reference": (body.payment_reference or "").strip() or None,
        "payment_date": body.payment_date or _today(),
    }

    # Règlement par DÉCAISSEMENT BANCAIRE (chèque, versement, virement, OV) →
    # seconde validation N+1 (migrations l37, l38) : l'avance reste 'approved' et
    # n'est ni décaissée ni comptabilisée avant approbation.
    from routers.accounting_cheques import validation_mode, defer_bank_payment
    mode = validation_mode(body.payment_method)
    if mode:
        return defer_bank_payment(
            db,
            user=user,
            kind="cash_note",
            mode=mode,
            data={"note_id": note_id, "updates": updates},
            amount=float(note.get("total") or 0),
            counterparty=note.get("beneficiary_name"),
            label=f"Note de caisse {note.get('reference') or ''}".strip(),
            cheque_number=body.payment_reference,
            issue_date=updates["payment_date"],
        )

    return commit_note_payment(db, note_id, updates, user.id)


def commit_note_payment(db: Client, note_id: str, updates: dict, user_id: str) -> dict:
    """Décaisse et comptabilise effectivement l'avance.

    Chemin UNIQUE de comptabilisation — appelé directement hors décaissement bancaire, et rejoué
    à l'identique par la validation N+1 des décaissements bancaires (cf.
    routers/accounting_cheques.execute_pending_payment). L'horodatage est posé
    ici : le paiement est effectif à la validation, pas à la soumission."""
    note = _load_note(db, note_id)
    updates = {**updates, "paid_at": _now(), "updated_at": _now()}
    res = db.from_("cash_notes").update(updates).eq("id", note_id).execute()
    paid = res.data[0] if res.data else {**note, **updates}
    # Comptabilisation : décaissement réel → ligne 'sortie' au journal de caisse.
    _sync_cash_entry(db, paid, user_id)
    if note.get("created_by") and note["created_by"] != user_id:
        notify_users(
            db, [note["created_by"]],
            title="Avance de caisse payée 💸",
            message=f"{note.get('reference') or 'Votre note de caisse'} a été réglée et comptabilisée.",
            type="success",
            link="/dashboard/accounting",
        )
    log_audit(db, user_id, "cash_note.pay", "cash_note", note_id,
              {"reference": note.get("reference"), "method": updates.get("payment_method"),
               "total": note.get("total")})
    return paid


@router.get("/{note_id}/pdf")
async def export_note_pdf(
    note_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Génère le PDF de la note de caisse (modèle bébleo)."""
    _require_read(user)
    rows = db.from_("cash_notes").select("*").eq("id", note_id).execute().data
    if not rows:
        raise HTTPException(404, "Note introuvable")
    note = rows[0]
    pdf_bytes = render_cash_note_pdf(note)
    filename = f"Note_de_caisse_{note.get('reference') or str(note.get('id'))[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
