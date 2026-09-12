import csv
import io
import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Annotated, Optional
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import (
    InventoryItemCreate, InventoryItemUpdate, InventoryMovementCreate,
    InventoryAllocationsUpdate,
)
from utils.audit import log_audit
from utils.excel import make_xlsx

router = APIRouter(prefix="/accounting/inventory", tags=["accounting"])

# Catégories historiques — repli si la migration L56 (catégories gérables,
# table inventory_categories) n'est pas encore passée.
ASSET_CATEGORIES_FALLBACK = {"consommable", "equipement", "locaux", "service"}
MOVEMENT_TYPES = {"entree", "sortie", "ajustement"}
# 'en_stock' ajouté par la migration L58 — la contrainte CHECK en base doit
# être mise à jour (sinon l'insertion/mise à jour échoue proprement, cf.
# _status_check_error ci-dessous).
ITEM_STATUSES = {"en_stock", "actif", "hors_service", "vendu", "perdu"}

# Champs ajoutés par la migration L54 — on les envoie seulement quand ils sont
# renseignés pour ne pas casser la création si la migration n'est pas passée.
_L54_ITEM_FIELDS = ("caracteristiques", "unite", "prix_unitaire_ttc", "tva_percent")

_CATEGORY_LABELS_FALLBACK = {
    "consommable": "Consommable", "equipement": "Équipement",
    "locaux": "Local", "service": "Service",
}
_STATE_LABELS = {"rupture": "Rupture", "alerte": "Sous seuil", "ok": "En stock"}


def _require_admin(user: CurrentUser) -> None:
    if not user.can_access_accounting_full():
        raise HTTPException(403, "Admin only")


def _valid_category_keys(db: Client) -> set[str]:
    """Clés de catégorie actives (L56) — repli sur les 4 historiques si la
    migration n'est pas passée ou si le référentiel est vide."""
    try:
        rows = db.from_("inventory_categories").select("key").eq("active", True).execute().data or []
        keys = {r["key"] for r in rows}
        return keys or ASSET_CATEGORIES_FALLBACK
    except Exception:
        return ASSET_CATEGORIES_FALLBACK


def _category_label(db: Client, key: Optional[str]) -> str:
    if not key:
        return "tous"
    try:
        rows = db.from_("inventory_categories").select("label").eq("key", key).execute().data
        if rows:
            return rows[0]["label"]
    except Exception:
        pass
    return _CATEGORY_LABELS_FALLBACK.get(key, key)


def _status_check_error(ex: Exception) -> Optional[HTTPException]:
    """Si l'écriture échoue parce que le statut 'en_stock' n'est pas encore
    accepté par la contrainte CHECK en base (migration L58 non passée),
    renvoie une erreur claire plutôt que l'exception brute PostgREST."""
    msg = str(ex)
    if "inventory_items_status_check" in msg or "status_check" in msg:
        return HTTPException(400, "Migration L58 requise (statut « En stock » non reconnu en base).")
    return None


def _calculate_amortization(item: dict) -> dict:
    initial_val = float(item.get("initial_value") or 0)
    duration = item.get("amortissement_duree_annees")
    p_date_str = item.get("purchase_date")

    amortized_amount = 0.0
    vnc = initial_val
    amortization_percentage = 0.0
    yearly_amortization = 0.0

    if duration and duration > 0 and p_date_str:
        try:
            p_date = date.fromisoformat(p_date_str)
            today = date.today()
            days_elapsed = (today - p_date).days
            if days_elapsed < 0:
                days_elapsed = 0

            total_days = duration * 365.25
            ratio = min(1.0, days_elapsed / total_days)

            amortized_amount = round(initial_val * ratio, 2)
            vnc = round(initial_val - amortized_amount, 2)
            amortization_percentage = round(ratio * 100, 2)
            yearly_amortization = round(initial_val / duration, 2)
        except Exception:
            pass

    return {
        **item,
        "amortized_amount": amortized_amount,
        "vnc": vnc,
        "amortization_percentage": amortization_percentage,
        "yearly_amortization": yearly_amortization,
    }


