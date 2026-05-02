from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import CourseCreate

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("")
async def list_courses(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    courses = db.from_("courses").select("*").order("created_at", desc=True).execute().data or []

    all_enrollments = db.from_("course_enrollments").select("course_id, student_id").execute().data or []
    count_map: dict[str, int] = {}
    enrolled_ids: set[str] = set()
    for e in all_enrollments:
        count_map[e["course_id"]] = count_map.get(e["course_id"], 0) + 1
        if e["student_id"] == user.id:
            enrolled_ids.add(e["course_id"])

    prof_ids = list({c["professor_id"] for c in courses if c.get("professor_id")})
    prof_map: dict[str, str] = {}
    if prof_ids:
        profs = db.from_("profiles").select("id, full_name").in_("id", prof_ids).execute().data or []
        prof_map = {p["id"]: (p["full_name"] or "—") for p in profs}

    return [
        {
            **c,
            "professor_name": prof_map.get(c.get("professor_id", ""), "—") if c.get("professor_id") else "—",
            "enrollment_count": count_map.get(c["id"], 0),
            "is_enrolled": c["id"] in enrolled_ids,
        }
        for c in courses
    ]


@router.get("/list")
async def list_courses_simple(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    return db.from_("courses").select("id, title").order("title").execute().data or []


@router.post("")
async def create_course(
    body: CourseCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Only professors and admins can create courses")
    res = db.from_("courses").insert(
        {
            "title": body.title,
            "description": body.description,
            "code": body.code,
            "semester": body.semester,
            "credits": body.credits,
            "cover_color": body.cover_color,
            "professor_id": user.id,
            "is_published": True,
        }
    ).execute()
    return res.data[0]


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    course = db.from_("courses").select("professor_id").eq("id", course_id).execute().data
    if not course:
        raise HTTPException(404, "Not found")
    if not user.is_admin() and course[0]["professor_id"] != user.id:
        raise HTTPException(403, "Not authorized")
    db.from_("courses").delete().eq("id", course_id).execute()
    return {"ok": True}


@router.post("/{course_id}/enroll")
async def enroll(
    course_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    try:
        db.from_("course_enrollments").insert({"course_id": course_id, "student_id": user.id}).execute()
    except Exception as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.delete("/{course_id}/enroll")
async def unenroll(
    course_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    db.from_("course_enrollments").delete().eq("course_id", course_id).eq("student_id", user.id).execute()
    return {"ok": True}
