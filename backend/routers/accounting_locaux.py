import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import LocalCreate, LocalUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/accounting/locaux", tags=["accounting"])

# Étages connus + ordre d'affichage (du bas vers le haut). Non contraint en
# base : on tolère une valeur libre, mais l'UI ne propose que celles-ci.
FLOOR_ORDER = ["rdc", "1er", "2e", "3e", "4e", "terrasse"]

# Photo du local — même bucket que le reste des pièces jointes comptables.
PHOTO_BUCKET = "accounting"
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 Mo
# Affichée directement dans la liste des locaux : l'URL signée ne doit pas
# expirer en pratique (mêmes conventions que employee_files.py).
PHOTO_URL_TTL = 60 * 60 * 24 * 365 * 10
ALLOWED_PHOTO_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _floor_rank(floor: str) -> int:
    try:
        return FLOOR_ORDER.index(floor)
    except ValueError:
        return len(FLOOR_ORDER)


@router.get("")
async def list_locaux(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    floor: Optional[str] = None,
    include_inactive: bool = False,
):
    _require_admin(user)
    query = db.from_("locaux").select("*")
    if floor:
        query = query.eq("floor", floor)
    if not include_inactive:
        query = query.eq("active", True)
    rows = query.execute().data or []
    rows.sort(key=lambda r: (_floor_rank(r.get("floor") or ""),
                             r.get("sort_order") or 0,
                             (r.get("name") or "").lower()))
    return rows


@router.post("")
async def create_local(
    body: LocalCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Le nom du local est requis.")
    payload = {
        "name": name,
        "floor": (body.floor or "3e").strip(),
        "code": (body.code or "").strip() or None,
        "capacity": body.capacity,
        "note": (body.note or "").strip() or None,
        "sort_order": body.sort_order or 0,
        "created_by": user.id,
    }
    try:
        res = db.from_("locaux").insert(payload).execute()
    except Exception as ex:
        msg = str(ex)
        if "duplicate key" in msg or "locaux_name_floor_key" in msg or "unique" in msg.lower():
            raise HTTPException(409, "Ce local existe déjà à cet étage.")
        if "does not exist" in msg or "relation" in msg:
            raise HTTPException(400, "Migration L55 requise (table locaux).")
        raise HTTPException(500, "Création du local impossible.")
    new_local = res.data[0]
    log_audit(db, user.id, "local.create", "local", new_local["id"], {"name": name, "floor": payload["floor"]})
    return new_local


@router.patch("/{local_id}")
async def update_local(
    local_id: str,
    body: LocalUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    raw = body.model_dump(exclude_unset=True)
    nullable = {"code", "capacity", "note"}
    updates = {}
    for k, v in raw.items():
        if isinstance(v, str):
            v = v.strip() or None
        if k in nullable or v is not None:
            updates[k] = v
    if not updates:
        raise HTTPException(400, "Aucun champ à modifier.")
    if updates.get("name") == "":
        raise HTTPException(400, "Le nom ne peut pas être vide.")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        res = db.from_("locaux").update(updates).eq("id", local_id).execute()
    except Exception as ex:
        if "duplicate key" in str(ex) or "unique" in str(ex).lower():
            raise HTTPException(409, "Ce local existe déjà à cet étage.")
        raise HTTPException(500, "Mise à jour impossible.")
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "local.update", "local", local_id, updates)
    return res.data[0]


@router.delete("/{local_id}")
async def delete_local(
    local_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("locaux").select("id, name").eq("id", local_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    name = rows[0]["name"]

    used = db.from_("inventory_items").select("id").eq("location", name).limit(1).execute().data or []
    if not used:
        try:
            used = db.from_("inventory_allocations").select("id").eq("location", name).limit(1).execute().data or []
        except Exception:
            used = []
    if used:
        raise HTTPException(409, f"Local « {name} » utilisé par l'inventaire — désactivez-le au lieu de le supprimer.")

    db.from_("locaux").delete().eq("id", local_id).execute()
    log_audit(db, user.id, "local.delete", "local", local_id, {"name": name})
    return {"ok": True}


@router.post("/{local_id}/photo")
async def upload_local_photo(
    local_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile = File(...),
):
    _require_admin(user)
    rows = db.from_("locaux").select("id, photo_path").eq("id", local_id).execute().data
    if not rows:
        raise HTTPException(404, "Local introuvable")

    content_type = file.content_type or ""
    ext = ALLOWED_PHOTO_TYPES.get(content_type)
    if not ext:
        raise HTTPException(400, "Seuls les fichiers JPG, PNG et WEBP sont acceptés")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Fichier vide")
    if len(data) > MAX_PHOTO_SIZE:
        raise HTTPException(400, "L'image dépasse la limite de 8 Mo")

    old_path = rows[0].get("photo_path")
    file_path = f"locaux/{local_id}/{secrets.token_hex(8)}.{ext}"
    try:
        db.storage.from_(PHOTO_BUCKET).upload(file_path, data, {"content-type": content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage : {str(e)}")

    try:
        signed = db.storage.from_(PHOTO_BUCKET).create_signed_url(file_path, PHOTO_URL_TTL)
        photo_url = signed.get("signedURL") or signed.get("signed_url")
        if not photo_url:
            raise ValueError("no signed url")
    except Exception:
        db.storage.from_(PHOTO_BUCKET).remove([file_path])
        raise HTTPException(500, "Échec de la génération de l'URL de la photo")

    try:
        res = db.from_("locaux").update({"photo_path": file_path, "photo_url": photo_url}).eq("id", local_id).execute()
    except Exception:
        db.storage.from_(PHOTO_BUCKET).remove([file_path])
        raise HTTPException(500, "Mise à jour du local impossible.")
    if not res.data:
        db.storage.from_(PHOTO_BUCKET).remove([file_path])
        raise HTTPException(404, "Not found")

    if old_path:
        try:
            db.storage.from_(PHOTO_BUCKET).remove([old_path])
        except Exception:
            pass  # nettoyage best-effort — la nouvelle photo est déjà en place

    log_audit(db, user.id, "local.photo_upload", "local", local_id, {"file_path": file_path})
    return res.data[0]


@router.delete("/{local_id}/photo")
async def delete_local_photo(
    local_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("locaux").select("photo_path").eq("id", local_id).execute().data
    if not rows:
        raise HTTPException(404, "Local introuvable")

    old_path = rows[0].get("photo_path")
    db.from_("locaux").update({"photo_path": None, "photo_url": None}).eq("id", local_id).execute()
    if old_path:
        try:
            db.storage.from_(PHOTO_BUCKET).remove([old_path])
        except Exception:
            pass

    log_audit(db, user.id, "local.photo_delete", "local", local_id, {})
    return {"ok": True}
