import io
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer
from supabase import Client

from deps import CurrentUser, get_current_user, get_db
from models import DocumentFileCompose, DocumentFileUpdate, DocumentFolderCreate, DocumentFolderUpdate
from utils.audit import log_audit
from utils.documents import C_GREEN, C_INK, C_LINE, C_MUTED, CONTENT_LEFT, CONTENT_RIGHT, letterhead, page_footer
from utils.html_flowables import _TreeBuilder, _block_flowables, _esc

router = APIRouter(prefix="/document-library", tags=["document-library"])

BUCKET = "document-files"
SIGNED_URL_TTL = 60 * 60  # 1 hour
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_DEPTH = 2  # 0/1/2 = 3 levels

ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/jpeg": "jpg",
    "image/png": "png",
}


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin access only")


# ── Compose: Tiptap HTML -> lettered PDF ────────────────────────────────────

def _compose_styles() -> dict:
    return {
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, textColor=C_GREEN, leading=20, spaceAfter=4),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13.5, textColor=C_GREEN, leading=17, spaceAfter=3),
        "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=11.5, textColor=C_INK, leading=15, spaceAfter=3),
        "h4": ParagraphStyle("h4", fontName="Helvetica-Bold", fontSize=10, textColor=C_MUTED, leading=13, spaceAfter=3),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, textColor=C_INK, leading=15, alignment=TA_JUSTIFY),
        "th": ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9, textColor=C_GREEN),
        "td": ParagraphStyle("td", fontName="Helvetica", fontSize=9.5, textColor=C_INK, leading=13),
        "table_grid_color": C_LINE,
        "table_header_bg": colors.HexColor("#EDEDED"),
    }


def _render_composed_pdf(title: str, body_html: str) -> bytes:
    """Renders a Tiptap-authored document to a PDF carrying the same
    letterhead/footer as attestations/certificats (utils/documents.py),
    reusing the shared HTML->flowables pipeline (utils/html_flowables.py)."""
    width, height = A4
    buf = io.BytesIO()
    styles = _compose_styles()

    def on_page(c, _doc):
        c.saveState()
        letterhead(c, width, height - 18 * mm)
        page_footer(c, width)
        c.restoreState()

    frame_top = height - 54 * mm   # below the letterhead's logo + rule, matching its own geometry
    frame_bottom = 24 * mm         # above the footer's address/contact lines
    frame = Frame(
        CONTENT_LEFT, frame_bottom, width - CONTENT_LEFT - CONTENT_RIGHT, frame_top - frame_bottom,
        id="body", topPadding=0, leftPadding=0, rightPadding=0, bottomPadding=0,
    )
    doc = BaseDocTemplate(
        buf, pagesize=A4, title=title or "Document", author="IPISB",
        pageTemplates=[PageTemplate(id="body", frames=[frame], onPage=on_page)],
    )

    story = [Paragraph(_esc(title), styles["h1"]), Spacer(1, 4 * mm)]
    tree = _TreeBuilder()
    tree.feed(body_html or "")
    story += _block_flowables(tree.root, styles)

    doc.build(story)
    return buf.getvalue()


# ── Folders ──────────────────────────────────────────────────────────────

