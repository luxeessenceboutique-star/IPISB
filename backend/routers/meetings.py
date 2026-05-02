import uuid
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import MeetingCreate

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("")
async def list_meetings(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    meetings = (
        db.from_("meetings").select("*, courses(title)").order("scheduled_at", desc=True).execute().data or []
    )
    host_ids = list({m["created_by"] for m in meetings if m.get("created_by")})
    host_map: dict[str, str] = {}
    if host_ids:
        profiles = db.from_("profiles").select("id, full_name").in_("id", host_ids).execute().data or []
        host_map = {p["id"]: (p["full_name"] or "—") for p in profiles}

    return [
        {
            **{k: v for k, v in m.items() if k != "courses"},
            "course_title": (m.get("courses") or {}).get("title"),
            "host_name": host_map.get(m.get("created_by", ""), "—") if m.get("created_by") else "—",
        }
        for m in meetings
    ]


@router.post("")
async def create_meeting(
    body: MeetingCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    room_id = f"ipisbe-{uuid.uuid4().hex[:20]}"
    res = db.from_("meetings").insert(
        {
            "title": body.title,
            "description": body.description,
            "course_id": body.course_id,
            "created_by": user.id,
            "scheduled_at": body.scheduled_at,
            "duration_minutes": body.duration_minutes,
            "room_id": room_id,
            "is_active": False,
        }
    ).execute()
    return res.data[0]


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    meeting = db.from_("meetings").select("created_by").eq("id", meeting_id).execute().data
    if not meeting:
        raise HTTPException(404, "Not found")
    if not user.is_admin() and meeting[0]["created_by"] != user.id:
        raise HTTPException(403, "Not authorized")
    db.from_("meetings").delete().eq("id", meeting_id).execute()
    return {"ok": True}


@router.put("/{meeting_id}/activate")
async def activate(
    meeting_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("meetings").update({"is_active": True}).eq("id", meeting_id).execute()
    return {"ok": True}


@router.put("/{meeting_id}/deactivate")
async def deactivate(
    meeting_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("meetings").update({"is_active": False}).eq("id", meeting_id).execute()
    return {"ok": True}
