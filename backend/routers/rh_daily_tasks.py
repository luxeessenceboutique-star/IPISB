import calendar
from datetime import datetime, timezone, date
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import DailyTaskCreate, DailyTaskUpdate, DailyTaskValidate, DAILY_TASK_STATUSES
from utils.audit import log_audit

router = APIRouter(prefix="/rh/daily-tasks", tags=["rh"])

# Barème /20 — au-dessous, pas de prime de rendement suggérée ; entre le
# seuil et la note max, la suggestion croît linéairement jusqu'au plafond
# (% du salaire de base). Purement indicatif : l'admin ajuste librement
# via bonus_decided avant application sur la fiche de paie.
BONUS_NOTE_THRESHOLD = 12.0
BONUS_MAX_PERCENT_OF_SALARY = 0.10


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


def _suggest_bonus(avg_note: Optional[float], base_salary: float) -> float:
    if avg_note is None or avg_note < BONUS_NOTE_THRESHOLD or base_salary <= 0:
        return 0.0
    ratio = (avg_note - BONUS_NOTE_THRESHOLD) / (20 - BONUS_NOTE_THRESHOLD)
    return round(base_salary * BONUS_MAX_PERCENT_OF_SALARY * ratio, 2)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _employee_ids_for(db: Client, department: Optional[str], position: Optional[str]) -> Optional[list[str]]:
    """Résout les employee_id correspondant aux filtres service/poste — daily_tasks
    ne porte pas ces colonnes (elles vivent sur employees)."""
    if not department and not position:
        return None
    query = db.from_("employees").select("id")
    if department:
        query = query.eq("department", department)
    if position:
        query = query.eq("position", position)
    rows = query.execute().data or []
    return [r["id"] for r in rows]


