from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import OrgProjectCreate, OrgProjectUpdate, OrgMemberAdd, OrgMemberRoleUpdate, OrgPositionUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/orgchart", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def get_orgchart(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    projects = db.from_("orgchart_projects").select("*").order("created_at").execute().data or []
    members = db.from_("orgchart_team_members").select("*").execute().data or []
    employees = (
        db.from_("employees")
        .select("id, full_name, position, department, status")
        .neq("status", "candidate")
        .execute()
        .data or []
    )

    emp_map = {e["id"]: e for e in employees}
    assigned_ids = {m["employee_id"] for m in members}

    projects_out = [
        {
            **project,
            "members": [
                {**m, "employee": emp_map.get(m["employee_id"], {})}
                for m in members if m["project_id"] == project["id"]
            ],
        }
        for project in projects
    ]
    unassigned = [e for e in employees if e["id"] not in assigned_ids]

    return {"projects": projects_out, "unassigned": unassigned}


@router.post("/projects")
async def create_project(
    body: OrgProjectCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("orgchart_projects").insert(body.model_dump()).execute()
    if not res.data:
        raise HTTPException(400, "Could not create project")
    project = res.data[0]
    log_audit(db, user.id, "orgchart_project.create", "orgchart_project", project["id"])
    return project


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: OrgProjectUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("orgchart_projects").update(updates).eq("id", project_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "orgchart_project.update", "orgchart_project", project_id, updates)
    return res.data[0]


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("orgchart_projects").select("id").eq("id", project_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("orgchart_team_members").delete().eq("project_id", project_id).execute()
    db.from_("orgchart_projects").delete().eq("id", project_id).execute()
    log_audit(db, user.id, "orgchart_project.delete", "orgchart_project", project_id)
    return {"ok": True}


@router.post("/projects/{project_id}/members")
async def add_member(
    project_id: str,
    body: OrgMemberAdd,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # Keep "one project per employee" — drop any existing membership first.
    db.from_("orgchart_team_members").delete().eq("employee_id", body.employee_id).execute()

    res = db.from_("orgchart_team_members").insert({
        "project_id": project_id,
        "employee_id": body.employee_id,
        "role_in_team": body.role_in_team,
    }).execute()
    if not res.data:
        raise HTTPException(400, "Could not add member")
    log_audit(db, user.id, "orgchart_member.add", "orgchart_project", project_id, {"employee_id": body.employee_id})
    return res.data[0]


@router.patch("/projects/{project_id}/members/{employee_id}")
async def update_member_role(
    project_id: str,
    employee_id: str,
    body: OrgMemberRoleUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("orgchart_team_members")
        .update({"role_in_team": body.role_in_team})
        .eq("project_id", project_id).eq("employee_id", employee_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.delete("/projects/{project_id}/members/{employee_id}")
async def remove_member(
    project_id: str,
    employee_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    db.from_("orgchart_team_members").delete().eq("project_id", project_id).eq("employee_id", employee_id).execute()
    log_audit(db, user.id, "orgchart_member.remove", "orgchart_project", project_id, {"employee_id": employee_id})
    return {"ok": True}


@router.get("/positions")
async def list_positions(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("orgchart_node_positions").select("*").execute()
    return res.data or []


@router.put("/positions/{employee_id}")
async def save_position(
    employee_id: str,
    body: OrgPositionUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = (
        db.from_("orgchart_node_positions")
        .upsert({"employee_id": employee_id, "x": body.x, "y": body.y}, on_conflict="employee_id")
        .execute()
    )
    if not res.data:
        raise HTTPException(400, "Could not save position")
    return res.data[0]
