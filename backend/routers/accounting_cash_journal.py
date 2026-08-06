import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, Response
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import CashJournalEntryCreate, CashJournalEntryUpdate
from utils.audit import log_audit
from utils.notify import notify_users
from utils.uploads import validate_and_read
from utils.pdf_generators import render_cash_journal_pdf

router = APIRouter(prefix="/accounting/cash-journal", tags=["accounting"])

TYPES = {"entree", "sortie"}
NC_VALUES = {"noir", "comptable"}

# ── Deux registres, une seule table (colonne `channel`, migration l36) ───────
#   'caisse' → Journal de caisse   : espèces (caisse physique), axe n/c actif
#   'banque' → Journal des comptes : virement / OV / chèque / carte / prélèvement
#
# TROIS natures d'opération, et pas une quatrième (channel × nc) :
#   1. caisse + nc='comptable' → caisse comptabilisée
#   2. caisse + nc='noir'      → caisse sociale (noire) : NON comptabilisée
#   3. banque                  → toujours comptabilisée ; nc est forcé à
#                                'comptable' partout (création, modification,
#                                sync des pièces, migration) — il n'existe pas
#                                de mouvement bancaire non déclaré.
CHANNELS = {"caisse", "banque"}
CASH = "caisse"
BANK = "banque"

# Modes de règlement normalisés et registre de rattachement.
BANK_MODES = {"virement", "versement", "ov_permanent", "ov_ponctuel", "cheque", "prelevement", "carte"}
MODE_LABELS = {
    "virement": "Virement", "versement": "Versement", "ov_permanent": "OV permanent",
    "ov_ponctuel": "OV ponctuel", "cheque": "Chèque", "prelevement": "Prélèvement",
    "carte": "Carte bancaire", "especes": "Espèces", "caisse_sociale": "Caisse sociale",
    "autre": "Autre",
}
# Les modes arrivent tantôt en clés canoniques ('ov_permanent', 'cheque'), tantôt
# en libellés libres saisis dans les formulaires ('Virement', 'Chèque', 'Espèces',
# 'espèce'…). On ramène tout à une clé unique (même table que journal_mode_key()
# côté SQL, cf. migration l36).
_MODE_ALIASES = {
    "virement": "virement", "virement bancaire": "virement", "transfert": "virement",
    "transfert bancaire": "virement",
    "versement": "versement", "versement bancaire": "versement",
    "cheque": "cheque", "chq": "cheque", "cheque bancaire": "cheque",
    "ov_permanent": "ov_permanent", "ov permanent": "ov_permanent",
    "ov_ponctuel": "ov_ponctuel", "ov ponctuel": "ov_ponctuel", "ov": "ov_ponctuel",
    "prelevement": "prelevement", "prelevement automatique": "prelevement",
    "carte": "carte", "carte bancaire": "carte", "cb": "carte",
    "espece": "especes", "especes": "especes", "cash": "especes", "liquide": "especes",
    "numeraire": "especes",
    "caisse_sociale": "caisse_sociale", "caisse sociale": "caisse_sociale",
    "autre": "autre",
}
_ACCENTS = str.maketrans(
    "éèêëàâäçôöûüùïîÉÈÊËÀÂÄÇÔÖÛÜÙÏÎ",
    "eeeeaaacoouuuiiEEEEAAACOOUUUII",
)


def normalize_mode(raw: str | None) -> str | None:
    """Clé canonique du mode de règlement, ou None si non identifiable."""
    if not raw:
        return None
    return _MODE_ALIASES.get(str(raw).translate(_ACCENTS).strip().lower())


def resolve_channel(raw: str | None) -> tuple[str, str | None]:
    """(registre, mode canonique) déduits d'un mode de règlement quelconque.
    Un mode inconnu ou absent reste en caisse (comportement historique)."""
    mode = normalize_mode(raw)
    return (BANK if mode in BANK_MODES else CASH), mode


