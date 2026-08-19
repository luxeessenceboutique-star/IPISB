import csv
import io
from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ClassTuitionUpdate, TrainerRateUpdate
from utils.audit import log_audit
from utils.pdf_generators import render_accounting_report_pdf

router = APIRouter(prefix="/accounting/analytics", tags=["accounting"])


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _num(v) -> float:
    return float(v or 0)


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _period_range(period: str, date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date, str]:
    """Resolve the [from, to] date window used to count teaching hours.
    Explicit date_from/date_to win; otherwise derive from a named period."""
    if date_from and date_to:
        return date.fromisoformat(date_from), date.fromisoformat(date_to), "personnalisée"

    now = datetime.now(timezone.utc)
    y = now.year
    if period == "month":
        start = date(y, now.month, 1)
        end = date(y + 1, 1, 1) - timedelta(days=1) if now.month == 12 else date(y, now.month + 1, 1) - timedelta(days=1)
        return start, end, "Ce mois"
    if period == "quarter":
        q_start_month = ((now.month - 1) // 3) * 3 + 1
        start = date(y, q_start_month, 1)
        end_month = q_start_month + 3
        end = date(y + 1, 1, 1) - timedelta(days=1) if end_month > 12 else date(y, end_month, 1) - timedelta(days=1)
        return start, end, "Ce trimestre"
    # default: full current year
    return date(y, 1, 1), date(y, 12, 31), "Cette année"


def _weekday_occurrences(d_from: date, d_to: date, weekday: int) -> int:
    """How many times a given weekday (0=Mon..6=Sun) falls within [d_from, d_to]."""
    if d_to < d_from:
        return 0
    delta = (weekday - d_from.weekday()) % 7
    first = d_from + timedelta(days=delta)
    if first > d_to:
        return 0
    return (d_to - first).days // 7 + 1


def _schedule_hours(sched: dict, d_from: date, d_to: date) -> float:
    """Teaching hours a schedule contributes to the analysis window.
    'once' → counted once if its date is in range; 'weekly' → duration × number
    of matching weekdays in the window (institute timetable repeats indefinitely)."""
    try:
        start = _parse_dt(sched["start_time"])
        end = _parse_dt(sched["end_time"])
    except (KeyError, ValueError, TypeError):
        return 0.0
    duration = (end - start).total_seconds() / 3600.0
    if duration <= 0:
        return 0.0
    if sched.get("recurrence") == "weekly":
        return duration * _weekday_occurrences(d_from, d_to, start.weekday())
    # 'once'
    return duration if d_from <= start.date() <= d_to else 0.0


@router.get("/formation")
async def formation_analytics(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    period: str = "year",              # 'month' | 'quarter' | 'year'
    date_from: Optional[str] = None,   # ISO date, overrides period
    date_to: Optional[str] = None,
    indirect_total: float = 0,         # charges indirectes de la période (DH), réparties à l'heure
):
    """Pilotage formation : CA facturable / encaissé / encours + coût de revient
    formateurs (charges directes + quote-part de charges indirectes), agrégés par
    promo (classe) et par formateur, sur une période choisie."""
    _require_admin(user)

    d_from, d_to, period_label = _period_range(period, date_from, date_to)
    indirect_total = max(0.0, _num(indirect_total))

    classes = db.from_("classes").select("id, name, tuition_per_student").order("name").execute().data or []
    memberships = db.from_("class_students").select("class_id, student_id, tuition_amount").execute().data or []
    inv_rows = db.from_("invoices").select("class_id, student_id, total_incl_vat, payment_status").execute().data or []
    schedules = db.from_("schedules").select("class_id, professor_id, start_time, end_time, recurrence").execute().data or []
    rates_rows = db.from_("trainer_rates").select("user_id, hourly_rate, social_charge_percent").execute().data or []
    prof_role_rows = db.from_("user_roles").select("user_id").eq("role", "professor").execute().data or []

    rate_map = {r["user_id"]: _num(r["hourly_rate"]) for r in rates_rows}
    social_map = {r["user_id"]: _num(r.get("social_charge_percent")) for r in rates_rows}
    class_name = {c["id"]: c["name"] for c in classes}

    # Profiles for every professor we might name (schedules + declared professors)
    prof_ids = {s["professor_id"] for s in schedules if s.get("professor_id")}
    prof_ids |= {r["user_id"] for r in prof_role_rows}
    prof_ids |= set(rate_map.keys())
    prof_ids.discard(None)
    prof_map: dict[str, dict] = {}
    if prof_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", list(prof_ids)).execute().data or []
        prof_map = {p["id"]: p for p in profs}

    # ── CA facturable & nb élèves par classe ──────────────────────────────────
    default_tuition = {c["id"]: _num(c["tuition_per_student"]) for c in classes}
    ca_by_class: dict[str, float] = {c["id"]: 0.0 for c in classes}
    nb_students: dict[str, int] = {c["id"]: 0 for c in classes}
    for m in memberships:
        cid = m["class_id"]
        if cid not in ca_by_class:
            continue
        nb_students[cid] += 1
        amt = m["tuition_amount"]
        ca_by_class[cid] += _num(amt) if amt is not None else default_tuition.get(cid, 0.0)

    # ── Encaissé / encours par classe (factures rattachées) ───────────────────
    # La facture est la source : 'paid' => encaissé ; 'pending'/'partially_paid' => encours.
    encaisse_by_class: dict[str, float] = {}
    encours_by_class: dict[str, float] = {}
    for inv in inv_rows:
        cid = inv.get("class_id")
        if not cid:
            continue
        amt = _num(inv.get("total_incl_vat"))
        if inv.get("payment_status") == "paid":
            encaisse_by_class[cid] = encaisse_by_class.get(cid, 0.0) + amt
        else:
            encours_by_class[cid] = encours_by_class.get(cid, 0.0) + amt

    # ── Heures + coût DIRECT (rémunération + charges sociales) ────────────────
    # First pass: hours per schedule → aggregate hours (for indirect allocation)
    # and direct cost per class / per trainer.
    class_hours: dict[str, float] = {c["id"]: 0.0 for c in classes}
    class_direct: dict[str, float] = {c["id"]: 0.0 for c in classes}
    trainer_hours: dict[str, float] = {}
    trainer_remun: dict[str, float] = {}
    trainer_direct: dict[str, float] = {}
    trainer_by_class: dict[str, dict[str, float]] = {}  # pid -> {class_id: hours}
    total_hours = 0.0
    for s in schedules:
        hours = _schedule_hours(s, d_from, d_to)
        if hours <= 0:
            continue
        total_hours += hours
        pid = s.get("professor_id")
        cid = s.get("class_id")
        rate = rate_map.get(pid, 0.0) if pid else 0.0
        social_pct = social_map.get(pid, 0.0) if pid else 0.0
        remun = rate * hours
        direct = remun * (1 + social_pct / 100.0)
        if cid in class_hours:
            class_hours[cid] += hours
            class_direct[cid] += direct
        if pid:
            trainer_hours[pid] = trainer_hours.get(pid, 0.0) + hours
            trainer_remun[pid] = trainer_remun.get(pid, 0.0) + remun
            trainer_direct[pid] = trainer_direct.get(pid, 0.0) + direct
            if cid:
                trainer_by_class.setdefault(pid, {})
                trainer_by_class[pid][cid] = trainer_by_class[pid].get(cid, 0.0) + hours

    # Taux horaire de charges indirectes = pot commun ÷ total heures enseignées
    indirect_rate = (indirect_total / total_hours) if total_hours > 0 else 0.0

    # ── Assemble sessions ─────────────────────────────────────────────────────
    sessions = []
    for c in classes:
        cid = c["id"]
        ca = round(ca_by_class.get(cid, 0.0), 2)
        enc = round(encaisse_by_class.get(cid, 0.0), 2)
        encours = round(encours_by_class.get(cid, 0.0), 2)
        cout_direct = round(class_direct.get(cid, 0.0), 2)
        cout_indirect = round(indirect_rate * class_hours.get(cid, 0.0), 2)
        cout = round(cout_direct + cout_indirect, 2)
        sessions.append({
            "class_id": cid,
            "class_name": c["name"],
            "tuition_per_student": _num(c["tuition_per_student"]),
            "nb_students": nb_students.get(cid, 0),
            "ca_facturable": ca,
            "encaisse": enc,
            "encours": encours,
            "cout_direct": cout_direct,
            "cout_indirect": cout_indirect,
            "cout_formateurs": cout,
            "marge": round(enc - cout, 2),
        })
    sessions.sort(key=lambda x: x["ca_facturable"], reverse=True)

    # ── Assemble trainers (tous les professeurs, même à 0h) ───────────────────
    trainers = []
    for pid in prof_ids:
        prof = prof_map.get(pid, {})
        hrs = trainer_hours.get(pid, 0.0)
        remun = round(trainer_remun.get(pid, 0.0), 2)
        direct = round(trainer_direct.get(pid, 0.0), 2)
        indirect = round(indirect_rate * hrs, 2)
        cost = round(direct + indirect, 2)
        by_class = [
            {"class_id": k, "class_name": class_name.get(k, "—"), "hours": round(v, 2)}
            for k, v in sorted(trainer_by_class.get(pid, {}).items(), key=lambda kv: kv[1], reverse=True)
        ]
        trainers.append({
            "user_id": pid,
            "full_name": prof.get("full_name") or prof.get("email") or "—",
            "email": prof.get("email"),
            "hourly_rate": rate_map.get(pid, 0.0),
            "social_charge_percent": social_map.get(pid, 0.0),
            "hours": round(hrs, 2),
            "remuneration": remun,
            "cout_direct": direct,
            "cout_indirect": indirect,
            "cout_revient": cost,
            "cout_horaire_reel": round(cost / hrs, 2) if hrs > 0 else 0.0,
            "by_class": by_class,
        })
    trainers.sort(key=lambda x: (x["cout_revient"], x["hours"]), reverse=True)

    totals = {
        "ca_facturable": round(sum(s["ca_facturable"] for s in sessions), 2),
        "encaisse": round(sum(s["encaisse"] for s in sessions), 2),
        "encours": round(sum(s["encours"] for s in sessions), 2),
        "cout_direct": round(sum(s["cout_direct"] for s in sessions), 2),
        "cout_indirect": round(sum(s["cout_indirect"] for s in sessions), 2),
        "cout_formateurs": round(sum(s["cout_formateurs"] for s in sessions), 2),
        "marge": round(sum(s["marge"] for s in sessions), 2),
    }

    return {
        "period": {"from": d_from.isoformat(), "to": d_to.isoformat(), "label": period_label},
        "indirect_total": round(indirect_total, 2),
        "indirect_rate": round(indirect_rate, 2),
        "total_hours": round(total_hours, 2),
        "sessions": sessions,
        "trainers": trainers,
        "totals": totals,
    }


@router.get("/class/{class_id}/students")
async def class_student_detail(
    class_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Détail d'une promo : élèves inscrits + factures rattachées et leur état.
    Lecture seule — l'affectation des factures se fait dans l'onglet Factures."""
    _require_admin(user)

    cls = db.from_("classes").select("id, name, tuition_per_student").eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    default_tuition = _num(cls[0]["tuition_per_student"])

    memberships = (
        db.from_("class_students").select("student_id, tuition_amount")
        .eq("class_id", class_id).execute().data or []
    )
    invoices = (
        db.from_("invoices")
        .select("id, invoice_number, invoice_date, due_date, total_incl_vat, payment_status, student_id")
        .eq("class_id", class_id).execute().data or []
    )

    # Profils des élèves (inscrits + éventuels élèves facturés hors liste)
    student_ids = {m["student_id"] for m in memberships}
    student_ids |= {i["student_id"] for i in invoices if i.get("student_id")}
    student_ids.discard(None)
    prof_map: dict[str, dict] = {}
    if student_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", list(student_ids)).execute().data or []
        prof_map = {p["id"]: p for p in profs}

    # Factures groupées par élève
    inv_by_student: dict[str, list] = {}
    unassigned: list = []
    for i in invoices:
        row = {
            "id": i["id"],
            "invoice_number": i["invoice_number"],
            "invoice_date": i.get("invoice_date"),
            "due_date": i.get("due_date"),
            "total_incl_vat": _num(i.get("total_incl_vat")),
            "payment_status": i.get("payment_status"),
        }
        sid = i.get("student_id")
        if sid:
            inv_by_student.setdefault(sid, []).append(row)
        else:
            unassigned.append(row)

    def _summarize(inv_list: list) -> tuple[float, float, float]:
        facture_total = round(sum(x["total_incl_vat"] for x in inv_list), 2)
        paye = round(sum(x["total_incl_vat"] for x in inv_list if x["payment_status"] == "paid"), 2)
        return facture_total, paye, round(facture_total - paye, 2)

    tuition_override = {m["student_id"]: m.get("tuition_amount") for m in memberships}
    students = []
    for sid in sorted(tuition_override.keys(), key=lambda s: (prof_map.get(s, {}).get("full_name") or "").lower()):
        prof = prof_map.get(sid, {})
        inv_list = inv_by_student.get(sid, [])
        ft, paye, reste = _summarize(inv_list)
        ov = tuition_override.get(sid)
        students.append({
            "student_id": sid,
            "full_name": prof.get("full_name") or prof.get("email") or "—",
            "email": prof.get("email"),
            "tuition": _num(ov) if ov is not None else default_tuition,
            "invoices": inv_list,
            "facture_total": ft,
            "paye": paye,
            "encours": reste,
        })

    # Factures rattachées à la classe mais à un élève non inscrit (edge case)
    for sid, inv_list in inv_by_student.items():
        if sid in tuition_override:
            continue
        prof = prof_map.get(sid, {})
        ft, paye, reste = _summarize(inv_list)
        students.append({
            "student_id": sid,
            "full_name": (prof.get("full_name") or prof.get("email") or "—") + " (non inscrit)",
            "email": prof.get("email"),
            "tuition": 0.0,
            "invoices": inv_list,
            "facture_total": ft,
            "paye": paye,
            "encours": reste,
        })

    uf, up, ur = _summarize(unassigned)
    return {
        "class_id": class_id,
        "class_name": cls[0]["name"],
        "students": students,
        "unassigned": {"invoices": unassigned, "facture_total": uf, "paye": up, "encours": ur},
    }


@router.put("/class/{class_id}/tuition")
async def set_class_tuition(
    class_id: str,
    body: ClassTuitionUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Frais de scolarité par élève d'une promo (base du CA facturable)."""
    _require_admin(user)
    if body.tuition_per_student < 0:
        raise HTTPException(400, "tuition_per_student must be >= 0")
    res = db.from_("classes").update({"tuition_per_student": body.tuition_per_student}).eq("id", class_id).execute()
    if not res.data:
        raise HTTPException(404, "Classe introuvable")
    log_audit(db, user.id, "class.tuition.update", "class", class_id, {"tuition_per_student": body.tuition_per_student})
    return {"ok": True, "class_id": class_id, "tuition_per_student": body.tuition_per_student}


@router.put("/trainer/{user_id}/rate")
async def set_trainer_rate(
    user_id: str,
    body: TrainerRateUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Tarif horaire + % de charges sociales d'un formateur (base du coût de revient)."""
    _require_admin(user)
    if body.hourly_rate < 0 or body.social_charge_percent < 0:
        raise HTTPException(400, "Values must be >= 0")
    db.from_("trainer_rates").upsert({
        "user_id": user_id,
        "hourly_rate": body.hourly_rate,
        "social_charge_percent": body.social_charge_percent,
        "currency": body.currency,
        "updated_by": user.id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    log_audit(db, user.id, "trainer.rate.update", "trainer", user_id,
              {"hourly_rate": body.hourly_rate, "social_charge_percent": body.social_charge_percent})
    return {"ok": True, "user_id": user_id, "hourly_rate": body.hourly_rate,
            "social_charge_percent": body.social_charge_percent, "currency": body.currency}


@router.get("/report/pdf")
async def export_report_pdf(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # Import dashboard summary directly
    from routers.accounting_dashboard import dashboard_summary
    summary = await dashboard_summary(user, db)
    
    pdf_bytes = render_accounting_report_pdf(summary)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=Rapport_Synthese_Comptable.pdf"
        }
    )


@router.get("/export/csv")
async def export_csv(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    
    # Fetch purchases
    purchases = db.from_("purchases").select("purchase_number, title, total_incl_vat, purchase_date, payment_status").execute().data or []
    # Fetch expenses
    expenses = db.from_("expenses").select("title, amount, expense_date").execute().data or []
    # Fetch revenues
    revenues = db.from_("revenues").select("title, total_incl_vat, revenue_date, status").execute().data or []
    
    output = io.StringIO()
    # UTF-8 BOM for Excel compatibility
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    
    # Section Purchases
    writer.writerow(["--- ACHATS ---"])
    writer.writerow(["Numero", "Titre", "Montant TTC", "Date", "Statut Paiement"])
    for p in purchases:
        writer.writerow([p.get("purchase_number"), p.get("title"), p.get("total_incl_vat"), p.get("purchase_date"), p.get("payment_status")])
        
    writer.writerow([])
    
    # Section Expenses
    writer.writerow(["--- DEPENSES ---"])
    writer.writerow(["Titre", "Montant", "Date"])
    for e in expenses:
        writer.writerow([e.get("title"), e.get("amount"), e.get("expense_date")])
        
    writer.writerow([])
    
    # Section Revenues
    writer.writerow(["--- RECETTES ---"])
    writer.writerow(["Titre", "Montant TTC", "Date", "Statut"])
    for r in revenues:
        writer.writerow([r.get("title"), r.get("total_incl_vat"), r.get("revenue_date"), r.get("status")])
        
    output.seek(0)
    
    # We return StreamingResponse so the client receives the file directly
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=synthese_financiere.csv"
        }
    )

