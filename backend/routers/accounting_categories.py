import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import CategoryCreate, CategoryUpdate, CategoryArticleCreate, CategoryArticleUpdate
from utils.audit import log_audit
from utils.uploads import validate_and_read

router = APIRouter(prefix="/accounting/categories", tags=["accounting"])

BUCKET = "accounting"
SIGNED_URL_TTL = 60 * 60  # 1 heure


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_categories(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    return db.from_("accounting_categories").select("*").order("name").execute().data or []


@router.post("")
async def create_category(
    body: CategoryCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # `code` n'est écrit que s'il est fourni : reste compatible avec une base
    # où la migration l52 (colonne accounting_categories.code) n'est pas
    # encore appliquée.
    row = {"name": body.name, "created_by": user.id}
    if body.code:
        row["code"] = body.code
    try:
        res = db.from_("accounting_categories").insert(row).execute()
    except Exception as e:
        raise HTTPException(400, str(e))
    new_category = res.data[0]
    log_audit(db, user.id, "category.create", "accounting_category", new_category["id"], {"name": body.name, "code": body.code})
    return new_category


@router.patch("/{category_id}")
async def update_category(
    category_id: str,
    body: CategoryUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune modification")
    try:
        res = db.from_("accounting_categories").update(updates).eq("id", category_id).execute()
    except Exception as e:
        raise HTTPException(400, str(e))
    if not res.data:
        raise HTTPException(404, "Catégorie introuvable")
    log_audit(db, user.id, "category.update", "accounting_category", category_id, updates)
    return res.data[0]


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    in_use = db.from_("purchases").select("id").eq("category_id", category_id).limit(1).execute().data
    if in_use:
        raise HTTPException(409, "Category is in use by existing purchases")
    db.from_("accounting_categories").delete().eq("id", category_id).execute()
    log_audit(db, user.id, "category.delete", "accounting_category", category_id)
    return {"ok": True}


# ── Catalogue d'articles par catégorie (migration l52) ───────────────────────
# Chaque catégorie peut porter une liste d'articles (Code article / Article /
# Caractéristiques / Commentaire), réutilisable pour pré-remplir une Demande
# d'achat (champs `article_code` / `characteristics`, déjà existants et
# indépendants sur purchase_requests).

@router.get("/{category_id}/articles")
async def list_category_articles(
    category_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    return (
        db.from_("accounting_category_articles").select("*")
        .eq("category_id", category_id).order("article").execute().data or []
    )


@router.post("/{category_id}/articles")
async def create_category_article(
    category_id: str,
    body: CategoryArticleCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    cat = db.from_("accounting_categories").select("id").eq("id", category_id).execute().data
    if not cat:
        raise HTTPException(404, "Catégorie introuvable")
    row = {
        "category_id": category_id,
        "article": body.article,
        "code_article": body.code_article,
        "caracteristiques": body.caracteristiques,
        "commentaire": body.commentaire,
        "created_by": user.id,
    }
    try:
        res = db.from_("accounting_category_articles").insert(row).execute()
    except Exception as e:
        raise HTTPException(400, str(e))
    new_article = res.data[0]
    log_audit(db, user.id, "category_article.create", "accounting_category_article", new_article["id"],
              {"category_id": category_id, "article": body.article})
    return new_article


@router.patch("/{category_id}/articles/{article_id}")
async def update_category_article(
    category_id: str,
    article_id: str,
    body: CategoryArticleUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune modification")
    res = (
        db.from_("accounting_category_articles").update(updates)
        .eq("id", article_id).eq("category_id", category_id).execute()
    )
    if not res.data:
        raise HTTPException(404, "Article introuvable")
    log_audit(db, user.id, "category_article.update", "accounting_category_article", article_id, updates)
    return res.data[0]


@router.delete("/{category_id}/articles/{article_id}")
async def delete_category_article(
    category_id: str,
    article_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    db.from_("accounting_category_articles").delete().eq("id", article_id).eq("category_id", category_id).execute()
    log_audit(db, user.id, "category_article.delete", "accounting_category_article", article_id)
    return {"ok": True}


def _get_article_or_404(db: Client, category_id: str, article_id: str) -> dict:
    rows = (
        db.from_("accounting_category_articles").select("*")
        .eq("id", article_id).eq("category_id", category_id).execute().data
    )
    if not rows:
        raise HTTPException(404, "Article introuvable")
    return rows[0]


@router.post("/{category_id}/articles/{article_id}/cdc")
async def upload_article_cdc(
    category_id: str,
    article_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    file: UploadFile,
):
    """Joint (ou remplace) le cahier des charges / fiche technique de l'article."""
    _require_admin(user)
    article = _get_article_or_404(db, category_id, article_id)

    data, ext = await validate_and_read(file)
    file_path = f"category_article/{article_id}/cdc/{uuid.uuid4().hex}.{ext}"
    try:
        db.storage.from_(BUCKET).upload(file_path, data, {"content-type": file.content_type})
    except Exception as e:
        raise HTTPException(500, f"Échec du stockage du fichier : {str(e)}")

    if article.get("cdc_path"):
        try:
            db.storage.from_(BUCKET).remove([article["cdc_path"]])
        except Exception:
            pass

    try:
        res = db.from_("accounting_category_articles").update({
            "cdc_path": file_path, "cdc_name": file.filename or "cdc",
        }).eq("id", article_id).execute()
    except Exception as ex:
        msg = str(ex)
        if "does not exist" in msg or "Could not find" in msg:
            raise HTTPException(400, "Migration L73 requise (cahier des charges des articles).")
        raise
    log_audit(db, user.id, "category_article.cdc.upload", "accounting_category_article", article_id,
              {"file_name": file.filename})
    return res.data[0]


@router.get("/{category_id}/articles/{article_id}/cdc")
async def download_article_cdc(
    category_id: str,
    article_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    article = _get_article_or_404(db, category_id, article_id)
    if not article.get("cdc_path"):
        raise HTTPException(404, "Aucun cahier des charges joint à cet article.")
    signed = db.storage.from_(BUCKET).create_signed_url(article["cdc_path"], SIGNED_URL_TTL)
    return {
        "signed_url": signed.get("signedURL") or signed.get("signed_url"),
        "file_name": article.get("cdc_name") or "cdc",
    }


@router.delete("/{category_id}/articles/{article_id}/cdc")
async def delete_article_cdc(
    category_id: str,
    article_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    article = _get_article_or_404(db, category_id, article_id)
    if not article.get("cdc_path"):
        raise HTTPException(404, "Aucun cahier des charges joint à cet article.")
    try:
        db.storage.from_(BUCKET).remove([article["cdc_path"]])
    except Exception:
        pass
    res = db.from_("accounting_category_articles").update({
        "cdc_path": None, "cdc_name": None,
    }).eq("id", article_id).execute()
    log_audit(db, user.id, "category_article.cdc.delete", "accounting_category_article", article_id)
    return res.data[0]
