import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import RevenueCreate, RevenueUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read

router = APIRouter(prefix="/accounting/revenues", tags=["accounting"])

BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 hour
ENTITY_TYPE = "revenue"
ATTACHMENT_KINDS = {"invoice", "receipt", "document"}
REVENUE_TYPES = {"tuition", "subsidy", "donation", "service", "other"}
STATUSES = {"expected", "received", "cancelled"}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _shape(rev: dict) -> dict:
    return {
        **{k: v for k, v in rev.items() if k != "accounting_categories"},
        "category_name": (rev.get("accounting_categories") or {}).get("name"),
    }


@router.get("")
async def list_revenues(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    revenue_type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "revenue_date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)

    allowed_sort = {"revenue_date", "amount", "total_incl_vat", "title", "created_at"}
    if sort_by not in allowed_sort:
        sort_by = "revenue_date"
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("revenues").select("*, accounting_categories(name)", count="exact")
    if q:
        query = query.ilike("title", f"%{q}%")
    if category_id:
        query = query.eq("category_id", category_id)
    if revenue_type:
        query = query.eq("revenue_type", revenue_type)
    if status:
        query = query.eq("status", status)
    if date_from:
        query = query.gte("revenue_date", date_from)
    if date_to:
        query = query.lte("revenue_date", date_to)

    start = (page - 1) * page_size
    res = query.order(sort_by, desc=(sort_dir == "desc")).range(start, start + page_size - 1).execute()

    return {
        "items": [_shape(r) for r in (res.data or [])],
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{revenue_id}")
async def get_revenue(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("revenues").select("*, accounting_categories(name)").eq("id", revenue_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")

    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", revenue_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    return {**_shape(rows[0]), "attachments": attachments}


@router.post("")
async def create_revenue(
    body: RevenueCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.title.strip():
        raise HTTPException(400, "title is required")
    if body.revenue_type not in REVENUE_TYPES:
        raise HTTPException(400, "Invalid revenue_type")
    if body.status not in STATUSES:
        raise HTTPException(400, "Invalid status")

    data = body.model_dump(exclude={"revenue_date"})
    data["revenue_date"] = body.revenue_date or datetime.now(timezone.utc).date().isoformat()
    data["created_by"] = user.id

    res = db.from_("revenues").insert(data).execute()
    new_revenue = res.data[0]
    log_audit(db, user.id, "revenue.create", "revenue", new_revenue["id"], {"title": body.title})
    return _shape(new_revenue)


@router.patch("/{revenue_id}")
async def update_revenue(
    revenue_id: str,
    body: RevenueUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "revenue_type" in updates and updates["revenue_type"] not in REVENUE_TYPES:
        raise HTTPException(400, "Invalid revenue_type")
    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(400, "Invalid status")

    res = db.from_("revenues").update(updates).eq("id", revenue_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "revenue.update", "revenue", revenue_id, updates)
    return _shape(res.data[0])


@router.delete("/{revenue_id}")
async def delete_revenue(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("revenues").select("id").eq("id", revenue_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    attachments = (
        db.from_("accounting_attachments")
        .select("file_path")
        .eq("entity_type", ENTITY_TYPE)
        .eq("entity_id", revenue_id)
        .execute()
        .data or []
    )
    if attachments:
        try:
            db.storage.from_(BUCKET).remove([a["file_path"] for a in attachments])
        except Exception:
            pass
        db.from_("accounting_attachments").delete().eq("entity_type", ENTITY_TYPE).eq("entity_id", revenue_id).execute()

    db.from_("revenues").delete().eq("id", revenue_id).execute()
    log_audit(db, user.id, "revenue.delete", "revenue", revenue_id)
    return {"ok": True}


# ── Attachments (pièces justificatives) ──────────────────────────────────────

@router.post("/{revenue_id}/attachments")
async def upload_attachment(
    revenue_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
    kind: Annotated[str, Form()] = "invoice",
):
    _require_admin(user)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(400, f"Invalid kind. Use one of: {', '.join(ATTACHMENT_KINDS)}")

    revenue = db.from_("revenues").select("id").eq("id", revenue_id).execute().data
    if not revenue:
        raise HTTPException(404, "Revenue not found")

    data, ext = await validate_and_read(file)
    file_path = f"{ENTITY_TYPE}/{revenue_id}/{uuid.uuid4().hex}.{ext}"

    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Failed to store file: {str(e)}")

    res = db.from_("accounting_attachments").insert({
        "entity_type": ENTITY_TYPE,
        "entity_id": revenue_id,
        "kind": kind,
        "file_path": file_path,
        "file_name": file.filename or "document",
        "file_type": file.content_type,
        "file_size": len(data),
        "uploaded_by": user.id,
    }).execute()
    new_attachment = res.data[0]
    log_audit(db, user.id, "revenue.attachment.upload", "revenue", revenue_id, {"kind": kind, "file_name": file.filename})
    return new_attachment


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).eq("entity_type", ENTITY_TYPE)
        .execute().data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    signed = db.storage.from_(BUCKET).create_signed_url(rows[0]["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url"), "file_name": rows[0]["file_name"]}


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = (
        db.from_("accounting_attachments").select("*")
        .eq("id", attachment_id).eq("entity_type", ENTITY_TYPE)
        .execute().data
    )
    if not rows:
        raise HTTPException(404, "Not found")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass
    db.from_("accounting_attachments").delete().eq("id", attachment_id).execute()
    log_audit(db, user.id, "revenue.attachment.delete", "revenue", rows[0]["entity_id"])
    return {"ok": True}