def mode_label(mode: str | None) -> str | None:
    return MODE_LABELS.get(mode or "", None)


BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 heure
# entity_type des pièces jointes directement rattachées à une ligne de caisse.
ENTITY_TYPE = "cash_journal"
ATTACHMENT_KINDS = {"invoice", "receipt", "document"}
# Sources dont les pièces justificatives sont attachées via accounting_attachments.
_ATTACHMENT_SOURCES = {"revenue", "expense", "purchase_payment"}
# entity_type autorisés au téléchargement depuis le journal de caisse.
_DOWNLOAD_ENTITY_TYPES = {"revenue", "expense", "purchase_payment", "tuition_payment", "manual", "cash_journal"}


def _admin_ids(db: Client) -> list[str]:
    """Tous les comptes admin (destinataires des notifications d'approbation)."""
    rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    return list({r["user_id"] for r in rows if r.get("user_id")})


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _require_read(user: CurrentUser, channel: str = CASH) -> None:
    """Lecture d'un journal : admin, comptable (lecture) ou caissier.
    Le Journal des comptes (banque) relève de la trésorerie : le caissier « pur »
    (ni admin ni comptable) n'y a pas accès."""
    if not user.can_read_accounting():
        raise HTTPException(403, "Accès comptabilité requis")
    if channel == BANK and not (user.is_admin() or user.is_accountant()):
        raise HTTPException(403, "Journal des comptes réservé à l'administration et à la comptabilité")


def _check_channel(channel: str) -> str:
    if channel not in CHANNELS:
        raise HTTPException(400, "Journal invalide (caisse | banque)")
    return channel


def _write_mode(user: CurrentUser, channel: str) -> str | None:
    """Droit d'écriture (saisie / suppression) sur un journal :
      - 'direct'  : admin — insertion immédiate
      - 'pending' : caissier (caisse) ou comptable (banque) — validation N+1
      - None      : interdit
    """
    if user.is_admin():
        return "direct"
    if channel == BANK:
        return "pending" if user.is_accountant() else None
    return "pending" if user.is_cashier() else None


def _num(v) -> float:
    return float(v or 0)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _queue_cash_op(
    db: Client,
    user: CurrentUser,
    *,
    op_type: str,
    payload: dict,
    amount: float | None,
    notify_message: str,
) -> dict:
    """Dépose une opération de caisse (création / modification / suppression) dans
    la file de validation N+1 et notifie les admins. Renvoie {"pending": True}."""
    op = db.from_("pending_operations").insert({
        "op_type": op_type,
        "payload": payload,
        "amount": amount,
        "created_by": user.id,
    }).execute()
    try:
        notify_users(
            db, _admin_ids(db),
            title="Opération de caisse à valider 🧾",
            message=notify_message,
            type="info",
            link="/dashboard/accounting",
        )
    except Exception:
        pass
    log_audit(db, user.id, f"{op_type}.pending", "pending_operation",
              (op.data[0]["id"] if op.data else None), payload)
    return {"pending": True}


# Libellés du TYPE de pièce justificative (colonne « justificatif » du journal).
PIECE_LABELS = {"invoice": "Facture", "receipt": "Reçu", "document": "Pièce justificative"}
_PIECE_PRIORITY = ["invoice", "receipt", "document"]


def piece_type_label(kinds) -> str | None:
    """Libellé du type de pièce prioritaire présent parmi `kinds`, sinon None."""
    for k in _PIECE_PRIORITY:
        if k in kinds:
            return PIECE_LABELS[k]
    return None


