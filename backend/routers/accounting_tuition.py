from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, Response
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import TuitionPlanUpdate, TuitionPlanBulkUpdate, ClassScheduleUpdate, TuitionPaymentCreate, TuitionPaymentUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read
from utils.notify import notify_users
from utils.excel import make_xlsx
from utils.pdf_generators import render_tuition_invoice_pdf

router = APIRouter(prefix="/accounting/tuition", tags=["accounting"])

ENROLLMENT_STATUSES = {"actif", "abandon", "absent", "suspendu", "diplome"}
DEFAULT_INSTALLMENTS = 11
_FR_MONTHS =["", "Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"]
_FR_MONTHS_FULL = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
                   "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 hour
ENTITY_TYPE = "tuition_payment"
_EPS = 0.5  # tolérance d'arrondi (MAD) : ignore les résidus < ½ MAD (mensualités non entières)


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _require_read(user: CurrentUser) -> None:
    """Lecture du suivi de scolarité : admin, comptable (lecture seule) ou caissier."""
    if not user.can_read_accounting():
        raise HTTPException(403, "Accès comptabilité requis")


def _admin_ids(db: Client) -> list[str]:
    rows = db.from_("user_roles").select("user_id").eq("role", "admin").execute().data or []
    return list({r["user_id"] for r in rows if r.get("user_id")})


def _num(v) -> float:
    return float(v or 0)


def _validate_due_fields(updates: dict) -> None:
    """Bornes du jour d'échéance / tolérance (cohérentes avec la contrainte SQL l18)."""
    if updates.get("due_day") is not None and not (1 <= updates["due_day"] <= 28):
        raise HTTPException(400, "due_day doit être entre 1 et 28")
    if updates.get("grace_days") is not None and not (0 <= updates["grace_days"] <= 27):
        raise HTTPException(400, "grace_days doit être entre 0 et 27")


# ── Helpers mois / dates ─────────────────────────────────────────────────────
def _fom(d: date) -> date:
    """Premier jour du mois."""
    return d.replace(day=1)


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_label(d: date) -> str:
    return f"{_FR_MONTHS[d.month]} {d.year % 100:02d}"


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def _parse_month(s) -> Optional[date]:
    if not s:
        return None
    try:
        return _fom(date.fromisoformat(str(s)[:10]))
    except (ValueError, TypeError):
        return None


def _default_start(today: date) -> date:
    """Mois courant par défaut quand la classe n'a pas d'ancrage explicite."""
    return today.replace(day=1)


def _eff_date(p: dict) -> Optional[date]:
    """Date réelle d'encaissement d'un versement : `paid_on` si renseigné, sinon
    la date de création de l'enregistrement (`created_at`). Sert à mesurer le
    RETARD (comportement de paiement), indépendamment du mois couvert."""
    s = p.get("paid_on") or p.get("created_at")
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def _deadline(period_fom: date, due_day: int, grace_days: int) -> date:
    """Échéance tolérée d'une mensualité : le `due_day` du mois de la période,
    plus `grace_days` jours de tolérance. `due_day` est borné 1..28 (mois courts)."""
    d = min(28, max(1, int(due_day or 1)))
    return period_fom.replace(day=d) + timedelta(days=max(0, int(grace_days or 0)))


def _class_schedule(cls: dict, today: date) -> tuple[date, int]:
    """Ancre des colonnes : mois de départ + nombre de mensualités (période de formation)."""
    start = _parse_month(cls.get("payment_start_month")) or _parse_month(cls.get("start_date")) or _default_start(today)
    count = int(cls.get("installments_count") or cls.get("duration_months") or DEFAULT_INSTALLMENTS)
    return start, max(1, count)


def _budget(monthly: float, count: int) -> float:
    """Budget de scolarité (dérivé) = Mensualité × nombre de mois.

    La mensualité est SAISIE (standardisée par promo). Les frais d'inscription
    sont un poste TOTALEMENT séparé : ils n'entrent NI dans le budget, NI dans le
    total payé, NI dans le reste de scolarité. Jouer dessus (réductions) n'a donc
    aucun impact sur la scolarité.
    """
    return round(max(0.0, monthly) * count, 2) if count > 0 else 0.0


def _elapsed_installments(start: date, count: int, ref: date, past_only: bool = False) -> int:
    """Nombre d'échéances CALENDAIRES échues à la date `ref`, alignées sur les
    colonnes de mois de l'échéancier (mois de départ + i mois).

    - past_only=False : compte les échéances dont le mois a commencé (mois ≤ mois courant).
      → base du « manque d'argent » cumulé (l'alerte doit s'allumer ici).
    - past_only=True  : ne compte que les mois ENTIÈREMENT écoulés (mois < mois courant).
      → sert à distinguer un vrai retard (rouge) d'un simple rappel du mois courant (ambre).

    Aligné sur le calcul mois-par-mois de la matrice : payer sa mensualité du mois
    remet le solde à 0 (pas de faux retard), et un trop-perçu se reporte tout seul
    puisqu'on compare le CUMUL payé au CUMUL attendu.
    """
    ref_fom = _fom(ref)
    n = 0
    for i in range(count):
        mk = _add_months(start, i)
        if (mk < ref_fom) if past_only else (mk <= ref_fom):
            n += 1
    return n


