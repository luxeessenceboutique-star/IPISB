"""
Role-tagged knowledge base describing every module of IPISB Connect, used by
the in-app platform copilot (backend/copilot/agent.py) to answer "how do I…"
and "what is…" questions from logged-in users.

Each section is tagged with which roles can actually see it in the sidebar
(frontend/src/routes/dashboard.tsx SIDE_ITEMS / allItems), so the copilot
never explains a feature a given user can't access.
"""

# role tags: "all" (tout compte authentifié), "staff" (admin+professor), "admin" (admin only).
# Certains modules "admin" sont en réalité aussi accordés à un rôle métier
# précis qui n'est ni admin ni professor (comptabilite, rh, assistant_rh,
# cashier, accountant) — voir les *_ROLES en bas de fichier et
# sections_for_role(), qui les ajoute explicitement pour ces rôles-là.
#
# Ce fichier décrit UNIQUEMENT le projet Administratif (comptabilité, RH,
# communication, documents, utilisateurs) — les modules pédagogiques
# (cours, examens, classes, bibliothèque, élèves…) vivent dans le projet
# Pédagogique, une application séparée avec sa propre base de données.

PLATFORM_SECTIONS: list[dict] = [
    {
        "key": "overview", "title": "Aperçu", "path": "/dashboard", "roles": ["all"],
        "body": "Page d'accueil personnalisée : raccourcis vers les sections les plus utilisées selon le "
                "rôle du compte.",
    },
    {
        "key": "notifications", "title": "Notifications", "path": "/dashboard/notifications", "roles": ["all"],
        "body": "Centre de notifications (tâche assignée, message dans un groupe de discussion, décision "
                "en attente, etc.). Le badge rouge dans la barre latérale indique le nombre de notifications "
                "non lues ; cliquer une notification ouvre directement l'élément concerné.",
    },
    {
        "key": "profile", "title": "Mon profil", "path": "/dashboard/profile", "roles": ["all"],
        "body": "Informations personnelles de l'utilisateur connecté et paramètres du compte.",
    },
    {
        "key": "meetings", "title": "Réunions", "path": "/dashboard/meetings", "roles": ["all"],
        "body": "Visioconférence intégrée (Jitsi) : planifier une réunion, obtenir le lien, et rejoindre "
                "une session directement depuis la plateforme sans logiciel externe.",
    },
    {
        "key": "communication", "title": "Communication", "path": "/dashboard/communication", "roles": ["all"],
        "body": "Deux onglets : Annonces (diffusion interne ciblée par rôle — admin, professeurs, "
                "stagiaires — publiée uniquement par un administrateur) et Groupes (discussions liées aux "
                "tâches partagées : dès qu'une tâche est assignée à 2 personnes ou plus, un groupe est créé "
                "automatiquement pour qu'elles en discutent).",
    },
    {
        "key": "purchase_requests_self", "title": "Demandes d'achat", "path": "/dashboard/purchase-requests",
        "roles": ["all"],
        "body": "Page en libre-service ouverte à tout compte connecté : chacun crée et suit ses propres "
                "demandes d'achat ; seul un administrateur ou la comptabilité décide (validation, devis, "
                "émission de la commande).",
    },
    {
        "key": "tasks", "title": "Gestion des tâches", "path": "/dashboard/tasks", "roles": ["admin"],
        "body": "Tableau de tâches générique (Kanban ou liste) pour toute l'équipe, avec priorité, "
                "échéance, domaine (RH/Comptabilité/Scolarité/Général) et commentaires. Chacun peut créer, "
                "s'assigner et faire évoluer une tâche librement ; la suppression est réservée au créateur, "
                "à un assigné ou à un administrateur.",
    },
    {
        "key": "users", "title": "Utilisateurs", "path": "/dashboard/users", "roles": ["staff"],
        "body": "Gestion des comptes de la plateforme. Un administrateur crée un compte par CANAL de "
                "permission (V2 = administrateur, V1 = comptabilité, V0 = formateurs/assistantes "
                "RH/comptable — V0 attribue les 3 rôles à la fois) plutôt qu'un rôle brut, et peut ajouter/"
                "retirer un canal à un compte existant. Un professeur n'y crée que des comptes stagiaires.",
    },
    {
        "key": "documents", "title": "Documents", "path": "/dashboard/documents", "roles": ["admin"],
        "body": "Génération de documents administratifs à partir de modèles, et stockage centralisé des "
                "pièces.",
    },
    {
        "key": "reunions_instances", "title": "Réunions & instances", "path": "/dashboard/reunions-instances",
        "roles": ["admin"],
        "body": "Suivi des réunions et instances officielles de l'établissement (conseils, comités).",
    },
    {
        "key": "agenda_gestion", "title": "Agenda de gestion", "path": "/dashboard/agenda-gestion",
        "roles": ["admin"],
        "body": "Calendrier de gestion administrative : échéances et rappels transverses (tâches en "
                "retard, décisions en attente, etc.), pour l'administration et la comptabilité.",
    },
    {
        "key": "accounting", "title": "Comptabilité", "path": "/dashboard/accounting", "roles": ["admin"],
        "body": (
            "Module de gestion administrative et financière, organisé en onglets : Validations (file "
            "d'approbation N+1 en attente), Vue d'ensemble, Paiements scolarité (statut de scolarité par "
            "élève/classe), Mes saisies (mes propres soumissions et leur statut, pour un caissier), "
            "Recettes, Dépenses, Factures, Demandes d'achat, Livraisons (réception des commandes + "
            "contrôle qualité — une livraison marquée Conforme se verrouille ensuite, plus modifiable), "
            "Paiements, Inventaire, Locaux (salles/installations de l'école, avec photo), Budgets, "
            "Fournisseurs, Catégories, Journal de caisse (mouvements espèces, filtrable par registre "
            "Caisse comptable/Caisse sociale), Journal des comptes (virements/OV/chèques), Chèques & "
            "virements, Notes de caisse (avances de caisse, validées par un admin ou comptabilité), Frais "
            "de mission (notes de frais sur plusieurs jours), Historique comptable (journal d'audit). "
            "Exemples d'usage : enregistrer une dépense (onglet Dépenses → Nouvelle dépense), suivre un "
            "budget (onglet Budgets), approuver une note de caisse (onglet Validations ou Notes de "
            "caisse → bouton vert). Accessible en écriture complète à un administrateur ou à quiconque a "
            "le rôle comptabilité (canal V1 du questionnaire des canaux) ; le comptable externe (rôle "
            "accountant) y a un accès en lecture seule ; le caissier n'y voit que la scolarité, les "
            "demandes d'achat, la caisse et ses propres saisies."
        ),
    },
    {
        "key": "accounting_tasks", "title": "Tâches Comptabilité", "path": "/dashboard/accounting-tasks", "roles": ["admin"],
        "body": (
            "Tableau Kanban (vue Kanban ou liste) dédié aux tâches de l'équipe Comptabilité, séparé du "
            "module Comptabilité lui-même — raccourci direct dans la barre latérale, juste après "
            "Notifications. Chaque tâche peut être rattachée à un ou plusieurs canaux à la fois (V0, V1, "
            "V2 — le questionnaire des canaux de permission : V2 = administrateur, V1 = comptabilité, "
            "V0 = formateurs/assistantes RH/comptable) et assignée à plusieurs personnes en même temps. "
            "Seul un administrateur (V2) crée une tâche Comptabilité et choisit son ou ses canaux ; les "
            "autres membres consultent le tableau et font évoluer le statut de ce qui leur est assigné. "
            "Dès qu'une tâche compte 2 assignés ou plus, un groupe de discussion est créé automatiquement "
            "dans Communication → onglet Groupes pour qu'ils en discutent ensemble."
        ),
    },
    {
        "key": "rh", "title": "Ressources humaines", "path": "/dashboard/rh", "roles": ["admin"],
        "body": (
            "Module RH complet, organisé en onglets : Employés (fiches du personnel), Congés (demandes "
            "et soldes de congés, avec approbation), Paie (fiches de paie avec calcul CNSS/IR marocain et "
            "génération de bulletins PDF), Évaluations (entretiens de performance), Recrutement (annonces "
            "d'emploi, candidats, entretiens, créneaux de rendez-vous), Intégration (plans d'onboarding "
            "30/60/90 jours, pulse surveys), Formation (catalogue de formations, affectations, matrice de "
            "compétences), Talents (grille 9-box performance/potentiel, OKRs, plans de développement), "
            "Organigramme (projets/équipes en glisser-déposer), Matériel (inventaire du matériel assigné "
            "aux employés), Paramètres (départements et types de contrat). Exemples d'usage : approuver une "
            "demande de congé (onglet Congés → cliquer sur le bouton vert), générer la paie du mois "
            "(onglet Paie → sélectionner le mois → « Générer la paie du mois »), ou promouvoir un candidat "
            "en employé (onglet Recrutement → Candidats → « Promouvoir »)."
        ),
    },
]

