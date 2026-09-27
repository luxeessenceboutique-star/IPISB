from datetime import date
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    GovernanceInstanceCreate, GovernanceInstanceUpdate,
    GovernanceMeetingCreate, GovernanceMeetingUpdate,
)
from utils.audit import log_audit

router = APIRouter(prefix="/reunions-instances", tags=["gouvernance"])


def _today() -> str:
    return date.today().isoformat()


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _attach_meetings(db: Client, instances: list[dict]) -> list[dict]:
    if not instances:
        return []
    ids = [i["id"] for i in instances]
    rows = (
        db.from_("governance_instance_meetings").select("*")
        .in_("instance_id", ids).order("sort_order").order("date")
        .execute().data or []
    )
    by_instance: dict[str, list[dict]] = {}
    for r in rows:
        by_instance.setdefault(r["instance_id"], []).append(r)
    for i in instances:
        i["meetings"] = by_instance.get(i["id"], [])
    return instances


@router.get("")
async def list_instances(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    niveau: Optional[int] = None,
):
    _require_admin(user)
    query = db.from_("governance_instances").select("*")
    if niveau is not None:
        query = query.eq("niveau", niveau)
    instances = query.order("date", desc=True).execute().data or []
    return _attach_meetings(db, instances)


@router.post("")
async def create_instance(
    body: GovernanceInstanceCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.niveau not in (1, 2):
        raise HTTPException(400, "niveau doit être 1 ou 2")
    if not body.projet.strip() or not body.recommandation.strip():
        raise HTTPException(400, "Projet et Recommandation sont obligatoires")

    row = {**body.model_dump(exclude_none=True), "created_by": user.id}
    res = db.from_("governance_instances").insert(row).execute()
    instance = res.data[0]
    instance["meetings"] = []
    log_audit(db, user.id, "governance_instance.create", "governance_instance", instance["id"])
    return instance


@router.patch("/{instance_id}")
async def update_instance(
    instance_id: str,
    body: GovernanceInstanceUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Aucune modification")

    res = (
        db.from_("governance_instances").update({**updates, "derniere_maj": _today()})
        .eq("id", instance_id).execute()
    )
    if not res.data:
        raise HTTPException(404, "Instance introuvable")
    log_audit(db, user.id, "governance_instance.update", "governance_instance", instance_id, updates)
    return res.data[0]


@router.delete("/{instance_id}")
async def delete_instance(
    instance_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("governance_instances").select("id").eq("id", instance_id).execute().data
    if not existing:
        raise HTTPException(404, "Instance introuvable")
    db.from_("governance_instances").delete().eq("id", instance_id).execute()
    log_audit(db, user.id, "governance_instance.delete", "governance_instance", instance_id)
    return {"ok": True}


@router.post("/{instance_id}/meetings")
async def create_meeting(
    instance_id: str,
    body: GovernanceMeetingCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("governance_instances").select("id").eq("id", instance_id).execute().data
    if not existing:
        raise HTTPException(404, "Instance introuvable")

    count = db.from_("governance_instance_meetings").select("id").eq("instance_id", instance_id).execute().data or []
    row = {
        **body.model_dump(exclude_none=True),
        "instance_id": instance_id, "created_by": user.id, "sort_order": len(count),
    }
    res = db.from_("governance_instance_meetings").insert(row).execute()
    meeting = res.data[0]
    db.from_("governance_instances").update({"derniere_maj": _today()}).eq("id", instance_id).execute()
    log_audit(db, user.id, "governance_meeting.create", "governance_instance_meeting", meeting["id"], {"instance_id": instance_id})
    return meeting


@router.patch("/meetings/{meeting_id}")
async def update_meeting(
    meeting_id: str,
    body: GovernanceMeetingUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Aucune modification")
    res = db.from_("governance_instance_meetings").update(updates).eq("id", meeting_id).execute()
    if not res.data:
        raise HTTPException(404, "Réunion introuvable")
    log_audit(db, user.id, "governance_meeting.update", "governance_instance_meeting", meeting_id, updates)
    return res.data[0]


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("governance_instance_meetings").select("id").eq("id", meeting_id).execute().data
    if not existing:
        raise HTTPException(404, "Réunion introuvable")
    db.from_("governance_instance_meetings").delete().eq("id", meeting_id).execute()
    log_audit(db, user.id, "governance_meeting.delete", "governance_instance_meeting", meeting_id)
    return {"ok": True}