@router.get("/folders")
async def list_folders(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("document_folders").select("*").order("name").execute()
    return res.data or []


@router.post("/folders")
async def create_folder(
    body: DocumentFolderCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")

    depth = 0
    if body.parent_id:
        parent = db.from_("document_folders").select("depth").eq("id", body.parent_id).execute().data
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if parent[0]["depth"] >= MAX_DEPTH:
            raise HTTPException(400, "Maximum folder depth (3 levels) reached")
        depth = parent[0]["depth"] + 1

    res = db.from_("document_folders").insert({
        "name": name, "parent_id": body.parent_id, "depth": depth, "created_by": user.id,
    }).execute()
    if not res.data:
        raise HTTPException(400, "Could not create folder")

    folder = res.data[0]
    log_audit(db, user.id, "document_folder.create", "document_folder", folder["id"])
    return folder


@router.patch("/folders/{folder_id}")
async def rename_folder(
    folder_id: str,
    body: DocumentFolderUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")

    res = db.from_("document_folders").update({"name": name}).eq("id", folder_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "document_folder.rename", "document_folder", folder_id, {"name": name})
    return res.data[0]


def _descendant_folder_ids(all_folders: list[dict], root_id: str) -> list[str]:
    """All folders under root_id (any depth) — bounded to at most 2 hops
    given the 3-level cap, but walked generically rather than hardcoded."""
    children_by_parent: dict[str | None, list[str]] = {}
    for f in all_folders:
        children_by_parent.setdefault(f["parent_id"], []).append(f["id"])

    out: list[str] = []
    frontier = [root_id]
    while frontier:
        next_frontier: list[str] = []
        for fid in frontier:
            kids = children_by_parent.get(fid, [])
            out.extend(kids)
            next_frontier.extend(kids)
        frontier = next_frontier
    return out


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("document_folders").select("id").eq("id", folder_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    all_folders = db.from_("document_folders").select("id, parent_id").execute().data or []
    folder_ids = [folder_id] + _descendant_folder_ids(all_folders, folder_id)

    files = (
        db.from_("document_files").select("file_path").in_("folder_id", folder_ids).execute().data or []
    )
    if files:
        try:
            db.storage.from_(BUCKET).remove([f["file_path"] for f in files])
        except Exception:
            pass  # storage cleanup is best-effort — don't block the row delete on it

    # DB cascades through document_folders (sub-folders) and document_files
    # (ON DELETE CASCADE on folder_id) from this single delete.
    db.from_("document_folders").delete().eq("id", folder_id).execute()
    log_audit(db, user.id, "document_folder.delete", "document_folder", folder_id, {"files_removed": len(files)})
    return {"ok": True}


# ── Files ────────────────────────────────────────────────────────────────

@router.get("/files")
async def list_files(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    return (
        db.from_("document_files")
        .select("id, reference_code, folder_id, title, source, filename, content_type, created_at, updated_at")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )


@router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Full row including body_html — kept out of the list endpoint (which
    many documents at once would otherwise load in full) and fetched here
    only when actually reopening a composed document for re-editing."""
    _require_admin(user)
    rows = db.from_("document_files").select("*").eq("id", file_id).execute().data
    if not rows:
        raise HTTPException(404, "Fichier introuvable")
    return rows[0]


@router.post("/files/import")
async def import_file(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    title: str = Form(...),
    folder_id: str | None = Form(None),
    file: UploadFile = File(...),
):
    _require_admin(user)
    title = title.strip()
    if not title:
        raise HTTPException(400, "title is required")

    content_type = file.content_type or ""
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise HTTPException(400, "Seuls les fichiers PDF, DOCX, JPG et PNG sont acceptés")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Fichier vide")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "Le fichier dépasse la limite de 20 Mo")

    file_path = f"import/{secrets.token_hex(8)}.{ext}"
    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage : {str(e)}")

    try:
        res = db.from_("document_files").insert({
            "folder_id": folder_id, "title": title, "source": "import",
            "filename": file.filename or f"fichier.{ext}", "file_path": file_path,
            "content_type": content_type, "uploaded_by": user.id,
        }).execute()
        if not res.data:
            raise HTTPException(400, "Impossible d'enregistrer le fichier")
    except Exception:
        db.storage.from_(BUCKET).remove([file_path])
        raise

    new_file = res.data[0]
    log_audit(db, user.id, "document_file.import", "document_file", new_file["id"], {"title": title})
    return new_file


@router.post("/files/compose")
async def compose_file(
    body: DocumentFileCompose,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title is required")

    pdf_bytes = _render_composed_pdf(title, body.body_html)
    file_path = f"composed/{secrets.token_hex(8)}.pdf"
    try:
        db.storage.from_(BUCKET).upload(file_path, pdf_bytes, {"content-type": "application/pdf"})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage : {str(e)}")

    try:
        res = db.from_("document_files").insert({
            "folder_id": body.folder_id, "title": title, "source": "composed",
            "file_path": file_path, "content_type": "application/pdf",
            "body_html": body.body_html, "uploaded_by": user.id,
        }).execute()
        if not res.data:
            raise HTTPException(400, "Impossible d'enregistrer le document")
    except Exception:
        db.storage.from_(BUCKET).remove([file_path])
        raise

    new_file = res.data[0]
    log_audit(db, user.id, "document_file.compose", "document_file", new_file["id"], {"title": title})
    return new_file


@router.patch("/files/{file_id}")
async def update_file(
    file_id: str,
    body: DocumentFileUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("document_files").select("*").eq("id", file_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")
    row = existing[0]

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "title" in updates and not (updates["title"] or "").strip():
        raise HTTPException(400, "title cannot be empty")

    # Re-editing a composed document's body re-renders the PDF and replaces
    # the stored file — only meaningful for source='composed' rows.
    if "body_html" in updates:
        if row["source"] != "composed":
            raise HTTPException(400, "Only composed documents can be re-edited")
        new_title = updates.get("title", row["title"])
        pdf_bytes = _render_composed_pdf(new_title, updates["body_html"])
        new_path = f"composed/{secrets.token_hex(8)}.pdf"
        db.storage.from_(BUCKET).upload(new_path, pdf_bytes, {"content-type": "application/pdf"})
        old_path = row["file_path"]
        updates["file_path"] = new_path
        try:
            res = db.from_("document_files").update(updates).eq("id", file_id).execute()
        except Exception:
            db.storage.from_(BUCKET).remove([new_path])
            raise
        try:
            db.storage.from_(BUCKET).remove([old_path])
        except Exception:
            pass  # best-effort cleanup of the superseded PDF
    else:
        res = db.from_("document_files").update(updates).eq("id", file_id).execute()

    if not res.data:
        raise HTTPException(400, "Could not update document")
    log_audit(db, user.id, "document_file.update", "document_file", file_id, {k: v for k, v in updates.items() if k != "body_html"})
    return res.data[0]


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("document_files").select("file_path").eq("id", file_id).execute().data
    if not rows:
        raise HTTPException(404, "Fichier introuvable")
    signed = db.storage.from_(BUCKET).create_signed_url(rows[0]["file_path"], SIGNED_URL_TTL)
    return {"signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("document_files").select("file_path").eq("id", file_id).execute().data
    if not rows:
        raise HTTPException(404, "Fichier introuvable")
    try:
        db.storage.from_(BUCKET).remove([rows[0]["file_path"]])
    except Exception:
        pass  # storage cleanup is best-effort — don't block the row delete on it
    db.from_("document_files").delete().eq("id", file_id).execute()

    log_audit(db, user.id, "document_file.delete", "document_file", file_id)
    return {"ok": True}