ROLE_LABEL = {
    "admin": "administrateur",
    "professor": "professeur",
    "comptabilite": "comptabilité (canal V1)",
    "rh": "ressources humaines",
    "assistant_rh": "assistant RH",
    "cashier": "caissier",
    "accountant": "comptable",
    "student": "étudiant",
}
# Ordre de priorité pour choisir UN libellé à afficher quand l'utilisateur
# cumule plusieurs rôles — le plus large d'abord.
_LABEL_PRIORITY = ["admin", "professor", "comptabilite", "rh", "assistant_rh", "cashier", "accountant", "student"]

# Rôles qui travaillent réellement dans un module donné sans forcément être
# admin — sections_for_role() le leur accorde même si le module est tagué
# "admin" dans PLATFORM_SECTIONS (qui ne connaît que all/staff/admin).
_ACCOUNTING_PAGE_ROLES = {"comptabilite", "cashier", "accountant"}
_ACCOUNTING_TASKS_ROLES = {"comptabilite", "accountant", "professor", "assistant_rh"}
_RH_ROLES = {"rh", "assistant_rh"}
# /dashboard/tasks (générique) exclut seulement "student" côté beforeLoad —
# accordé à tout le reste hors admin (déjà couvert par le tag "admin").
_TASKS_ROLES = {"professor", "rh", "assistant_rh", "comptabilite", "cashier", "accountant"}


