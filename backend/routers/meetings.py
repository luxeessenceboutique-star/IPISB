import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import MeetingCreate
from utils.notify import notify_users
from utils.email import send_email


def _is_expired(meeting: dict) -> bool:
    """Return True if the meeting's time window has fully elapsed."""
    try:
        raw   = meeting["scheduled_at"].replace("Z", "+00:00")
        start = datetime.fromisoformat(raw)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)  # treat naive as UTC
        end = start + timedelta(minutes=meeting.get("duration_minutes", 60))
        return datetime.now(timezone.utc) > end
    except Exception:
        return False

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("")
async def list_meetings(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if user.is_admin():
        # Admins see all meetings
        meetings = (
            db.from_("meetings")
            .select("*, courses(title), classes(name)")
            .order("scheduled_at", desc=True)
            .execute()
            .data or []
        )
    elif user.is_prof():
        # Professors see meetings for classes they created OR meetings they created directly
        prof_classes = (
            db.from_("classes").select("id").eq("created_by", user.id).execute().data or []
        )
        prof_class_ids = [c["id"] for c in prof_classes]

        if prof_class_ids:
            # Meetings linked to professor's classes OR created by this professor
            class_meetings = (
                db.from_("meetings")
                .select("*, courses(title), classes(name)")
                .in_("class_id", prof_class_ids)
                .order("scheduled_at", desc=True)
                .execute()
                .data or []
            )
            own_meetings = (
                db.from_("meetings")
                .select("*, courses(title), classes(name)")
                .eq("created_by", user.id)
                .is_("class_id", "null")
                .order("scheduled_at", desc=True)
                .execute()
                .data or []
            )
            # Merge and deduplicate by id
            seen: set[str] = set()
            meetings = []
            for m in class_meetings + own_meetings:
                if m["id"] not in seen:
                    seen.add(m["id"])
                    meetings.append(m)
            meetings.sort(key=lambda m: m["scheduled_at"], reverse=True)
        else:
            # Professor has no classes yet — show only meetings they personally created
            meetings = (
                db.from_("meetings")
                .select("*, courses(title), classes(name)")
                .eq("created_by", user.id)
                .order("scheduled_at", desc=True)
                .execute()
                .data or []
            )
    else:
        # Students see only meetings for classes they are enrolled in
        student_classes = (
            db.from_("class_students").select("class_id").eq("student_id", user.id).execute().data or []
        )
        student_class_ids = [c["class_id"] for c in student_classes]

        if not student_class_ids:
            return []

        meetings = (
            db.from_("meetings")
            .select("*, courses(title), classes(name)")
            .in_("class_id", student_class_ids)
            .order("scheduled_at", desc=True)
            .execute()
            .data or []
        )

    # Auto-deactivate any still-active meetings whose time window has passed.
    expired_ids = [m["id"] for m in meetings if m.get("is_active") and _is_expired(m)]
    if expired_ids:
        db.from_("meetings").update({"is_active": False}).in_("id", expired_ids).execute()
        for m in meetings:
            if m["id"] in expired_ids:
                m["is_active"] = False

    host_ids = list({m["created_by"] for m in meetings if m.get("created_by")})
    host_map: dict[str, str] = {}
    if host_ids:
        profiles = db.from_("profiles").select("id, full_name").in_("id", host_ids).execute().data or []
        host_map = {p["id"]: (p["full_name"] or "—") for p in profiles}

    return [
        {
            **{k: v for k, v in m.items() if k not in ("courses", "classes")},
            "course_title": (m.get("courses") or {}).get("title"),
            "class_name":   (m.get("classes")  or {}).get("name"),
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
            "class_id": body.class_id,
            "created_by": user.id,
            "scheduled_at": body.scheduled_at,
            "duration_minutes": body.duration_minutes,
            "room_id": room_id,
            "is_active": False,
        }
    ).execute()
    new_meeting = res.data[0]

    # Notify students enrolled in the meeting's class (if class_id is set)
    if body.class_id:
        try:
            enrolled = (
                db.from_("class_students")
                .select("student_id")
                .eq("class_id", body.class_id)
                .execute()
                .data or []
            )
            student_ids = [r["student_id"] for r in enrolled]
            notify_users(
                db,
                student_ids,
                f"Nouvelle réunion : {body.title}",
                f"Planifiée le {body.scheduled_at[:10]}",
                "info",
                "/dashboard/meetings",
            )
            # Email students in the class about the new meeting
            try:
                if student_ids:
                    profiles = (
                        db.from_("profiles")
                        .select("email")
                        .in_("id", student_ids)
                        .execute()
                        .data or []
                    )
                    emails = [p["email"] for p in profiles if p.get("email")]
                    if emails:
                        date_label = body.scheduled_at[:10]
                        send_email(
                            emails,
                            f"Nouvelle réunion : {body.title}",
                            (
                                f"<h2>Nouvelle réunion</h2>"
                                f"<p><b>{body.title}</b> est planifiée le {date_label}.</p>"
                                f"<a href='https://ipisb.ma/dashboard/meetings'>Rejoindre</a>"
                            ),
                        )
            except Exception:
                pass
        except Exception:
            pass  # notification failure must never break the main operation

    return new_meeting


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
    row = db.from_("meetings").select("scheduled_at, duration_minutes").eq("id", meeting_id).execute().data
    if not row:
        raise HTTPException(404, "Not found")
    if _is_expired(row[0]):
        raise HTTPException(403, "Meeting has expired and can no longer be activated")
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