def sync_source_piece(db: Client, *, source_type: str, source_id: str, update_nc: bool = True) -> None:
    """Recalcule le justificatif (et, si update_nc, le nc) de l'entrée de caisse
    d'une source selon les pièces justificatives actuellement jointes :
      - au moins une pièce → justificatif = type de pièce (+ nc='comptable' si update_nc)
      - aucune pièce        → justificatif = 'Sans pièce'  (+ nc='noir' si update_nc)
    (entity_type des pièces = source_type : 'revenue' | 'expense' | 'purchase_payment').

    update_nc=False pour les paiements d'achat : leur nature (caisse sociale /
    comptable) découle du MODE de règlement, pas de la présence d'un scan — un
    justificatif ne doit donc jamais faire basculer un paiement en caisse sociale
    vers 'comptable'.

    L'axe n/c ne concerne que la CAISSE : une ligne du Journal des comptes
    (channel='banque') reste 'comptable' même sans scan."""
    kinds = [
        r.get("kind")
        for r in (
            db.from_("accounting_attachments").select("kind")
            .eq("entity_type", source_type).eq("entity_id", source_id)
            .execute().data or []
        )
    ]
    label = piece_type_label(kinds)
    has = label is not None
    base = db.from_("cash_journal").update({"justificatif": label if has else "Sans pièce"})
    base.eq("source_type", source_type).eq("source_id", source_id).execute()
    if update_nc:
        (
            db.from_("cash_journal").update({"nc": "comptable" if has else "noir"})
            .eq("source_type", source_type).eq("source_id", source_id)
            .eq("channel", CASH)
            .execute()
        )


def create_cash_entry(
    db: Client,
    *,
    user_id: str,
    type: str,
    amount: float,
    prestataire: str | None,
    action: str,
    justificatif: str | None,
    nc: str,
    source_type: str,
    source_id: str | None,
    payment_method: str | None = None,
    payment_ref: str | None = None,
) -> dict | None:
    """Insère une ligne automatique dans le journal correspondant au MODE de
    règlement : virement / OV / chèque / carte → Journal des comptes (banque),
    espèces / caisse sociale / mode inconnu → Journal de caisse.

    Idempotent par (source_type, source_id) : si une ligne existe déjà pour ce
    couple, ne fait rien et renvoie None."""
    # 1. Anti-doublon : une seule ligne de journal par opération source.
    if source_id is not None:
        existing = (
            db.from_("cash_journal").select("id")
            .eq("source_type", source_type).eq("source_id", source_id)
            .execute().data
        )
        if existing:
            return None
    # 2. Registre déduit du mode de règlement (banque = déclaré par construction).
    channel, mode = resolve_channel(payment_method)
    # 3. Insertion de la ligne.
    row = {
        "entry_date": _today(),
        "type": type,
        "action": action,
        "prestataire": prestataire,
        "amount": _num(amount),
        "justificatif": justificatif,
        "nc": "comptable" if channel == BANK else (nc if nc in NC_VALUES else "comptable"),
        "channel": channel,
        "payment_mode": mode,
        "payment_ref": payment_ref,
        "source_type": source_type,
        "source_id": source_id,
        "created_by": user_id,
    }
    res = db.from_("cash_journal").insert(row).execute()
    return res.data[0] if res.data else row


def create_purchase_cash_entry(
    db: Client,
    *,
    user_id: str,
    amount: float,
    prestataire: str | None,
    action: str,
    justificatif: str | None,
    nc: str,
    source_id: str,
    payment_method: str | None = None,
    payment_ref: str | None = None,
) -> dict:
    """Insère un décaissement à l'émission d'une commande (DA), dans le journal
    correspondant au mode de règlement. Appelé par le routeur des achats à la
    validation unique. Délègue au helper générique pour éviter toute divergence."""
    entry = create_cash_entry(
        db,
        user_id=user_id,
        type="sortie",
        amount=amount,
        prestataire=prestataire,
        action=action,
        justificatif=justificatif,
        nc=nc,
        source_type="purchase_request",
        source_id=source_id,
        payment_method=payment_method,
        payment_ref=payment_ref,
    )
    return entry or {}


