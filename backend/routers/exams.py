from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ExamCreate, QuestionCreate, ExamAnswers

router = APIRouter(prefix="/exams", tags=["exams"])


@router.get("")
async def list_exams(
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

        exams = (
            db.from_("exams").select("*").in_("course_id", course_ids).order("created_at", desc=True).execute().data or []
        )
        q_count: dict[str, int] = {}
        if exams:
            exam_ids = [e["id"] for e in exams]
            questions = db.from_("exam_questions").select("exam_id").in_("exam_id", exam_ids).execute().data or []
            for q in questions:
                q_count[q["exam_id"]] = q_count.get(q["exam_id"], 0) + 1

        return [
            {**e, "course_title": course_map.get(e["course_id"], "—"), "question_count": q_count.get(e["id"], 0)}
            for e in exams
        ]
    else:
        enrollments = (
            db.from_("course_enrollments").select("course_id").eq("student_id", user.id).execute().data or []
        )
        enrolled_ids = [e["course_id"] for e in enrollments]
        if not enrolled_ids:
            return []

        courses = db.from_("courses").select("id, title").in_("id", enrolled_ids).execute().data or []
        course_map = {c["id"]: c["title"] for c in courses}

        exams = (
            db.from_("exams")
            .select("*")
            .in_("course_id", enrolled_ids)
            .eq("is_published", True)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
        if not exams:
            return []

        exam_ids = [e["id"] for e in exams]
        questions = db.from_("exam_questions").select("exam_id").in_("exam_id", exam_ids).execute().data or []
        q_count: dict[str, int] = {}
        for q in questions:
            q_count[q["exam_id"]] = q_count.get(q["exam_id"], 0) + 1

        responses = (
            db.from_("exam_responses")
            .select("*")
            .eq("student_id", user.id)
            .in_("exam_id", exam_ids)
            .execute()
            .data or []
        )
        resp_map = {r["exam_id"]: r for r in responses}

        return [
            {
                **e,
                "course_title": course_map.get(e["course_id"], "—"),
                "question_count": q_count.get(e["id"], 0),
                "my_response": resp_map.get(e["id"]),
            }
            for e in exams
        ]


@router.post("")
async def create_exam(
    body: ExamCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    res = db.from_("exams").insert(
        {
            "title": body.title,
            "description": body.description,
            "duration_minutes": body.duration_minutes,
            "start_time": body.start_time,
            "course_id": body.course_id,
            "is_published": False,
        }
    ).execute()
    return res.data[0]


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("exams").delete().eq("id", exam_id).execute()
    return {"ok": True}


@router.get("/{exam_id}/questions")
async def get_questions(
    exam_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    questions = (
        db.from_("exam_questions").select("*").eq("exam_id", exam_id).order("order_num").execute().data or []
    )
    if user.can_create():
        return questions
    # Students: hide correct_index until they submit
    return [{k: v for k, v in q.items() if k != "correct_index"} for q in questions]


@router.post("/{exam_id}/questions")
async def add_question(
    exam_id: str,
    body: QuestionCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    res = db.from_("exam_questions").insert(
        {
            "exam_id": exam_id,
            "question": body.question,
            "options": body.options,
            "correct_index": body.correct_index,
            "order_num": body.order_num,
        }
    ).execute()
    return res.data[0]


@router.delete("/{exam_id}/questions/{question_id}")
async def delete_question(
    exam_id: str,
    question_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    db.from_("exam_questions").delete().eq("id", question_id).eq("exam_id", exam_id).execute()
    return {"ok": True}


@router.put("/{exam_id}/publish")
async def toggle_publish(
    exam_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    exam = db.from_("exams").select("is_published").eq("id", exam_id).execute().data
    if not exam:
        raise HTTPException(404, "Exam not found")
    new_val = not exam[0]["is_published"]
    db.from_("exams").update({"is_published": new_val}).eq("id", exam_id).execute()
    return {"is_published": new_val}


@router.post("/{exam_id}/submit")
async def submit_exam(
    exam_id: str,
    body: ExamAnswers,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    questions = (
        db.from_("exam_questions").select("id, correct_index").eq("exam_id", exam_id).execute().data or []
    )
    score = sum(
        1
        for q in questions
        if str(q["id"]) in body.answers and body.answers[str(q["id"])] == q["correct_index"]
    )
    total = len(questions)

    existing = (
        db.from_("exam_responses")
        .select("id")
        .eq("exam_id", exam_id)
        .eq("student_id", user.id)
        .execute()
        .data
    )
    if existing:
        db.from_("exam_responses").update(
            {"answers": body.answers, "score": score, "total": total}
        ).eq("id", existing[0]["id"]).execute()
    else:
        db.from_("exam_responses").insert(
            {
                "exam_id": exam_id,
                "student_id": user.id,
                "answers": body.answers,
                "score": score,
                "total": total,
            }
        ).execute()
    return {"score": score, "total": total}


@router.get("/{exam_id}/result")
async def get_result(
    exam_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    resp = (
        db.from_("exam_responses")
        .select("*")
        .eq("exam_id", exam_id)
        .eq("student_id", user.id)
        .execute()
        .data
    )
    if not resp:
        raise HTTPException(404, "No response found")
    questions = (
        db.from_("exam_questions").select("*").eq("exam_id", exam_id).order("order_num").execute().data or []
    )
    return {"response": resp[0], "questions": questions}
