"""Sources des réponses du Copilote : la page (et l'onglet) de la plateforme
où l'utilisateur retrouve l'information — utilisées pour « Voir la source »
et pour la navigation guidée pendant une réunion.

- Réponse appuyée sur des données : les outils réellement consultés.
- Réponse d'aide (« comment faire… ») : les modules et onglets cités dans le
  texte, limités à ceux auxquels l'utilisateur a accès.
"""
import re
import unicodedata

from .knowledge import sections_for_role

# Outil de lecture → écran où voir ces données.
TOOL_SOURCES: dict[str, dict] = {
    "demandes_conges":    {"path": "/dashboard/rh", "tab": "leaves", "crumbs": ["Gestion", "Ressources humaines", "Congés"]},
    "liste_employes":     {"path": "/dashboard/rh", "tab": "employees", "crumbs": ["Gestion", "Ressources humaines", "Employés"]},
    "synthese_comptable": {"path": "/dashboard/accounting", "tab": "overview", "crumbs": ["Gestion", "Comptabilité", "Vue d'ensemble"]},
    "demandes_achat":     {"path": "/dashboard/accounting", "tab": "purchase_requests", "crumbs": ["Gestion", "Comptabilité", "Demandes d'achat"]},
    "agenda_echeances":   {"path": "/dashboard/agenda-gestion", "tab": None, "crumbs": ["Aperçu", "Agenda de gestion"]},
}

# Onglets cités par leur nom dans une réponse d'aide.
TAB_LABELS: dict[str, list[tuple[str, str]]] = {
    "/dashboard/rh": [
        ("employees", "Employés"), ("leaves", "Congés"), ("payroll", "Paie"), ("performance", "Évaluations"),
        ("recruitment", "Recrutement"), ("onboarding", "Intégration"), ("training", "Formation"),
        ("talents", "Talents"), ("orgchart", "Organigramme"), ("assets", "Matériel"), ("settings", "Paramètres"),
    ],
    "/dashboard/accounting": [
        ("validations", "Validations"), ("overview", "Vue d'ensemble"), ("tuition", "Paiements scolarité"),
        ("revenues", "Recettes"), ("invoices", "Factures"), ("purchase_requests", "Demandes d'achat"),
        ("purchases", "Livraisons"), ("payments", "Paiements"), ("inventory", "Inventaire"), ("locaux", "Locaux"),
        ("budgets", "Budgets"), ("suppliers", "Fournisseurs"), ("categories", "Catégories"),
        ("cash_journal", "Journal de caisse"), ("bank_journal", "Journal des comptes"),
        ("cheques", "Chèques"), ("cash_notes", "Notes de caisse"), ("mission_notes", "Frais de mission"),
        ("journal", "Historique comptable"),
    ],
}
GROUP_OF_PATH = {
    "/dashboard/rh": "Gestion", "/dashboard/accounting": "Gestion", "/dashboard/communication": "Gestion",
    "/dashboard/documents": "Gestion", "/dashboard/reunions-instances": "Gestion", "/dashboard/salle-conference": "Gestion",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _source(path: str, tab, crumbs: list[str]) -> dict:
    return {"path": path, "tab": tab, "crumbs": crumbs, "label": " › ".join(crumbs)}


def sources_from_tools(tool_names: list[str]) -> list[dict]:
    out: list[dict] = []
    for name in tool_names:
        s = TOOL_SOURCES.get(name)
        if s:
            out.append(_source(s["path"], s["tab"], s["crumbs"]))
    return dedupe(out)


def sources_from_text(text: str, roles: list[str]) -> list[dict]:
    """Modules (et onglets) explicitement cités dans la réponse."""
    t = _norm(text)
    out: list[dict] = []
    for sec in sections_for_role(roles):
        path, title = sec["path"], sec["title"]
        if path == "/dashboard" or not re.search(r"\b" + re.escape(_norm(title)) + r"\b", t):
            continue
        group = GROUP_OF_PATH.get(path)
        base = ([group] if group else []) + [title]
        tabs = [(k, lbl) for k, lbl in TAB_LABELS.get(path, []) if re.search(r"\b" + re.escape(_norm(lbl)) + r"\b", t)]
        if tabs:
            for k, lbl in tabs[:2]:
                out.append(_source(path, k, base + [lbl]))
        else:
            out.append(_source(path, None, base))
    return dedupe(out)


def dedupe(items: list[dict], limit: int = 3) -> list[dict]:
    seen, out = set(), []
    for s in items:
        key = (s["path"], s.get("tab"))
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out[:limit]