def role_label_for(roles: list[str]) -> str:
    role_set = set(roles)
    for r in _LABEL_PRIORITY:
        if r in role_set:
            return ROLE_LABEL[r]
    return "utilisateur"


def sections_for_role(roles: list[str]) -> list[dict]:
    """Modules visibles pour CE cumul de rôles. Ne réduit plus tout à
    admin/professor/student : chaque rôle métier (comptabilite, rh,
    assistant_rh, cashier, accountant…) reçoit les modules où il travaille
    réellement, même sans être admin — voir dashboard.accounting.tsx /
    dashboard.tsx pour la même logique côté accès réel à la plateforme."""
    role_set = set(roles)
    is_admin = "admin" in role_set
    is_prof = "professor" in role_set
    allowed = {"all"}
    if is_admin or is_prof:
        allowed.add("staff")
    if is_admin:
        allowed.add("admin")
    sections = [s for s in PLATFORM_SECTIONS if any(r in allowed for r in s["roles"])]

    def _grant(key: str) -> None:
        extra = next((s for s in PLATFORM_SECTIONS if s["key"] == key), None)
        if extra and extra not in sections:
            sections.append(extra)

    if not is_admin:
        if role_set & _ACCOUNTING_PAGE_ROLES:
            _grant("accounting")
        if role_set & _ACCOUNTING_TASKS_ROLES:
            _grant("accounting_tasks")
        if role_set & _RH_ROLES:
            _grant("rh")
        if role_set & _TASKS_ROLES:
            _grant("tasks")
    return sections


def render_sections(sections: list[dict]) -> str:
    return "\n\n".join(f"### {s['title']} ({s['path']})\n{s['body']}" for s in sections)
