from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import AssignmentCreate, SubmissionCreate, GradeInput, QuickGradeInput
from utils.notify import notify_users
from utils.email import send_email

router = APIRouter(prefix="/assignments", tags=["assignments"])


def _check_own_course(db: Client, user: CurrentUser, course_id: str) -> None:
    if user.is_admin():
        return
    course = db.from_("courses").select("professor_id").eq("id", course_id).execute().data
    if not course:
        raise HTTPException(404, "Cours introuvable")
    if course[0]["professor_id"] != user.id:
        raise HTTPException(403, "Not your course")


@router.get("/quick-grade")
async def get_quick_grades(
    course_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Notes déjà saisies via le raccourci « Note directe » pour ce cours —
    {student_id: note}, vide si aucune saisie n'a encore eu lieu."""
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    _check_own_course(db, user, course_id)
    assignment = (
        db.from_("assignments").select("id")
        .eq("course_id", course_id).eq("is_quick_grade", True)
        .execute().data
    )
    if not assignment:
        return {}
    subs = db.from_("submissions").select("student_id, grade").eq("assignment_id", assignment[0]["id"]).execute().data or []
    return {s["student_id"]: s["grade"] for s in subs}


@router.put("/quick-grade")
async def set_quick_grades(
    body: QuickGradeInput,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Saisie directe des notes d'un cours (page Notes) : upsert un devoir
    canonique « Note directe » par cours (créé au premier usage, repéré par
    is_quick_grade), puis la note de chaque élève dessus — réutilise le
    pipeline devoir/soumission/notation existant sans exiger de remise
    préalable de l'élève (contrairement au circuit devoir normal)."""
    if not user.can_create():
        raise HTTPException(403, "Not authorized")
    _check_own_course(db, user, body.course_id)

    existing = (
        db.from_("assignments").select("id")
        .eq("course_id", body.course_id).eq("is_quick_grade", True)
        .execute().data
    )
    if existing:
        assignment_id = existing[0]["id"]
    else:
        res = db.from_("assignments").insert({
            "title": "Note directe", "course_id": body.course_id, "max_grade": 20, "is_quick_grade": True,
        }).execute()
        assignment_id = res.data[0]["id"]

    existing_subs = (
        db.from_("submissions").select("id, student_id")
        .eq("assignment_id", assignment_id).in_("student_id", list(body.grades.keys()))
        .execute().data or []
    )
    sub_by_student = {s["student_id"]: s["id"] for s in existing_subs}

    to_insert = []
    for student_id, grade in body.grades.items():
        if student_id in sub_by_student:
            db.from_("submissions").update({"grade": grade}).eq("id", sub_by_student[student_id]).execute()
        else:
            to_insert.append({"assignment_id": assignment_id, "student_id": student_id, "grade": grade})
    if to_insert:
        db.from_("submissions").insert(to_insert).execute()

    return {"ok": True, "assignment_id": assignment_id}


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
    new_assignment = res.data[0]

    # Notify all students enrolled in this course
    try:
        enrolled = (
            db.from_("course_enrollments")
            .select("student_id")
            .eq("course_id", body.course_id)
            .execute()
            .data or []
        )
        student_ids = [r["student_id"] for r in enrolled]
        notify_users(
            db,
            student_ids,
            f"Nouveau contrôle continu : {body.title}",
            body.description or None,
            "info",
            f"/dashboard/assignments?focus={new_assignment['id']}",
        )
        # Email enrolled students
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
                    due_label = body.due_date[:10] if body.due_date else "Non définie"
                    send_email(
                        emails,
                        f"Nouveau contrôle continu : {body.title}",
                        (
                            f"<h2>Nouveau contrôle continu</h2>"
                            f"<p><b>{body.title}</b> a été ajouté à votre cours.</p>"
                            f"<p>Date limite : {due_label}</p>"
                            f"<a href='https://ipisb.ma/dashboard/assignments'>Voir le contrôle continu</a>"
                        ),
                    )
        except Exception:
            pass
    except Exception:
        pass  # notification failure must never break the main operation

    return new_assignment


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
    if user.can_create():
        raise HTTPException(403, "Only students can submit assignments")
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

    # Fetch submission details before updating so we can notify the student
    submission_data = (
        db.from_("submissions")
        .select("student_id, assignment_id")
        .eq("id", submission_id)
        .execute()
        .data
    )

    db.from_("submissions").update({"grade": body.grade, "feedback": body.feedback}).eq(
        "id", submission_id
    ).execute()

    # Notify the student that their submission has been graded
    if submission_data and body.grade is not None:
        try:
            sub = submission_data[0]
            assignment_data = (
                db.from_("assignments")
                .select("title")
                .eq("id", sub["assignment_id"])
                .execute()
                .data
            )
            assignment_title = assignment_data[0]["title"] if assignment_data else "Contrôle continu"
            notify_users(
                db,
                [sub["student_id"]],
                f"Contrôle continu noté : {assignment_title}",
                f"Votre note : {body.grade}/20",
                "success",
                f"/dashboard/assignments?focus={sub['assignment_id']}",
            )
            # Email the student their grade
            try:
                profile = (
                    db.from_("profiles")
                    .select("email")
                    .eq("id", sub["student_id"])
                    .execute()
                    .data
                )
                student_email = profile[0]["email"] if profile and profile[0].get("email") else None
                if student_email:
                    send_email(
                        student_email,
                        "Votre contrôle continu a été noté",
                        (
                            f"<h2>Contrôle continu noté</h2>"
                            f"<p>Votre contrôle continu <b>{assignment_title}</b> a été noté : "
                            f"<b>{body.grade}/20</b>.</p>"
                            f"<a href='https://ipisb.ma/dashboard/assignments'>Voir mon contrôle continu</a>"
                        ),
                    )
            except Exception:
                pass
        except Exception:
            pass  # notification failure must never break the main operation

    return {"ok": True}
