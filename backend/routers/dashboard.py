from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    now = datetime.now(timezone.utc).isoformat()
    unread = len(
        db.from_("notifications").select("id").eq("user_id", user.id).eq("read", False).execute().data or []
    )

    if user.is_admin():
        courses = len(db.from_("courses").select("id").execute().data or [])
        assignments = len(db.from_("assignments").select("id").execute().data or [])
        exams = len(db.from_("exams").select("id").execute().data or [])
        events = len(db.from_("calendar_events").select("id").execute().data or [])
        return {
            "courses": courses,
            "assignments": assignments,
            "exams": exams,
            "events": events,
            "unread": unread,
            "pending_grade": 0,
        }

    elif user.is_prof():
        prof_courses = db.from_("courses").select("id").eq("professor_id", user.id).execute().data or []
        course_ids = [c["id"] for c in prof_courses]
        assignments = exams = pending_grade = 0
        if course_ids:
            assignments = len(
                db.from_("assignments").select("id").in_("course_id", course_ids).execute().data or []
            )
            exams = len(
                db.from_("exams").select("id").in_("course_id", course_ids).execute().data or []
            )
            assign_ids = [
                a["id"]
                for a in (db.from_("assignments").select("id").in_("course_id", course_ids).execute().data or [])
            ]
            if assign_ids:
                pending_grade = len(
                    db.from_("submissions")
                    .select("id")
                    .in_("assignment_id", assign_ids)
                    .is_("grade", "null")
                    .execute()
                    .data or []
                )
        return {
            "courses": len(course_ids),
            "assignments": assignments,
            "exams": exams,
            "events": 0,
            "unread": unread,
            "pending_grade": pending_grade,
        }

    else:
        enrollments = (
            db.from_("course_enrollments").select("course_id").eq("student_id", user.id).execute().data or []
        )
        enrolled_ids = [e["course_id"] for e in enrollments]
        assignments = exams = 0
        if enrolled_ids:
            assignments = len(
                db.from_("assignments")
                .select("id")
                .in_("course_id", enrolled_ids)
                .gt("due_date", now)
                .execute()
                .data or []
            )
            exams = len(
                db.from_("exams")
                .select("id")
                .in_("course_id", enrolled_ids)
                .eq("is_published", True)
                .execute()
                .data or []
            )
        events = len(
            db.from_("calendar_events").select("id").gt("start_time", now).execute().data or []
        )
        return {
            "courses": len(enrolled_ids),
            "assignments": assignments,
            "exams": exams,
            "events": events,
            "unread": unread,
            "pending_grade": 0,
        }
