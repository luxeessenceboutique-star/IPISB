"""Registre des règlements bancaires + validation N+1 (migrations l37, l38).

Deux responsabilités :

1. **Registre** — un règlement bancaire = une ligne de `cheques`, suivie UNE PAR
   UNE de bout en bout (émission → remise / exécution → encaissement / impayé),
   quelle que soit l'opération qui l'a produite : paiement d'achat, note de
   caisse, frais de mission, dépense, scolarité, recette, saisie au journal.
   La colonne `mode` en donne la nature : chèque, versement, virement, OV.

2. **Validation N+1 de TOUT décaissement bancaire** (l38) — l'opération n'est
   PAS exécutée à la saisie : elle est mise en attente (`pending_operations`,
   op_type 'bank_payment') avec le payload complet, et
   `execute_pending_payment()` la rejoue à l'approbation en appelant la MÊME
   fonction `commit_*` que le chemin direct (aucune logique dupliquée qui
   pourrait diverger).
   Les ENCAISSEMENTS ne sont pas concernés — recevoir n'est pas une décision :
   les chèques REÇUS (scolarité, recettes) sont seulement inscrits au registre,
   pour le suivi de leur encaissement.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ChequeCreate, ChequeUpdate, ChequeStatusUpdate
from utils.audit import log_audit
from utils.excel import make_xlsx
from utils.notify import notify_users

router = APIRouter(prefix="/accounting/cheques", tags=["accounting"])

EMIS = "emis"
RECU = "recu"
DIRECTIONS = {EMIS, RECU}

# ── Natures de pièce soumises à validation N+1 (tout décaissement bancaire) ──
CHEQUE = "cheque"
# Ordres de paiement : même circuit et même cycle de vie que le chèque, seul le
# vocabulaire change (« à exécuter » plutôt que « à remettre »).
TRANSFER_MODES = ("versement", "virement", "ov_permanent", "ov_ponctuel")
VALIDATED_MODES = (CHEQUE, *TRANSFER_MODES)
MODES = set(VALIDATED_MODES)
# Navigation du registre : deux familles, chacune suivie séparément.
MODE_GROUPS = {"cheque": (CHEQUE,), "transfert": TRANSFER_MODES}

# op_type de la file d'attente : celui de l38, et celui de l37 encore possible
# en base sur un déploiement en cours.
PAYMENT_OP_TYPES = ("bank_payment", "cheque_payment")
PAYMENT_OP_TYPE = "bank_payment"

# Cycle de vie. 'en_attente' n'existe que pour une pièce émise (file N+1).
STATUSES = {"en_attente", "rejete", "a_remettre", "remis", "encaisse", "impaye", "annule"}
STATUS_LABELS = {
    "en_attente": "En attente de validation",
    "rejete": "Validation refusée",
    "a_remettre": "À remettre",
    "remis": "Remis",
    "encaisse": "Encaissé",
    "impaye": "Impayé",
    "annule": "Annulé",
}
# Même cycle de vie, lu avec le vocabulaire de l'ordre de paiement.
_TRANSFER_STATUS_LABELS = {
    "en_attente": "En attente de validation",
    "rejete": "Validation refusée",
    "a_remettre": "À exécuter",
    "remis": "Ordre transmis",
    "encaisse": "Exécuté",
    "impaye": "Rejeté par la banque",
    "annule": "Annulé",
}
# Intitulé de l'ACTION qui MÈNE au statut (boutons du registre), et non du statut.
ACTION_LABELS = {"remis": "Remettre", "encaisse": "Encaisser",
                 "impaye": "Impayé", "annule": "Annuler"}
_TRANSFER_ACTION_LABELS = {"remis": "Transmettre", "encaisse": "Confirmer l'exécution",
                           "impaye": "Rejet banque", "annule": "Annuler"}
# Transitions autorisées manuellement (hors validation N+1, gérée par approvals).
TRANSITIONS: dict[str, set[str]] = {
    "en_attente": set(),                       # seule la validation N+1 en sort
    "rejete": set(),
    "a_remettre": {"remis", "annule"},
    "remis": {"encaisse", "impaye", "annule"},
    "impaye": {"remis", "annule"},             # ré-présentation possible
    "encaisse": set(),
    "annule": set(),
}
# Statuts qui clôturent le chèque (exclus des alertes d'échéance).
CLOSED = {"encaisse", "rejete", "annule"}

SOURCE_TYPES = {
    "manual", "purchase_payment", "cash_note", "mission_note",
    "expense", "tuition_payment", "revenue", "cash_journal",
}
SOURCE_LABELS = {
    "manual": "Saisie manuelle",
    "purchase_payment": "Paiement d'achat",
    "cash_note": "Note de caisse",
    "mission_note": "Frais de mission",
    "expense": "Dépense",
    "tuition_payment": "Scolarité",
    "revenue": "Recette",
    "cash_journal": "Journal des comptes",
}

# Opérations différées : `kind` → nature de l'opération mise en attente. La
# fonction `commit_*` correspondante est importée à la demande dans
# `execute_pending_payment()` (imports circulaires entre routeurs).
OPERATION_LABELS = {
    "purchase_payment": "Paiement d'achat",
    "cash_note": "Règlement d'une note de caisse",
    "mission_note": "Règlement de frais de mission",
    "expense": "Dépense",
    "cash_journal": "Écriture au Journal des comptes",
}


def _is_cheque_mode(mode: Optional[str]) -> bool:
    """Une pièce sans mode connu est un chèque (registre d'avant l38)."""
    return (mode or CHEQUE) == CHEQUE


def status_label(status: Optional[str], mode: Optional[str] = CHEQUE) -> str:
    table = STATUS_LABELS if _is_cheque_mode(mode) else _TRANSFER_STATUS_LABELS
    return table.get(status or "", status or "—")


def action_label(status: Optional[str], mode: Optional[str] = CHEQUE) -> str:
    table = ACTION_LABELS if _is_cheque_mode(mode) else _TRANSFER_ACTION_LABELS
    return table.get(status or "", status or "—")


def mode_label(mode: Optional[str]) -> str:
    """Libellé du mode de règlement — table partagée avec le journal, jamais dupliquée."""
    from routers.accounting_cash_journal import mode_label as journal_mode_label
    return journal_mode_label(mode) or (mode or "—")


def operation_label(kind: Optional[str], mode: Optional[str] = CHEQUE) -> str:
    """« Paiement d'achat — Virement » : ce qui est réglé, et par quel moyen."""
    base = OPERATION_LABELS.get(kind or "", "Règlement bancaire")
    return f"{base} — {mode_label(mode)}"


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_read(user: CurrentUser) -> None:
    """Le registre des chèques relève de la trésorerie : admin + comptable."""
    if not (user.can_access_accounting_full() or user.is_accountant()):
        raise HTTPException(403, "Registre des chèques réservé à l'administration et à la comptabilité.")


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _admin_ids(db: Client) -> list[str]:
    rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    return list({r["user_id"] for r in rows if r.get("user_id")})


# ── Détection du mode de règlement ───────────────────────────────────────────

def is_cheque(raw) -> bool:
    """True si ce mode de règlement est un chèque, quel que soit son libellé
    ('cheque', 'Chèque', 'chq'…). S'appuie sur la normalisation du journal."""
    from routers.accounting_cash_journal import normalize_mode
    return normalize_mode(raw) == CHEQUE


def validation_mode(raw) -> Optional[str]:
    """Mode canonique si ce règlement exige une validation N+1, sinon None.

    Tout DÉCAISSEMENT bancaire est concerné — chèque, versement, virement, ordre
    de virement permanent ou ponctuel : l'argent quitte le compte, c'est une
    décision. Espèces et caisse sociale ne le sont pas (elles relèvent de la file
    du journal de caisse), pas plus que les encaissements."""
    from routers.accounting_cash_journal import normalize_mode
    mode = normalize_mode(raw)
    return mode if mode in MODES else None


# ── Écriture au registre ─────────────────────────────────────────────────────

def register_instrument(
    db: Client,
    *,
    direction: str,
    mode: str = CHEQUE,
    amount: float,
    counterparty: Optional[str] = None,
    label: Optional[str] = None,
    cheque_number: Optional[str] = None,
    bank: Optional[str] = None,
    issue_date: Optional[str] = None,
    due_date: Optional[str] = None,
    status: Optional[str] = None,
    source_type: str = "manual",
    source_id: Optional[str] = None,
    pending_op_id: Optional[str] = None,
    journal_entry_id: Optional[str] = None,
    comment: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Optional[dict]:
    """Inscrit un règlement au registre (best-effort : ne bloque jamais
    l'opération métier). Idempotent sur (source_type, source_id) hors saisie
    manuelle : un même paiement ne peut pas générer deux pièces.

    Statut par défaut : 'en_attente' pour une pièce émise (validation N+1),
    'remis' pour un chèque reçu (on détient déjà le chèque)."""
    try:
        if source_id and source_type != "manual":
            existing = (
                db.from_("cheques").select("id")
                .eq("source_type", source_type).eq("source_id", source_id)
                .execute().data
            )
            if existing:
                return existing[0]
        row = {
            "direction": direction,
            "mode": mode if mode in MODES else CHEQUE,
            "status": status or ("en_attente" if direction == EMIS else "remis"),
            "amount": float(amount or 0),
            "counterparty": (counterparty or None),
            "label": (label or None),
            "cheque_number": (cheque_number or "").strip() or None,
            "bank": (bank or None),
            "issue_date": issue_date or _today(),
            "due_date": due_date or None,
            "source_type": source_type,
            "source_id": source_id,
            "pending_op_id": pending_op_id,
            "journal_entry_id": journal_entry_id,
            "comment": comment or None,
            "created_by": created_by,
        }
        res = db.from_("cheques").insert(row).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None


def unregister_source(db: Client, *, source_type: str, source_id: str, user_id: Optional[str] = None) -> int:
    """Retire du registre la pièce inscrite pour une opération supprimée.

    Symétrique de `register_instrument` : si le paiement qui a fait naître le
    chèque (ou le virement) disparaît, la pièce ne doit pas rester à suivre —
    elle deviendrait un règlement fantôme dans les alertes et les statistiques.
    Best-effort, comme l'inscription : ne bloque jamais la suppression métier.
    Renvoie le nombre de pièces retirées."""
    try:
        rows = (
            db.from_("cheques").select("id, mode, direction, status, amount")
            .eq("source_type", source_type).eq("source_id", source_id)
            .execute().data or []
        )
        if not rows:
            return 0
        db.from_("cheques").delete().eq("source_type", source_type).eq("source_id", source_id).execute()
        if user_id:
            for r in rows:
                try:
                    log_audit(db, user_id, "cheque.delete_source", "cheque", r["id"], {
                        "source_type": source_type, "source_id": source_id,
                        "mode": r.get("mode"), "direction": r.get("direction"),
                        "status": r.get("status"), "amount": r.get("amount"),
                    })
                except Exception:
                    pass
        return len(rows)
    except Exception:
        return 0


def link_cheque(db: Client, cheque_id: str, *, source_id: Optional[str] = None,
                journal_source: Optional[tuple[str, str]] = None) -> None:
    """Rattache le chèque à la ligne métier puis à sa ligne de journal, après
    exécution de l'opération différée."""
    updates: dict = {"updated_at": _now()}
    if source_id:
        updates["source_id"] = source_id
    if journal_source:
        try:
            rows = (
                db.from_("cash_journal").select("id")
                .eq("source_type", journal_source[0]).eq("source_id", journal_source[1])
                .execute().data or []
            )
            if rows:
                updates["journal_entry_id"] = rows[0]["id"]
        except Exception:
            pass
    try:
        db.from_("cheques").update(updates).eq("id", cheque_id).execute()
    except Exception:
        pass


# ── Mise en attente d'un décaissement bancaire ───────────────────────────────

def defer_bank_payment(
    db: Client,
    *,
    user: CurrentUser,
    kind: str,
    mode: str,
    data: dict,
    amount: float,
    counterparty: Optional[str],
    label: Optional[str],
    cheque_number: Optional[str] = None,
    bank: Optional[str] = None,
    issue_date: Optional[str] = None,
    due_date: Optional[str] = None,
    student_id: Optional[str] = None,
) -> dict:
    """Met le décaissement en file de validation N+1 et l'inscrit au registre.

    Rien n'est écrit dans la table métier ni au journal : `execute_pending_payment()`
    rejouera `data` à l'approbation. La réponse renvoyée à l'appelant porte
    `pending: True` — les écrans doivent afficher « soumis à validation ».
    """
    op = db.from_("pending_operations").insert({
        "op_type": PAYMENT_OP_TYPE,
        "payload": {"kind": kind, "mode": mode, "data": data},
        "amount": float(amount or 0),
        "student_id": student_id,
        "created_by": user.id,
    }).execute().data[0]

    cheque = register_instrument(
        db,
        direction=EMIS,
        mode=mode,
        amount=amount,
        counterparty=counterparty,
        label=label,
        cheque_number=cheque_number,
        bank=bank,
        issue_date=issue_date,
        due_date=due_date,
        status="en_attente",
        source_type=kind,
        pending_op_id=op["id"],
        created_by=user.id,
    )
    # Sans ligne au registre, l'opération serait validée sans qu'aucune pièce ne
    # soit suivie : on annule la mise en attente plutôt que d'accepter ce trou.
    # Cause quasi unique : le n° de chèque est déjà porté par un chèque en cours.
    if not cheque:
        db.from_("pending_operations").delete().eq("id", op["id"]).execute()
        raise HTTPException(
            400,
            f"Impossible d'inscrire ce règlement au registre"
            + (f" : le n° {cheque_number} est déjà utilisé par un chèque en cours."
               if (cheque_number and mode == CHEQUE)
               else ". Vérifiez le registre des règlements."),
        )

    # Le payload doit connaître la pièce pour la rattacher après exécution.
    db.from_("pending_operations").update({
        "payload": {"kind": kind, "mode": mode, "data": data, "cheque_id": cheque["id"]},
    }).eq("id", op["id"]).execute()

    recipients = [a for a in _admin_ids(db) if a != user.id] or _admin_ids(db)
    notify_users(
        db, recipients,
        title=("Chèque à valider 🖊️" if mode == CHEQUE else "Virement à valider 🏦"),
        message=(f"{operation_label(kind, mode)} — "
                 f"{float(amount or 0):,.2f} DH".replace(",", " ") +
                 (f" au profit de {counterparty}" if counterparty else "") +
                 (". Validation requise avant émission." if mode == CHEQUE
                  else ". Validation requise avant exécution.")),
        type="warning",
        link="/dashboard/accounting",
    )
    log_audit(db, user.id, "cheque.submit", "cheque", (cheque or {}).get("id"),
              {"kind": kind, "mode": mode, "amount": amount, "counterparty": counterparty,
               "pending_op_id": op["id"]})

    return {
        "pending": True,
        "pending_op_id": op["id"],
        "cheque": cheque,
        "message": f"Règlement par {mode_label(mode).lower()} soumis à validation (N+1). "
                   "Il sera comptabilisé après approbation.",
    }


# ── Exécution / rejet après décision N+1 (appelés par routers/approvals.py) ──

async def execute_pending_payment(db: Client, op: dict, approver_id: str) -> Optional[str]:
    """Rejoue l'opération différée après approbation et fait passer la pièce en
    'a_remettre' (à remettre / à exécuter). Renvoie l'id de la ligne métier créée."""
    payload = op.get("payload") or {}
    kind = payload.get("kind")
    data = payload.get("data") or {}
    cheque_id = payload.get("cheque_id")
    initiator = op.get("created_by") or approver_id

    if kind == "purchase_payment":
        from routers.accounting_payments import commit_payment
        row = await commit_payment(db, data, initiator)
    elif kind == "cash_note":
        from routers.accounting_cash_notes import commit_note_payment
        row = commit_note_payment(db, data["note_id"], data["updates"], initiator)
    elif kind == "mission_note":
        from routers.accounting_mission_notes import commit_note_payment
        row = commit_note_payment(db, data["note_id"], data["updates"], initiator)
    elif kind == "expense":
        from routers.accounting_expenses import commit_expense
        row = commit_expense(db, data, initiator)
    elif kind == "cash_journal":
        from routers.accounting_cash_journal import commit_journal_row
        row = commit_journal_row(db, data, initiator)
    else:
        raise HTTPException(400, "Opération de règlement inconnue")

    result_id = (row or {}).get("id")
    if cheque_id:
        journal_source = (kind, result_id) if (kind != "cash_journal" and result_id) else None
        link_cheque(db, cheque_id, source_id=result_id, journal_source=journal_source)
        updates = {
            "status": "a_remettre",
            "approved_by": approver_id,
            "approved_at": _now(),
            "updated_at": _now(),
        }
        if kind == "cash_journal" and result_id:
            updates["journal_entry_id"] = result_id
        try:
            db.from_("cheques").update(updates).eq("id", cheque_id).execute()
        except Exception:
            pass
    return result_id


def reject_pending_payment(db: Client, op: dict, comment: str, reviewer_id: str) -> None:
    """Marque la pièce comme refusée : l'opération n'a pas eu lieu, le numéro de
    chèque est libéré (index unique partiel excluant 'rejete')."""
    cheque_id = (op.get("payload") or {}).get("cheque_id")
    if not cheque_id:
        return
    try:
        db.from_("cheques").update({
            "status": "rejete",
            "review_comment": comment,
            "approved_by": reviewer_id,
            "approved_at": _now(),
            "updated_at": _now(),
        }).eq("id", cheque_id).execute()
    except Exception:
        pass


# ── Consultation du registre ─────────────────────────────────────────────────

def _shape(row: dict) -> dict:
    mode = row.get("mode") or CHEQUE
    nexts = sorted(TRANSITIONS.get(row.get("status") or "", set()))
    return {
        **row,
        "mode": mode,
        "mode_label": mode_label(mode),
        "status_label": status_label(row.get("status"), mode),
        "source_label": SOURCE_LABELS.get(row.get("source_type") or "", row.get("source_type")),
        "direction_label": "Émis" if row.get("direction") == EMIS else "Reçu",
        "next_statuses": nexts,
        # Libellés des boutons calculés ici : le vocabulaire d'une pièce (remettre
        # un chèque / transmettre un ordre) ne doit pas être redit côté écran.
        "next_actions": [{"status": s, "label": action_label(s, mode)} for s in nexts],
        "overdue": bool(
            row.get("due_date")
            and (row.get("status") not in CLOSED)
            and row["due_date"] < _today()
        ),
    }


def _resolve_modes(mode: Optional[str]) -> Optional[list[str]]:
    """Filtre `mode` de l'API : une nature précise ('cheque', 'virement'…) ou une
    famille de navigation ('cheque' | 'transfert'). None = tout le registre."""
    if not mode:
        return None
    if mode in MODE_GROUPS:
        return list(MODE_GROUPS[mode])
    if mode in MODES:
        return [mode]
    raise HTTPException(400, "mode invalide (cheque | transfert | versement | virement | ov_permanent | ov_ponctuel)")


def _filtered(
    db: Client,
    *,
    select: str = "*",
    count: Optional[str] = None,
    mode: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Requête du registre pour un jeu de filtres. Écran et export Excel passent
    par ici : ce qui est affiché est exactement ce qui est exporté."""
    query = db.from_("cheques").select(select, count=count) if count else db.from_("cheques").select(select)
    modes = _resolve_modes(mode)
    if modes:
        query = query.in_("mode", modes)
    if direction:
        if direction not in DIRECTIONS:
            raise HTTPException(400, "direction invalide (emis | recu)")
        query = query.eq("direction", direction)
    if status:
        if status == "ouverts":
            query = query.not_.in_("status", list(CLOSED))
        elif status in STATUSES:
            query = query.eq("status", status)
        else:
            raise HTTPException(400, "statut invalide")
    if date_from:
        query = query.gte("issue_date", date_from)
    if date_to:
        query = query.lte("issue_date", date_to)
    if q:
        term = q.replace("%", "").replace(",", " ").strip()
        if term:
            query = query.or_(
                f"cheque_number.ilike.%{term}%,counterparty.ilike.%{term}%,"
                f"reference.ilike.%{term}%,label.ilike.%{term}%,bank.ilike.%{term}%"
            )
    return query


@router.get("")
async def list_cheques(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    mode: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    """Registre des règlements bancaires, filtrable.
    `mode='cheque'` | `'transfert'` (versements, virements, OV) pour naviguer
    d'une famille à l'autre, ou une nature précise.
    `status='ouverts'` = tout ce qui n'est pas clos (ni encaissé, ni rejeté, ni
    annulé)."""
    _require_read(user)
    page = max(1, page)
    page_size = max(1, min(200, page_size))

    query = _filtered(db, count="exact", mode=mode, direction=direction, status=status,
                      q=q, date_from=date_from, date_to=date_to)
    start = (page - 1) * page_size
    res = query.order("issue_date", desc=True).order("created_at", desc=True) \
               .range(start, start + page_size - 1).execute()
    return {
        "items": [_shape(r) for r in (res.data or [])],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/stats")
async def cheque_stats(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    mode: Optional[str] = None,
):
    """Compteurs du registre : par direction × statut, plus les pièces en retard
    (échéance dépassée et pièce non close). `mode` restreint au même périmètre
    que la liste, pour que les tuiles collent à l'onglet affiché."""
    _require_read(user)
    query = db.from_("cheques").select("direction, status, amount, due_date")
    modes = _resolve_modes(mode)
    if modes:
        query = query.in_("mode", modes)
    rows = query.execute().data or []
    today = _today()
    out: dict[str, dict] = {}
    overdue_n = overdue_amount = 0
    en_attente_n = en_attente_amount = 0
    for r in rows:
        key = f"{r.get('direction')}:{r.get('status')}"
        bucket = out.setdefault(key, {"count": 0, "amount": 0.0})
        bucket["count"] += 1
        bucket["amount"] += float(r.get("amount") or 0)
        closed = r.get("status") in CLOSED
        if r.get("due_date") and not closed and r["due_date"] < today:
            overdue_n += 1
            overdue_amount += float(r.get("amount") or 0)
        if r.get("status") == "en_attente":
            en_attente_n += 1
            en_attente_amount += float(r.get("amount") or 0)
    return {
        "buckets": out,
        "overdue": {"count": overdue_n, "amount": overdue_amount},
        "en_attente": {"count": en_attente_n, "amount": en_attente_amount},
        "total": len(rows),
    }


# ── Export Excel du registre ─────────────────────────────────────────────────

# Référence de l'opération à l'origine du règlement, quand ce n'est pas un achat.
_SOURCE_REF = {
    "cash_note": ("cash_notes", "reference"),
    "mission_note": ("mission_notes", "reference"),
    "tuition_payment": ("tuition_payments", "reference"),
    "revenue": ("revenues", "revenue_number"),
}


def _fr_date(iso) -> str:
    """jj/mm/aaaa — un tableau destiné à être imprimé et signé se lit en français."""
    s = str(iso or "")[:10]
    if len(s) != 10 or s[4] != "-":
        return ""
    return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"


def _order_numbers(db: Client, rows: list[dict]) -> dict[str, str]:
    """« N° commande » de chaque règlement : le bon de commande pour un paiement
    d'achat, la référence de la pièce d'origine sinon (note de caisse, frais de
    mission, scolarité, recette).

    Une pièce encore en attente de validation n'a pas de ligne métier — son
    `source_id` est vide : le bon de commande se lit alors dans le payload de
    l'opération différée, sans quoi les règlements les plus urgents à suivre
    seraient précisément ceux qui sortiraient sans numéro."""
    out: dict[str, str] = {}
    by_source: dict[str, dict[str, list[str]]] = {}   # source_type → id → [cheque_id]
    pending: dict[str, list[str]] = {}                # pending_op_id → [cheque_id]
    for c in rows:
        if c.get("source_id"):
            by_source.setdefault(c["source_type"], {}).setdefault(c["source_id"], []).append(c["id"])
        elif c.get("pending_op_id"):
            pending.setdefault(c["pending_op_id"], []).append(c["id"])

    # purchase_id → [cheque_id], alimenté par les deux chemins (payé / en attente).
    purchases: dict[str, list[str]] = {}

    pay_ids = list(by_source.get("purchase_payment", {}).keys())
    if pay_ids:
        for p in (db.from_("purchase_payments").select("id, purchase_id")
                    .in_("id", pay_ids).execute().data or []):
            if p.get("purchase_id"):
                purchases.setdefault(p["purchase_id"], []).extend(
                    by_source["purchase_payment"].get(p["id"], []))

    if pending:
        for op in (db.from_("pending_operations").select("id, payload")
                     .in_("id", list(pending)).execute().data or []):
            data = ((op.get("payload") or {}).get("data") or {})
            if data.get("purchase_id"):
                purchases.setdefault(data["purchase_id"], []).extend(pending.get(op["id"], []))

    if purchases:
        for pu in (db.from_("purchases").select("id, purchase_number")
                     .in_("id", list(purchases)).execute().data or []):
            for cid in purchases.get(pu["id"], []):
                out[cid] = pu.get("purchase_number") or ""

    for src, (table, col) in _SOURCE_REF.items():
        ids = list(by_source.get(src, {}).keys())
        if not ids:
            continue
        try:
            for r in db.from_(table).select(f"id, {col}").in_("id", ids).execute().data or []:
                for cid in by_source[src].get(r["id"], []):
                    out[cid] = r.get(col) or ""
        except Exception:
            pass   # table absente d'un déploiement : le n° reste vide, l'export passe
    return {k: v for k, v in out.items() if v}


@router.get("/export/xlsx")
async def export_cheques_xlsx(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    mode: Optional[str] = None,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Tableau Excel des règlements bancaires, sur les mêmes filtres que l'écran.

    `date_from` = `date_to` = un jour → le registre de cette journée : la feuille
    part à la signature telle quelle. Les deux colonnes « Signature 1 » et
    « Signature 2 » sont laissées vides pour être signées à la main."""
    _require_read(user)
    rows = (
        _filtered(db, mode=mode, direction=direction, status=status,
                  q=q, date_from=date_from, date_to=date_to)
        .order("issue_date", desc=False).order("created_at", desc=False)
        .execute().data or []
    )
    numbers = _order_numbers(db, rows)

    out = [
        {
            "order_no": numbers.get(c["id"]) or "",
            "amount": float(c.get("amount") or 0),
            "supplier": c.get("counterparty") or "",
            "due_date": _fr_date(c.get("due_date")),
            "mode": mode_label(c.get("mode")),
            "doc_no": c.get("cheque_number") or c.get("reference") or "",
            "sign1": "",
            "sign2": "",
            "remitted": _fr_date(c.get("remitted_date")),
            "cashed": _fr_date(c.get("cashed_date")),
            "status": status_label(c.get("status"), c.get("mode")),
        }
        for c in rows
    ]

    total = sum(r["amount"] for r in out)
    if date_from and date_from == date_to:
        period = f"Journée du {_fr_date(date_from)}"
        suffix = date_from
    elif date_from or date_to:
        period = f"Du {_fr_date(date_from) or '…'} au {_fr_date(date_to) or '…'}"
        suffix = f"{date_from or 'debut'}_{date_to or 'fin'}"
    else:
        period = "Registre complet"
        suffix = "complet"
    scope = {"cheque": "Chèques", "transfert": "Versements & virements"}.get(mode or "", "Tous modes")

    return make_xlsx(
        filename=f"Reglements_bancaires_{suffix}.xlsx",
        title="RÈGLEMENTS BANCAIRES — IPISB",
        subtitle=(f"{period} · {scope} · {len(out)} règlement(s) · "
                  f"Total : {total:,.2f} MAD · Édité le {_fr_date(_today())}").replace(",", " "),
        theme="green",
        sheet_name="Règlements bancaires",
        columns=[
            {"key": "order_no",  "label": "Commande n°",     "width": 17},
            {"key": "amount",    "label": "Montant",         "type": "money", "width": 16},
            {"key": "supplier",  "label": "Fournisseur",     "width": 30},
            {"key": "due_date",  "label": "Échéance",        "type": "date",  "width": 13},
            {"key": "mode",      "label": "Type de paiement", "width": 16},
            {"key": "doc_no",    "label": "N° doc",          "width": 16},
            {"key": "sign1",     "label": "Signature 1",     "width": 20},
            {"key": "sign2",     "label": "Signature 2",     "width": 20},
            {"key": "remitted",  "label": "Déposé le",       "type": "date",  "width": 13},
            {"key": "cashed",    "label": "Encaissé le",     "type": "date",  "width": 13},
            {"key": "status",    "label": "Statut",          "width": 22},
        ],
        rows=out,
    )


# ── Saisie / correction manuelle ─────────────────────────────────────────────

@router.post("")
async def create_cheque(
    body: ChequeCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Saisie manuelle d'une pièce au registre (chèque reçu à encaisser, ou
    règlement émis hors opération comptable). Une pièce émise saisie ici n'engage
    aucune écriture — elle n'est donc pas soumise à validation N+1 ; elle naît
    directement 'à remettre' / 'à exécuter'."""
    _require_admin(user)
    if body.direction not in DIRECTIONS:
        raise HTTPException(400, "direction invalide (emis | recu)")
    if body.mode not in MODES:
        raise HTTPException(400, "mode invalide (cheque | versement | virement | ov_permanent | ov_ponctuel)")
    if body.amount <= 0:
        raise HTTPException(400, "Le montant doit être supérieur à zéro.")
    row = register_instrument(
        db,
        direction=body.direction,
        mode=body.mode,
        amount=body.amount,
        counterparty=body.counterparty,
        label=body.label,
        cheque_number=body.cheque_number,
        bank=body.bank,
        issue_date=body.issue_date,
        due_date=body.due_date,
        status="a_remettre" if body.direction == EMIS else "remis",
        source_type="manual",
        comment=body.comment,
        created_by=user.id,
    )
    if not row:
        raise HTTPException(400, "Impossible d'enregistrer la pièce "
                                 "(numéro déjà utilisé par un chèque émis en cours ?).")
    log_audit(db, user.id, "cheque.create", "cheque", row["id"],
              {"direction": body.direction, "mode": body.mode,
               "amount": body.amount, "number": body.cheque_number})
    return _shape(row)


def _load(db: Client, cheque_id: str) -> dict:
    rows = db.from_("cheques").select("*").eq("id", cheque_id).execute().data
    if not rows:
        raise HTTPException(404, "Chèque introuvable")
    return rows[0]


@router.patch("/{cheque_id}")
async def update_cheque(
    cheque_id: str,
    body: ChequeUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Complète ou corrige les informations du chèque (n°, banque, échéance,
    bénéficiaire, observation). Ne change PAS le statut — cf. /status."""
    _require_admin(user)
    _load(db, cheque_id)
    # exclude_unset : seuls les champs réellement envoyés sont touchés. On garde
    # les null explicites — c'est ainsi qu'on efface une échéance ou une banque.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return _shape(_load(db, cheque_id))
    if "cheque_number" in updates:
        updates["cheque_number"] = (updates["cheque_number"] or "").strip() or None
    if updates.get("issue_date") is None:
        updates.pop("issue_date", None)   # colonne NOT NULL : on ne l'efface pas
    updates["updated_at"] = _now()
    try:
        res = db.from_("cheques").update(updates).eq("id", cheque_id).execute()
    except Exception:
        raise HTTPException(400, "Numéro de chèque déjà utilisé par un chèque émis en cours.")
    log_audit(db, user.id, "cheque.update", "cheque", cheque_id, updates)
    return _shape(res.data[0] if res.data else _load(db, cheque_id))


@router.post("/{cheque_id}/status")
async def set_cheque_status(
    cheque_id: str,
    body: ChequeStatusUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Fait avancer la pièce dans son cycle de vie (remise ou transmission,
    encaissement ou exécution, impayé, annulation). Les transitions sont
    contrôlées : on ne sort de 'en_attente' que par la validation N+1, et une
    pièce encaissée est définitive."""
    _require_admin(user)
    cheque = _load(db, cheque_id)
    mode = cheque.get("mode") or CHEQUE
    current = cheque.get("status") or "en_attente"
    target = body.status
    if target not in STATUSES:
        raise HTTPException(400, "Statut invalide")
    allowed = TRANSITIONS.get(current, set())
    if target not in allowed:
        if current == "en_attente":
            raise HTTPException(400, "Ce règlement attend sa validation N+1 "
                                     "(onglet Validations) — statut non modifiable ici.")
        raise HTTPException(400, f"Transition refusée : {status_label(current, mode)} "
                                 f"→ {status_label(target, mode)}.")
    updates: dict = {"status": target, "updated_at": _now()}
    if target in ("encaisse", "impaye"):
        updates["cashed_date"] = body.date or _today()
    elif target == "remis":
        # Remise à la banque (ou transmission de l'ordre) : c'est le « déposé le »
        # du registre, distinct de l'échéance convenue — l'export des règlements
        # bancaires porte les deux colonnes (migration l40).
        updates["remitted_date"] = body.date or _today()
        updates["cashed_date"] = None
        # Ré-présentation après impayé : on repart en plus d'une échéance propre.
        # Hors ce cas, l'échéance du chèque reste celle qui a été convenue.
        if body.date and current == "impaye":
            updates["due_date"] = body.date
    if body.comment:
        updates["review_comment"] = body.comment
    res = db.from_("cheques").update(updates).eq("id", cheque_id).execute()
    log_audit(db, user.id, "cheque.status", "cheque", cheque_id,
              {"from": current, "to": target, "date": updates.get("cashed_date")})
    # Un impayé est une anomalie de trésorerie : on prévient l'initiateur.
    if target == "impaye" and cheque.get("created_by") and cheque["created_by"] != user.id:
        notify_users(
            db, [cheque["created_by"]],
            title=("Chèque impayé ⛔" if mode == CHEQUE else "Règlement rejeté ⛔"),
            message=(f"{mode_label(mode)} {cheque.get('cheque_number') or cheque.get('reference') or ''} "
                     f"({float(cheque.get('amount') or 0):,.2f} DH) a été rejeté par la banque."
                     ).replace(",", " "),
            type="error",
            link="/dashboard/accounting",
        )
    return _shape(res.data[0] if res.data else _load(db, cheque_id))


@router.delete("/{cheque_id}")
async def delete_cheque(
    cheque_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Supprime une ligne du registre. Réservé aux pièces saisies manuellement :
    une pièce issue d'une opération comptabilisée s'annule (statut 'annule'), elle
    ne s'efface pas."""
    _require_admin(user)
    cheque = _load(db, cheque_id)
    if cheque.get("source_type") != "manual":
        raise HTTPException(400, "Règlement rattaché à une opération : utilisez l'annulation, "
                                 "pas la suppression.")
    db.from_("cheques").delete().eq("id", cheque_id).execute()
    log_audit(db, user.id, "cheque.delete", "cheque", cheque_id,
              {"number": cheque.get("cheque_number"), "amount": cheque.get("amount")})
    return {"ok": True}
