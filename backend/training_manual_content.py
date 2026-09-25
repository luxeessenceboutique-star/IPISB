"""Manifeste de contenu du manuel de formation — module Comptabilité.

Un dict par chapitre : tab_key (dossier de captures correspondant),
title, objectives (texte multi-lignes, une ligne = un point clé affiché
sur la page de chapitre), content (markdown, jetons [[image:ID]] pour
placer une capture au bon endroit, blocs ```diagram pour les encarts
"Exemple concret" orange) et images (liste de {id, file, caption} —
file est le nom du PNG annoté dans output/annotated/<tab_key>/).

Toutes les données citées en exemple sont fictives (jeu de démonstration
de backend/seed_accounting_demo.py) — aucune donnée réelle d'élève ou de
fournisseur n'apparaît dans ce manuel.
"""

CHAPTERS = [
    # ── 1. Validations ──────────────────────────────────────────────────
    {
        "tab_key": "validations",
        "title": "Validations",
        "objectives": (
            "Comprendre pourquoi cette page existe : c'est la boîte de réception unique de tout "
            "ce qui attend une décision dans le module Comptabilité\n"
            "Approuver ou rejeter une avance de caisse, une note de frais de mission ou un règlement bancaire\n"
            "Distinguer le circuit à une seule validation (la majorité des cas) du circuit « quatre yeux » "
            "réservé aux règlements bancaires"
        ),
        "content": """
L'onglet **Validations** centralise tout ce qui, dans le module Comptabilité, attend une décision
avant de devenir définitif : avances de caisse, frais de mission, demandes d'achat au stade de
l'expression de besoin, et règlements bancaires. C'est le seul endroit où un administrateur voit
d'un coup d'œil tout ce qui est en attente, tous types confondus.

[[image:01]]

### Approuver ou rejeter une demande

Chaque carte affiche qui a soumis la demande, son montant et son objet. Deux boutons sont proposés
directement sur la carte :

1. **Approuver** — la demande passe au statut suivant (par exemple « approuvée » pour une note de
   caisse, qui pourra ensuite être réglée dans l'onglet Paiements).
2. **Rejeter** — un motif est obligatoire ; la personne qui a soumis la demande est notifiée.

[[image:02]]

Après la décision, la carte disparaît de la liste et le compteur « Validations en attente » diminue.

[[image:03]]

### Le circuit « quatre yeux » — uniquement pour les règlements bancaires

Pour la grande majorité des demandes (notes de caisse, frais de mission), **une seule validation
suffit** : n'importe quel administrateur ou compte comptabilité peut approuver. Un règlement bancaire
(sortie par chèque, virement ou ordre de virement) est différent : il exige **deux validations par
deux administrateurs différents**. La personne qui a saisi le règlement ne peut jamais se valider
elle-même, et le premier validateur ne peut pas non plus donner la seconde validation. Le bouton
affiche alors « Valider (2e) » pour indiquer qu'une première validation a déjà été donnée par
quelqu'un d'autre.

```diagram
TITLE: Exemple concret
CATEGORIE:
- Le caissier Hassan saisit une avance de caisse de 500 MAD pour Yassine Kabbaj.
- Elle apparaît immédiatement dans Validations, sous « Avances de caisse ».
- La comptable Amina clique sur Approuver : une seule validation a suffi, la demande disparaît de la file.
- Elle pourra maintenant être réglée depuis l'onglet Paiements.
```

**Demandes d'achat au stade brouillon.** Une expression de besoin qui vient d'être créée n'a pas de
bouton Approuver/Rejeter ici : un bouton « Voir la DA » renvoie directement vers l'onglet Demandes
d'achat, où la décision (validation, retour, annulation) se prend avec le contexte complet du
formulaire.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "File d'attente des validations, regroupée par type de demande."},
            {"id": "02", "file": "02-avant-approbation-crop.png", "caption": "Boutons Approuver / Rejeter sur une carte de la file."},
            {"id": "03", "file": "03-apres-approbation-full.png", "caption": "La demande approuvée disparaît de la file ; le compteur diminue."},
        ],
    },

    # ── 2. Vue d'ensemble ────────────────────────────────────────────────
    {
        "tab_key": "overview",
        "title": "Vue d'ensemble",
        "objectives": (
            "Situer cette page : un tableau de bord de lecture, sans aucun bouton ni formulaire\n"
            "Lire les indicateurs de trésorerie, de recouvrement et de répartition des dépenses\n"
            "Savoir quand revenir sur cette page (point d'entrée quotidien avant d'aller agir ailleurs)"
        ),
        "content": """
**Vue d'ensemble** est un tableau de bord pur : aucune action n'y est possible, il n'y a ni bouton
ni formulaire. C'est le point de départ recommandé de chaque session : un coup d'œil ici indique
où porter l'attention avant d'aller agir dans les autres onglets.

[[image:01]]

### Ce que montrent les graphiques

- **Trésorerie** — évolution du solde caisse et banque sur la période, pour repérer une tension de
  liquidités avant qu'elle ne devienne un problème.
- **Taux de recouvrement** — proportion des sommes dues (scolarité, factures clients) effectivement
  encaissée, pour suivre les impayés sans avoir à ouvrir chaque dossier individuellement.
- **Répartition des sorties** — où va l'argent, par catégorie de dépense, pour confirmer que
  les postes budgétaires sont respectés.
- **Budget vs réel** — l'écart entre ce qui avait été planifié dans l'onglet Budgets et ce qui a
  réellement été dépensé.

```diagram
TITLE: Exemple concret
CATEGORIE:
- La directrice administrative ouvre Vue d'ensemble en début de semaine.
- Elle voit que le taux de recouvrement de la scolarité a baissé de 5 points.
- Elle va directement dans Paiements scolarité pour identifier les élèves en retard, plutôt que de les chercher un par un.
```

Cette page ne remplace pas les onglets détaillés (Paiements scolarité, Journal de caisse…) : elle
sert à décider **où** aller, pas à agir directement.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Tableau de bord : trésorerie, recouvrement, répartition des sorties, budget vs réel."},
        ],
    },

    # ── 3. Paiements scolarité ───────────────────────────────────────────
    {
        "tab_key": "tuition",
        "title": "Paiements scolarité",
        "objectives": (
            "Naviguer entre la liste des promos et la matrice élève × mois d'une promo\n"
            "Éviter le piège le plus important du module : le brouillon local qui n'est pas encore enregistré\n"
            "Enregistrer un versement pour un élève et comprendre le code couleur des cellules et des badges\n"
            "Distinguer le versement immédiat (admin/comptabilité) du versement mis en attente (caissier)"
        ),
        "content": """
**Paiements scolarité** est la page la plus complète du module. Elle a deux niveaux de lecture :
une liste des promotions, puis, pour une promotion choisie, une matrice élève × mois qui montre
en un coup d'œil qui a payé, qui est en retard, et de combien.

[[image:01]]

### Ouvrir une promo

Cliquez sur la carte d'une promotion pour ouvrir sa matrice de paiement.

[[image:02]]

### ATTENTION — Le piège le plus important de tout le module

Les champs éditables de la matrice (mensualité, frais d'inscription, échéance, tolérance,
commentaire) forment un **brouillon local, par lot** : rien n'est enregistré tant que le bouton
**« Enregistrer les modifications »** en haut de page n'a pas été cliqué explicitement. Changer
d'onglet, rafraîchir la page ou revenir en arrière **perd silencieusement toutes les modifications
en cours**, sans aucun avertissement. La bonne habitude : enregistrer après chaque petite série de
modifications, pas seulement à la toute fin.

[[image:03]]

### Enregistrer un versement

Cliquez sur la cellule du mois concerné pour un élève — la cellule s'ouvre en formulaire de
versement.

[[image:04]]

Renseignez le montant, le mode de règlement, la date, puis validez.

[[image:05]]

Le versement apparaît immédiatement dans la matrice et une facture PDF est générée automatiquement
si c'est un administrateur ou un compte comptabilité qui a enregistré le paiement.

[[image:06]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Youssef Chraibi n'a rien versé pour septembre — sa cellule est rouge, badge « en retard » à côté de son nom.
- La comptable clique sur sa cellule de septembre, saisit 1500 MAD, mode espèces, date du jour.
- Après validation, la cellule passe au vert et une facture PDF est proposée au téléchargement.
```

### Le code couleur, à deux niveaux

- **Couleur de la cellule** = statut du mois précis (payé à temps, payé en partie ou en retard,
  mois sauté mais compensé plus tard, manque d'argent).
- **Badge à côté du nom de l'élève** = statut global cumulé (par exemple « 1 en retard »), qui peut
  différer du statut du mois affiché si l'élève a rattrapé un retard ailleurs dans l'année.

Une légende de couleurs est affichée en haut de la matrice — s'y référer en cas de doute plutôt que
de deviner.

### Qui peut encaisser, et comment

- **Administrateur ou compte comptabilité** : le versement est enregistré immédiatement et la
  facture est générée dans la foulée.
- **Caissier** : le versement part en attente de validation N+1 (visible dans l'onglet Validations) ;
  aucune facture n'est émise tant que la validation n'a pas eu lieu.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des promotions, avec recherche élève et filtres de statut."},
            {"id": "02", "file": "02-liste-promos-annotee-crop.png", "caption": "Ouvrir la matrice de paiement d'une promotion."},
            {"id": "03", "file": "03-matrice-eleves-full.png", "caption": "Matrice élève × mois : couleurs de cellule, badges de statut, légende."},
            {"id": "04", "file": "04-formulaire-versement-vide-crop.png", "caption": "Cliquer une cellule ouvre le formulaire de versement."},
            {"id": "05", "file": "05-formulaire-versement-rempli-crop.png", "caption": "Montant, mode de règlement et date renseignés."},
            {"id": "06", "file": "06-matrice-apres-versement-full.png", "caption": "Versement enregistré — facture générée automatiquement."},
        ],
    },

    # ── 4. Recettes ─────────────────────────────────────────────────────
    {
        "tab_key": "revenues",
        "title": "Recettes",
        "objectives": (
            "Enregistrer une recette (subvention, don, prestation…) hors scolarité au jour le jour\n"
            "Choisir le bon statut (attendu / encaissé / annulé) et le bon mode d'encaissement\n"
            "Distinguer cet onglet des Paiements scolarité, qui gère spécifiquement les versements élèves"
        ),
        "content": """
L'onglet **Recettes** enregistre toute entrée d'argent qui n'est pas un versement de scolarité
(celui-ci se gère dans Paiements scolarité) : subventions, dons, prestations de service, etc.

[[image:01]]

### Créer une recette

Cliquez sur **Nouvelle recette**.

[[image:02]]

Renseignez le libellé, le type (Compte courant, Chiffre d'affaires, Crédit, ou Autre avec une
précision libre), la catégorie éventuelle, le montant HT et la TVA — le total TTC se calcule
automatiquement.

[[image:03]]

Choisissez le statut : **Attendu** (recette prévue mais pas encore encaissée), **Encaissé**, ou
**Annulé**. Le mode d'encaissement (virement, chèque, espèces…) est optionnel mais recommandé pour
le suivi. Validez.

[[image:04]]

La nouvelle recette apparaît dans la liste, avec son statut visible immédiatement.

[[image:05]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- L'école reçoit une subvention annuelle de fonctionnement de 50 000 MAD, déjà virée.
- Libellé : « Subvention ministère de tutelle », type Autre -> « Subvention », statut Encaissé, mode Virement.
- La recette apparaît immédiatement dans la liste avec le badge « Encaissé ».
```
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des recettes, avec recherche."},
            {"id": "02", "file": "02-bouton-nouvelle-recette-crop.png", "caption": "Créer une nouvelle recette."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Formulaire de recette — libellé obligatoire."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Recette renseignée, prête à être validée."},
            {"id": "05", "file": "05-nouvelle-ligne-full.png", "caption": "La recette apparaît dans la liste."},
        ],
    },

    # ── 5. Factures ──────────────────────────────────────────────────────
    {
        "tab_key": "invoices",
        "title": "Factures",
        "objectives": (
            "Enregistrer une facture fournisseur, liée ou non à une commande existante\n"
            "Suivre son statut de paiement (en attente, partiellement payée, payée)"
        ),
        "content": """
L'onglet **Factures** centralise les factures fournisseurs — qu'elles soient liées à une commande
déjà passée dans Demandes d'achat, ou saisies directement.

[[image:01]]

### Créer une facture

Cliquez sur **Nouvelle facture**.

[[image:02]]

Le numéro de facture est obligatoire. Le fournisseur et le numéro de commande sont optionnels : si
la facture correspond à une commande déjà passée, la relier permet de retrouver l'historique complet
depuis la fiche fournisseur ou la commande.

[[image:03]]

Renseignez le montant HT et la TVA — le total TTC s'affiche automatiquement — puis le statut de
paiement (**En attente**, **Partiellement payé**, **Payé**).

[[image:04]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- TechnoMaroc Distribution envoie sa facture FA-2026-0001 pour l'ordinateur portable commandé.
- La commande a déjà été réceptionnée et payée : statut « Payé », mode Virement, date de paiement renseignée.
- Une seconde facture (cahiers d'exercices, FA-2026-0002) reste « En attente » tant qu'elle n'est pas réglée.
```

La facture apparaît dans la liste avec un badge de couleur reflétant son statut — utile pour repérer
d'un coup d'œil les factures encore en attente de paiement.

[[image:05]]
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des factures fournisseurs."},
            {"id": "02", "file": "02-bouton-nouvelle-facture-crop.png", "caption": "Créer une nouvelle facture."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Numéro de facture, fournisseur, commande liée."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Montant et statut de paiement renseignés."},
            {"id": "05", "file": "05-nouvelle-ligne-full.png", "caption": "La facture apparaît avec son badge de statut."},
        ],
    },

    # ── 6. Demandes d'achat ──────────────────────────────────────────────
    {
        "tab_key": "purchase_requests",
        "title": "Demandes d'achat",
        "objectives": (
            "Créer une demande d'achat (DA) en piochant un article dans le catalogue de la catégorie\n"
            "Comprendre le cycle complet : brouillon -> besoin validé -> devis -> commande\n"
            "Savoir où se prend chaque décision et qui peut la prendre"
        ),
        "content": """
L'onglet **Demandes d'achat** est le point d'entrée de tout achat de l'établissement : fournitures,
équipement, services. Chaque demande suit un cycle en plusieurs étapes, chacune tracée et décidée
par un administrateur ou un compte comptabilité.

[[image:01]]

### Créer une demande d'achat

Cliquez sur **Nouvelle DA**.

[[image:02]]

Remplissez le contexte (société, service, projet, activité) et la justification du besoin — ce
dernier champ est obligatoire.

[[image:03]]

### Le catalogue d'articles accélère la saisie

Si une catégorie a déjà un catalogue d'articles renseigné (voir le chapitre Catégories), la
sélectionner fait apparaître un second menu déroulant, **Article du catalogue** : choisir un article
y pré-remplit automatiquement le code, l'identification, les caractéristiques et le budget estimé.

[[image:04]]

Ces champs restent modifiables après le pré-remplissage — le catalogue accélère la saisie, il ne la
verrouille pas.

[[image:05]]

Une fois créée, la demande apparaît en statut **Brouillon**.

[[image:06]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Le service pédagogique a besoin de renouveler les blouses de stage pour la rentrée.
- Catégorie « Fournitures pédagogiques » -> article du catalogue « Blouses de stage » : code, caractéristiques et budget se remplissent seuls.
- La quantité (30) est ajustée manuellement, puis la DA est créée en Brouillon.
```

### Le cycle complet, en quatre statuts

1. **Brouillon** — la demande vient d'être créée.
2. **Besoin validé** (ou retourné/annulé) — un administrateur décide si le besoin est légitime.
3. **Devis validé** — un ou plusieurs devis ont été saisis, l'un d'eux a été retenu.
4. **Commande émise** — un échéancier de paiement complet a été renseigné et validé ; la demande est
   alors verrouillée et une commande (visible dans Livraisons/Paiements) est créée.

Chaque décision peut être annulée (« Revenir en arrière ») tant que l'étape suivante ne l'empêche
pas — par exemple, il faut supprimer les devis saisis avant de pouvoir annuler la validation du
besoin.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des demandes d'achat, avec leurs statuts."},
            {"id": "02", "file": "02-bouton-nouvelle-da-crop.png", "caption": "Créer une nouvelle demande d'achat."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Justification du besoin — champ obligatoire."},
            {"id": "04", "file": "04-categorie-choisie-crop.png", "caption": "Catégorie choisie : le catalogue d'articles apparaît."},
            {"id": "05", "file": "05-formulaire-rempli-crop.png", "caption": "Article du catalogue sélectionné, champs pré-remplis."},
            {"id": "06", "file": "06-nouvelle-ligne-full.png", "caption": "La demande apparaît en statut Brouillon."},
        ],
    },

    # ── 7. Livraisons ────────────────────────────────────────────────────
    {
        "tab_key": "purchases",
        "title": "Livraisons",
        "objectives": (
            "Retrouver une commande émise et consulter sa réception\n"
            "Comprendre le circuit d'anomalie qualité (partielle, totale, retour)"
        ),
        "content": """
L'onglet **Livraisons** liste les commandes issues des demandes d'achat validées, et permet
d'enregistrer leur réception.

[[image:01]]

### Consulter une réception

Cliquez sur une commande pour ouvrir son détail.

[[image:02]]

Chaque réception précise la quantité reçue, le statut qualité (conforme, non conforme partiel,
non conforme total, retourné), et si un contrôle QHSE a été effectué.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- L'ordinateur portable commandé à TechnoMaroc Distribution arrive à l'école.
- Réception enregistrée : quantité 1, statut « conforme », contrôle QHSE effectué.
- Une réception conforme crée automatiquement l'entrée correspondante dans l'Inventaire — aucune saisie supplémentaire nécessaire.
```

### Une anomalie bloque l'entrée en stock

Une réception marquée non conforme (partielle, totale) ou retournée **ne crée pas** automatiquement
d'article d'inventaire : elle reste en attente de validation. Un administrateur doit statuer sur
l'anomalie avant que la marchandise, ou la part jugée conforme, n'entre officiellement au stock. Une
réception conforme, elle, est immédiate : l'inventaire est mis à jour sans étape supplémentaire.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des commandes et de leur statut de paiement."},
            {"id": "02", "file": "02-liste-annotee-crop.png", "caption": "Ouvrir le détail d'une commande."},
            {"id": "03", "file": "03-detail-reception-full.png", "caption": "Détail de la réception : quantité, statut qualité, contrôle QHSE."},
        ],
    },

    # ── 8. Paiements ─────────────────────────────────────────────────────
    {
        "tab_key": "payments",
        "title": "Paiements",
        "objectives": (
            "Retrouver l'échéancier de paiement planifié d'une commande\n"
            "Savoir que cet onglet regroupe aussi les avances de caisse et frais de mission approuvés, en attente de règlement"
        ),
        "content": """
L'onglet **Paiements** est celui où un engagement (commande, avance de caisse approuvée, note de
frais de mission approuvée) devient un décaissement réel.

[[image:01]]

### L'échéancier d'une commande

Cliquez sur une commande pour ouvrir son échéancier planifié — les jalons de paiement définis avant
l'émission de la commande (voir le chapitre Demandes d'achat).

[[image:02]]

Le détail affiche l'échéancier planifié et l'historique des versements déjà effectués pour cette
commande.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- La commande de l'ordinateur portable (9 840 MAD TTC) a un échéancier d'un seul jalon : « Paiement à la livraison », par ordre de virement.
- Une fois la livraison réceptionnée, ce jalon devient payable depuis cet écran.
- Le montant réellement décaissé alimente alors le Journal des comptes, avec sa propre nature (caisse ou banque).
```

### Avances de caisse et frais de mission approuvés

Au-delà des commandes, cet onglet regroupe aussi les avances de caisse et les notes de frais de
mission déjà **approuvées** dans l'onglet Validations : c'est ici, et seulement ici, qu'elles sont
effectivement réglées et viennent alimenter le journal de caisse ou des comptes correspondant.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Commandes avec échéances de paiement."},
            {"id": "02", "file": "02-liste-annotee-crop.png", "caption": "Ouvrir l'échéancier d'une commande."},
            {"id": "03", "file": "03-echeancier-planifie-full.png", "caption": "Échéancier planifié et versements déjà effectués."},
        ],
    },

    # ── 9. Inventaire ────────────────────────────────────────────────────
    {
        "tab_key": "inventory",
        "title": "Inventaire",
        "objectives": (
            "Ajouter un actif au parc, en piochant éventuellement dans le catalogue de Catégories\n"
            "Distinguer les mouvements de stock (entrée / sortie / ajustement)\n"
            "Repérer le piège de l'ajustement de stock, qui remplace la quantité au lieu de l'additionner"
        ),
        "content": """
L'onglet **Inventaire** suit le parc de l'établissement : consommables, équipements, locaux, services.
Chaque catégorie d'actif est gérable (icône engrenage), et deux vues sont proposées — Liste et
Tableau, ce dernier avec export Excel/CSV.

[[image:01]]

### Ajouter un actif

Cliquez sur **Ajouter un actif**.

[[image:02]]

Comme pour les demandes d'achat, un article du catalogue de la catégorie choisie peut être
sélectionné pour pré-remplir automatiquement le nom et les caractéristiques.

[[image:03]]

Complétez ensuite catégorie, statut, quantité, unité, prix unitaire, TVA, emplacement.

[[image:04]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Le local « Salle de cours 12 » vient d'être équipé de 40 chaises empilables.
- Article « Chaises de salle de classe », catégorie Équipement, quantité 40, prix unitaire 350 MAD TTC.
- Emplacement : Salle de cours 12 — l'article apparaît dans la liste, affecté à ce local.
```

[[image:05]]

### ATTENTION — Le piège de l'ajustement de stock

La fiche d'un article propose trois types de mouvement : **Entrée**, **Sortie**, et
**Ajustement**. Les deux premiers modifient la quantité de façon relative (ajoutent ou retirent).
L'ajustement, lui, **remplace la quantité affichée par la valeur saisie** — ce n'est pas un
mouvement supplémentaire à ajouter au stock existant. Saisir « 40 » en ajustement sur un article qui
en compte déjà 40 ne change rien ; saisir « 40 » en pensant en ajouter 40 à un stock de 10 aboutira
à 40, pas à 50. En cas de doute, un mouvement d'Entrée ou de Sortie est plus sûr qu'un Ajustement.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Vue Liste de l'inventaire."},
            {"id": "02", "file": "02-bouton-ajouter-crop.png", "caption": "Ajouter un nouvel actif."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Piocher un article du catalogue de la catégorie."},
            {"id": "04", "file": "05-formulaire-rempli-crop.png", "caption": "Nom et caractéristiques pré-remplis depuis le catalogue."},
            {"id": "05", "file": "06-nouvelle-ligne-full.png", "caption": "Le nouvel actif apparaît dans l'inventaire."},
        ],
    },

    # ── 10. Locaux ───────────────────────────────────────────────────────
    {
        "tab_key": "locaux",
        "title": "Locaux",
        "objectives": (
            "Créer un local dans le référentiel des salles\n"
            "Comprendre à quoi sert ce référentiel (champ Emplacement de l'Inventaire)"
        ),
        "content": """
L'onglet **Locaux** est le référentiel des salles de l'établissement : nom, étage, capacité, code,
photo. Il alimente notamment le champ **Emplacement** de l'onglet Inventaire.

[[image:01]]

### Ajouter un local

Le formulaire est directement affiché en haut de la page — pas de fenêtre à ouvrir. Renseignez le
nom, l'étage et, si utile, la capacité, puis cliquez sur **Ajouter**.

[[image:02]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- L'école ouvre une nouvelle salle informatique au 1er étage, capacité 20 places.
- Nom « Salle informatique 2 », étage « 1er étage », capacité 20 -> Ajouter.
- La salle est immédiatement disponible comme emplacement pour les articles d'inventaire.
```

[[image:03]]

### Suppression bloquée si le local est utilisé ailleurs

Un local déjà référencé (par exemple comme emplacement d'un article d'inventaire) ne peut pas être
supprimé directement — le bouton **Désactiver** doit être utilisé à la place, ce qui le retire des
listes actives sans casser les références existantes.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Référentiel des locaux, groupés par étage."},
            {"id": "02", "file": "02-formulaire-vide-crop.png", "caption": "Formulaire d'ajout d'un local, toujours visible en haut de page."},
            {"id": "03", "file": "04-nouvelle-ligne-full.png", "caption": "Le nouveau local apparaît dans son groupe d'étage."},
        ],
    },

    # ── 11. Budgets ──────────────────────────────────────────────────────
    {
        "tab_key": "budgets",
        "title": "Budgets",
        "objectives": (
            "Créer un budget annuel ou sur une période précise, pour une catégorie de dépense\n"
            "Comprendre à quoi sert le budget : comparaison avec le réel dans Vue d'ensemble"
        ),
        "content": """
L'onglet **Budgets** permet de planifier un montant prévisionnel par catégorie de dépense, comparé
ensuite au réel dans Vue d'ensemble.

[[image:01]]

### Créer un budget

Cliquez sur **Nouveau budget**.

[[image:02]]

Choisissez la catégorie, puis soit un exercice complet (laisser les dates vides), soit une période
précise via **Agenda début / Agenda fin** — utile pour un budget trimestriel ou lié à un projet
ponctuel.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Un budget annuel de 60 000 MAD est prévu pour les Fournitures pédagogiques sur l'exercice en cours.
- Un renfort ponctuel de 10 000 MAD est prévu pour l'Équipement informatique, sur la période du 1er octobre au 31 décembre uniquement.
- Les deux budgets coexistent pour la même catégorie sans se chevaucher, chacun sur sa propre période.
```

[[image:04]]

Le nouveau budget apparaît dans la liste — son suivi (consommé vs prévu) se lit dans Vue d'ensemble
et dans le détail de la catégorie.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des budgets par catégorie et exercice."},
            {"id": "02", "file": "02-bouton-nouveau-crop.png", "caption": "Créer un nouveau budget."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Catégorie et période (exercice complet ou dates précises)."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Budget renseigné, prêt à être créé."},
        ],
    },

    # ── 12. Fournisseurs ─────────────────────────────────────────────────
    {
        "tab_key": "suppliers",
        "title": "Fournisseurs",
        "objectives": (
            "Créer une fiche fournisseur complète (coordonnées, RIB, conditions de paiement)\n"
            "Comprendre où cette fiche est réutilisée (devis, factures, chèques)"
        ),
        "content": """
L'onglet **Fournisseurs** centralise les coordonnées et informations bancaires de chaque fournisseur
— réutilisées ensuite dans les devis, les factures et les règlements.

[[image:01]]

### Créer un fournisseur

Cliquez sur **Nouveau fournisseur**.

[[image:02]]

Seul le nom de l'entreprise est obligatoire ; les autres champs (contact, coordonnées, numéro
fiscal, RIB, banque, délai de paiement) peuvent être complétés au fil du temps.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Un nouveau fournisseur de papeterie est référencé : « Papeterie Universelle Meknès ».
- Contact, e-mail et téléphone sont renseignés dès la création ; le RIB pourra être ajouté plus tard, à la première facture.
- Une fois créé, ce fournisseur apparaît dans les menus déroulants de Demandes d'achat, Factures et Chèques & virements.
```

[[image:04]]
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des fournisseurs, avec recherche."},
            {"id": "02", "file": "02-bouton-nouveau-crop.png", "caption": "Créer un nouveau fournisseur."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Seul le nom de l'entreprise est obligatoire."},
            {"id": "04", "file": "05-nouvelle-ligne-full.png", "caption": "Le fournisseur apparaît dans la liste."},
        ],
    },

    # ── 13. Catégories ───────────────────────────────────────────────────
    {
        "tab_key": "categories",
        "title": "Catégories",
        "objectives": (
            "Créer une catégorie de dépense et lui associer un catalogue d'articles réutilisables\n"
            "Générer automatiquement un code article, ou le saisir manuellement\n"
            "Joindre un cahier des charges (CDC) à un article du catalogue"
        ),
        "content": """
L'onglet **Catégories** structure toutes les dépenses de l'établissement, et porte pour chacune un
**catalogue d'articles** réutilisable — la source des menus « Article du catalogue » vus dans
Demandes d'achat et Inventaire.

[[image:01]]

### Ouvrir une catégorie pour voir son catalogue

Cliquez sur une catégorie pour dérouler son catalogue d'articles.

[[image:02]]

[[image:03]]

### Ajouter un article au catalogue

Le formulaire d'ajout est toujours visible en bas du catalogue déroulé. Le code article peut être
saisi manuellement, ou **généré automatiquement** en cliquant sur le bouton « Générer » (icône étincelle) — il reprend le
préfixe de la catégorie suivi du prochain numéro disponible.

[[image:04]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- La catégorie « Fournitures pédagogiques » (préfixe FPED) a déjà deux articles : FPED00001 et FPED00002.
- Un troisième article est ajouté : « Trousses de premiers secours », caractéristiques et budget estimé renseignés.
- Le bouton « Générer » (icône étincelle) génère automatiquement le code FPED00003, sans avoir à consulter les articles existants.
```

[[image:05]]

### Cahier des charges (CDC)

Un fichier (PDF, JPG ou PNG) peut être joint à un article du catalogue : lorsqu'une demande d'achat
pioche cet article, son CDC est proposé pour être repris automatiquement, sans avoir à le
retéléverser à chaque demande.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des catégories de dépense."},
            {"id": "02", "file": "02-liste-annotee-crop.png", "caption": "Ouvrir une catégorie pour dérouler son catalogue."},
            {"id": "03", "file": "03-categorie-ouverte-full.png", "caption": "Catalogue d'articles de la catégorie, avec formulaire d'ajout en bas."},
            {"id": "04", "file": "04-article-formulaire-rempli-crop.png", "caption": "Génération automatique du prochain code article."},
            {"id": "05", "file": "05-nouvel-article-full.png", "caption": "Le nouvel article apparaît dans le catalogue."},
        ],
    },

    # ── 14. Journal de caisse ────────────────────────────────────────────
    {
        "tab_key": "cash_journal",
        "title": "Journal de caisse",
        "objectives": (
            "Comprendre que ce journal est alimenté automatiquement par les autres onglets, et manuellement au besoin\n"
            "Saisir un mouvement manuel (entrée ou sortie) en espèces\n"
            "Retenir le plafond réglementaire de 4 500 MAD par transaction en caisse"
        ),
        "content": """
Le **Journal de caisse** trace tous les mouvements en espèces de l'établissement. Il se remplit
automatiquement au fil des paiements, dépenses et recettes réglées ailleurs dans le module, et peut
aussi recevoir des saisies manuelles ponctuelles.

[[image:01]]

### Saisir un mouvement manuel

Cliquez sur **Saisie manuelle**.

[[image:02]]

Précisez le type (entrée ou sortie), le libellé de l'opération, le prestataire éventuel, le montant
et un numéro de pièce justificative.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Un achat imprévu de produits de nettoyage (380 MAD) est réglé en espèces auprès d'un fournisseur local.
- Type « Sortie », libellé « Achat de fournitures de nettoyage », prestataire « Droguerie Al Wafa », justificatif BL-2214.
- L'écriture apparaît immédiatement dans le journal, avec la même traçabilité qu'un mouvement automatique.
```

[[image:04]]

### ATTENTION — Le plafond caisse : 4 500 MAD

Toute transaction en Journal de caisse est plafonnée à **4 500 MAD**. Un montant supérieur doit
passer par le Journal des comptes (règlement bancaire), jamais par la caisse espèces.

### Qui peut saisir, et comment

Un administrateur ou un compte comptabilité saisit directement. Un caissier peut aussi saisir, mais
son écriture part en attente de validation N+1, visible dans l'onglet Validations, avant d'apparaître
définitivement dans le journal.

### Export par période

Le journal peut être exporté (PDF ou Excel) sur une période choisie (aujourd'hui, hier, ce mois, ou
dates libres). Le solde de l'export **repart de zéro** sur la période choisie — il ne correspond pas
au solde cumulé affiché à l'écran, qui lui tient compte de tout l'historique.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Journal de caisse — mouvements automatiques et manuels."},
            {"id": "02", "file": "02-bouton-saisie-crop.png", "caption": "Saisir un mouvement manuel."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Type, libellé, prestataire, montant, justificatif."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Mouvement renseigné, prêt à être enregistré."},
        ],
    },

    # ── 15. Journal des comptes ──────────────────────────────────────────
    {
        "tab_key": "bank_journal",
        "title": "Journal des comptes",
        "objectives": (
            "Reconnaître que cet écran est le même composant que le Journal de caisse, en mode bancaire\n"
            "Comprendre pourquoi une sortie bancaire déclenche systématiquement le circuit de validation des Chèques"
        ),
        "content": """
Le **Journal des comptes** est l'exact équivalent bancaire du Journal de caisse — même écran, mêmes
principes de saisie manuelle et automatique — à ceci près qu'il n'a **pas** de plafond à 4 500 MAD
et qu'il exige un mode de règlement bancaire (virement, ordre de virement, chèque…) plutôt
qu'espèces.

[[image:01]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Un virement de 50 000 MAD (subvention) arrive sur le compte bancaire de l'école.
- Une écriture « Entrée », mode Virement, référence VIR-2026-0456, est saisie manuellement dans le Journal des comptes.
- Contrairement à une sortie, une entrée bancaire n'entraîne aucun circuit de validation supplémentaire.
```

### La différence essentielle avec la caisse : les sorties bancaires

Une **sortie** bancaire (chèque, virement, ordre de virement) ne s'enregistre jamais directement :
elle passe automatiquement par le circuit de validation de l'onglet **Chèques & virements**, avec sa
règle des « quatre yeux » (deux administrateurs différents, voir le chapitre Validations). Une
**entrée** bancaire (réception d'un virement, par exemple), elle, s'enregistre immédiatement comme
en caisse.

Pour la saisie détaillée d'un formulaire d'écriture manuelle (libellé, prestataire, montant,
référence), se reporter au chapitre **Journal de caisse** — les champs sont identiques, avec en plus
un champ **Référence bancaire** (n° de chèque, d'OV ou de virement).
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Journal des comptes — même écran que le Journal de caisse, en mode bancaire."},
        ],
    },

    # ── 16. Chèques & virements ──────────────────────────────────────────
    {
        "tab_key": "cheques",
        "title": "Chèques & virements",
        "objectives": (
            "Inscrire une pièce (chèque ou virement) déjà en main, sans déclencher d'écriture comptable\n"
            "Ne surtout pas confondre cette inscription avec un vrai règlement, qui se fait ailleurs\n"
            "Suivre le cycle du dépôt jusqu'à l'encaissement ou le rejet"
        ),
        "content": """
L'onglet **Chèques & virements** est le registre unifié de toutes les pièces bancaires, chèques
comme virements/OV, du dépôt jusqu'à l'encaissement ou le rejet. Deux sous-onglets internes
(Chèques / Versements & virements) partagent le même cycle avec un vocabulaire adapté : « À
remettre -> Remis -> Encaissé » pour un chèque, « À exécuter -> Transmis -> Exécuté » pour un virement.

[[image:01]]

### ATTENTION — Le piège le plus important de cet onglet

Le bouton **« Inscrire une pièce »** sert uniquement à **enregistrer une pièce déjà en main** — par
exemple un chèque reçu d'un parent d'élève, avant même son encaissement. Ce bouton **ne déclenche
aucune écriture comptable et n'est soumis à aucune validation N+1**. Ce n'est **pas** l'écran où
régler un paiement réel.

Pour un vrai règlement (payer un fournisseur, encaisser une mensualité), il faut passer par l'écran
concerné — **Paiements**, **Notes de caisse/Frais de mission**, ou **Journal des comptes** — qui,
eux, déclenchent le véritable circuit de validation.

[[image:02]]

### Inscrire une pièce reçue

Cliquez sur **Inscrire un chèque** (ou l'équivalent pour un virement).

[[image:03]]

Renseignez la nature de la pièce, le sens (reçu ou émis), le montant, le numéro, la banque et les
dates.

[[image:04]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Un parent d'élève remet un chèque de 1500 MAD pour la mensualité d'octobre, avant même son dépôt en banque.
- Inscription au registre : sens « Reçu », montant 1500 MAD, n° de chèque, banque, date d'établissement.
- Le chèque apparaît au statut « À remettre » — son encaissement effectif, lui, se fera via l'écran de règlement concerné.
```

[[image:05]]
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Registre des chèques et virements, par statut."},
            {"id": "02", "file": "02-bouton-inscrire-crop.png", "caption": "Inscrire une pièce déjà en main."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Nature, sens, montant, référence."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Pièce renseignée, prête à être inscrite."},
            {"id": "05", "file": "05-nouvelle-ligne-full.png", "caption": "La pièce apparaît au registre, statut « À remettre »."},
        ],
    },

    # ── 17. Notes de caisse ──────────────────────────────────────────────
    {
        "tab_key": "cash_notes",
        "title": "Notes de caisse",
        "objectives": (
            "Créer une note de caisse pour justifier une avance ou un remboursement\n"
            "Comprendre le cycle : soumission -> approbation N+1 -> règlement (dans Paiements)\n"
            "Approuver ou rejeter une note en attente"
        ),
        "content": """
Une **note de caisse** justifie une avance remise à un bénéficiaire (achat urgent, remboursement de
frais) avec un détail ligne par ligne (article, prestataire, montant HT/TVA/TTC).

[[image:01]]

### Créer une note de caisse

Cliquez sur **Nouvelle note**.

[[image:02]]

Renseignez le bénéficiaire, l'objet, et le détail des dépenses ligne par ligne — le total TTC se
calcule automatiquement.

[[image:03]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Mohammed Alaoui doit acheter en urgence des fournitures de bureau (500 MAD).
- Note créée : bénéficiaire Mohammed Alaoui, objet « Achat de fournitures de bureau », une ligne de détail avec le montant HT et la TVA.
- La note est enregistrée « En attente N+1 » — aucune écriture caisse n'est passée à ce stade.
```

[[image:04]]

### Approuver une note en attente

Un administrateur ou un compte comptabilité peut approuver directement depuis cet onglet.

[[image:05]]

Après approbation, la note passe au statut **Approuvée** — mais elle n'est **pas encore payée** :
le règlement effectif, et l'écriture au journal de caisse qui l'accompagne, se font uniquement
depuis l'onglet **Paiements**.

[[image:06]]
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des notes de caisse, avec leur statut."},
            {"id": "02", "file": "02-bouton-nouvelle-note-crop.png", "caption": "Créer une nouvelle note de caisse."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Bénéficiaire, objet et détail des dépenses."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Note renseignée, prête à être enregistrée."},
            {"id": "05", "file": "06-avant-approbation-crop.png", "caption": "Approuver une note en attente N+1."},
            {"id": "06", "file": "07-apres-approbation-full.png", "caption": "Note approuvée — reste à régler depuis Paiements."},
        ],
    },

    # ── 18. Frais de mission ─────────────────────────────────────────────
    {
        "tab_key": "mission_notes",
        "title": "Frais de mission",
        "objectives": (
            "Créer une note de frais de mission avec une grille de dépenses par jour et par thème\n"
            "Utiliser la génération automatique des colonnes de jours à partir des dates de mission\n"
            "Éviter le piège qui transforme une modification en suppression de la note"
        ),
        "content": """
Une **note de frais de mission** justifie les dépenses d'un déplacement professionnel (transport,
hébergement, repas), ventilées par thème et par jour dans une grille.

[[image:01]]

### Créer une note de frais de mission

Cliquez sur **Nouvelle note**.

[[image:02]]

Renseignez le bénéficiaire, l'objet de la mission, puis les dates **« Mission du »** et **« … au »**.

[[image:03]]

La grille des jours se génère **automatiquement** dès que les deux dates sont renseignées (avec une
marge de ± 1 jour), sans avoir besoin de cliquer sur un bouton séparé. Complétez ensuite les montants
par thème et par jour.

[[image:04]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Une mission de deux jours à Tanger, du 12 au 13 octobre 2026, pour visiter un centre de stage partenaire.
- Les dates génèrent automatiquement 3 colonnes de jours (marge de ±1 jour incluse).
- Un montant de train (200 MAD) est saisi pour le premier jour ; la note est enregistrée « En attente N+1 ».
```

[[image:05]]

### ATTENTION — Le piège : vider tous les montants supprime la note

Si tous les montants d'une note existante sont remis à zéro puis la note enregistrée, la note est
**supprimée** plutôt qu'enregistrée vide. Pour corriger une erreur de saisie, il est plus sûr de
modifier les montants concernés plutôt que de tout effacer d'un coup.

L'approbation d'une note de frais de mission suit le même circuit que les notes de caisse : une
seule validation N+1 (voir le chapitre Validations), puis un règlement effectif depuis l'onglet
Paiements — jamais d'écriture caisse à la simple création.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Liste des notes de frais de mission."},
            {"id": "02", "file": "02-bouton-nouvelle-note-crop.png", "caption": "Créer une nouvelle note de frais de mission."},
            {"id": "03", "file": "03-formulaire-vide-crop.png", "caption": "Bénéficiaire, objet, dates de mission."},
            {"id": "04", "file": "04-formulaire-rempli-crop.png", "caption": "Grille des jours générée automatiquement, montants saisis."},
            {"id": "05", "file": "05-nouvelle-ligne-en-attente-full.png", "caption": "La note apparaît « En attente N+1 »."},
        ],
    },

    # ── 19. Historique comptable ─────────────────────────────────────────
    {
        "tab_key": "journal",
        "title": "Historique comptable",
        "objectives": (
            "Consulter le journal d'audit complet du module : qui a fait quoi, et quand\n"
            "Filtrer par date, par profil ou par type d'opération pour retrouver un événement précis"
        ),
        "content": """
L'**Historique comptable** est un journal d'audit en lecture seule : aucune action n'y est possible,
seulement la consultation. Chaque opération significative du module (création, modification,
validation, suppression) y est tracée avec son auteur et son horodatage.

[[image:01]]

### Filtrer pour retrouver un événement précis

Des filtres **Du / Au**, **Profil** et **Type d'opération** permettent de restreindre la liste.

[[image:02]]

```diagram
TITLE: Exemple concret
CATEGORIE:
- Une demande d'achat semble avoir changé de statut sans explication.
- Filtre « Type d'opération » réglé sur « Demande d'achat », puis période resserrée autour de la date suspectée.
- L'historique révèle qui a pris la décision, à quelle heure, et avec quel commentaire éventuel.
```

[[image:03]]

### Un journal qui dépasse la seule comptabilité

Le filtre « Type d'opération » inclut aussi des entités académiques comme « Classe » ou
« Formateur » — l'historique couvre en réalité toute l'activité journalisée de la plateforme, pas
uniquement les mouvements financiers. Ce n'est pas une anomalie : c'est volontaire, pour garder une
trace unique et centralisée.
""",
        "images": [
            {"id": "01", "file": "01-liste-full.png", "caption": "Journal d'audit complet, en lecture seule."},
            {"id": "02", "file": "02-filtres-vides-crop.png", "caption": "Filtrer par date, profil ou type d'opération."},
            {"id": "03", "file": "03-filtre-applique-full.png", "caption": "Résultat filtré sur un type d'opération précis."},
        ],
    },
]