def _stock_state(quantity: float, niveau_alerte) -> str:
    if quantity <= 0:
        return "rupture"
    if niveau_alerte is not None and quantity <= float(niveau_alerte):
        return "alerte"
    return "ok"


def _item_allocations(db: Client, item_id: str) -> list[dict]:
    try:
        return (
            db.from_("inventory_allocations")
            .select("location, quantity")
            .eq("inventory_item_id", item_id)
            .order("location")
            .execute().data or []
        )
    except Exception:
        return []


@router.get("")
async def list_inventory(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    q: Optional[str] = None,
    asset_category: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
):
    _require_admin(user)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    query = db.from_("inventory_items").select("*", count="exact")
    if q:
        query = query.ilike("name", f"%{q}%")
    if asset_category:
        query = query.eq("asset_category", asset_category)
    if status:
        query = query.eq("status", status)

    start = (page - 1) * page_size
    res = query.order("code_unique", desc=False).range(start, start + page_size - 1).execute()

    items = [_calculate_amortization(item) for item in (res.data or [])]

    return {
        "items": items,
        "total": res.count or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/alerts")
async def list_alerts(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("inventory_items").select("*").eq("status", "actif").not_.is_("niveau_alerte", "null").execute().data or []
    alerts = [
        _calculate_amortization(r) for r in rows
        if float(r.get("quantity") or 0) <= float(r.get("niveau_alerte") or 0)
    ]
    return alerts


def _table_rows(db: Client, asset_category=None, status=None, q=None) -> list[dict]:
    query = db.from_("inventory_items").select("*")
    if asset_category:
        query = query.eq("asset_category", asset_category)
    if status:
        query = query.eq("status", status)
    if q:
        query = query.ilike("name", f"%{q}%")
    items = query.order("code_unique", desc=False).execute().data or []
    ids = [it["id"] for it in items]

    movements: list[dict] = []
    allocs: list[dict] = []
    if ids:
        try:
            movements = db.from_("inventory_movements").select(
                "inventory_item_id, movement_type, quantity, beneficiary"
            ).in_("inventory_item_id", ids).execute().data or []
        except Exception:
            movements = db.from_("inventory_movements").select(
                "inventory_item_id, movement_type, quantity"
            ).in_("inventory_item_id", ids).execute().data or []
        try:
            allocs = db.from_("inventory_allocations").select(
                "inventory_item_id, location, quantity"
            ).in_("inventory_item_id", ids).execute().data or []
        except Exception:
            allocs = []

    entree_by: dict[str, float] = {}
    sortie_by: dict[str, float] = {}
    benef_by: dict[str, list[str]] = {}
    for m in movements:
        iid = m["inventory_item_id"]
        qy = float(m.get("quantity") or 0)
        if m.get("movement_type") == "entree":
            entree_by[iid] = entree_by.get(iid, 0.0) + qy
        elif m.get("movement_type") == "sortie":
            sortie_by[iid] = sortie_by.get(iid, 0.0) + qy
            b = (m.get("beneficiary") or "").strip()
            if b and qy > 0:
                benef_by.setdefault(iid, [])
                if b not in benef_by[iid]:
                    benef_by[iid].append(b)

    alloc_by: dict[str, list[dict]] = {}
    for a in allocs:
        alloc_by.setdefault(a["inventory_item_id"], []).append(
            {"location": a["location"], "quantity": float(a.get("quantity") or 0)}
        )
    for lst in alloc_by.values():
        lst.sort(key=lambda x: x["location"])

    rows = []
    for it in items:
        iid = it["id"]
        qty = float(it.get("quantity") or 0)
        alert = it.get("niveau_alerte")
        pu = it.get("prix_unitaire_ttc")
        pu = float(pu) if pu is not None else None
        rows.append({
            "id": iid,
            "code_unique": it.get("code_unique"),
            "name": it.get("name"),
            "caracteristiques": it.get("caracteristiques") or "",
            "unite": it.get("unite") or "",
            "asset_category": it.get("asset_category"),
            "status": it.get("status"),
            "quantity": qty,
            "niveau_alerte": float(alert) if alert is not None else None,
            "stock_state": _stock_state(qty, alert),
            "prix_unitaire_ttc": pu,
            "tva_percent": float(it["tva_percent"]) if it.get("tva_percent") is not None else None,
            "prix_total_stock": round(pu * qty, 2) if pu is not None else None,
            "total_entree": round(entree_by.get(iid, 0.0), 2),
            "total_sortie": round(sortie_by.get(iid, 0.0), 2),
            "beneficiaries": benef_by.get(iid, []),
            "allocations": alloc_by.get(iid, []),
            "location": it.get("location") or "",
        })
    return rows


@router.get("/table")
async def inventory_table(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    asset_category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    """Vue tableau filtrable : une ligne par article avec les agrégats
    (entrées / sorties cumulées, demandeurs, ventilation par local, valeurs)."""
    _require_admin(user)
    return {"rows": _table_rows(db, asset_category, status, q)}


@router.get("/table/export")
async def inventory_table_export(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    asset_category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    fmt: str = "xlsx",
):
    _require_admin(user)
    rows = _table_rows(db, asset_category, status, q)
    today = datetime.now(timezone.utc).date()
    out = []
    for r in rows:
        out.append({
            "code_unique": r["code_unique"],
            "name": r["name"],
            "caracteristiques": r["caracteristiques"],
            "unite": r["unite"],
            "state": _STATE_LABELS.get(r["stock_state"], r["stock_state"]),
            "quantity": r["quantity"],
            "prix_unitaire_ttc": r["prix_unitaire_ttc"] or 0,
            "prix_total_stock": r["prix_total_stock"] or 0,
            "total_entree": r["total_entree"],
            "total_sortie": r["total_sortie"],
            "beneficiaries": ", ".join(r["beneficiaries"]),
            "allocations": " · ".join(f'{a["location"]}: {a["quantity"]:g}' for a in r["allocations"]),
        })
    cat = _category_label(db, asset_category)
    stem = f"Inventaire_{cat}_{today.isoformat()}"

    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Code article", "Article", "Caractéristiques", "Unité", "État de stock",
                    "Quantité", "Prix unité TTC", "Prix total stock", "Total entré",
                    "Total sorti", "Demandeurs", "Affectation par local"])
        for r in out:
            w.writerow([r["code_unique"], r["name"], r["caracteristiques"], r["unite"], r["state"],
                        f'{r["quantity"]:g}', f'{r["prix_unitaire_ttc"]:.2f}', f'{r["prix_total_stock"]:.2f}',
                        f'{r["total_entree"]:g}', f'{r["total_sortie"]:g}', r["beneficiaries"], r["allocations"]])
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'},
        )

    total_val = sum(r["prix_total_stock"] for r in out)
    return make_xlsx(
        filename=f"{stem}.xlsx",
        title="INVENTAIRE IPISB",
        subtitle=f"Édité le {today.strftime('%d/%m/%Y')} — {cat} — {len(out)} article(s) — "
                 f"Valeur stock : {total_val:,.2f} MAD".replace(",", " "),
        theme="grey",
        sheet_name="Inventaire",
        columns=[
            {"key": "code_unique", "label": "Code article", "width": 14},
            {"key": "name", "label": "Article", "width": 26},
            {"key": "caracteristiques", "label": "Caractéristiques", "width": 28},
            {"key": "unite", "label": "Unité", "width": 10},
            {"key": "state", "label": "État de stock", "width": 13},
            {"key": "quantity", "label": "Quantité", "type": "int", "width": 11},
            {"key": "prix_unitaire_ttc", "label": "Prix unité TTC", "type": "money", "width": 15},
            {"key": "prix_total_stock", "label": "Prix total stock", "type": "money", "width": 16},
            {"key": "total_entree", "label": "Total entré", "type": "int", "width": 11},
            {"key": "total_sortie", "label": "Total sorti", "type": "int", "width": 11},
            {"key": "beneficiaries", "label": "Demandeurs", "width": 24},
            {"key": "allocations", "label": "Affectation par local", "width": 30},
        ],
        rows=out,
    )


