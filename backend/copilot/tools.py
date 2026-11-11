"""Outils de LECTURE des agents du Copilote.

Même principe que copilot/actions.py : chaque outil appelle directement la
fonction du routeur que l'interface utilise, avec le MÊME utilisateur et le
MÊME client — les vérifications de rôle du routeur s'appliquent telles
quelles (un 403 devient « accès refusé » pour l'agent). Aucun outil ici
n'écrit quoi que ce soit : les écritures restent des propositions à
confirmer (agent « actions »).
"""
import json
import logging
from typing import Any, Optional

from fastapi import HTTPException
from langchain_core.tools import StructuredTool
from supabase import Client

from deps import CurrentUser
from routers import agenda_gestion, accounting_dashboard, accounting_purchase_requests, rh_employees, rh_leaves

log = logging.getLogger(__name__)
MAX_CHARS = 6000


def _dump(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str)
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "… (résultat tronqué)"
    return text


async def _call(func, user: CurrentUser, db: Client, **kwargs) -> str:
    try:
        return _dump(await func(user=user, db=db, **kwargs))
    except HTTPException as e:
        if e.status_code == 403:
            return "ACCÈS REFUSÉ : le rôle de cet utilisateur ne permet pas de consulter ces données."
        return f"Erreur {e.status_code} : {e.detail}"
    except Exception as e:  # une panne d'outil ne doit pas faire tomber la réponse
        log.warning("Copilot tool %s failed: %s", getattr(func, "__name__", func), e)
        return f"Erreur lors de la lecture des données : {type(e).__name__}"


def build_read_tools(user: CurrentUser, db: Client) -> dict[str, StructuredTool]:
    async def agenda_echeances() -> str:
        """Échéances et éléments à traiter (RH, Comptabilité, Tâches) : en retard, aujourd'hui, à venir."""
        return await _call(agenda_gestion.get_overview, user, db)

    async def synthese_comptable() -> str:
        """Synthèse comptable globale : achats, dépenses, recettes, factures et budgets agrégés."""
        return await _call(accounting_dashboard.dashboard_summary, user, db)

    async def demandes_achat(statut: Optional[str] = None, recherche: Optional[str] = None) -> str:
        """Liste des demandes d'achat (DI/DA). statut possible : brouillon, retournee, besoin_valide, en_consultation, devis_valide, commande_emise, annulee."""
        return await _call(accounting_purchase_requests.list_requests, user, db, q=recherche, status=statut, page=1, page_size=25)

    async def liste_employes(recherche: Optional[str] = None, statut: Optional[str] = None, departement: Optional[str] = None) -> str:
        """Liste des employés (nom, poste, département, statut). recherche : nom ou poste."""
        return await _call(rh_employees.list_employees, user, db, q=recherche, status=statut, department=departement, page=1, page_size=50)

    async def demandes_conges(statut: Optional[str] = None) -> str:
        """Demandes de congé. statut possible : pending, approved, rejected, cancelled."""
        return await _call(rh_leaves.list_leaves, user, db, status=statut, page=1, page_size=50)

    funcs = [agenda_echeances, synthese_comptable, demandes_achat, liste_employes, demandes_conges]
    return {f.__name__: StructuredTool.from_function(coroutine=f, name=f.__name__, description=f.__doc__) for f in funcs}


RH_TOOLS = ("liste_employes", "demandes_conges", "agenda_echeances")
FINANCE_TOOLS = ("synthese_comptable", "demandes_achat", "agenda_echeances")
