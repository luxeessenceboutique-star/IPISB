import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import PurchaseReceptionCreate, PurchaseReceptionUpdate, PurchaseReceptionValidation
from utils.audit import log_audit
from routers.accounting_purchases import _reception_counts_as_received

router = APIRouter(prefix="/accounting/receptions", tags=["accounting"])

QUALITY_STATUSES = {"conforme", "non_conforme_partiel", "non_conforme_total", "retourne"}
# Une anomalie qualité ne finalise plus la réception tout de suite (L60) :
# elle reste « pending » — aucun article en stock — tant qu'un admin ne l'a
# pas validée (acceptée ou rejetée), motif obligatoire à l'appui.
ANOMALY_STATUSES = {"non_conforme_partiel", "non_conforme_total", "retourne"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _create_inventory_for_reception(db: Client, purchase: dict, reception: dict, quantity: float, user_id: str) -> None:
    """Crée l'article d'inventaire (+ mouvement d'entrée) correspondant à une
    réception finalisée — à la création directe (conforme) ou lors de la
    validation d'une anomalie acceptée. Best-effort : une erreur ici ne doit
    pas faire échouer la réception/validation elle-même."""
    try:
        asset_category = "consommable"
        pr = purchase.get("purchase_requests")
        if pr and pr.get("asset_category"):
            asset_category = pr.get("asset_category")

        # Valeur d'acquisition de l'actif inventaire — TTC (prix unitaire HT +
        # TVA de l'achat) × quantité reçue, pour correspondre au libellé
        # « Valeur d'acquisition (TTC) » affiché sur la fiche inventaire.
        unit_price_ht = float(purchase.get("unit_price") or 0)
        vat_percent = float(purchase.get("vat_percent") or 0)
        unit_price_ttc = unit_price_ht * (1 + vat_percent / 100)
        initial_val = round(unit_price_ttc * float(quantity), 2)

        inv_data = {
            "name": purchase.get("title") or "Article sans titre",
            "asset_category": asset_category,
            "purchase_id": purchase["id"],
            "reception_id": reception["id"],
            "initial_value": initial_val,
            "purchase_date": purchase.get("purchase_date"),
            "status": "actif",
            "quantity": quantity,
            "created_by": user_id,
        }
        inv_res = db.from_("inventory_items").insert(inv_data).execute()
        if inv_res.data:
            new_item = inv_res.data[0]
            db.from_("inventory_movements").insert({
                "inventory_item_id": new_item["id"],
                "movement_type": "entree",
                "quantity": quantity,
                "movement_date": datetime.now(timezone.utc).date().isoformat(),
                "description": f"Réception de l'achat {purchase.get('purchase_number')}",
                "created_by": user_id,
            }).execute()
    except Exception:
        pass


@router.get("")
async def list_receptions(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    purchase_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("purchase_receptions").select("*, purchases(title, purchase_number)", count="exact")
    if purchase_id:
        query = query.eq("purchase_id", purchase_id)

    start = (page - 1) * page_size
    res = query.order("created_at", desc=True).range(start, start + page_size - 1).execute()

    items = []
    for r in (res.data or []):
        p = r.get("purchases") or {}
        items.append({
            **{k: v for k, v in r.items() if k != "purchases"},
            "purchase_title": p.get("title"),
            "purchase_number": p.get("purchase_number"),
        })

    return {
        "items": items,
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.post("")
async def create_reception(
    body: PurchaseReceptionCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.quality_status not in QUALITY_STATUSES:
        raise HTTPException(400, "Invalid quality_status")

    # Fetch related purchase
    purchase_rows = db.from_("purchases").select("*, purchase_requests(asset_category)").eq("id", body.purchase_id).execute().data
    if not purchase_rows:
        raise HTTPException(404, "Purchase not found")
    purchase = purchase_rows[0]

    if body.received_quantity <= 0:
        raise HTTPException(400, "La quantité reçue doit être supérieure à zéro.")

    # On ne réceptionne jamais plus que la quantité commandée : le cumul des
    # réceptions qui comptent vraiment comme reçues (cf. _reception_counts_as_received —
    # exclut les retours et les anomalies en attente/rejetées) + celle-ci doit
    # rester ≤ quantité de la commande.
    ordered_qty = float(purchase.get("quantity") or 0)
    if ordered_qty > 0:
        prior = (
            db.from_("purchase_receptions")
            .select("received_quantity, validation_status, quality_status").eq("purchase_id", body.purchase_id)
            .execute().data or []
        )
        already_received = sum(float(r.get("received_quantity") or 0) for r in prior if _reception_counts_as_received(r))
        remaining = ordered_qty - already_received
        if body.received_quantity > remaining + 1e-9:
            raise HTTPException(
                400,
                f"Quantité reçue ({body.received_quantity:g}) supérieure au reste à livrer "
                f"({max(remaining, 0):g} sur {ordered_qty:g} commandé(s)).",
            )

    data = body.model_dump()
    data["received_by"] = user.id
    data["created_by"] = user.id
    data["received_at"] = datetime.now(timezone.utc).isoformat()
    # Anomalie qualité → validation obligatoire avant toute entrée en stock
    # (L60). Une réception conforme reste finalisée tout de suite.
    data["validation_status"] = "pending" if body.quality_status in ANOMALY_STATUSES else "auto"

    try:
        res = db.from_("purchase_receptions").insert(data).execute()
    except Exception as ex:
        if "validation_status" in str(ex) or "does not exist" in str(ex):
            raise HTTPException(400, "Migration L60 requise (colonnes de validation des réceptions).")
        raise
    new_reception = res.data[0]

    # Réception conforme : entrée en stock immédiate, comme avant L60.
    # Une anomalie (partiel/total/retourné) reste en attente — voir /validate.
    if data["validation_status"] == "auto" and body.quality_status == "conforme":
        _create_inventory_for_reception(db, purchase, new_reception, body.received_quantity, user.id)

    log_audit(db, user.id, "purchase_reception.create", "purchase_reception", new_reception["id"], {
        "purchase_id": body.purchase_id,
        "received_quantity": body.received_quantity,
        "quality_status": body.quality_status,
        "validation_status": data["validation_status"],
    })

    return new_reception


@router.post("/{reception_id}/validate")
async def validate_reception(
    reception_id: str,
    body: PurchaseReceptionValidation,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Tranche une réception en attente (anomalie qualité) : Accepter crée
    l'article en stock, Rejeter n'en crée aucun. Motif obligatoire dans les
    deux cas — conservé (validated_by/at/comment) comme historique de la
    décision, visible sur la commande."""
    _require_admin(user)
    if body.decision not in ("accept", "reject"):
        raise HTTPException(400, "decision must be 'accept' or 'reject'")
    if not body.comment.strip():
        raise HTTPException(400, "Un commentaire est requis pour motiver la décision.")

    rows = db.from_("purchase_receptions").select("*, purchases(*, purchase_requests(asset_category))").eq("id", reception_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")
    reception = rows[0]
    if reception.get("validation_status") != "pending":
        raise HTTPException(400, "Cette réception n'est pas en attente de validation.")

    purchase = reception.get("purchases") or {}
    new_status = "validated" if body.decision == "accept" else "rejected"
    updates = {
        "validation_status": new_status,
        "validated_by": user.id,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "validation_comment": body.comment.strip(),
    }
    res = db.from_("purchase_receptions").update(updates).eq("id", reception_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    updated = res.data[0]

    if body.decision == "accept":
        _create_inventory_for_reception(db, purchase, updated, float(updated.get("received_quantity") or 0), user.id)

    log_audit(db, user.id, "purchase_reception.validate", "purchase_reception", reception_id, {
        "decision": body.decision, "comment": body.comment.strip(),
    })
    return updated


@router.patch("/{reception_id}")
async def update_reception(
    reception_id: str,
    body: PurchaseReceptionUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Édition d'une réception : essentiellement les contrôles QHSE / CG et le
    statut qualité après coup. La quantité liée à un article d'inventaire déjà
    créé n'est pas resynchronisée ici (édition ciblée sur le contrôle)."""
    _require_admin(user)
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "quality_status" in updates and updates["quality_status"] not in QUALITY_STATUSES:
        raise HTTPException(400, "Invalid quality_status")

    # Même plafond qu'à la création si la quantité reçue est modifiée.
    if "received_quantity" in updates:
        if updates["received_quantity"] <= 0:
            raise HTTPException(400, "La quantité reçue doit être supérieure à zéro.")
        rec_rows = db.from_("purchase_receptions").select("purchase_id").eq("id", reception_id).execute().data
        if rec_rows:
            pid = rec_rows[0]["purchase_id"]
            pr_rows = db.from_("purchases").select("quantity").eq("id", pid).execute().data
            ordered_qty = float((pr_rows[0].get("quantity") if pr_rows else 0) or 0)
            if ordered_qty > 0:
                others = (
                    db.from_("purchase_receptions").select("received_quantity, validation_status, quality_status")
                    .eq("purchase_id", pid).neq("id", reception_id).execute().data or []
                )
                already = sum(float(r.get("received_quantity") or 0) for r in others if _reception_counts_as_received(r))
                if updates["received_quantity"] > ordered_qty - already + 1e-9:
                    raise HTTPException(
                        400,
                        f"Quantité reçue supérieure au reste à livrer "
                        f"({max(ordered_qty - already, 0):g} sur {ordered_qty:g}).",
                    )

    res = db.from_("purchase_receptions").update(updates).eq("id", reception_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "purchase_reception.update", "purchase_reception", reception_id, updates)
    return res.data[0]


@router.delete("/{reception_id}")
async def delete_reception(
    reception_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("purchase_receptions").select("id").eq("id", reception_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    # Delete related inventory items if created
    items = db.from_("inventory_items").select("id").eq("reception_id", reception_id).execute().data or []
    for item in items:
        # Cascade will delete movements
        db.from_("inventory_items").delete().eq("id", item["id"]).execute()

    db.from_("purchase_receptions").delete().eq("id", reception_id).execute()
    log_audit(db, user.id, "purchase_reception.delete", "purchase_reception", reception_id)
    return {"ok": True}