@router.get("/{item_id}")
async def get_inventory_item(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    rows = db.from_("inventory_items").select("*, purchases(purchase_number)").eq("id", item_id).execute().data
    if not rows:
        raise HTTPException(404, "Not found")

    item = rows[0]
    p = item.get("purchases") or {}
    shaped = {
        **{k: v for k, v in item.items() if k != "purchases"},
        "purchase_number": p.get("purchase_number"),
    }

    shaped = _calculate_amortization(shaped)

    attachments = (
        db.from_("accounting_attachments")
        .select("id, kind, file_name, file_type, file_size, created_at")
        .eq("entity_type", "inventory_item")
        .eq("entity_id", item_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    shaped["attachments"] = attachments
    shaped["allocations"] = _item_allocations(db, item_id)
    return shaped


@router.post("")
async def create_inventory_item(
    body: InventoryItemCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.asset_category not in _valid_category_keys(db):
        raise HTTPException(400, "Invalid asset_category")
    if body.status not in ITEM_STATUSES:
        raise HTTPException(400, "Invalid status")

    data = body.model_dump(exclude={"purchase_date", *_L54_ITEM_FIELDS})
    data["purchase_date"] = body.purchase_date or date.today().isoformat()
    data["created_by"] = user.id
    # champs L54 : seulement si renseignés (compat pré-migration)
    for f in _L54_ITEM_FIELDS:
        v = getattr(body, f)
        if v is not None:
            data[f] = v

    try:
        res = db.from_("inventory_items").insert(data).execute()
    except Exception as ex:
        status_err = _status_check_error(ex)
        if status_err:
            raise status_err
        raise
    new_item = res.data[0]

    # Create initial entree movement if quantity > 0
    if body.quantity > 0:
        db.from_("inventory_movements").insert({
            "inventory_item_id": new_item["id"],
            "movement_type": "entree",
            "quantity": body.quantity,
            "movement_date": data["purchase_date"],
            "description": "Création initiale de l'article d'inventaire",
            "created_by": user.id,
        }).execute()
        # ventilation initiale sur l'emplacement principal
        if body.location:
            try:
                db.from_("inventory_allocations").insert({
                    "inventory_item_id": new_item["id"],
                    "location": body.location.strip(),
                    "quantity": body.quantity,
                }).execute()
            except Exception:
                pass

    log_audit(db, user.id, "inventory_item.create", "inventory_item", new_item["id"],
              {"name": body.name, "reference": new_item.get("reference") or new_item.get("code_unique")})
    return _calculate_amortization(new_item)


@router.patch("/{item_id}")
async def update_inventory_item(
    item_id: str,
    body: InventoryItemUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    # Ces champs peuvent être remis à vide depuis la fiche.
    nullable = {"caracteristiques", "unite", "prix_unitaire_ttc", "niveau_alerte",
                "location", "comment", "amortissement_duree_annees"}
    raw = body.model_dump(exclude_unset=True)
    updates = {k: v for k, v in raw.items() if k in nullable or v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    if updates.get("asset_category") is not None and updates["asset_category"] not in _valid_category_keys(db):
        raise HTTPException(400, "Invalid asset_category")
    if updates.get("status") is not None and updates["status"] not in ITEM_STATUSES:
        raise HTTPException(400, "Invalid status")

    try:
        res = db.from_("inventory_items").update(updates).eq("id", item_id).execute()
    except Exception as ex:
        status_err = _status_check_error(ex)
        if status_err:
            raise status_err
        if any(f in str(ex) for f in _L54_ITEM_FIELDS) or "does not exist" in str(ex):
            for f in _L54_ITEM_FIELDS:
                updates.pop(f, None)
            if not updates:
                raise HTTPException(400, "Migration L54 requise pour ces champs.")
            res = db.from_("inventory_items").update(updates).eq("id", item_id).execute()
        else:
            raise
    if not res.data:
        raise HTTPException(404, "Not found")

    log_audit(db, user.id, "inventory_item.update", "inventory_item", item_id, updates)
    return _calculate_amortization(res.data[0])


@router.put("/{item_id}/allocations")
async def set_allocations(
    item_id: str,
    body: InventoryAllocationsUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Remplace la ventilation par local d'un article. La somme des quantités
    n'est pas forcée à égaler le stock : l'écart est renvoyé pour information."""
    _require_admin(user)
    item = db.from_("inventory_items").select("id, quantity").eq("id", item_id).execute().data
    if not item:
        raise HTTPException(404, "Not found")

    agg: dict[str, float] = {}
    for a in body.allocations:
        loc = (a.location or "").strip()
        if not loc:
            continue
        agg[loc] = round(agg.get(loc, 0.0) + max(0.0, float(a.quantity or 0)), 4)

    try:
        db.from_("inventory_allocations").delete().eq("inventory_item_id", item_id).execute()
        if agg:
            db.from_("inventory_allocations").insert(
                [{"inventory_item_id": item_id, "location": k, "quantity": v} for k, v in agg.items()]
            ).execute()
    except Exception as ex:
        msg = str(ex)
        if "does not exist" in msg or "inventory_allocations" in msg:
            raise HTTPException(400, "Migration L54 requise (table inventory_allocations).")
        raise HTTPException(500, "Écriture de la ventilation impossible.")

    log_audit(db, user.id, "inventory_item.allocations", "inventory_item", item_id,
              {"locations": list(agg.keys()), "total": round(sum(agg.values()), 2)})

    item_qty = float(item[0].get("quantity") or 0)
    allocated = round(sum(agg.values()), 2)
    return {
        "ok": True,
        "allocations": [{"location": k, "quantity": v} for k, v in sorted(agg.items())],
        "allocated_total": allocated,
        "item_quantity": item_qty,
        "unallocated": round(item_qty - allocated, 2),
    }


@router.delete("/{item_id}")
async def delete_inventory_item(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("inventory_items").select("id").eq("id", item_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("inventory_items").delete().eq("id", item_id).execute()
    log_audit(db, user.id, "inventory_item.delete", "inventory_item", item_id)
    return {"ok": True}


# ── Inventory movements ─────────────────────────────────────────────────────

@router.get("/{item_id}/movements")
async def list_movements(
    item_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    item_exists = db.from_("inventory_items").select("id").eq("id", item_id).execute().data
    if not item_exists:
        raise HTTPException(404, "Inventory item not found")

    res = db.from_("inventory_movements").select("*").eq("inventory_item_id", item_id).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/{item_id}/movements")
async def create_movement(
    item_id: str,
    body: InventoryMovementCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if body.movement_type not in MOVEMENT_TYPES:
        raise HTTPException(400, "Invalid movement_type")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")

    item_rows = db.from_("inventory_items").select("quantity").eq("id", item_id).execute().data
    if not item_rows:
        raise HTTPException(404, "Inventory item not found")

    current_quantity = float(item_rows[0].get("quantity") or 0)
    qty_diff = float(body.quantity)

    if body.movement_type == "entree":
        new_quantity = current_quantity + qty_diff
    elif body.movement_type == "sortie":
        new_quantity = current_quantity - qty_diff
        if new_quantity < 0:
            raise HTTPException(400, "Stock insuffisant pour cette sortie")
    else:  # ajustement : fixe la quantité absolue
        new_quantity = qty_diff

    data = body.model_dump(exclude={"movement_date", "beneficiary"})
    data["inventory_item_id"] = item_id
    data["movement_date"] = body.movement_date or date.today().isoformat()
    data["created_by"] = user.id
    if body.beneficiary is not None and body.beneficiary.strip():
        data["beneficiary"] = body.beneficiary.strip()

    try:
        res = db.from_("inventory_movements").insert(data).execute()
    except Exception as ex:
        if "beneficiary" in str(ex):
            data.pop("beneficiary", None)
            res = db.from_("inventory_movements").insert(data).execute()
        else:
            raise
    new_movement = res.data[0]

    db.from_("inventory_items").update({"quantity": new_quantity}).eq("id", item_id).execute()

    log_audit(db, user.id, "inventory_item.movement", "inventory_item", item_id, {
        "movement_type": body.movement_type,
        "quantity": body.quantity,
        "new_quantity": new_quantity,
    })

    return new_movement