@router.get("")
async def list_entries(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    channel: str = CASH,
):
    """Mouvements + solde cumulé d'un journal.
    `channel='caisse'` (défaut) → Journal de caisse (espèces, Solde Caisse) ;
    `channel='banque'`          → Journal des comptes (virement / OV / chèque,
                                  Solde Compte)."""
    _check_channel(channel)
    _require_read(user, channel)
    rows = (
        db.from_("cash_journal")
        .select("*")
        .eq("channel", channel)
        .order("entry_date", desc=False)
        .order("created_at", desc=False)
        .execute()
        .data or []
    )

    # Visibilité par rôle : le comptable (ni admin ni caissier) ne voit QUE les
    # lignes déclarées ('comptable'). Filtrer AVANT le calcul des soldes pour que
    # son « Solde Caisse » reflète uniquement la caisse déclarée.
    if user.is_accountant() and not user.is_admin() and not user.is_cashier():
        rows = [r for r in rows if r.get("nc") == "comptable"]

    # Solde cumulé calculé chronologiquement (entrée = +, sortie = −).
    balance = 0.0
    total_in = 0.0
    total_out = 0.0
    for r in rows:
        amt = _num(r.get("amount"))
        if r.get("type") == "entree":
            balance += amt
            total_in += amt
        else:
            balance -= amt
            total_out += amt
        r["balance"] = round(balance, 2)

    # Enrichissement de l'auteur.
    actor_ids = list({r["created_by"] for r in rows if r.get("created_by")})
    names: dict[str, str] = {}
    if actor_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", actor_ids).execute().data or []
        names = {p["id"]: (p.get("full_name") or p.get("email") or "—") for p in profs}
    for r in rows:
        r["created_by_name"] = names.get(r.get("created_by"))
        r["payment_mode_label"] = mode_label(r.get("payment_mode"))

    # Pièces justificatives : batch-fetch pour les lignes issues d'une source
    # portant des scans (recette / dépense / paiement d'achat). Une seule requête
    # via .in_(entity_id) puis appariement par (entity_type, entity_id) en Python.
    # Deux origines de pièces : (a) la source de la ligne (recette/dépense/paiement)
    # via son source_id ; (b) la pièce jointe directement à la ligne de caisse
    # (entity_type='cash_journal', entity_id = id de la ligne). On récupère les deux
    # en une seule requête .in_(entity_id) puis on apparie par (entity_type, entity_id).
    att_ids = {
        r["source_id"]
        for r in rows
        if r.get("source_id") and r.get("source_type") in _ATTACHMENT_SOURCES
    }
    att_ids |= {r["id"] for r in rows if r.get("id")}
    att_map: dict[tuple, list[dict]] = {}
    if att_ids:
        atts = (
            db.from_("accounting_attachments")
            .select("id, entity_type, entity_id, kind, file_name")
            .in_("entity_id", list(att_ids))
            .execute().data or []
        )
        for a in atts:
            key = (a.get("entity_type"), a.get("entity_id"))
            att_map.setdefault(key, []).append(
                {"id": a["id"], "kind": a.get("kind"), "file_name": a.get("file_name")}
            )
    for r in rows:
        r["attachments"] = (
            att_map.get((r.get("source_type"), r.get("source_id")), [])
            + att_map.get((ENTITY_TYPE, r.get("id")), [])
        )

    # Affichage : plus récent en premier (chaque ligne garde son solde cumulé).
    items = list(reversed(rows))
    return {
        "items": items,
        "balance": round(balance, 2),
        "total_in": round(total_in, 2),
        "total_out": round(total_out, 2),
    }


