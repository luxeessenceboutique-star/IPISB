import re
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from deps import CurrentUser, get_current_user, get_db
from models import FileCategoryCreate, FileCategoryUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/employee-file-categories", tags=["rh"])

# "photo" is the one value employee_files.py treats specially (it becomes the
# employee's profile photo) — the category can be relabeled but never removed,
# or uploads tagged "photo" would silently stop updating the profile photo.
PROTECTED_VALUE = "photo"


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_rh():
        raise HTTPException(403, "RH access only")


def _slugify(label: str) -> str:
    ascii_label = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_label.lower()).strip("_")
    return slug[:40] or "categorie"


@router.get("")
async def list_file_categories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("employee_file_categories").select("*").order("created_at").execute()
    return res.data or []


@router.post("")
async def create_file_category(
    body: FileCategoryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "label is required")

    base_value = _slugify(label)
    existing = {r["value"] for r in db.from_("employee_file_categories").select("value").execute().data or []}
    value = base_value
    i = 2
    while value in existing:
        value = f"{base_value}_{i}"
        i += 1

    res = db.from_("employee_file_categories").insert({"value": value, "label": label}).execute()
    if not res.data:
        raise HTTPException(400, "Could not create category")

    cat = res.data[0]
    log_audit(db, user.id, "employee_file_category.create", "employee_file_category", cat["id"])
    return cat


@router.patch("/{category_id}")
async def update_file_category(
    category_id: str,
    body: FileCategoryUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "label is required")

    res = db.from_("employee_file_categories").update({"label": label}).eq("id", category_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "employee_file_category.update", "employee_file_category", category_id, {"label": label})
    return res.data[0]


@router.delete("/{category_id}")
async def delete_file_category(
    category_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("employee_file_categories").select("id, value").eq("id", category_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    if existing[0]["value"] == PROTECTED_VALUE:
        raise HTTPException(400, "Cette catégorie est utilisée par la photo de profil et ne peut pas être supprimée.")

    db.from_("employee_file_categories").delete().eq("id", category_id).execute()
    log_audit(db, user.id, "employee_file_category.delete", "employee_file_category", category_id)
    return {"ok": True}
