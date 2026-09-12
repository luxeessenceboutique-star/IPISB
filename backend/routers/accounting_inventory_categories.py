import re
import unicodedata
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import InventoryCategoryCreate, InventoryCategoryUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/inventory-categories", tags=["accounting"])

# Catégories historiques — utilisées en repli si la migration L56 (table
# inventory_categories) n'est pas encore passée, pour que l'écran Inventaire
# reste utilisable pendant la transition.
_FALLBACK = [
    {"id": "consommable", "key": "consommable", "label": "Consommables", "sort_order": 1, "active": True},
    {"id": "equipement", "key": "equipement", "label": "Équipements", "sort_order": 2, "active": True},
    {"id": "locaux", "key": "locaux", "label": "Locaux", "sort_order": 3, "active": True},
    {"id": "service", "key": "service", "label": "Services", "sort_order": 4, "active": True},
]


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _slugify(label: str) -> str:
    s = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s or "categorie"


def _migration_error(ex: Exception) -> HTTPException:
    msg = str(ex)
    if "does not exist" in msg or "inventory_categories" in msg or "Could not find" in msg:
        return HTTPException(400, "Migration L56 requise (table inventory_categories).")
    return HTTPException(500, "Opération impossible.")


@router.get("")
async def list_categories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    include_inactive: bool = False,
):
    _require_admin(user)
    try:
        query = db.from_("inventory_categories").select("*")
        if not include_inactive:
            query = query.eq("active", True)
        rows = query.execute().data or []
    except Exception:
        rows = [r for r in _FALLBACK if include_inactive or r["active"]]
    rows.sort(key=lambda r: (r.get("sort_order") or 0, (r.get("label") or "").lower()))
    return rows


@router.post("")
async def create_category(
    body: InventoryCategoryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    label = (body.label or "").strip()
    if not label:
        raise HTTPException(400, "Le nom de la catégorie est requis.")
    try:
        existing = db.from_("inventory_categories").select("key, sort_order").execute().data or []
    except Exception as ex:
        raise _migration_error(ex)

    keys = {r["key"] for r in existing}
    base = _slugify(label)
    key = base
    i = 2
    while key in keys:
        key = f"{base}_{i}"
        i += 1
    next_sort = (max((r.get("sort_order") or 0) for r in existing) + 1) if existing else 1

    res = db.from_("inventory_categories").insert({
        "key": key, "label": label, "sort_order": next_sort, "created_by": user.id,
    }).execute()
    new_cat = res.data[0]
    log_audit(db, user.id, "inventory_category.create", "inventory_category", new_cat["id"],
              {"key": key, "label": label})
    return new_cat


@router.patch("/{cat_id}")
async def update_category(
    cat_id: str,
    body: InventoryCategoryUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "label" in updates:
        updates["label"] = updates["label"].strip()
        if not updates["label"]:
            raise HTTPException(400, "Le nom ne peut pas être vide.")
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier.")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = db.from_("inventory_categories").update(updates).eq("id", cat_id).execute()
    except Exception as ex:
        raise _migration_error(ex)
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "inventory_category.update", "inventory_category", cat_id, updates)
    return res.data[0]


@router.delete("/{cat_id}")
async def delete_category(
    cat_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("inventory_categories").select("id, key, label").eq("id", cat_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    key, label = rows[0]["key"], rows[0]["label"]

    used = db.from_("inventory_items").select("id").eq("asset_category", key).limit(1).execute().data or []
    if used:
        raise HTTPException(409, f"Catégorie « {label} » utilisée par l'inventaire — désactivez-la au lieu de la supprimer.")

    db.from_("inventory_categories").delete().eq("id", cat_id).execute()
    log_audit(db, user.id, "inventory_category.delete", "inventory_category", cat_id, {"key": key})
    return {"ok": True}