@router.get("/pdf")
async def export_cash_journal_pdf(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    journal_no: str = "",
    holder: str = "",
    poste: str = "",
    date_from: str = "",
    date_to: str = "",
    channel: str = CASH,
):
    """PDF d'un journal au modèle bébleo (chronologique, solde journalier +
    cumulé) : « Journal de la Caisse » (caisse) ou « Journal des Comptes »
    (banque). Respecte la visibilité par rôle : le comptable pur n'exporte que
    les lignes déclarées ('comptable')."""
    _check_channel(channel)
    _require_read(user, channel)
    rows = (
        db.from_("cash_journal").select("*")
        .eq("channel", channel)
        .order("entry_date", desc=False).order("created_at", desc=False)
        .execute().data or []
    )
    if _is_comptable_only(user):
        rows = [r for r in rows if r.get("nc") == "comptable"]
    if date_from:
        rows = [r for r in rows if (r.get("entry_date") or "") >= date_from]
    if date_to:
        rows = [r for r in rows if (r.get("entry_date") or "") <= date_to]
    # Solde cumulé chronologique (entrée = +, sortie = −).
    bal = 0.0
    for r in rows:
        amt = _num(r.get("amount"))
        bal += amt if r.get("type") == "entree" else -amt
        r["balance"] = round(bal, 2)
    is_bank = channel == BANK
    meta = {
        "journal_no": journal_no or None,
        "holder": holder or None,
        "poste": poste or None,
        "date_from": date_from or None,
        "date_to": date_to or None,
        "generated_on": _today(),
        "title": "Journal des Comptes" if is_bank else "Journal de la Caisse",
        "signatory": "Signature Responsable Trésorerie" if is_bank else "Signature Responsable de Caisse",
        "signature_col": "Signature|resp. trésorerie" if is_bank else "Signature|resp. caisse",
    }
    pdf_bytes = render_cash_journal_pdf(rows, meta)
    filename = "Journal_des_comptes.pdf" if is_bank else "Journal_de_caisse.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("")
