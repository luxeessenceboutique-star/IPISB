from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import JobDescriptionCreate, JobDescriptionUpdate, JobHeadingCreate, JobHeadingUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/job-descriptions", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


def _tree(headings: list[dict]) -> list[dict]:
    """Grands titres (parent_id None) avec leurs sous-titres imbriqués."""
    by_parent: dict[Optional[str], list[dict]] = {}
    for h in headings:
        by_parent.setdefault(h.get("parent_id"), []).append(h)
    for lst in by_parent.values():
        lst.sort(key=lambda h: (h.get("sort_order") or 0, h.get("label") or ""))
    roots = by_parent.get(None, [])
    for r in roots:
        r["children"] = by_parent.get(r["id"], [])
    return roots


@router.get("")
async def list_job_descriptions(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    department: Optional[str] = None,
    position: Optional[str] = None,
):
    _require_admin(user)
    query = db.from_("job_descriptions").select("*")
    if department:
        query = query.eq("department", department)
    if position:
        query = query.eq("position", position)
    rows = query.order("department").order("position").execute().data or []

    if not rows:
        return []
    headings = (
        db.from_("job_description_headings").select("*")
        .in_("job_description_id", [r["id"] for r in rows])
        .execute().data or []
    )
    by_jd: dict[str, list[dict]] = {}
    for h in headings:
        by_jd.setdefault(h["job_description_id"], []).append(h)
    return [{**r, "headings": _tree(by_jd.get(r["id"], []))} for r in rows]


@router.get("/by-position")
async def get_job_description_by_position(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    department: str,
    position: str,
):
    """Utilisé par la page Tâches quotidiennes : la fiche de poste applicable
    au salarié choisi (via son département/poste), ou null si aucune n'a
    encore été digitalisée pour ce poste."""
    _require_admin(user)
    rows = (
        db.from_("job_descriptions").select("*")
        .eq("department", department).eq("position", position)
        .execute().data
    )
    if not rows:
        return None
    jd = rows[0]
    headings = db.from_("job_description_headings").select("*").eq("job_description_id", jd["id"]).execute().data or []
    return {**jd, "headings": _tree(headings)}


@router.post("")
async def create_job_description(
    body: JobDescriptionCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    try:
        res = db.from_("job_descriptions").insert(body.model_dump()).execute()
    except Exception:
        raise HTTPException(409, "Une fiche de poste existe déjà pour ce département/poste.")
    jd = res.data[0]
    log_audit(db, user.id, "job_description.create", "job_description", jd["id"], {"position": body.position})
    return {**jd, "headings": []}


@router.patch("/{jd_id}")
async def update_job_description(
    jd_id: str,
    body: JobDescriptionUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = db.from_("job_descriptions").update(updates).eq("id", jd_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "job_description.update", "job_description", jd_id, updates)
    return res.data[0]


@router.delete("/{jd_id}")
async def delete_job_description(
    jd_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("job_descriptions").select("id").eq("id", jd_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    db.from_("job_descriptions").delete().eq("id", jd_id).execute()
    log_audit(db, user.id, "job_description.delete", "job_description", jd_id)
    return {"ok": True}


@router.post("/{jd_id}/headings")
async def create_heading(
    jd_id: str,
    body: JobHeadingCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    jd = db.from_("job_descriptions").select("id").eq("id", jd_id).execute().data
    if not jd:
        raise HTTPException(404, "Fiche de poste introuvable")
    if body.parent_id:
        parent = (
            db.from_("job_description_headings").select("id")
            .eq("id", body.parent_id).eq("job_description_id", jd_id).execute().data
        )
        if not parent:
            raise HTTPException(404, "Grand titre parent introuvable")

    data = body.model_dump()
    data["job_description_id"] = jd_id
    res = db.from_("job_description_headings").insert(data).execute()
    heading = res.data[0]
    log_audit(db, user.id, "job_heading.create", "job_description_heading", heading["id"], {"label": body.label})
    return {**heading, "children": []}


@router.patch("/headings/{heading_id}")
async def update_heading(
    heading_id: str,
    body: JobHeadingUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = db.from_("job_description_headings").update(updates).eq("id", heading_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "job_heading.update", "job_description_heading", heading_id, updates)
    return res.data[0]


@router.delete("/headings/{heading_id}")
async def delete_heading(
    heading_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("job_description_headings").select("id").eq("id", heading_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    db.from_("job_description_headings").delete().eq("id", heading_id).execute()
    log_audit(db, user.id, "job_heading.delete", "job_description_heading", heading_id)
    return {"ok": True}
