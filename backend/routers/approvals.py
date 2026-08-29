from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ApprovalReject
from utils.notify import notify_users
from utils.audit import log_audit

router = APIRouter(prefix="/approvals", tags=["approvals"])

_OP_LABELS = {
    "tuition_payment": "Paiement de scolarité",
    "tuition_payment_delete": "Suppression d'un paiement de scolarité",
    "student_enrollment": "Inscription d'un élève",
    "class_create": "Création d'une classe",
    "student_transfer": "Transfert d'un élève",
    "cash_journal_create": "Saisie au journal",
    "cash_journal_edit": "Modification d'une ligne de journal",
    "cash_journal_delete": "Suppression d'une ligne de journal",
    "bank_payment": "Règlement bancaire",
    "cheque_payment": "Paiement par chèque",   # op_type d'avant l38
}

# Journaux (migration l36) : la caisse (espèces) et les comptes (virement / OV /
# chèque) partagent la même file de validation ; on précise lequel quand le
# payload le porte.
_CHANNEL_SUFFIX = {"caisse": " de caisse", "banque": " des comptes"}


def _op_label(op: dict) -> str:
    """Libellé lisible de l'opération, précisé du journal concerné si connu."""
    op_type = op.get("op_type")
    label = _OP_LABELS.get(op_type, op_type)
    if op_type and op_type.startswith("cash_journal_"):
        payload = op.get("payload") or {}
        channel = payload.get("channel") or (payload.get("updates") or {}).get("channel")
        suffix = _CHANNEL_SUFFIX.get(channel or "")
        if suffix:
            label = f"{label}{suffix}"
    else:
        from routers.accounting_cheques import PAYMENT_OP_TYPES, operation_label, CHEQUE
        if op_type in PAYMENT_OP_TYPES:
            # Précise ce que le règlement paie (achat, dépense…) et par quel
            # moyen. Un payload d'avant l38 ne porte pas de mode : c'est un chèque.
            payload = op.get("payload") or {}
            label = operation_label(payload.get("kind"), payload.get("mode") or CHEQUE)
    return label


def _admin_ids(db: Client) -> list[str]:
    """Tous les comptes admin (destinataires des notifications d'approbation)."""
    rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    return list({r["user_id"] for r in rows if r.get("user_id")})


def _enrich(db: Client, ops: list[dict]) -> list[dict]:
    """Ajoute les libellés lisibles (nom du caissier, nom de l'élève, nom de la promo)."""
    if not ops:
        return []
    person_ids = list({
        pid
        for op in ops
        for pid in (op.get("created_by"), op.get("student_id"), op.get("reviewed_by"))
        if pid
    })
    class_ids = list({op["class_id"] for op in ops if op.get("class_id")})
    prof_map: dict[str, dict] = {}
    if person_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", person_ids).execute().data or []
        prof_map = {p["id"]: p for p in profs}
    class_map: dict[str, str] = {}
    if class_ids:
        cls = db.from_("classes").select("id, name").in_("id", class_ids).execute().data or []
        class_map = {c["id"]: c["name"] for c in cls}

    def _name(pid):
        p = prof_map.get(pid) or {}
        return p.get("full_name") or p.get("email") or "—"

    out = []
    for op in ops:
        out.append({
            **op,
            "op_label": _op_label(op),
            "created_by_name": _name(op.get("created_by")),
            "student_name": _name(op.get("student_id")) if op.get("student_id") else None,
            "class_name": class_map.get(op.get("class_id")) if op.get("class_id") else None,
            "reviewed_by_name": _name(op.get("reviewed_by")) if op.get("reviewed_by") else None,
        })
    return out