async def create_entry(
    body: CashJournalEntryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Saisie manuelle d'un mouvement (journal de caisse ou journal des comptes).

    - Admin : insertion directe (les deux journaux).
    - Caissier : caisse uniquement → validation N+1 (op_type='cash_journal_create').
    - Comptable : banque uniquement → validation N+1.
      Renvoie {"pending": True} dans les deux derniers cas.
    """
    channel = _check_channel(body.channel or CASH)
    write = _write_mode(user, channel)
    if write is None:
        raise HTTPException(403, "Saisie non autorisée")
    if body.type not in TYPES:
        raise HTTPException(400, "Type invalide (entree | sortie)")
    if body.nc not in NC_VALUES:
        raise HTTPException(400, "n/c invalide (noir | comptable)")
    if body.amount < 0:
        raise HTTPException(400, "Le montant doit être positif")
    if not (body.action or "").strip():
        raise HTTPException(400, "L'action est obligatoire")

    # Mode de règlement : obligatoire et forcément bancaire au Journal des comptes.
    mode = normalize_mode(body.payment_mode)
    if channel == BANK:
        if mode not in BANK_MODES:
            raise HTTPException(400, "Mode de règlement bancaire requis (virement, OV, chèque…)")
    elif mode in BANK_MODES:
        raise HTTPException(400, "Mode bancaire : à saisir dans le journal des comptes")

    row = {
        "entry_date": body.entry_date or _today(),
        "type": body.type,
        "action": body.action.strip(),
        "prestataire": body.prestataire,
        "amount": _num(body.amount),
        "justificatif": body.justificatif,
        # L'axe n/c ne vit qu'en caisse : une ligne bancaire est déclarée.
        "nc": "comptable" if channel == BANK else body.nc,
        "channel": channel,
        "payment_mode": mode,
        "payment_ref": (body.payment_ref or "").strip() or None,
        "source_type": "manual",
    }

    # DÉCAISSEMENT BANCAIRE (sortie par chèque, versement, virement ou OV) :
    # validation N+1 obligatoire avant toute écriture (migrations l37, l38). Ce
    # circuit remplace la file 'cash_journal_create' — un règlement ne se valide
    # qu'une fois, via le registre.
    from routers.accounting_cheques import VALIDATED_MODES, defer_bank_payment
    if row["type"] == "sortie" and mode in VALIDATED_MODES:
        return defer_bank_payment(
            db, user=user,
            kind="cash_journal",
            mode=mode,
            data=row,
            amount=row["amount"],
            counterparty=row.get("prestataire"),
            label=row["action"],
            cheque_number=row.get("payment_ref"),
            issue_date=row["entry_date"],
        )

    # Caissier / comptable : la saisie attend la validation de l'admin.
    if write == "pending":
        who = "le comptable" if channel == BANK else "le caissier"
        journal = "des comptes" if channel == BANK else "de caisse"
        return _queue_cash_op(
            db, user,
            op_type="cash_journal_create",
            payload=row,
            amount=row["amount"],
            notify_message=f"Une saisie au journal {journal} par {who} attend votre validation.",
        )

    return commit_journal_row(db, row, user.id)


def commit_journal_row(db: Client, row: dict, user_id: str) -> dict:
    """Insère effectivement une ligne de journal saisie manuellement.

    Chemin UNIQUE de l'insertion manuelle : saisie directe de l'admin, validation
    d'une saisie caissier/comptable (approvals), ou validation N+1 d'un
    décaissement bancaire. Inscrit au passage tout chèque REÇU au registre — une
    pièce émise y est déjà, posée par `defer_bank_payment()`."""
    payload = {**row, "created_by": user_id}
    entry = db.from_("cash_journal").insert(payload).execute().data[0]
    log_audit(db, user_id, "cash_journal.create", "cash_journal", entry["id"],
              {"type": entry["type"], "amount": entry["amount"], "nc": entry["nc"],
               "channel": entry.get("channel"), "payment_mode": entry.get("payment_mode")})
    if entry.get("payment_mode") == "cheque" and entry.get("type") == "entree":
        from routers.accounting_cheques import register_instrument, RECU
        register_instrument(
            db,
            direction=RECU,
            amount=entry.get("amount") or 0,
            counterparty=entry.get("prestataire"),
            label=entry.get("action"),
            cheque_number=entry.get("payment_ref"),
            issue_date=entry.get("entry_date"),
            status="remis",
            source_type="cash_journal",
            source_id=entry["id"],
            journal_entry_id=entry["id"],
            created_by=user_id,
        )
    return entry


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Supprime une saisie manuelle. Les entrées automatiques (DA…) sont figées.

    - Admin : suppression directe.
    - Caissier (caisse) / comptable (banque) : validation N+1
      (op_type='cash_journal_delete'). Renvoie {"pending": True}.
    """
    rows = db.from_("cash_journal").select("id, source_type, amount, channel").eq("id", entry_id).execute().data
    if not rows:
        raise HTTPException(404, "Entrée introuvable")
    channel = rows[0].get("channel") or CASH
    write = _write_mode(user, channel)
    if write is None:
        raise HTTPException(403, "Suppression non autorisée")
    if rows[0].get("source_type") != "manual":
        raise HTTPException(400, "Entrée automatique non supprimable")

    # Caissier / comptable : la suppression attend la validation de l'admin.
    if write == "pending":
        who = "le comptable" if channel == BANK else "le caissier"
        journal = "des comptes" if channel == BANK else "de caisse"
        return _queue_cash_op(
            db, user,
            op_type="cash_journal_delete",
            payload={"entry_id": entry_id},
            amount=rows[0].get("amount"),
            notify_message=f"Une suppression au journal {journal} par {who} attend votre validation.",
        )

    db.from_("cash_journal").delete().eq("id", entry_id).execute()
    log_audit(db, user.id, "cash_journal.delete", "cash_journal", entry_id)
    return {"ok": True}


def _is_comptable_only(user: CurrentUser) -> bool:
    """Comptable « pur » : ni admin ni caissier — n'a accès qu'aux lignes déclarées."""
    return user.is_accountant() and not user.is_admin() and not user.is_cashier()


def _lines_for_piece(db: Client, entity_type: str, entity_id: str) -> list[dict]:
    """Lignes de journal portant cette pièce justificative (pièce jointe
    directement à la ligne, ou attachée à l'opération source)."""
    if entity_type == ENTITY_TYPE:
        return db.from_("cash_journal").select("nc, channel").eq("id", entity_id).execute().data or []
    return (
        db.from_("cash_journal").select("nc, channel")
        .eq("source_type", entity_type).eq("source_id", entity_id)
        .execute().data or []
    )


def _line_visible_to_comptable(db: Client, entity_type: str, entity_id: str) -> bool:
    """True si la ligne de caisse portant cette pièce est déclarée ('comptable').
    Le comptable ne doit jamais accéder aux pièces d'une ligne 'noir'."""
    rows = _lines_for_piece(db, entity_type, entity_id)
    return bool(rows) and all(r.get("nc") == "comptable" for r in rows)


@router.post("/{entry_id}/attachments")
async def upload_attachment(
    entry_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "document",
):
    """Joint une pièce justificative directement à une ligne de caisse.
    Autorisé (accès direct) : admin, caissier, comptable. Le comptable ne peut
    joindre qu'aux lignes déclarées ('comptable') qu'il voit."""
    if not (user.is_admin() or user.is_cashier() or user.is_accountant()):
        raise HTTPException(403, "Accès comptabilité requis")
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Type de pièce invalide. Valeurs : {', '.join(ATTACHMENT_KINDS)}")

    entry = db.from_("cash_journal").select("id, nc, channel").eq("id", entry_id).execute().data
    if not entry:
        raise HTTPException(404, "Entrée introuvable")
    if _is_comptable_only(user) and entry[0].get("nc") != "comptable":
        raise HTTPException(403, "Ligne non accessible")
    if (entry[0].get("channel") or CASH) == BANK and not (user.is_admin() or user.is_accountant()):
        raise HTTPException(403, "Journal des comptes réservé à l'administration et à la comptabilité")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{entry_id}/{uuid.uuid4().hex}.{ext}"
    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du fichier : {e}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": entry_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    log_audit(db, user.id, "cash_journal.attachment.upload", "cash_journal", entry_id,
              {"kind": kind, "file_name": file.filename})
    return res.data[0]


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Renvoie une URL signée pour consulter la pièce justificative d'une ligne."""
    _require_read(user)
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).execute().data
    )
    if not rows or rows[0].get("entity_type") not in _DOWNLOAD_ENTITY_TYPES:
        raise HTTPException(404, "Pièce introuvable")
    att = rows[0]
    # Le comptable ne peut pas consulter la pièce d'une ligne 'noir'.
    if _is_comptable_only(user) and not _line_visible_to_comptable(db, att["entity_type"], att["entity_id"]):
        raise HTTPException(403, "Pièce non accessible")
    # Pièce d'une ligne bancaire : réservée à l'administration et à la comptabilité.
    if not (user.is_admin() or user.is_accountant()):
        lines = _lines_for_piece(db, att["entity_type"], att["entity_id"])
        if any((r.get("channel") or CASH) == BANK for r in lines):
            raise HTTPException(403, "Pièce non accessible")
    signed = db.storage.from_(BUCKET).create_signed_url(att["file_path"], SIGNED_URL_TTL)
    return {
        "signed_url": signed.get("signedURL") or signed.get("signed_url"),
        "file_name": att["file_name"],
    }


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Supprime une pièce jointe DIRECTEMENT à une ligne de caisse
    (entity_type='cash_journal'). Réservé à l'admin et au caissier."""
    if not (user.is_admin() or user.is_cashier()):
        raise HTTPException(403, "Suppression non autorisée")
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).eq("entity_type", ENTITY_TYPE)
        .execute().data
    )
    if not rows:
        raise HTTPException(404, "Pièce introuvable")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass
    db.from_("accounting_attachments").delete().eq("id", attachment_id).execute()
    log_audit(db, user.id, "cash_journal.attachment.delete", "cash_journal", rows[0]["entity_id"])
    return {"ok": True}


