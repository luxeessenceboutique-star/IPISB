from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ClassCreate, AddStudentRequest

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("/all")
async def list_all_classes(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """All classes — used by the course-assignment picker (any prof/admin can assign to any class)."""
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")
    return db.from_("classes").select("id, name").order("name").execute().data or []


@router.get("")
async def list_classes(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")

    if user.is_admin():
        classes = db.from_("classes").select("*").order("created_at", desc=True).execute().data or []
    else:
        classes = (
            db.from_("classes")
            .select("*")
            .eq("created_by", user.id)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )

    all_memberships = db.from_("class_students").select("class_id").execute().data or []
    count_map: dict[str, int] = {}
    for m in all_memberships:
        count_map[m["class_id"]] = count_map.get(m["class_id"], 0) + 1

    prof_ids = list({c["created_by"] for c in classes if c.get("created_by")})
    prof_map: dict[str, str] = {}
    if prof_ids:
        profs = db.from_("profiles").select("id, full_name").in_("id", prof_ids).execute().data or []
        prof_map = {p["id"]: p["full_name"] or "—" for p in profs}

    return [
        {
            **c,
            "student_count": count_map.get(c["id"], 0),
            "professor_name": prof_map.get(c["created_by"], "—") if c.get("created_by") else "—",
        }
        for c in classes
    ]


@router.post("")
async def create_class(
    body: ClassCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    if not user.can_create():
        raise HTTPException(403, "Professor or admin only")
    res = db.from_("classes").insert({
        "name": body.name,
        "description": body.description,
        "created_by": user.id,
    }).execute()
    return res.data[0]


@router.delete("/{class_id}")
async def delete_class(
    class_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    cls = db.from_("classes").select("created_by").eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    if not user.is_admin() and cls[0]["created_by"] != user.id:
        raise HTTPException(403, "Non autorisé")
    db.from_("class_students").delete().eq("class_id", class_id).execute()
    db.from_("classes").delete().eq("id", class_id).execute()
    return {"ok": True}


@router.get("/{class_id}/students")
async def get_class_students(
    class_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    cls = db.from_("classes").select("created_by").eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    if not user.is_admin() and cls[0]["created_by"] != user.id:
        raise HTTPException(403, "Non autorisé")

    memberships = (
        db.from_("class_students")
        .select("student_id, added_at")
        .eq("class_id", class_id)
        .execute()
        .data or []
    )
    if not memberships:
        return []

    student_ids = [m["student_id"] for m in memberships]
    profiles = (
        db.from_("profiles")
        .select("id, email, full_name")
        .in_("id", student_ids)
        .execute()
        .data or []
    )
    added_map = {m["student_id"]: m["added_at"] for m in memberships}
    return [{**p, "added_at": added_map.get(p["id"])} for p in profiles]


@router.post("/{class_id}/students")
async def add_student(
    class_id: str,
    body: AddStudentRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    cls = db.from_("classes").select("created_by").eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    if not user.is_admin() and cls[0]["created_by"] != user.id:
        raise HTTPException(403, "Non autorisé")

    if not user.is_admin():
        student = (
            db.from_("profiles")
            .select("id")
            .eq("id", body.student_id)
            .eq("created_by", user.id)
            .execute()
            .data
        )
        if not student:
            raise HTTPException(403, "Cet étudiant ne fait pas partie de vos étudiants")

    try:
        db.from_("class_students").insert({
            "class_id": class_id,
            "student_id": body.student_id,
        }).execute()
    except Exception as e:
        raise HTTPException(400, str(e))

    return {"ok": True}


@router.delete("/{class_id}/students/{student_id}")
async def remove_student(
    class_id: str,
    student_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    cls = db.from_("classes").select("created_by").eq("id", class_id).execute().data
    if not cls:
        raise HTTPException(404, "Classe introuvable")
    if not user.is_admin() and cls[0]["created_by"] != user.id:
        raise HTTPException(403, "Non autorisé")
    db.from_("class_students").delete().eq("class_id", class_id).eq("student_id", student_id).execute()
    return {"ok": True}