def _compute(plan: dict, paid_only: float, start: date, count: int, today: date) -> dict:
    """Synthèse d'un élève : mensualité, total encaissé, reste, retard, alerte.
    `paid_only` = somme des versements mensuels (hors avance).

    Le retard est le MANQUE CUMULÉ : on compare le total payé au total attendu pour
    toutes les échéances échues à ce jour (calendrier). Un trop-perçu d'un mois se
    reporte automatiquement sur les suivants ; dès que le cumul payé passe sous le
    cumul dû, l'alerte s'allume avec le montant manquant.
    """
    status = plan.get("enrollment_status") or "actif"
    advance = _num(plan.get("advance"))          # frais d'inscription — poste séparé
    monthly = _num(plan.get("monthly_fee"))
    budget = _budget(monthly, count)             # budget scolarité = mensualité × mois (SANS frais)
    total_paye = round(paid_only, 2)             # mensualités encaissées (frais exclus)
    reste = round(budget - total_paye, 2)

    base = {
        "monthly_fee": monthly,
        "advance": advance,
        "annual_budget": budget,
        "total_paye": total_paye,
        "reste": reste,
    }
    if status == "abandon":
        return {**base, "expected_to_date": 0.0, "late_amount": 0.0, "alert": "abandon"}

    elapsed_now = _elapsed_installments(start, count, today)               # échéances échues (mois courant inclus)
    elapsed_past = _elapsed_installments(start, count, today, past_only=True)  # mois entièrement écoulés

    short_now = round(max(0.0, monthly * elapsed_now - paid_only), 2)   # manque cumulé à ce jour
    short_past = round(max(0.0, monthly * elapsed_past - paid_only), 2)  # manque sur les mois clos

    # Tolérance d'arrondi : une mensualité non entière (ex. 10000 ÷ 6 = 1666,67)
    # laisse des résidus < 1 MAD qui ne sont pas de vrais retards. On les ignore
    # pour ne pas afficher « Manque 0 MAD ».
    if short_past > _EPS:
        alert, late = "retard", short_now   # retard réel : il manque de l'argent sur des mois clos
    elif short_now > _EPS:
        alert, late = "rappel", short_now   # mensualité du mois courant encore à régler
    else:
        alert, late = "a_jour", 0.0

    return {**base, "expected_to_date": round(monthly * elapsed_now, 2), "late_amount": late, "alert": alert}


def _student_names(db: Client, student_ids: list) -> dict[str, dict]:
    ids = list({s for s in student_ids if s})
    if not ids:
        return {}
    profs = db.from_("profiles").select("id, full_name, email").in_("id", ids).execute().data or []
    return {p["id"]: p for p in profs}


