from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import AssignmentCreate, SubmissionCreate, GradeInput

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("")
async def list_assignments(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if user.can_create():
        if user.is_admin():
            courses = db.from_("courses").select("id, title").execute().data or []
        else:
            courses = db.from_("courses").select("id, title").eq("professor_id", user.id).execute().data or []

        course_ids = [c["id"] for c in courses]
        course_map = {c["id"]: c["title"] for c in courses}

        if not course_ids:
            return []

        assignments = (
            db.from_("assignments")
            .select("*")
            .in_("course_id", course_ids)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
        return [{**a, "course_title": course_map.get(a["course_id"], "—")} for a in assignments]
    else:
        enrollments = (
            db.from_("course_enrollments").select("course_id").eq("student_id", user.id).execute().data or []
        )
        enrolled_ids = [e["course_id"] for e in enrollments]
        if not enrolled_ids:
            return []

        courses = db.from_("courses").select("id, title").in_("id", enrolled_ids).execute().data or []
        course_map = {c["id"]: c["title"] for c in courses}

        assignments = (
            db.from_("assignments")
            .select("*")
            .in_("course_id", enrolled_ids)
            .order("due_date")
            .execute()
            .data or []
        )

        sub_map: dict[str, dict] = {}
        if assignments:
            assign_ids = [a["id"] for a in assignments]
            subs = (
                db.from_("submissions")
                .select("*")
                .eq("student_id", user.id)
                .in_("assignment_id", assign_ids)
                .execute()
                .data or []
            )
            sub_map = {s["assignment_id"]: s for s in subs}

        return [
            {**a, "course_title": course_map.get(a["course_id"], "—"), "submission": sub_map.get(a["id"])}
            for a in assignments
        ]


@router.post("")
async def create_assignment(
    body: AssignmentCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    if not user.is_admin():
        course = db.from_("courses").select("professor_id").eq("id", body.course_id).execute().data
        if not course or course[0]["professor_id"] != user.id:
            raise HTTPException(403, "Not your course")
    res = db.from_("assignments").insert(
        {
            "title": body.title,
            "description": body.description,
            "due_date": body.due_date,
            "max_grade": body.max_grade,
            "course_id": body.course_id,
        }
    ).execute()
    return res.data[0]


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("assignments").delete().eq("id", assignment_id).execute()
    return {"ok": True}


@router.post("/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    body: SubmissionCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    existing = (
        db.from_("submissions")
        .select("id")
        .eq("assignment_id", assignment_id)
        .eq("student_id", user.id)
        .execute()
        .data
    )
    if existing:
        db.from_("submissions").update({"content": body.content, "file_url": body.file_url}).eq(
            "id", existing[0]["id"]
        ).execute()
    else:
        db.from_("submissions").insert(
            {
                "assignment_id": assignment_id,
                "student_id": user.id,
                "content": body.content,
                "file_url": body.file_url,
            }
        ).execute()
    return {"ok": True}


@router.get("/{assignment_id}/submissions")
async def list_submissions(
    assignment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    subs = db.from_("submissions").select("*").eq("assignment_id", assignment_id).execute().data or []
    student_ids = [s["student_id"] for s in subs]
    prof_map: dict[str, str] = {}
    if student_ids:
        profiles = db.from_("profiles").select("id, full_name").in_("id", student_ids).execute().data or []
        prof_map = {p["id"]: (p["full_name"] or p["id"]) for p in profiles}
    return [{**s, "student_name": prof_map.get(s["student_id"], s["student_id"])} for s in subs]


@router.put("/submissions/{submission_id}/grade")
async def grade_submission(
    submission_id: str,
    body: GradeInput,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("submissions").update({"grade": body.grade, "feedback": body.feedback}).eq(
        "id", submission_id
    ).execute()
    return {"ok": True}
