from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import TalentProfileUpdate, OkrCreate, OkrUpdate, PdiItemCreate, PdiItemUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/talents", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _classify(perf: int, pot: int) -> str:
    if perf >= 4 and pot >= 4:
        return "star"
    if perf >= 4 and pot <= 2:
        return "solid"
    if perf <= 2 and pot >= 4:
        return "potential"
    if perf <= 2 and pot <= 2:
        return "needs_improvement"
    return "key_player"


def _default_profile(employee_id: str) -> dict:
    return {
        "employee_id": employee_id,
        "performance_score": 3,
        "potential_score": 3,
        "talent_category": _classify(3, 3),
        "flight_risk": "low",
        "successor_names": [],
    }


# ── Stats / mobility / bulk (registered before the /{employee_id} catch-all) ──

@router.get("/stats/summary")
async def talent_stats(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    profiles = (
        db.from_("talent_profiles")
        .select("talent_category, flight_risk, performance_score, potential_score, is_critical_position")
        .execute()
        .data or []
    )

    by_category: dict[str, int] = {}
    for p in profiles:
        cat = p.get("talent_category") or "other"
        by_category[cat] = by_category.get(cat, 0) + 1

    high_risk = sum(1 for p in profiles if p.get("flight_risk") == "high")
    critical = sum(1 for p in profiles if p.get("is_critical_position"))
    avg_perf = round(sum(p.get("performance_score", 3) for p in profiles) / len(profiles), 1) if profiles else 0
    avg_pot = round(sum(p.get("potential_score", 3) for p in profiles) / len(profiles), 1) if profiles else 0

    return {
        "total": len(profiles),
        "by_category": by_category,
        "high_flight_risk": high_risk,
        "critical_positions": critical,
        "avg_performance": avg_perf,
        "avg_potential": avg_pot,
    }


@router.get("/mobility/candidates")
async def mobility_candidates(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("talent_profiles")
        .select("*, employees(id, full_name, email, position, department, hire_date)")
        .not_.is_("next_role", "null")
        .order("updated_at", desc=True)
        .execute()
        .data or []
    )
    return [r for r in rows if (r.get("next_role") or "").strip()]


@router.post("/bulk-profile")
async def bulk_create_profiles(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    active_ids = {e["id"] for e in db.from_("employees").select("id").eq("status", "active").execute().data or []}
    existing_ids = {p["employee_id"] for p in db.from_("talent_profiles").select("employee_id").execute().data or []}
    missing = active_ids - existing_ids

    if not missing:
        return {"created": 0, "skipped": len(active_ids)}

    records = [_default_profile(eid) for eid in missing]
    db.from_("talent_profiles").insert(records).execute()
    log_audit(db, user.id, "talent.bulk_profile", "talent_profiles", None, {"count": len(records)})
    return {"created": len(records), "skipped": len(active_ids) - len(records)}


# ── Profile CRUD ─────────────────────────────────────────────────────────────

@router.get("")
async def list_talents(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("talent_profiles")
        .select("*, employees(id, full_name, email, position, department)")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{employee_id}")
async def get_talent_profile(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("talent_profiles").select("*").eq("employee_id", employee_id).execute().data
    if rows:
        return rows[0]

    record = _default_profile(employee_id)
    res = db.from_("talent_profiles").insert(record).execute()
    if res.data:
        return res.data[0]
    raise HTTPException(400, "Could not initialize talent profile")


@router.patch("/{employee_id}")
async def update_talent_profile(
    employee_id: str,
    body: TalentProfileUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    existing_rows = db.from_("talent_profiles").select("*").eq("employee_id", employee_id).execute().data
    existing = existing_rows[0] if existing_rows else _default_profile(employee_id)

    # Recompute the 9-box category from the MERGED record (existing scores
    # overlaid with whatever this PATCH actually supplies), not from the raw
    # payload defaulting missing axes to 3 — a partial update that only
    # touches e.g. `notes` must not silently reset the other axis.
    perf = updates.get("performance_score", existing.get("performance_score", 3))
    pot = updates.get("potential_score", existing.get("potential_score", 3))
    updates["talent_category"] = _classify(perf, pot)

    if existing_rows:
        res = db.from_("talent_profiles").update(updates).eq("employee_id", employee_id).execute()
    else:
        res = db.from_("talent_profiles").insert({**existing, **updates, "employee_id": employee_id}).execute()

    if not res.data:
        raise HTTPException(400, "Could not save talent profile")
    log_audit(db, user.id, "talent.update", "talent_profile", employee_id, updates)
    return res.data[0]


# ── OKRs ─────────────────────────────────────────────────────────────────────

@router.get("/{employee_id}/okrs")
async def list_okrs(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("employee_okrs").select("*")
        .eq("employee_id", employee_id).neq("status", "cancelled")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{employee_id}/okrs")
async def create_okr(
    employee_id: str,
    body: OkrCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump()
    data["employee_id"] = employee_id

    res = db.from_("employee_okrs").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create OKR")
    return res.data[0]


@router.patch("/okrs/{okr_id}")
async def update_okr(
    okr_id: str,
    body: OkrUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("employee_okrs").update(updates).eq("id", okr_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.delete("/okrs/{okr_id}")
async def cancel_okr(
    okr_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("employee_okrs").update({"status": "cancelled"}).eq("id", okr_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ── PDI (individual development plan) items ─────────────────────────────────

@router.get("/{employee_id}/pdi")
async def list_pdi(
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("pdi_items").select("*").eq("employee_id", employee_id).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/{employee_id}/pdi")
async def create_pdi(
    employee_id: str,
    body: PdiItemCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    data = body.model_dump()
    data["employee_id"] = employee_id

    res = db.from_("pdi_items").insert(data).execute()
    if not res.data:
        raise HTTPException(400, "Could not create PDI item")
    return res.data[0]


@router.patch("/pdi/{item_id}")
async def update_pdi(
    item_id: str,
    body: PdiItemUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("pdi_items").update(updates).eq("id", item_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.delete("/pdi/{item_id}")
async def delete_pdi(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("pdi_items").select("id").eq("id", item_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("pdi_items").delete().eq("id", item_id).execute()
    return {"ok": True}