# ── Endpoints ────────────────────────────────────────────────────────────
@router.get("/classes")
async def list_classes(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Synthèse paiement par promo (pour le sélecteur de l'onglet)."""
    _require_read(user)
    today = datetime.now(timezone.utc).date()

    classes = db.from_("classes").select(
        "id, name, payment_start_month, installments_count, start_date, duration_months"
    ).order("name").execute().data or []
    memberships = db.from_("class_students").select(
        "class_id, student_id, advance, monthly_fee, annual_budget, enrollment_date, enrollment_status"
    ).execute().data or []
    payments = db.from_("tuition_payments").select("class_id, student_id, amount").execute().data or []

    paye_by = {}
    for p in payments:
        key = (p["class_id"], p["student_id"])
        paye_by[key] = paye_by.get(key, 0.0) + _num(p.get("amount"))

    mem_by_class = {}
    for m in memberships:
        mem_by_class.setdefault(m["class_id"], []).append(m)

    out = []
    for c in classes:
        start, count = _class_schedule(c, today)
        rows = mem_by_class.get(c["id"], [])
        total_budget = total_paye = total_reste = montant_retard = 0.0
        nb_retard = 0
        for m in rows:
            paid_only = paye_by.get((c["id"], m["student_id"]), 0.0)
            comp = _compute(m, paid_only, start, count, today)
            total_budget += comp["annual_budget"]
            total_paye += comp["total_paye"]
            total_reste += comp["reste"]
            if comp["alert"] == "retard":
                nb_retard += 1
                montant_retard += comp["late_amount"]
        out.append({
            "class_id": c["id"],
            "class_name": c["name"],
            "nb_students": len(rows),
            "total_budget": round(total_budget, 2),
            "total_paye": round(total_paye, 2),
            "total_reste": round(total_reste, 2),
            "nb_en_retard": nb_retard,
            "montant_retard": round(montant_retard, 2),
        })
    return out


@router.get("/class/{class_id}")
async def class_matrix(
    class_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Matrice mois × élève d'une promo (comme la feuille Excel) + alertes."""
    _require_read(user)
    today = datetime.now(timezone.utc).date()
    today_fom = _fom(today)

    cls = db.from_("classes").select(
        "id, name, payment_start_month, installments_count, start_date, duration_months"
    ).eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    cls = cls[0]
    start, count = _class_schedule(cls, today)

    # due_day / grace_days viennent de la migration l18. Si elle n'a pas encore été
    # appliquée, on retombe sur les valeurs par défaut (1er du mois + 9 j de tolérance)
    # pour que la détection de retard fonctionne quand même.
    _base_cols = ("student_id, advance, monthly_fee, annual_budget, "
                  "enrollment_number, enrollment_date, enrollment_status, payment_comment")
    try:
        memberships = db.from_("class_students").select(
            _base_cols + ", due_day, grace_days"
        ).eq("class_id", class_id).execute().data or []
    except Exception:
        memberships = db.from_("class_students").select(
            _base_cols
        ).eq("class_id", class_id).execute().data or []
    payments = db.from_("tuition_payments").select(
        "id, student_id, period_month, amount, method, note, paid_on, reference, comment, receipt_reference, created_at"
    ).eq("class_id", class_id).execute().data or []

    prof_map = _student_names(db, [m["student_id"] for m in memberships])
    payment_ids = [p["id"] for p in payments if p.get("id")]
    attachment_rows = []
    if payment_ids:
        attachment_rows = (
            db.from_("accounting_attachments")
            .select("id, entity_id, kind, file_path, file_name, file_type, file_size, created_at")
            .eq("entity_type", ENTITY_TYPE)
            .in_("entity_id", payment_ids)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
    attachments_by_payment: dict[str, list[dict]] = {}
    for row in attachment_rows:
        attachments_by_payment.setdefault(row["entity_id"], []).append(row)

    # Agrégation des versements par élève et par mois
    by_student_month: dict[str, dict[str, float]] = {}
    paye_by_student: dict[str, float] = {}
    payment_month_keys: set[str] = set()
    # Dates réelles d'encaissement par élève et par période (pour le retard/comportement).
    pay_dates: dict[str, dict[str, list[tuple]]] = {}
    raw_payments: list[dict] = []
    for p in payments:
        sid = p["student_id"]
        pm = _parse_month(p.get("period_month"))
        if pm is None:
            continue
        key = _month_key(pm)
        payment_month_keys.add(key)
        by_student_month.setdefault(sid, {})[key] = by_student_month.get(sid, {}).get(key, 0.0) + _num(p.get("amount"))
        paye_by_student[sid] = paye_by_student.get(sid, 0.0) + _num(p.get("amount"))
        pay_dates.setdefault(sid, {}).setdefault(key, []).append((_eff_date(p), _num(p.get("amount"))))
        raw_payments.append({
            "id": p["id"], "student_id": sid, "period_key": key,
            "period_month": p.get("period_month"), "amount": _num(p.get("amount")),
            "method": p.get("method"), "note": p.get("note"), "paid_on": p.get("paid_on"),
            "reference": p.get("reference"), "comment": p.get("comment"),
            "receipt_reference": p.get("receipt_reference"),
            "attachments": attachments_by_payment.get(p["id"], []),
        })

    # Colonnes : échéancier de la formation ∪ mois ayant des versements, triés chrono
    schedule_keys = [_month_key(_add_months(start, i)) for i in range(count)]
    all_keys = sorted(set(schedule_keys) | payment_month_keys)
    months = [{"key": k, "label": _month_label(date(int(k[:4]), int(k[5:7]), 1))} for k in all_keys]

    students = []
    for m in sorted(memberships, key=lambda x: (prof_map.get(x["student_id"], {}).get("full_name") or "").lower()):
        sid = m["student_id"]
        prof = prof_map.get(sid, {})
        paid_only = paye_by_student.get(sid, 0.0)
        comp = _compute(m, paid_only, start, count, today)

        # Report cumulé mois par mois (colonnes = mois calendaires) : pour chaque
        # mois échu on compare le cumul payé au cumul attendu (mensualité × échéances
        # écoulées depuis l'inscription). Un manque s'affiche « −X » (reporté) ; un
        # trop-perçu s'affiche « +X » (crédit reporté, ex. 1000 payé pour 900 dû).
        status = m.get("enrollment_status") or "actif"
        advance = _num(m.get("advance"))
        monthly = _num(m.get("monthly_fee"))
        budget = _budget(monthly, count)
        due_day = int(m.get("due_day") or 1)
        grace_days = int(m["grace_days"]) if m.get("grace_days") is not None else 9
        bm = by_student_month.get(sid, {})
        pd_by_month = pay_dates.get(sid, {})
        month_detail: dict[str, dict] = {}
        today_key = _month_key(today_fom)
        cum_paid = 0.0
        late_behavior_count = 0
        late_behavior_max_days = 0
        for mk in all_keys:
            paid_here = _num(bm.get(mk))
            cum_paid += paid_here
            # Attendu = mensualité × nb de mensualités CALENDAIRES écoulées (échéancier
            # aligné sur les colonnes de mois, PAS le cycle 30 j depuis l'inscription).
            # Ainsi payer sa mensualité du mois donne un solde à 0 (plus de faux +X/−X).
            elapsed = sum(1 for sk in schedule_keys if sk <= mk and sk <= today_key)
            cum_expected = round(monthly * elapsed, 2)
            due = (mk in schedule_keys) and (mk <= today_key) and status != "abandon"
            diff = round(cum_paid - cum_expected, 2)
            # Tolérance d'arrondi : on n'affiche ni « −0 » ni « +0 » pour les résidus < ½ MAD.
            missing = round(max(0.0, -diff), 2) if due and -diff > _EPS else 0.0
            credit = round(max(0.0, diff), 2) if due and diff > _EPS else 0.0

            # ── Comportement de paiement : le mois est-il RÉGLÉ EN RETARD ? ─────────
            # On regarde les versements de CE mois (period_month = mk). Le mois est
            # « payé en retard » si sa mensualité a bien été couverte, mais que la
            # couverture n'a été atteinte qu'APRÈS l'échéance tolérée (due_day + grace).
            paid_late = False
            late_days = 0
            deadline_iso = None
            paid_on_eff = None
            if due and monthly > 0:
                period_fom = date(int(mk[:4]), int(mk[5:7]), 1)
                deadline = _deadline(period_fom, due_day, grace_days)
                deadline_iso = deadline.isoformat()
                # Versements de la période, triés par date réelle (les dates nulles en dernier).
                plist = sorted(pd_by_month.get(mk, []), key=lambda x: (x[0] is None, x[0] or date.max))
                cum_here = 0.0
                for d_eff, amt in plist:
                    cum_here += amt
                    if cum_here + _EPS >= monthly:      # mensualité couverte à cette date
                        if d_eff is not None and d_eff > deadline:
                            paid_late = True
                            late_days = (d_eff - deadline).days
                            paid_on_eff = d_eff.isoformat()
                        break
                if paid_late:
                    late_behavior_count += 1
                    late_behavior_max_days = max(late_behavior_max_days, late_days)

            month_detail[mk] = {
                "paid": round(paid_here, 2),
                "cumul_expected": cum_expected,
                "cumul_paid": round(cum_paid, 2),
                "missing": missing,
                "credit": credit,
                "due": due,
                "paid_late": paid_late,
                "late_days": late_days,
                "deadline": deadline_iso,
                "paid_on_eff": paid_on_eff,
            }

        # ── Alerte de retard ÉCHELONNÉE sur le MOIS COURANT ────────────────────
        # Comportement TEMPOREL (distinct du « manque d'argent » cumulé) : si la
        # mensualité du mois en cours n'est pas encore réglée et que le jour
        # d'échéance de l'élève est dépassé, on gradue selon les jours écoulés :
        #   à J = rappel · à J+5 = danger · à J+10 = critique.
        overdue_level = None
        overdue_days = 0
        cur = month_detail.get(today_key)
        if status != "abandon" and monthly > 0 and cur and cur.get("due") and cur.get("missing", 0.0) > _EPS:
            due_date = today_fom.replace(day=min(28, max(1, due_day)))
            if today >= due_date:
                overdue_days = (today - due_date).days
                overdue_level = "critique" if overdue_days >= 10 else "danger" if overdue_days >= 5 else "rappel"

        students.append({
            "student_id": sid,
            "full_name": prof.get("full_name") or prof.get("email") or "—",
            "email": prof.get("email"),
            "enrollment_number": m.get("enrollment_number"),
            "enrollment_date": m.get("enrollment_date"),
            "enrollment_status": status,
            "payment_comment": m.get("payment_comment"),
            "annual_budget": budget,
            "by_month": bm,
            "month_detail": month_detail,
            "due_day": due_day,
            "grace_days": grace_days,
            "late_behavior_count": late_behavior_count,
            "late_behavior_max_days": late_behavior_max_days,
            "overdue_level": overdue_level,
            "overdue_days": overdue_days,
            **comp,   # monthly_fee, advance, expected_to_date, total_paye, reste, late_amount, alert
        })

    return {
        "class_id": class_id,
        "class_name": cls["name"],
        "payment_start_month": _month_key(start) + "-01",
        "installments_count": count,
        "months": months,
        "students": students,
        "payments": raw_payments,
    }


@router.patch("/class/{class_id}/schedule")
async def update_schedule(
    class_id: str,
    body: ClassScheduleUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Mois de départ + nombre de mensualités de l'échéancier (usage interne/scripts)."""
    _require_admin(user)
    updates: dict = {}
    if body.payment_start_month is not None:
        pm = _parse_month(body.payment_start_month)
        if pm is None:
            raise HTTPException(400, "payment_start_month invalide")
        updates["payment_start_month"] = pm.isoformat()
    if body.installments_count is not None:
        if body.installments_count < 1 or body.installments_count > 24:
            raise HTTPException(400, "installments_count doit être entre 1 et 24")
        updates["installments_count"] = body.installments_count
    if not updates:
        raise HTTPException(400, "Aucun champ à mettre à jour")

    res = db.from_("classes").update(updates).eq("id", class_id).execute()
    if not res.data:
        raise HTTPException(404, "Classe introuvable")
    log_audit(db, user.id, "tuition.schedule.update", "class", class_id, updates)
    return {"ok": True, **updates}


@router.patch("/class/{class_id}/student/{student_id}/plan")
async def update_plan(
    class_id: str,
    student_id: str,
    body: TuitionPlanUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Plan de paiement d'un élève inscrit (mensualité, frais d'inscription, statut…).
    La mensualité est SAISIE ; le budget est dérivé (mensualité × nb de mois + frais)
    et n'est donc pas stocké."""
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    updates.pop("annual_budget", None)       # dérivé (mensualité × mois + frais), jamais écrit
    updates.pop("registration_fee", None)    # obsolète (remplacé par advance)
    updates.pop("enrollment_number", None)   # auto-généré (001/IP/AAAA), jamais réécrit
    if not updates:
        raise HTTPException(400, "Aucun champ à mettre à jour")
    if "enrollment_status" in updates and updates["enrollment_status"] not in ENROLLMENT_STATUSES:
        raise HTTPException(400, "enrollment_status invalide")
    for f in ("advance", "monthly_fee"):
        if f in updates and updates[f] is not None and updates[f] < 0:
            raise HTTPException(400, f"{f} doit être >= 0")
    _validate_due_fields(updates)

    res = (
        db.from_("class_students").update(updates)
        .eq("class_id", class_id).eq("student_id", student_id).execute()
    )
    if not res.data:
        raise HTTPException(404, "Élève non inscrit à cette promo")
    log_audit(db, user.id, "tuition.plan.update", "class_student", f"{class_id}:{student_id}", updates)
    return {"ok": True, **updates}


@router.patch("/class/{class_id}/students/plan")
async def bulk_update_plans(
    class_id: str,
    body: TuitionPlanBulkUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Enregistre plusieurs modifications de plan en une seule requête."""
    _require_admin(user)
    if not body.updates:
        raise HTTPException(400, "Aucune modification à enregistrer")

    updated = []
    for item in body.updates:
        updates = item.model_dump(exclude_unset=True, exclude={"student_id"})
        updates.pop("annual_budget", None)       # dérivé, jamais écrit
        updates.pop("registration_fee", None)
        updates.pop("enrollment_number", None)
        if not updates:
            continue
        if "enrollment_status" in updates and updates["enrollment_status"] not in ENROLLMENT_STATUSES:
            raise HTTPException(400, "enrollment_status invalide")
        for f in ("advance", "monthly_fee"):
            if f in updates and updates[f] is not None and updates[f] < 0:
                raise HTTPException(400, f"{f} doit être >= 0")
        _validate_due_fields(updates)

        res = (
            db.from_("class_students").update(updates)
            .eq("class_id", class_id).eq("student_id", item.student_id).execute()
        )
        if not res.data:
            raise HTTPException(404, f"Élève non inscrit à cette promo: {item.student_id}")
        updated.append({"student_id": item.student_id, **updates})

    log_audit(db, user.id, "tuition.plan.bulk_update", "class", class_id, {"updated_count": len(updated)})
    return {"ok": True, "updated_count": len(updated), "updated": updated}


@router.post("/payment")
async def create_payment(
    body: TuitionPaymentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Enregistre un versement mensuel pour un élève.

    - Admin : insertion directe.
    - Caissier : la saisie part en file d'attente `pending_operations` et doit être
      validée par un admin (validation N+1). Renvoie {"pending": true}.
    """
    if not (user.can_access_accounting_full() or user.is_cashier()):
        raise HTTPException(403, "Admin ou caissier uniquement")
    pm = _parse_month(body.period_month)
    if pm is None:
        raise HTTPException(400, "period_month invalide")
    if body.amount < 0:
        raise HTTPException(400, "amount doit être >= 0")
    # Date de règlement obligatoire : elle sert à mesurer le RETARD (comportement de
    # paiement). Sans elle, impossible de distinguer un paiement à l'heure d'un retard.
    if not (body.paid_on or "").strip():
        raise HTTPException(400, "La date de règlement (paid_on) est obligatoire")

    receipt_reference = (body.receipt_reference or "").strip() or None
    data = {
        "class_id": body.class_id,
        "student_id": body.student_id,
        "period_month": pm.isoformat(),
        "amount": body.amount,
        "method": body.method,
        "note": body.note,
        "paid_on": body.paid_on,
        "comment": body.comment,
        "receipt_reference": receipt_reference,
        "created_by": user.id,
    }

    # ── Caissier : validation N+1 ──────────────────────────────────────────
    if user.is_cashier() and not user.can_access_accounting_full():
        op = db.from_("pending_operations").insert({
            "op_type": "tuition_payment",
            "payload": data,
            "class_id": body.class_id,
            "student_id": body.student_id,
            "amount": body.amount,
            "created_by": user.id,
        }).execute()
        op_id = op.data[0]["id"] if op.data else None
        admins = _admin_ids(db)
        notify_users(
            db, admins,
            title="Nouvelle saisie à valider 🧾",
            message="Un paiement de scolarité saisi par la caisse attend votre validation.",
            type="info",
            link=f"/dashboard/accounting?tab=validations&focus={op_id}",
        )
        log_audit(db, user.id, "tuition_payment.pending", "pending_operation", op_id,
                  {"class_id": body.class_id, "student_id": body.student_id, "amount": body.amount})
        return {"pending": True}

    res = db.from_("tuition_payments").insert(data).execute()
    row = res.data[0]
    log_audit(db, user.id, "tuition_payment.create", "tuition_payment", row["id"],
              {"class_id": body.class_id, "student_id": body.student_id, "amount": body.amount,
               "reference": row.get("reference")})

    # Journal : encaissement de scolarité (saisie admin directe), ventilé selon le
    # mode de règlement (chèque / virement → Journal des comptes, espèce → caisse).
    try:
        from routers.accounting_cash_journal import create_cash_entry
        student_name = None
        if body.student_id:
            prof = db.from_("profiles").select("full_name, email").eq("id", body.student_id).execute().data or []
            if prof:
                student_name = prof[0].get("full_name") or prof[0].get("email")
        create_cash_entry(
            db,
            user_id=user.id,
            type="entree",
            amount=body.amount,
            prestataire=student_name or "Élève",
            action="Scolarité — " + (student_name or "Élève"),
            justificatif="Reçu",
            nc="comptable",
            source_type="tuition_payment",
            source_id=row["id"],
            payment_method=body.method,
            payment_ref=receipt_reference,
        )
        # Chèque REÇU → inscrit au registre et suivi jusqu'à l'encaissement.
        # Pas de validation N+1 : l'encaissement n'est pas une décision.
        from routers.accounting_cheques import is_cheque, register_instrument, RECU
        if is_cheque(body.method):
            register_instrument(
                db,
                direction=RECU,
                amount=body.amount,
                counterparty=student_name or "Élève",
                label=f"Scolarité {receipt_reference or ''}".strip(),
                issue_date=body.paid_on,
                status="remis",
                source_type="tuition_payment",
                source_id=row["id"],
                created_by=user.id,
            )
    except Exception:
        pass

    return row


def _period_label(pm) -> Optional[str]:
    """'2026-09-01' → 'Septembre 2026'."""
    try:
        y, m = str(pm).split("-")[:2]
        return f"{_FR_MONTHS_FULL[int(m)]} {y}"
    except Exception:
        return None


@router.get("/payment/{payment_id}/facture")
async def payment_invoice_pdf(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Facture IPISB (PDF) d'un versement de scolarité — téléchargeable une fois
    le paiement enregistré. Lecture ouverte à admin / comptable / caissier."""
    _require_read(user)
    rows = (
        db.from_("tuition_payments")
        .select("id, class_id, student_id, period_month, amount, method, paid_on, reference, created_at")
        .eq("id", payment_id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Versement introuvable")
    p = rows[0]

    student_name = None
    if p.get("student_id"):
        prof = db.from_("profiles").select("full_name, email").eq("id", p["student_id"]).execute().data or []
        if prof:
            student_name = prof[0].get("full_name") or prof[0].get("email")

    class_name = None
    if p.get("class_id"):
        cl = db.from_("classes").select("name").eq("id", p["class_id"]).execute().data or []
        if cl:
            class_name = cl[0].get("name")

    enrollment_number = None
    if p.get("class_id") and p.get("student_id"):
        cs = (
            db.from_("class_students").select("enrollment_number")
            .eq("class_id", p["class_id"]).eq("student_id", p["student_id"]).execute().data or []
        )
        if cs:
            enrollment_number = cs[0].get("enrollment_number")

    pdf_bytes = render_tuition_invoice_pdf(
        p, student_name or "—", class_name, enrollment_number, _period_label(p.get("period_month"))
    )
    filename = f"Facture_{p.get('reference') or str(p['id'])[:8]}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.patch("/payment/{payment_id}")
async def update_payment(
    payment_id: str,
    body: TuitionPaymentUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if "period_month" in updates:
        pm = _parse_month(updates["period_month"])
        if pm is None:
            raise HTTPException(400, "period_month invalide")
        updates["period_month"] = pm.isoformat()
    if "amount" in updates and updates["amount"] is not None and updates["amount"] < 0:
        raise HTTPException(400, "amount doit être >= 0")
    if not updates:
        raise HTTPException(400, "Aucun champ à mettre à jour")

    res = db.from_("tuition_payments").update(updates).eq("id", payment_id).execute()
    if not res.data:
        raise HTTPException(404, "Versement introuvable")

    # Le journal doit suivre : un montant corrigé ici sans l'être au journal
    # ferait dériver le solde de caisse.
    if "amount" in updates or "method" in updates:
        try:
            from routers.accounting_cash_journal import update_cash_entry
            update_cash_entry(
                db,
                source_type="tuition_payment", source_id=payment_id,
                amount=updates.get("amount"),
                payment_method=updates.get("method"),
            )
        except Exception:
            pass

    log_audit(db, user.id, "tuition_payment.update", "tuition_payment", payment_id, updates)
    return res.data[0]


def perform_payment_delete(db: Client, payment_id: str, user_id: str) -> Optional[str]:
    """Supprime réellement un versement — et le retire de la caisse.

    L'encaissement avait été porté au journal (caisse ou comptes, selon le mode)
    et, s'il s'agissait d'un chèque, inscrit au registre des règlements. Les deux
    sont défaits ici : sans cela le solde continuerait d'inclure un montant que
    l'école n'a pas encaissé. Le journal est nettoyé AVANT la ligne métier — si
    cela échoue, rien n'est supprimé, plutôt qu'un solde faux.

    Appelé UNIQUEMENT depuis l'approbation N+1 (routers/approvals.py) : la route
    DELETE ne fait que déposer la demande.
    """
    existing = (
        db.from_("tuition_payments").select("id, amount, method, reference")
        .eq("id", payment_id).execute().data
    )
    if not existing:
        # Déjà supprimé entre-temps : on ne bloque pas la validation, la demande
        # a simplement perdu son objet.
        raise HTTPException(404, "Versement introuvable — il a peut-être déjà été supprimé.")

    from routers.accounting_cash_journal import delete_cash_entry
    from routers.accounting_cheques import unregister_source
    removed = delete_cash_entry(db, source_type="tuition_payment", source_id=payment_id, user_id=user_id)
    unregister_source(db, source_type="tuition_payment", source_id=payment_id, user_id=user_id)

    db.from_("tuition_payments").delete().eq("id", payment_id).execute()
    log_audit(db, user_id, "tuition_payment.delete", "tuition_payment", payment_id, {
        "amount": existing[0].get("amount"),
        "method": existing[0].get("method"),
        "reference": existing[0].get("reference"),
        "journal_rows_removed": removed,
    })
    return payment_id


@router.delete("/payment/{payment_id}")
async def delete_payment(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Supprime un versement — sous validation N+1 pour qui n'est pas admin.

    Effacer un versement efface une recette : la ligne du journal disparaît, la
    pièce sort du registre, et la facture déjà remise à la famille n'a plus de
    contrepartie. L'opération est donc tracée dans `pending_operations` dans
    tous les cas.

    - **Admin** : la demande est validée d'office (il est le N+1) et exécutée
      immédiatement — l'opération est enregistrée « approuvée » pour l'historique.
    - **Caissier** : la demande reste en attente et un admin l'exécute.
    """
    if not (user.can_access_accounting_full() or user.is_cashier()):
        raise HTTPException(403, "Admin ou caissier uniquement")
    existing = (
        db.from_("tuition_payments")
        .select("id, amount, method, reference, period_month, class_id, student_id")
        .eq("id", payment_id).execute().data
    )
    if not existing:
        raise HTTPException(404, "Versement introuvable")
    p = existing[0]

    # Deux demandes sur la même pièce feraient rejouer la suppression une fois
    # la ligne partie : une seule à la fois.
    already = (
        db.from_("pending_operations").select("id")
        .eq("op_type", "tuition_payment_delete").eq("status", "pending")
        .eq("payload->>payment_id", payment_id).execute().data
    )
    if already:
        raise HTTPException(400, "Une demande de suppression est déjà en attente de validation pour ce versement.")

    row = {
        "op_type": "tuition_payment_delete",
        "payload": {
            "payment_id": payment_id,
            "amount": p.get("amount"),
            "method": p.get("method"),
            "reference": p.get("reference"),
            "period_month": p.get("period_month"),
        },
        "class_id": p.get("class_id"),
        "student_id": p.get("student_id"),
        "amount": p.get("amount"),
        "created_by": user.id,
    }

    # ── Admin : il EST le N+1, sa demande est validée d'office ─────────────
    # La ligne d'opération est quand même écrite, déjà approuvée : la
    # suppression d'une recette doit rester lisible dans l'historique.
    if user.can_access_accounting_full():
        now = datetime.now(timezone.utc).isoformat()
        db.from_("pending_operations").insert({
            **row, "status": "approved", "reviewed_by": user.id, "reviewed_at": now,
            "result_id": payment_id,
        }).execute()
        perform_payment_delete(db, payment_id, user.id)
        return {"ok": True, "auto_approved": True}

    op = db.from_("pending_operations").insert(row).execute()
    op_id = op.data[0]["id"] if op.data else None

    notify_users(
        db, [a for a in _admin_ids(db) if a != user.id],
        title="Suppression de versement à valider ⚠️",
        message="Un paiement de scolarité est proposé à la suppression et attend une seconde validation.",
        type="warning",
        link=f"/dashboard/accounting?tab=validations&focus={op_id}",
    )
    log_audit(db, user.id, "tuition_payment.delete_pending", "pending_operation", op_id,
              {"payment_id": payment_id, "amount": p.get("amount"), "reference": p.get("reference")})
    return {"pending": True}


@router.post("/payment/{payment_id}/receipt")
async def upload_payment_receipt(
    payment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "receipt",
):
    _require_admin(user)
    if kind not in {"receipt", "document"}:
        raise HTTPException(400, "kind invalide")

    payment = db.from_("tuition_payments").select("id").eq("id", payment_id).execute().data
    if not payment:
        raise HTTPException(404, "Versement introuvable")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{payment_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as exc:
        raise HTTPException(500, f"Échec du stockage du fichier: {str(exc)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": payment_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "receipt",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "tuition_payment.attachment.upload", "tuition_payment", payment_id,
              {"kind": kind, "file_name": file.filename})
    return new_attachment


@router.get("/payment/attachments/{attachment_id}/download")
async def download_payment_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments")
        .select("*")
        .eq("id", attachment_id)
        .eq("entity_type", ENTITY_TYPE)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Pièce jointe introuvable")
    signed = db.storage.from_(BUCKET).create_signed_url(rows[0]["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url"), "file_name": rows[0]["file_name"]}


@router.delete("/payment/attachments/{attachment_id}")
async def delete_payment_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments")
        .select("*")
        .eq("id", attachment_id)
        .eq("entity_type", ENTITY_TYPE)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Pièce jointe introuvable")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass
    db.from_("accounting_attachments").delete().eq("id", attachment_id).execute()
    log_audit(db, user.id, "tuition_payment.attachment.delete", "tuition_payment", rows[0]["entity_id"])
    return {"ok": True}


@router.get("/alerts")
async def list_alerts(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Élèves en retard de paiement, tous promos confondus (bandeau d'alertes)."""
    _require_read(user)
    today = datetime.now(timezone.utc).date()

    classes = db.from_("classes").select(
        "id, name, payment_start_month, installments_count, start_date, duration_months"
    ).execute().data or []
    class_map = {c["id"]: c for c in classes}
    memberships = db.from_("class_students").select(
        "class_id, student_id, advance, monthly_fee, annual_budget, enrollment_date, enrollment_status"
    ).execute().data or []
    payments = db.from_("tuition_payments").select("class_id, student_id, amount").execute().data or []

    paye_by = {}
    for p in payments:
        key = (p["class_id"], p["student_id"])
        paye_by[key] = paye_by.get(key, 0.0) + _num(p.get("amount"))

    late_rows = []
    montant_total = 0.0
    for m in memberships:
        c = class_map.get(m["class_id"])
        if not c:
            continue
        start, count = _class_schedule(c, today)
        paid_only = paye_by.get((m["class_id"], m["student_id"]), 0.0)
        comp = _compute(m, paid_only, start, count, today)
        if comp["alert"] == "retard":
            late_rows.append({
                "class_id": m["class_id"],
                "class_name": c["name"],
                "student_id": m["student_id"],
                "reste": comp["reste"],
                "late_amount": comp["late_amount"],
            })
            montant_total += comp["late_amount"]

    prof_map = _student_names(db, [r["student_id"] for r in late_rows])
    for r in late_rows:
        prof = prof_map.get(r["student_id"], {})
        r["full_name"] = prof.get("full_name") or prof.get("email") or "—"

    late_rows.sort(key=lambda r: r["late_amount"], reverse=True)
    return {"items": late_rows, "total": len(late_rows), "montant_total": round(montant_total, 2)}


def _compute_all_students(db: Client) -> list[dict]:
    """Calcule la situation de paiement de tous les élèves inscrits (toutes promos
    confondues). Partagé par l'endpoint /students et l'export Excel."""
    today = datetime.now(timezone.utc).date()
    today_fom = _fom(today)
    today_key = _month_key(today_fom)

    classes = db.from_("classes").select(
        "id, name, payment_start_month, installments_count, start_date, duration_months"
    ).execute().data or []
    class_map = {c["id"]: c for c in classes}

    _base_cols = ("class_id, student_id, advance, monthly_fee, annual_budget, "
                  "enrollment_number, enrollment_date, enrollment_status")
    try:
        memberships = db.from_("class_students").select(
            _base_cols + ", due_day, grace_days"
        ).execute().data or []
    except Exception:
        memberships = db.from_("class_students").select(_base_cols).execute().data or []

    payments = db.from_("tuition_payments").select(
        "class_id, student_id, period_month, amount, paid_on, created_at"
    ).execute().data or []

    paye_by: dict[tuple, float] = {}
    pay_month: dict[tuple, dict[str, list[tuple]]] = {}
    for p in payments:
        key = (p["class_id"], p["student_id"])
        paye_by[key] = paye_by.get(key, 0.0) + _num(p.get("amount"))
        pm = _parse_month(p.get("period_month"))
        if pm is not None:
            pay_month.setdefault(key, {}).setdefault(_month_key(pm), []).append((_eff_date(p), _num(p.get("amount"))))

    prof_map = _student_names(db, [m["student_id"] for m in memberships])

    out = []
    for m in memberships:
        c = class_map.get(m["class_id"])
        if not c:
            continue
        start, count = _class_schedule(c, today)
        key = (m["class_id"], m["student_id"])
        paid_only = paye_by.get(key, 0.0)
        comp = _compute(m, paid_only, start, count, today)

        status = m.get("enrollment_status") or "actif"
        monthly = _num(m.get("monthly_fee"))
        due_day = int(m.get("due_day") or 1)
        grace_days = int(m["grace_days"]) if m.get("grace_days") is not None else 9
        schedule_keys = [_month_key(_add_months(start, i)) for i in range(count)]
        schedule_set = set(schedule_keys)
        pm_map = pay_month.get(key, {})
        # Échéancier de l'élève ∪ mois effectivement payés, triés chronologiquement.
        student_keys = sorted(schedule_set | set(pm_map.keys()))

        late_behavior_count = 0
        month_states: dict[str, str] = {}   # mk → 'paid' | 'late' | 'missing' | 'future' | 'na'
        month_paid: dict[str, float] = {}    # mk → montant encaissé ce mois-là
        cum_paid = 0.0
        for mk in student_keys:
            plist = sorted(pm_map.get(mk, []), key=lambda x: (x[0] is None, x[0] or date.max))
            paid_here = round(sum(a for _, a in plist), 2)
            month_paid[mk] = paid_here
            cum_paid += paid_here
            in_sched = mk in schedule_set
            elapsed = sum(1 for sk in schedule_keys if sk <= mk and sk <= today_key)
            cum_expected = round(monthly * elapsed, 2)
            due = in_sched and (mk <= today_key) and status != "abandon"
            missing = due and (cum_expected - cum_paid) > _EPS

            paid_late = False
            if due and monthly > 0:
                period_fom = date(int(mk[:4]), int(mk[5:7]), 1)
                deadline = _deadline(period_fom, due_day, grace_days)
                cum = 0.0
                for d_eff, amt in plist:
                    cum += amt
                    if cum + _EPS >= monthly:
                        if d_eff is not None and d_eff > deadline:
                            paid_late = True
                            late_behavior_count += 1
                        break

            if missing:
                month_states[mk] = "missing"
            elif paid_late:
                month_states[mk] = "late"
            elif paid_here > _EPS or (in_sched and due):
                month_states[mk] = "paid"
            elif in_sched:  # échéance non encore due
                month_states[mk] = "future"
            else:
                month_states[mk] = "na"

        prof = prof_map.get(m["student_id"], {})
        out.append({
            "class_id": m["class_id"],
            "class_name": c["name"],
            "student_id": m["student_id"],
            "full_name": prof.get("full_name") or prof.get("email") or "—",
            "enrollment_number": m.get("enrollment_number"),
            "enrollment_status": status,
            "total_paye": comp["total_paye"],
            "reste": comp["reste"],
            "alert": comp["alert"],
            "late_amount": comp["late_amount"],
            "late_behavior_count": late_behavior_count,
            "month_states": month_states,
            "month_paid": month_paid,
        })
    out.sort(key=lambda r: (r["full_name"] or "").lower())
    return out


@router.get("/students")
async def list_all_students(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Tous les élèves inscrits, toutes promos confondues, avec leur statut de
    paiement calculé (à jour / rappel / retard / abandon), le total payé et le
    nombre de mois réglés en retard. Sert aux filtres globaux de la page d'accueil
    du suivi de scolarité."""
    _require_read(user)
    return {"items": _compute_all_students(db)}


_STATUS_LABELS = {
    "actif": "Actif", "abandon": "Abandon", "absent": "Absent",
    "suspendu": "Suspendu", "diplome": "Diplômé",
}
_ALERT_LABELS = {
    "a_jour": "À jour", "rappel": "Rappel", "retard": "En retard",
    "abandon": "Abandon",
}

# Code couleur (palette classique Excel Good/Neutral/Bad) partagé cellules + légende.
_MONTH_COLORS = {
    "paid":    {"bg": "C6EFCE", "fg": "006100"},   # payé / à jour
    "late":    {"bg": "FFEB9C", "fg": "9C6500"},   # payé en retard
    "missing": {"bg": "FFC7CE", "fg": "9C0006"},   # dû non réglé
    "future":  {"bg": "F2F4F4", "fg": "B3B6B7"},   # échéance à venir
    "na":      {"bg": "E5E7E9"},                    # hors échéancier
}
_ALERT_COLORS = {
    "a_jour": _MONTH_COLORS["paid"], "rappel": _MONTH_COLORS["late"],
    "retard": _MONTH_COLORS["missing"], "abandon": {"bg": "D5D8DC", "fg": "566573"},
}
_STATUS_COLORS = {
    "actif": _MONTH_COLORS["paid"], "diplome": {"bg": "AED6F1", "fg": "1B4F72"},
    "absent": _MONTH_COLORS["late"], "suspendu": {"bg": "D5D8DC", "fg": "566573"},
    "abandon": _MONTH_COLORS["missing"],
}


def _fmt_month_amount(amount: float) -> str:
    """Montant encaissé un mois donné, en entier avec séparateur d'espace ; vide si nul."""
    if not amount or amount <= _EPS:
        return ""
    return f"{int(round(amount)):,}".replace(",", " ")


@router.get("/students/export/xlsx")
async def export_students_xlsx(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Export Excel « Paiements Étudiants » — situation de chaque élève (classe,
    N° d'inscription, statut, total payé, reste, retard) + grille mensuelle
    colorée (payé / en retard / impayé / à venir) avec légende."""
    _require_read(user)
    students = _compute_all_students(db)

    # Colonnes de mois : union chronologique des échéanciers de tous les élèves.
    month_keys = sorted({mk for s in students for mk in (s.get("month_states") or {})})

    rows = [
        {
            "class_name": s.get("class_name"),
            "full_name": s.get("full_name"),
            "enrollment_number": s.get("enrollment_number") or "",
            "enrollment_status": _STATUS_LABELS.get(s.get("enrollment_status"), s.get("enrollment_status")),
            "alert": _ALERT_LABELS.get(s.get("alert"), s.get("alert")),
            "total_paye": s.get("total_paye"),
            "reste": s.get("reste"),
            "late_amount": s.get("late_amount"),
            "_status": s.get("enrollment_status"),
            "_alert": s.get("alert"),
            "month_states": s.get("month_states") or {},
            **{mk: _fmt_month_amount((s.get("month_paid") or {}).get(mk, 0.0)) for mk in month_keys},
        }
        for s in students
    ]

    def _month_style(mk):
        def f(_val, row):
            return _MONTH_COLORS.get((row.get("month_states") or {}).get(mk, "na"))
        return f

    columns = [
        {"key": "class_name", "label": "Filière / Promo", "width": 26},
        {"key": "full_name", "label": "Nom et prénom", "width": 24},
        {"key": "enrollment_number", "label": "N° d'inscription", "width": 15, "align": "center"},
        {"key": "enrollment_status", "label": "Statut", "width": 12, "align": "center",
         "style": lambda _v, row: _STATUS_COLORS.get(row.get("_status"))},
        {"key": "alert", "label": "Situation", "width": 12, "align": "center",
         "style": lambda _v, row: _ALERT_COLORS.get(row.get("_alert"))},
        {"key": "total_paye", "label": "Total payé", "type": "money", "width": 15},
        {"key": "reste", "label": "Reste à payer", "type": "money", "width": 15},
        {"key": "late_amount", "label": "Dont en retard", "type": "money", "width": 15},
    ]
    for mk in month_keys:
        label = _month_label(date(int(mk[:4]), int(mk[5:7]), 1))
        columns.append({"key": mk, "label": label, "width": 11, "align": "center",
                        "style": _month_style(mk)})

    legend = [
        {"bg": _MONTH_COLORS["paid"]["bg"], "fg": _MONTH_COLORS["paid"]["fg"], "sample": "✓", "label": "Mois payé (à jour)"},
        {"bg": _MONTH_COLORS["late"]["bg"], "fg": _MONTH_COLORS["late"]["fg"], "sample": "!", "label": "Mois payé en retard"},
        {"bg": _MONTH_COLORS["missing"]["bg"], "fg": _MONTH_COLORS["missing"]["fg"], "sample": "×", "label": "Mois dû non réglé (impayé)"},
        {"bg": _MONTH_COLORS["future"]["bg"], "fg": _MONTH_COLORS["future"]["fg"], "sample": "·", "label": "Échéance à venir (non due)"},
        {"bg": _MONTH_COLORS["na"]["bg"], "label": "Hors échéancier de l'élève"},
        {"bg": _STATUS_COLORS["diplome"]["bg"], "fg": _STATUS_COLORS["diplome"]["fg"], "label": "Statut : diplômé"},
    ]

    today = datetime.now(timezone.utc).date()
    return make_xlsx(
        filename=f"Paiements_etudiants_{today.isoformat()}.xlsx",
        title="PAIEMENTS ÉTUDIANTS IPISB",
        subtitle=f"Situation au {today.strftime('%d/%m/%Y')} — {len(rows)} élève(s) — montants mensuels en MAD",
        theme="blue",
        sheet_name="Paiements étudiants",
        columns=columns,
        rows=rows,
        legend=legend,
    )


@router.get("/search")
async def search_students(
    q: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Recherche d'un élève par nom ou numéro d'inscription, tous promos confondus.
    Renvoie l'élève, son numéro d'inscription et la promo à laquelle il est inscrit
    (pour naviguer directement vers sa promo)."""
    _require_read(user)
    term = (q or "").strip()
    if len(term) < 2:
        return {"items": []}
    lterm = term.lower()
    # Wildcard PostgREST dans un filtre .or_() : c'est « * » (et non « % » comme en SQL).
    # Les virgules casseraient la syntaxe du .or_() : on les neutralise.
    pat = f"*{term.replace(',', ' ')}*"

    # Élèves dont le nom ou l'e-mail correspond
    name_hits = (
        db.from_("profiles").select("id")
        .or_(f"full_name.ilike.{pat},email.ilike.{pat}")
        .execute().data or []
    )
    name_ids = {p["id"] for p in name_hits}

    memberships = db.from_("class_students").select(
        "class_id, student_id, enrollment_number, enrollment_status"
    ).execute().data or []

    matched = [
        m for m in memberships
        if m["student_id"] in name_ids
        or (m.get("enrollment_number") and lterm in str(m["enrollment_number"]).lower())
    ][:50]

    classes = db.from_("classes").select("id, name").execute().data or []
    class_map = {c["id"]: c["name"] for c in classes}
    prof_map = _student_names(db, [m["student_id"] for m in matched])

    items = []
    for m in matched:
        prof = prof_map.get(m["student_id"], {})
        items.append({
            "class_id": m["class_id"],
            "class_name": class_map.get(m["class_id"], "—"),
            "student_id": m["student_id"],
            "full_name": prof.get("full_name") or prof.get("email") or "—",
            "enrollment_number": m.get("enrollment_number"),
            "enrollment_status": m.get("enrollment_status") or "actif",
        })
    items.sort(key=lambda r: (r["full_name"] or "").lower())
    return {"items": items}