@router.get("")
async def list_daily_tasks(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: Optional[str] = None,
    heading_id: Optional[str] = None,
    department: Optional[str] = None,
    position: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(200, page_size))

    query = db.from_("daily_tasks").select("*, employees(full_name, department, position)", count="exact")
    if employee_id:
        query = query.eq("employee_id", employee_id)
    else:
        ids = _employee_ids_for(db, department, position)
        if ids is not None:
            if not ids:
                return {"items": [], "total": 0, "page": page, "page_size": page_size}
            query = query.in_("employee_id", ids)
    if heading_id:
        query = query.eq("heading_id", heading_id)
    if status:
        if status not in DAILY_TASK_STATUSES:
            raise HTTPException(400, "Invalid status")
        query = query.eq("status", status)
    if date_from:
        query = query.gte("task_date", date_from)
    if date_to:
        query = query.lte("task_date", date_to)

    start = (page - 1) * page_size
    res = query.order("task_date", desc=True).order("created_at", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for row in res.data or []:
        emp = row.get("employees") or {}
        items.append({
            **{k: v for k, v in row.items() if k != "employees"},
            "employee_name": emp.get("full_name"),
            "department": emp.get("department"),
            "position": emp.get("position"),
        })
    return {"items": items, "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("")
async def create_daily_task(
    body: DailyTaskCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    emp = db.from_("employees").select("id").eq("id", body.employee_id).execute().data
    if not emp:
        raise HTTPException(404, "Employé introuvable")

    coefficient = body.coefficient
    if coefficient is None:
        coefficient = 1.0
        if body.heading_id:
            h = db.from_("job_description_headings").select("coefficient").eq("id", body.heading_id).execute().data
            if not h:
                raise HTTPException(404, "Rubrique de fiche de poste introuvable")
            coefficient = float(h[0]["coefficient"])
    elif coefficient <= 0:
        raise HTTPException(400, "Le coefficient doit être positif")

    data = body.model_dump(exclude={"coefficient", "task_date"})
    data["coefficient"] = coefficient
    data["task_date"] = body.task_date or date.today().isoformat()
    data["created_by"] = user.id

    res = db.from_("daily_tasks").insert(data).execute()
    task = res.data[0]
    log_audit(db, user.id, "daily_task.create", "daily_task", task["id"], {"employee_id": body.employee_id})
    return task


@router.patch("/{task_id}")
async def update_daily_task(
    task_id: str,
    body: DailyTaskUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Le salarié corrige une tâche encore non validée. Si elle avait été
    retournée par le responsable, la correction la repasse en 'submitted'
    (le commentaire du responsable reste visible comme historique jusqu'à
    la prochaine décision)."""
    _require_admin(user)
    existing = db.from_("daily_tasks").select("status").eq("id", task_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    if existing[0]["status"] == "validated":
        raise HTTPException(400, "Tâche déjà validée — verrouillée.")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    if existing[0]["status"] == "returned":
        updates.update({"status": "submitted", "note": None, "validated_by": None, "validated_at": None})

    res = db.from_("daily_tasks").update(updates).eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "daily_task.update", "daily_task", task_id, updates)
    return res.data[0]


@router.post("/{task_id}/validate")
async def validate_daily_task(
    task_id: str,
    body: DailyTaskValidate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Le responsable valide (note + commentaire) ou retourne (commentaire
    obligatoire) une tâche soumise par le salarié."""
    _require_admin(user)
    existing = db.from_("daily_tasks").select("status").eq("id", task_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    if existing[0]["status"] != "submitted":
        raise HTTPException(400, "Seule une tâche soumise peut être validée ou retournée.")
    if body.decision not in ("validate", "return"):
        raise HTTPException(400, "decision doit être 'validate' ou 'return'")
    if not body.manager_comment or not body.manager_comment.strip():
        raise HTTPException(400, "Un commentaire est requis.")

    updates: dict = {
        "manager_comment": body.manager_comment.strip(),
        "validated_by": user.id,
        "validated_at": _now(),
    }
    if body.decision == "validate":
        if body.note is None or not (0 <= body.note <= 20):
            raise HTTPException(400, "Une note entre 0 et 20 est requise pour valider.")
        updates["status"] = "validated"
        updates["note"] = body.note
    else:
        updates["status"] = "returned"
        updates["note"] = None

    res = db.from_("daily_tasks").update(updates).eq("id", task_id).execute()
    log_audit(db, user.id, f"daily_task.{body.decision}", "daily_task", task_id, updates)
    return res.data[0]


@router.delete("/{task_id}")
async def delete_daily_task(
    task_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("daily_tasks").select("id").eq("id", task_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    db.from_("daily_tasks").delete().eq("id", task_id).execute()
    log_audit(db, user.id, "daily_task.delete", "daily_task", task_id)
    return {"ok": True}


@router.get("/monthly-summary")
async def monthly_summary(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    employee_id: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
):
    """Nombre de tâches validées + note mensuelle pondérée (/20) + suggestion
    de prime de rendement — alimente l'évaluation mensuelle. Réservé à
    can_access_rh_payroll() : contrairement au reste de cette page, la
    réponse expose le salaire de base (assistant_rh, qui a accès RH sans la
    paie, ne doit pas le voir — cf. _redact_salary dans rh_employees.py)."""
    if not user.can_access_rh_payroll():
        raise HTTPException(403, "RH (paie) uniquement")
    emp = db.from_("employees").select("salary").eq("id", employee_id).execute().data
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    base_salary = float(emp[0].get("salary") or 0)

    last_day = calendar.monthrange(year, month)[1]
    from_date = f"{year:04d}-{month:02d}-01"
    to_date = f"{year:04d}-{month:02d}-{last_day:02d}"

    rows = (
        db.from_("daily_tasks").select("note, coefficient")
        .eq("employee_id", employee_id).eq("status", "validated")
        .gte("task_date", from_date).lte("task_date", to_date)
        .execute().data or []
    )
    task_count = len(rows)
    weight_sum = sum(float(r["coefficient"]) for r in rows)
    avg_note = round(sum(float(r["note"]) * float(r["coefficient"]) for r in rows) / weight_sum, 2) if weight_sum else None
    bonus_suggested = _suggest_bonus(avg_note, base_salary)

    return {
        "employee_id": employee_id, "month": month, "year": year,
        "task_count": task_count, "avg_note": avg_note,
        "base_salary": base_salary, "bonus_suggested": bonus_suggested,
    }