@router.get("/pending")
async def list_pending(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """File d'attente des saisies caissier à valider (admin uniquement)."""
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")
    ops = (
        db.from_("pending_operations").select("*")
        .eq("status", "pending").order("created_at", desc=True)
        .execute().data or []
    )
    return {"items": _enrich(db, ops)}


# ── Boîte de réception unique ───────────────────────────────────────────────
# Tout ce qui attend une décision de l'administration ne vit pas dans
# `pending_operations` : les avances de caisse et de mission portent leur propre
# statut, et les demandes d'achat ont un circuit à deux décisions. L'admin ne
# doit pas avoir à faire le tour des onglets pour savoir ce qui l'attend — cet
# endpoint rassemble les quatre files dans un seul flux, chaque élément portant
# les URL d'action à appeler (aucune logique d'approbation n'est dupliquée).

def _people(db: Client, ids: list[str]) -> dict[str, str]:
    ids = [i for i in {i for i in ids if i}]
    if not ids:
        return {}
    rows = db.from_("profiles").select("id, full_name, email").in_("id", ids).execute().data or []
    return {r["id"]: (r.get("full_name") or r.get("email") or "—") for r in rows}


@router.get("/inbox")
async def approvals_inbox(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Toutes les demandes en attente d'une décision (admin uniquement).

    Regroupe : opérations différées (saisies caissier, règlements bancaires,
    suppressions de versement), avances de caisse, avances de frais de mission
    et demandes d'achat en attente de décision.
    """
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")

    items: list[dict] = []

    # 1. Opérations différées — y compris les règlements bancaires (chèque,
    #    virement, OV, versement) et les suppressions de versement.
    ops = (
        db.from_("pending_operations").select("*")
        .eq("status", "pending").order("created_at", desc=True)
        .execute().data or []
    )
    for op in _enrich(db, ops):
        detail = " · ".join(filter(None, [
            f"Élève : {op['student_name']}" if op.get("student_name") else None,
            f"Promo : {op['class_name']}" if op.get("class_name") else None,
        ]))
        items.append({
            "kind": "operation",
            "id": op["id"],
            "group": "Opérations à valider",
            "label": op["op_label"],
            "detail": detail or None,
            "amount": op.get("amount"),
            "created_at": op.get("created_at"),
            "created_by": op.get("created_by"),
            "created_by_name": op.get("created_by_name"),
            "approve_url": f"/api/approvals/{op['id']}/approve",
            "reject_url": f"/api/approvals/{op['id']}/reject",
            # Seuls les décaissements bancaires exigent un second regard.
            "four_eyes": op["op_type"] in PAYMENT_OP_TYPES_CACHE(),
        })

    # 2 & 3. Avances de caisse et de mission : statut porté par la note.
    for table, prefix, group, label in (
        ("cash_notes", "cash-notes", "Avances de caisse", "Avance de caisse"),
        ("mission_notes", "mission-notes", "Avances de frais de mission", "Avance de frais de mission"),
    ):
        try:
            rows = (
                db.from_(table).select("*")
                .eq("status", "pending").order("created_at", desc=True)
                .execute().data or []
            )
        except Exception:
            rows = []
        names = _people(db, [r.get("created_by") for r in rows])
        for n in rows:
            beneficiary = n.get("beneficiary_name") or n.get("beneficiary")
            items.append({
                "kind": "note",
                "id": n["id"],
                "group": group,
                "label": f"{label} {n.get('reference') or ''}".strip(),
                "detail": beneficiary or n.get("object") or n.get("motif") or None,
                "amount": n.get("total"),
                "created_at": n.get("created_at"),
                "created_by": n.get("created_by"),
                "created_by_name": names.get(n.get("created_by")) or "—",
                "approve_url": f"/api/accounting/{prefix}/{n['id']}/approve",
                "reject_url": f"/api/accounting/{prefix}/{n['id']}/reject",
                "four_eyes": False,
            })

    # 4. Demandes d'achat : la décision demande de choisir (validation, retour,
    #    annulation) et parfois de trancher entre devis — cela se fait dans
    #    l'onglet dédié. On signale seulement l'attente, avec le lien.
    try:
        prs = (
            db.from_("purchase_requests").select("*")
            .in_("status", ["brouillon", "retournee", "besoin_valide", "en_consultation"])
            .order("created_at", desc=True).execute().data or []
        )
    except Exception:
        prs = []
    names = _people(db, [r.get("created_by") for r in prs])
    for pr in prs:
        besoin = pr.get("status") in ("brouillon", "retournee")
        items.append({
            "kind": "purchase_request",
            "id": pr["id"],
            "group": "Demandes d'achat",
            "label": f"{'Besoin à valider' if besoin else 'Devis à trancher'} — {pr.get('request_number') or ''}".strip(" —"),
            "detail": pr.get("activity") or pr.get("project") or pr.get("justification"),
            "amount": pr.get("budget_estimate"),
            "created_at": pr.get("created_at"),
            "created_by": pr.get("created_by"),
            "created_by_name": names.get(pr.get("created_by")) or "—",
            "approve_url": None,          # décision à prendre dans l'onglet
            "reject_url": None,
            "tab": "purchase_requests",
            "four_eyes": False,
        })

    items.sort(key=lambda i: (i.get("created_at") or ""), reverse=True)
    return {"items": items}


def PAYMENT_OP_TYPES_CACHE():
    """Import différé : accounting_cheques importe approvals indirectement."""
    from routers.accounting_cheques import PAYMENT_OP_TYPES
    return PAYMENT_OP_TYPES


@router.get("/mine")
async def list_mine(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Mes saisies (caissier) — avec leur statut et le motif de rejet éventuel."""
    if not (user.is_cashier() or user.can_access_accounting_full()):
        raise HTTPException(403, "Caissier ou admin uniquement")
    ops = (
        db.from_("pending_operations").select("*")
        .eq("created_by", user.id).order("created_at", desc=True)
        .execute().data or []
    )
    return {"items": _enrich(db, ops)}


def _load_pending(db: Client, op_id: str) -> dict:
    rows = db.from_("pending_operations").select("*").eq("id", op_id).execute().data
    if not rows:
        raise HTTPException(404, "Opération introuvable")
    op = rows[0]
    if op["status"] != "pending":
        raise HTTPException(400, f"Opération déjà {op['status']}")
    return op


@router.post("/{op_id}/approve")
async def approve_operation(
    op_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Valide une saisie caissier : exécute l'insertion réelle puis notifie le caissier."""
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")
    op = _load_pending(db, op_id)
    payload = op.get("payload") or {}
    result_id = None

    # Décaissements bancaires : contrôle à quatre yeux. On refuse l'auto-validation
    # DÈS QU'un autre compte admin existe ; s'il n'y en a qu'un, il valide son
    # propre règlement (tracé dans le journal d'audit) — sinon le circuit serait
    # bloqué.
    from routers.accounting_cheques import PAYMENT_OP_TYPES
    if op["op_type"] in PAYMENT_OP_TYPES and op.get("created_by") == user.id:
        if len([a for a in _admin_ids(db) if a != user.id]) > 0:
            raise HTTPException(
                403,
                "Un règlement bancaire ne peut pas être validé par la personne qui l'a saisi. "
                "Demandez la validation à un autre administrateur.",
            )

    if op["op_type"] == "tuition_payment":
        res = db.from_("tuition_payments").insert(payload).execute()
        result_id = (res.data[0].get("id") if res.data else None)
        # Journal : encaissement de scolarité (validé par l'admin), ventilé selon
        # le mode de règlement (chèque / virement → comptes, espèce → caisse).
        try:
            from routers.accounting_cash_journal import create_cash_entry
            student_name = None
            sid = op.get("student_id") or payload.get("student_id")
            if sid:
                prof = db.from_("profiles").select("full_name, email").eq("id", sid).execute().data or []
                if prof:
                    student_name = prof[0].get("full_name") or prof[0].get("email")
            receipt = payload.get("receipt_reference")
            create_cash_entry(
                db,
                user_id=user.id,
                type="entree",
                amount=payload.get("amount") or 0,
                prestataire=student_name or "Élève",
                action="Scolarité — " + (student_name or "versement"),
                justificatif="Reçu",
                nc="comptable",
                source_type="tuition_payment",
                source_id=result_id,
                payment_method=payload.get("method"),
                payment_ref=receipt,
            )
            # Chèque REÇU → inscrit au registre et suivi jusqu'à l'encaissement.
            # Pas de validation N+1 : l'encaissement n'est pas une décision.
            from routers.accounting_cheques import is_cheque, register_instrument, RECU
            if is_cheque(payload.get("method")):
                register_instrument(
                    db,
                    direction=RECU,
                    amount=payload.get("amount") or 0,
                    counterparty=student_name or "Élève",
                    label=f"Scolarité {receipt or ''}".strip(),
                    issue_date=payload.get("paid_on"),
                    status="remis",
                    source_type="tuition_payment",
                    source_id=result_id,
                    created_by=op["created_by"],
                )
        except Exception:
            pass
    elif op["op_type"] == "tuition_payment_delete":
        # Le second admin exécute ce que le premier a demandé : la ligne métier,
        # sa ligne de journal et sa pièce au registre partent ensemble.
        from routers.accounting_tuition import perform_payment_delete
        result_id = perform_payment_delete(db, payload.get("payment_id"), user.id)
    elif op["op_type"] == "student_enrollment":
        try:
            res = db.from_("class_students").insert(payload).execute()
            result_id = (res.data[0].get("id") if res.data else None)
        except Exception as e:
            raise HTTPException(400, f"Échec de l'inscription : {e}")
    elif op["op_type"] == "class_create":
        try:
            res = db.from_("classes").insert(payload).execute()
            result_id = (res.data[0].get("id") if res.data else None)
        except Exception as e:
            raise HTTPException(400, f"Échec de la création de la classe : {e}")
    elif op["op_type"] == "student_transfer":
        # Revalider à l'approbation : la classe cible doit exister et appartenir
        # à la MÊME filière (formation) que la classe d'origine (prix identiques).
        from_id = payload.get("from_class_id")
        to_id = payload.get("to_class_id")
        sid = payload.get("student_id")
        rows = db.from_("classes").select("id, formation_id").in_("id", [c for c in [from_id, to_id] if c]).execute().data or []
        by_id = {c["id"]: c for c in rows}
        if from_id not in by_id or to_id not in by_id:
            raise HTTPException(400, "Classe source ou cible introuvable")
        if (by_id[from_id].get("formation_id")) != (by_id[to_id].get("formation_id")):
            raise HTTPException(400, "Transfert refusé : filière (formation) différente")
        already_target = (
            db.from_("class_students").select("student_id")
            .eq("class_id", to_id).eq("student_id", sid).execute().data
        )
        if already_target:
            # Déjà inscrit dans la classe cible → on retire seulement l'inscription
            # d'origine (l'UPDATE violerait la PK (class_id, student_id)).
            db.from_("class_students").delete().eq("class_id", from_id).eq("student_id", sid).execute()
        else:
            upd = (
                db.from_("class_students").update({"class_id": to_id})
                .eq("class_id", from_id).eq("student_id", sid).execute()
            )
            if not upd.data:
                raise HTTPException(404, "Élève non inscrit à la classe d'origine")
        result_id = to_id
    elif op["op_type"] in PAYMENT_OP_TYPES:
        # Rejoue l'opération différée (paiement d'achat, note, dépense, écriture)
        # puis fait passer la pièce en « à remettre » / « à exécuter » au registre.
        from routers.accounting_cheques import execute_pending_payment
        result_id = await execute_pending_payment(db, op, user.id)
    elif op["op_type"] == "cash_journal_create":
        # Passe par le chemin d'insertion commun (inscrit un chèque reçu au
        # registre le cas échéant) ; la ligne reste créditée à l'initiateur.
        from routers.accounting_cash_journal import commit_journal_row
        entry = commit_journal_row(db, dict(payload), op["created_by"])
        result_id = entry.get("id")
    elif op["op_type"] == "cash_journal_edit":
        entry_id = payload.get("entry_id")
        updates = payload.get("updates") or {}
        if entry_id and updates:
            db.from_("cash_journal").update(updates).eq("id", entry_id).execute()
        result_id = entry_id
    elif op["op_type"] == "cash_journal_delete":
        entry_id = payload.get("entry_id")
        if entry_id:
            existing = db.from_("cash_journal").select("source_type").eq("id", entry_id).execute().data or []
            if existing and existing[0].get("source_type") != "manual":
                raise HTTPException(400, "Entrée automatique non supprimable")
            db.from_("cash_journal").delete().eq("id", entry_id).execute()
        result_id = entry_id
    else:
        raise HTTPException(400, "Type d'opération inconnu")

    now = datetime.now(timezone.utc).isoformat()
    db.from_("pending_operations").update({
        "status": "approved",
        "reviewed_by": user.id,
        "reviewed_at": now,
        "result_id": result_id,
    }).eq("id", op_id).execute()

    label = _op_label(op)
    notify_users(
        db, [op["created_by"]],
        title="Saisie approuvée ✅",
        message=f"Votre saisie « {label} » a été validée par l'administration.",
        type="success",
        link=f"/dashboard/accounting?tab=mine&focus={op_id}",
    )
    log_audit(db, user.id, "approval.approve", "pending_operation", op_id,
              {"op_type": op["op_type"], "result_id": result_id})
    return {"ok": True, "result_id": result_id}


@router.post("/{op_id}/reject")
async def reject_operation(
    op_id: str,
    body: ApprovalReject,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Rejette une saisie caissier avec un motif obligatoire ; notifie le caissier."""
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")
    comment = (body.comment or "").strip()
    if not comment:
        raise HTTPException(400, "Le motif du rejet est obligatoire")
    op = _load_pending(db, op_id)

    # Règlement refusé : l'opération n'a pas eu lieu et le numéro de chèque est
    # libéré au registre (statut 'rejete').
    from routers.accounting_cheques import PAYMENT_OP_TYPES, reject_pending_payment
    if op["op_type"] in PAYMENT_OP_TYPES:
        reject_pending_payment(db, op, comment, user.id)

    now = datetime.now(timezone.utc).isoformat()
    db.from_("pending_operations").update({
        "status": "rejected",
        "review_comment": comment,
        "reviewed_by": user.id,
        "reviewed_at": now,
    }).eq("id", op_id).execute()

    label = _op_label(op)
    notify_users(
        db, [op["created_by"]],
        title="Saisie rejetée ⛔",
        message=f"Votre saisie « {label} » a été rejetée. Motif : {comment}",
        type="error",
        link=f"/dashboard/accounting?tab=mine&focus={op_id}",
    )
    log_audit(db, user.id, "approval.reject", "pending_operation", op_id,
              {"op_type": op["op_type"], "comment": comment})
    return {"ok": True}