@router.patch("/{entry_id}")
async def update_entry(
    entry_id: str,
    body: CashJournalEntryUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Modifie une ligne de journal (caisse ou comptes).

    - Admin : modification directe (y compris le transfert d'un journal à l'autre
      si la ligne a été mal ventilée).
    - Caissier : toute ligne de caisse → validation N+1 (op_type='cash_journal_edit').
    - Comptable : uniquement les lignes 'comptable' → validation N+1.
      Renvoie {"pending": true} dans les deux derniers cas.
    """
    rows = db.from_("cash_journal").select("*").eq("id", entry_id).execute().data
    if not rows:
        raise HTTPException(404, "Entrée introuvable")
    entry = rows[0]
    if (entry.get("channel") or CASH) == BANK and not (user.is_admin() or user.is_accountant()):
        raise HTTPException(403, "Journal des comptes réservé à l'administration et à la comptabilité")

    # Champs fournis (non-None) uniquement.
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "type" in updates and updates["type"] not in TYPES:
        raise HTTPException(400, "Type invalide (entree | sortie)")
    if "nc" in updates and updates["nc"] not in NC_VALUES:
        raise HTTPException(400, "n/c invalide (noir | comptable)")
    if "channel" in updates:
        _check_channel(updates["channel"])
        # Reventiler une ligne d'un journal à l'autre est un arbitrage comptable.
        if not user.is_admin() and updates["channel"] != (entry.get("channel") or CASH):
            raise HTTPException(403, "Changement de journal réservé à l'administration")
    if "amount" in updates:
        if updates["amount"] < 0:
            raise HTTPException(400, "Le montant doit être positif")
        updates["amount"] = _num(updates["amount"])

    # Mode de règlement + cohérence journal / mode / n/c.
    if "payment_mode" in updates:
        mode = normalize_mode(updates["payment_mode"])
        if mode is None:
            raise HTTPException(400, "Mode de règlement invalide")
        updates["payment_mode"] = mode
    if "payment_ref" in updates:
        updates["payment_ref"] = (updates["payment_ref"] or "").strip() or None
    target_channel = updates.get("channel") or entry.get("channel") or CASH
    target_mode = updates.get("payment_mode", entry.get("payment_mode"))
    if target_channel == BANK:
        if target_mode not in BANK_MODES:
            raise HTTPException(400, "Mode de règlement bancaire requis (virement, OV, chèque…)")
        if updates:
            updates["nc"] = "comptable"   # une ligne bancaire est déclarée par construction
    elif target_mode in BANK_MODES:
        raise HTTPException(400, "Mode bancaire : la ligne relève du journal des comptes")

    if user.is_admin():
        if not updates:
            return entry
        res = db.from_("cash_journal").update(updates).eq("id", entry_id).execute()
        log_audit(db, user.id, "cash_journal.update", "cash_journal", entry_id, updates)
        return res.data[0] if res.data else {**entry, **updates}

    # Caissier : toute ligne. Comptable : uniquement les lignes déclarées qu'il voit.
    if user.is_cashier():
        who = "le caissier"
    elif user.is_accountant():
        if entry.get("nc") != "comptable":
            raise HTTPException(403, "Ligne non modifiable")
        who = "le comptable"
    else:
        raise HTTPException(403, "Modification non autorisée")

    if not updates:
        return entry
    return _queue_cash_op(
        db, user,
        op_type="cash_journal_edit",
        payload={"entry_id": entry_id, "updates": updates},
        amount=updates.get("amount", entry.get("amount")),
        notify_message=f"Une modification du journal de caisse par {who} attend votre validation.",
    )
