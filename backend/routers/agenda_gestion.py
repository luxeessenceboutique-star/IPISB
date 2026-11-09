"""Agenda de gestion — RH, Comptabilité et Tâches réunis dans une seule vue
d'échéances, avec relance possible à la demande (voir aussi la boucle
périodique dans main.py, qui appelle utils.reminders.scan_and_notify)."""
import logging
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from deps import CurrentUser, get_current_user, get_db
from utils.reminders import compute_agenda_items, scan_and_notify

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agenda-gestion", tags=["agenda-gestion"])


def _require_admin(user: CurrentUser) -> None:
    if not (user.is_admin() or user.is_rh() or user.is_assistant_rh() or user.is_comptabilite()):
        raise HTTPException(403, "Admin, RH ou Comptabilité uniquement")


@router.get("/overview")
async def get_overview(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    items = compute_agenda_items(db)
    # Chaque catégorie de responsable ne voit que ce qui la concerne, sauf
    # l'admin qui voit tout — évite d'exposer les échéances RH à comptabilite
    # et inversement.
    if not user.is_admin():
        allowed_domains = set()
        if user.is_rh() or user.is_assistant_rh():
            allowed_domains.add("rh")
        if user.is_comptabilite():
            allowed_domains.add("comptabilite")
        items = [i for i in items if i.get("domain") in allowed_domains or i.get("category") == "task"]
    return {"items": items, "count": len(items)}


def _d(v) -> Optional[date]:
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _q(fn):
    """Source d'événements indisponible (migration manquante…) → on l'ignore
    plutôt que de faire échouer tout le calendrier."""
    try:
        return fn() or []
    except Exception:
        log.warning("Calendrier — source indisponible", exc_info=True)
        return []


@router.get("/calendar")
async def get_calendar(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    start: date,
    end: date,
):
    """Tous les événements datés de [start, end] (inclus) pour la vue
    calendrier : TOUTES les tâches ayant une échéance (quel que soit leur
    statut), congés, fins de contrat et d'essai. `undated_tasks` liste les
    tâches ouvertes sans échéance pour qu'aucune tâche ne disparaisse."""
    _require_admin(user)
    if end < start or (end - start).days > 120:
        raise HTTPException(400, "Plage de dates invalide (120 jours max).")
    s, e = start.isoformat(), end.isoformat()
    show_rh = user.is_admin() or user.is_rh() or user.is_assistant_rh()
    events: list[dict] = []

    tasks = _q(lambda: db.from_("tasks")
               .select("id, title, status, priority, domain, assignee_ids, due_date")
               .gte("due_date", s).lte("due_date", e).execute().data)
    undated = _q(lambda: db.from_("tasks")
                 .select("id, title, status, priority, domain, assignee_ids, due_date")
                 .is_("due_date", "null").not_.in_("status", ["done", "cancelled"]).execute().data)

    leaves = _q(lambda: db.from_("leave_requests")
                .select("id, employee_id, type, start_date, end_date, status")
                .in_("status", ["pending", "approved"]).lte("start_date", e).gte("end_date", s)
                .execute().data) if show_rh else []
    contracts = _q(lambda: db.from_("employees").select("id, full_name, contract_end")
                   .gte("contract_end", s).lte("contract_end", e).eq("status", "active").execute().data) if show_rh else []
    probation = _q(lambda: db.from_("employees").select("id, full_name, probation_end_date")
                   .gte("probation_end_date", s).lte("probation_end_date", e)
                   .eq("probation_status", "in_progress").execute().data) if show_rh else []

    uids = {u for t in [*tasks, *undated] for u in (t.get("assignee_ids") or [])}
    names: dict[str, str] = {}
    if uids:
        for p in _q(lambda: db.from_("profiles").select("id, full_name, email").in_("id", list(uids)).execute().data):
            names[p["id"]] = p.get("full_name") or p.get("email") or "—"
    emp_ids = list({l["employee_id"] for l in leaves if l.get("employee_id")})
    emp_names: dict[str, str] = {}
    if emp_ids:
        for p in _q(lambda: db.from_("employees").select("id, full_name").in_("id", emp_ids).execute().data):
            emp_names[p["id"]] = p.get("full_name") or "—"

    def task_ev(t: dict) -> dict:
        return {
            "id": f"task-{t['id']}", "kind": "task", "title": t["title"],
            "start": t.get("due_date"), "end": t.get("due_date"),
            "status": t["status"], "priority": t["priority"], "domain": t.get("domain"),
            "people": [names.get(u, "—") for u in (t.get("assignee_ids") or [])],
            "link": f"/dashboard/tasks?focus={t['id']}",
        }

    events += [task_ev(t) for t in tasks]
    for lv in leaves:
        events.append({
            "id": f"leave-{lv['id']}", "kind": "leave", "title": f"Congé — {emp_names.get(lv.get('employee_id'), '—')}",
            "start": lv["start_date"], "end": lv["end_date"], "status": lv["status"],
            "link": f"/dashboard/rh?tab=leaves&focus={lv['id']}",
        })
    for c in contracts:
        events.append({"id": f"contract-{c['id']}", "kind": "contract", "title": f"Fin de contrat — {c.get('full_name') or '—'}",
                       "start": c["contract_end"], "end": c["contract_end"], "link": f"/dashboard/rh/employees/{c['id']}?tab=profil"})
    for c in probation:
        events.append({"id": f"probation-{c['id']}", "kind": "probation", "title": f"Fin d'essai — {c.get('full_name') or '—'}",
                       "start": c["probation_end_date"], "end": c["probation_end_date"], "link": f"/dashboard/rh/employees/{c['id']}?tab=profil"})

    # Comptabilité : opérations en attente de décision depuis trop longtemps,
    # placées à leur date de création (elles n'ont pas d'échéance propre).
    if user.is_admin() or user.is_comptabilite():
        for i, it in enumerate(i for i in _q(lambda: compute_agenda_items(db)) if i.get("category") == "accounting_approval"):
            day = _d(it.get("due_date"))
            if day and start <= day <= end:
                events.append({"id": f"approval-{i}-{day}", "kind": "approval", "title": it["title"],
                               "start": day.isoformat(), "end": day.isoformat(), "status": "pending", "link": it["link"]})

    return {"events": events, "undated_tasks": [task_ev(t) for t in undated]}


@router.post("/scan-now")
async def scan_now(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Déclenche immédiatement le même passage de relance que la boucle
    périodique — utile pour tester ou forcer un rappel sans attendre."""
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    result = await scan_and_notify(db)
    return result
