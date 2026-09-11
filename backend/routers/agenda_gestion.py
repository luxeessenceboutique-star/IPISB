"""Agenda de gestion — RH, Comptabilité et Tâches réunis dans une seule vue
d'échéances, avec relance possible à la demande (voir aussi la boucle
périodique dans main.py, qui appelle utils.reminders.scan_and_notify)."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from deps import CurrentUser, get_current_user, get_db
from utils.reminders import compute_agenda_items, scan_and_notify

router = APIRouter(prefix="/agenda-gestion", tags=["agenda-gestion"])


def _require_admin(user: CurrentUser) -> None:
    if not (user.is_admin() or user.is_rh() or user.is_assistant_rh() or user.is_comptabilite()):
        raise HTTPException(403, "Admin, RH ou Comptabilité uniquement")


@router.get("/overview")
async def get_overview(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    items = compute_agenda_items(db)
    # Chaque catégorie de responsable ne voit que ce qui la concerne, sauf
    # l'admin qui voit tout — évite d'exposer les échéances RH à comptabilite
    # et inversement.
    if not user.is_admin():
        allowed_domains = set()
        if user.is_rh() or user.is_assistant_rh():
            allowed_domains.add("rh")
        if user.is_comptabilite():
            allowed_domains.add("comptabilite")
        items = [i for i in items if i.get("domain") in allowed_domains or i.get("category") == "task"]
    return {"items": items, "count": len(items)}


@router.post("/scan-now")
async def scan_now(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Déclenche immédiatement le même passage de relance que la boucle
    périodique — utile pour tester ou forcer un rappel sans attendre."""
    if not user.is_admin():
        raise HTTPException(403, "Admin only")
    result = await scan_and_notify(db)
    return result
