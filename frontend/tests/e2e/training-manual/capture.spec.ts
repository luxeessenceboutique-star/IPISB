import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loginAs } from "../fixtures/auth";
import { TABS } from "./tabs";
import { captureStep, fieldByLabel, waitForModal } from "./capture-utils";

/* Compte admin dédié au seed de démo (cf. backend/seed_accounting_demo.py) —
 * pas admin1@ipisb.ma, dont le mot de passe réel n'est pas connu ici. */
const SEED_ADMIN_EMAIL = "seed.demo.admin@ipisb.ma";
const SEED_ADMIN_PASSWORD = "SeedDemo@IPISB2026!";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();
  await loginAs(page, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
});

test.afterAll(async () => {
  await page.close();
});

async function gotoTab(key: string) {
  await page.goto(`/dashboard/accounting?tab=${key}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300); // laisse le temps aux petites animations d'entrée (anim-rise/anim-fade)
}

// ── Passe 1 : vue d'atterrissage pour les 19 onglets ─────────────────────────
// Base commune à tout le manuel — indépendante de toute connaissance fine de
// chaque composant, donc peu de risque de sélecteur cassé.
for (const tab of TABS) {
  test(`Atterrissage — ${tab.label}`, async () => {
    await gotoTab(tab.key);
    await captureStep(page, tab.key, "liste");
  });
}

// ── Passe 2 : parcours détaillés (création → nouvelle ligne) ────────────────
// Onglets couverts pour l'instant : Fournisseurs, Catégories, Demandes d'achat.
// Les 16 autres onglets restent à approfondir dans une itération suivante —
// ils ont déjà leur capture d'atterrissage de la passe 1.

test("Détail — Fournisseurs (création)", async () => {
  await gotoTab("suppliers");
  const newBtn = page.getByRole("button", { name: "Nouveau fournisseur" });
  await captureStep(page, "suppliers", "bouton-nouveau", [
    { label: "Créer un nouveau fournisseur", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);

  await captureStep(page, "suppliers", "formulaire-vide", [
    { label: "Nom de l'entreprise", locator: fieldByLabel(panel, "Nom de l'entreprise") },
  ]);

  await fieldByLabel(panel, "Nom de l'entreprise").fill("Papeterie Universelle Meknès");
  await fieldByLabel(panel, "Personne à contacter").fill("Rachid Fassi");
  await fieldByLabel(panel, "E-mail").fill("contact@papeterie-universelle.ma");
  await fieldByLabel(panel, "Téléphone").fill("0535112233");
  await fieldByLabel(panel, "Adresse").fill("Avenue Hassan II, Meknès");
  await fieldByLabel(panel, "Forme juridique").fill("SARL");

  const submitBtn = panel.getByRole("button", { name: "Créer le fournisseur" });
  await captureStep(page, "suppliers", "formulaire-rempli", [
    { label: "Valider la création", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "suppliers", "nouvelle-ligne");
});

test("Détail — Catégories (catalogue d'articles)", async () => {
  await gotoTab("categories");
  const catRow = page.locator(".row-c", { hasText: "Fournitures pédagogiques" });
  await captureStep(page, "categories", "liste-annotee", [
    { label: "Ouvrir la catégorie « Fournitures pédagogiques »", locator: catRow },
  ]);
  await catRow.click();
  await page.waitForTimeout(300);
  await captureStep(page, "categories", "categorie-ouverte");

  // La grille "nouvel article" (Code / Article / Caractéristiques / Commentaire
  // / Budget / bouton Ajouter) est un unique conteneur — repéré via le champ
  // "Article *", car il existe AUSSI un bouton "Ajouter" pour les catégories
  // tout en haut de page (piège : .first() attraperait le mauvais bouton).
  const articleInput = page.getByPlaceholder("Article *");
  const articleRow = articleInput.locator("xpath=..");
  await articleInput.fill("Trousses de premiers secours");
  await articleRow.getByPlaceholder("Caractéristiques").fill("Kit de base, 20 pièces, conforme QHSE");
  await articleRow.getByPlaceholder("Budget estimé (MAD)").fill("900");
  const genBtn = articleRow.getByRole("button", { name: "Générer le prochain code" });
  await captureStep(page, "categories", "article-formulaire-rempli", [
    { label: "Générer automatiquement le code article", locator: genBtn },
  ]);
  await genBtn.click();
  const addBtn = articleRow.getByRole("button", { name: "Ajouter" });
  await addBtn.click();
  await page.waitForTimeout(400);
  await captureStep(page, "categories", "nouvel-article");
});

test("Détail — Demandes d'achat (création avec catalogue)", async () => {
  await gotoTab("purchase_requests");
  const newBtn = page.getByRole("button", { name: "Nouvelle DA" });
  await captureStep(page, "purchase_requests", "bouton-nouvelle-da", [
    { label: "Créer une nouvelle demande d'achat", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "purchase_requests", "formulaire-vide", [
    { label: "Justification du besoin", locator: fieldByLabel(panel, "Justification du besoin") },
  ]);

  await fieldByLabel(panel, "Projet").fill("Journée portes ouvertes 2026");
  await fieldByLabel(panel, "Activité").fill("Communication & relations écoles");
  await fieldByLabel(panel, "Justification du besoin").fill(
    "Achat de kakémonos et de brochures pour la journée portes ouvertes.",
  );
  await fieldByLabel(panel, "Catégorie").selectOption({ label: "Fournitures pédagogiques" });
  await page.waitForTimeout(300); // laisse le catalogue d'articles se charger
  const articleSelect = fieldByLabel(panel, "Article du catalogue");
  await captureStep(page, "purchase_requests", "categorie-choisie", [
    { label: "Choisir un article du catalogue", locator: articleSelect },
  ]);
  const articleValue = await articleSelect.locator("option", { hasText: "Blouses de stage" }).getAttribute("value");
  await articleSelect.selectOption(articleValue!);
  await page.waitForTimeout(200);
  const submitBtn = panel.getByRole("button", { name: "Créer la DA" });
  await captureStep(page, "purchase_requests", "formulaire-rempli", [
    { label: "Valider la demande d'achat", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "purchase_requests", "nouvelle-ligne");
});

test("Détail — Recettes (création)", async () => {
  await gotoTab("revenues");
  const newBtn = page.getByRole("button", { name: "Nouvelle recette" });
  await captureStep(page, "revenues", "bouton-nouvelle-recette", [
    { label: "Créer une nouvelle recette", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "revenues", "formulaire-vide", [
    { label: "Libellé de la recette", locator: fieldByLabel(panel, "Libellé") },
  ]);

  await fieldByLabel(panel, "Libellé").fill("Frais d'inscription — nouveaux inscrits");
  await fieldByLabel(panel, "Type").selectOption({ label: "Autre" });
  await panel.getByPlaceholder("Préciser le type (optionnel)…").fill("Frais de scolarité");
  await fieldByLabel(panel, "Montant HT (MAD)").fill("5000");
  await fieldByLabel(panel, "Mode d'encaissement").selectOption({ label: "Espèces" });
  // Le sélecteur "Promo" appelle GET /api/classes/all, un endpoint qui
  // n'existe pas dans ce backend (confirmé : aucune route ne le sert,
  // .catch(() => {}) avale l'échec en silence) — il reste donc toujours
  // vide en pratique. Ne pas documenter un contrôle non fonctionnel comme
  // s'il marchait ; signalé séparément comme bug réel à corriger.

  const submitBtn = panel.getByRole("button", { name: "Créer la recette" });
  await captureStep(page, "revenues", "formulaire-rempli", [
    { label: "Valider la recette", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "revenues", "nouvelle-ligne");
});

test("Détail — Factures (création)", async () => {
  await gotoTab("invoices");
  const newBtn = page.getByRole("button", { name: "Nouvelle facture" });
  await captureStep(page, "invoices", "bouton-nouvelle-facture", [
    { label: "Créer une nouvelle facture", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "invoices", "formulaire-vide", [
    { label: "Numéro de facture", locator: fieldByLabel(panel, "Numéro de facture") },
  ]);

  await fieldByLabel(panel, "Numéro de facture").fill("FA-2026-0003");
  await fieldByLabel(panel, "Fournisseur").selectOption({ label: "Fournitures Pédagogiques SARL" });
  await fieldByLabel(panel, "Montant HT (MAD)").fill("650");

  const submitBtn = panel.getByRole("button", { name: "Créer la facture" });
  await captureStep(page, "invoices", "formulaire-rempli", [
    { label: "Valider la facture", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "invoices", "nouvelle-ligne");
});

test("Détail — Locaux (création)", async () => {
  await gotoTab("locaux");
  const nameInput = fieldByLabel(page, "Nouveau local");
  await captureStep(page, "locaux", "formulaire-vide", [
    { label: "Nommer le nouveau local", locator: nameInput },
  ]);
  await nameInput.fill("Salle informatique 2");
  await fieldByLabel(page, "Étage").selectOption({ label: "1er étage" });
  await fieldByLabel(page, "Capacité").fill("20");
  const addBtn = page.getByRole("button", { name: "Ajouter", exact: true });
  await captureStep(page, "locaux", "formulaire-rempli", [
    { label: "Ajouter le local", locator: addBtn },
  ]);
  await addBtn.click();
  await page.waitForTimeout(400);
  await captureStep(page, "locaux", "nouvelle-ligne");
});

test("Détail — Inventaire (création depuis le catalogue)", async () => {
  await gotoTab("inventory");
  const newBtn = page.getByRole("button", { name: "Ajouter un actif" });
  await captureStep(page, "inventory", "bouton-ajouter", [
    { label: "Ajouter un nouvel actif", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  // Le bloc "Piocher dans le catalogue" n'a pas de <label> propre (juste un
  // en-tête de section) — on le repère par son texte, puis on descend à son
  // conteneur parent pour cibler ses deux <select> sans ambiguïté avec les
  // autres champs du formulaire (Catégorie/Statut plus bas ont aussi des selects).
  const catalogBox = panel.getByText("Piocher dans le catalogue (code article)").locator("xpath=..");
  const catSelect = catalogBox.locator("select").first();
  const articleSelect = catalogBox.locator("select").nth(1);
  // Le catalogue se charge après l'ouverture de la modal — attendre qu'il y
  // ait plus que la seule option placeholder avant d'interagir.
  await catSelect.locator("option").nth(1).waitFor({ state: "attached" });
  await captureStep(page, "inventory", "formulaire-vide", [
    { label: "Piocher un article du catalogue", locator: catSelect },
  ]);

  const catValue = await catSelect.locator("option", { hasText: "Équipement informatique" }).first().getAttribute("value");
  await catSelect.selectOption(catValue!);
  await articleSelect.locator("option", { hasText: "Ordinateur portable formateur" }).first().waitFor({ state: "attached" });
  const articleValue = await articleSelect.locator("option", { hasText: "Ordinateur portable formateur" }).first().getAttribute("value");
  await articleSelect.selectOption(articleValue!);
  await page.waitForTimeout(200);
  await captureStep(page, "inventory", "article-du-catalogue-choisi");

  await fieldByLabel(panel, "Emplacement principal").selectOption({ label: "Salle de cours 12" });

  const submitBtn = panel.getByRole("button", { name: "Créer" });
  await captureStep(page, "inventory", "formulaire-rempli", [
    { label: "Valider la création de l'actif", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "inventory", "nouvelle-ligne");
});

test("Détail — Notes de caisse (création + approbation N+1)", async () => {
  await gotoTab("cash_notes");
  const newBtn = page.getByRole("button", { name: "Nouvelle note" });
  await captureStep(page, "cash_notes", "bouton-nouvelle-note", [
    { label: "Créer une nouvelle note de caisse", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "cash_notes", "formulaire-vide", [
    { label: "Nom et prénom du bénéficiaire", locator: fieldByLabel(panel, "Nom et Prénom") },
  ]);

  await fieldByLabel(panel, "Nom et Prénom").fill("Yassine Kabbaj");
  await fieldByLabel(panel, "CIN").fill("BK456789");
  await fieldByLabel(panel, "Objet de la note").fill("Achat de consommables pour l'atelier pratique");
  await panel.getByPlaceholder("Désignation").first().fill("Petit matériel d'atelier");
  await panel.getByPlaceholder("Fournisseur / tiers").first().fill("Quincaillerie Centrale");
  await panel.getByPlaceholder("0,00").first().fill("650");

  const submitBtn = panel.getByRole("button", { name: "Créer & télécharger" });
  await captureStep(page, "cash_notes", "formulaire-rempli", [
    { label: "Enregistrer la note (soumise à approbation N+1)", locator: submitBtn },
  ]);
  // window.confirm() natif déclenché par l'approbation plus bas : le
  // gestionnaire doit être posé avant TOUT clic qui pourrait en déclencher
  // un, donc enregistré une fois pour le reste du test (accepte toujours).
  page.on("dialog", d => d.accept());

  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "cash_notes", "nouvelle-ligne-en-attente");

  // Approuve la note du jeu de démo (Mohammed Alaoui) pour illustrer le
  // circuit N+1. Le toast "Avance enregistrée" (sonner, ~4s) peut encore
  // intercepter les clics à l'écran — on le laisse le temps de disparaître.
  const demoRow = page.locator("tr", { hasText: "Mohammed Alaoui" });
  const approveBtn = demoRow.getByTitle("Approuver (N+1)");
  await captureStep(page, "cash_notes", "avant-approbation", [
    { label: "Approuver l'avance de caisse", locator: approveBtn },
  ]);
  // Le toast sonner (coin bas-droit, ~4s) peut encore couvrir la ligne visée
  // par scrollIntoViewIfNeeded() — fermé via son propre bouton (closeButton
  // activé dans components/ui/sonner.tsx) plutôt que d'attendre son minutage
  // ou de toucher le DOM directement (React perd alors le nœud et plante).
  const closeButtons = page.locator("[data-close-button]");
  for (let n = await closeButtons.count(); n > 0; n--) {
    await closeButtons.first().click({ timeout: 2000 }).catch(() => {});
  }
  const approveResponse = page.waitForResponse(r => r.url().includes("/cash-notes/") && r.url().includes("/approve"));
  await approveBtn.click();
  const resp = await approveResponse;
  if (!resp.ok()) throw new Error(`Approbation échouée : ${resp.status()} ${await resp.text()}`);
  await page.locator(".shimmer").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await captureStep(page, "cash_notes", "apres-approbation");
});

test("Détail — Frais de mission (création)", async () => {
  await gotoTab("mission_notes");
  const newBtn = page.getByRole("button", { name: "Nouvelle note" });
  await captureStep(page, "mission_notes", "bouton-nouvelle-note", [
    { label: "Créer une nouvelle note de frais de mission", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "mission_notes", "formulaire-vide", [
    { label: "Nom et prénom du bénéficiaire", locator: fieldByLabel(panel, "Nom et Prénom") },
  ]);

  await fieldByLabel(panel, "Nom et Prénom").fill("Karim Lahlou");
  await fieldByLabel(panel, "CIN").fill("BL321654");
  await fieldByLabel(panel, "Objet de mission").fill("Visite d'un centre de stage partenaire à Tanger");
  await fieldByLabel(panel, "Mission du").fill("2026-10-12");
  await fieldByLabel(panel, "… au").fill("2026-10-13");
  // La grille Thème×Jour se génère automatiquement (± 1 jour de marge) dès
  // que les deux dates sont renseignées — pas besoin de cliquer le bouton.
  await page.waitForTimeout(300);
  await panel.getByPlaceholder("0,00").first().fill("350");

  const submitBtn = panel.getByRole("button", { name: "Créer & télécharger" });
  await captureStep(page, "mission_notes", "formulaire-rempli", [
    { label: "Enregistrer la note (soumise à approbation N+1)", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "mission_notes", "nouvelle-ligne-en-attente");
});

test("Détail — Paiements scolarité (matrice + versement)", async () => {
  await gotoTab("tuition");
  const classCard = page.locator(".dash-card", { hasText: "Infirmiers Polyvalents" });
  await captureStep(page, "tuition", "liste-promos-annotee", [
    { label: "Ouvrir la matrice de paiement de la promo", locator: classCard },
  ]);
  const classDetailResponse = page.waitForResponse(r => /\/tuition\/class\/[^/]+$/.test(new URL(r.url()).pathname));
  await classCard.click();
  await classDetailResponse;
  // Youssef Chraibi n'a encore rien versé (statut "en retard") — cellule de
  // septembre 2026 pour illustrer le rattrapage d'un mois impayé. Les
  // colonnes fixes (statut/élève/n° insc./frais/mensualité/éch./budget/
  // payé/reste) précèdent les colonnes mensuelles — seules ces dernières
  // sont cliquables (onClick posé seulement quand canPay), d'où le
  // ciblage par style plutôt que par position fixe.
  const studentRow = page.locator("tr", { hasText: "Chraibi" });
  await studentRow.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await captureStep(page, "tuition", "matrice-eleves");

  const cell = studentRow.locator('td[style*="cursor: pointer"]').first();
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  const panel = await waitForModal(page);
  await captureStep(page, "tuition", "formulaire-versement-vide", [
    { label: "Montant du versement", locator: panel.getByLabel("Montant (MAD)") },
  ]);

  await panel.getByLabel("Montant (MAD)").fill("1500");
  await panel.getByLabel("Note (optionnel)").fill("Rattrapage mensualité septembre");

  const submitBtn = panel.getByRole("button", { name: "Ajouter" });
  await captureStep(page, "tuition", "formulaire-versement-rempli", [
    { label: "Enregistrer le versement", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await studentRow.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await captureStep(page, "tuition", "matrice-apres-versement");
});

test("Détail — Paiements (échéancier d'une commande)", async () => {
  await gotoTab("payments");
  const row = page.locator(".row-c", { hasText: "ordinateur portable" });
  await captureStep(page, "payments", "liste-annotee", [
    { label: "Ouvrir l'échéancier de la commande", locator: row },
  ]);
  await row.click();
  await page.waitForTimeout(400);
  await captureStep(page, "payments", "echeancier-planifie");
});

test("Détail — Livraisons (détail d'une réception)", async () => {
  await gotoTab("purchases");
  const row = page.locator(".row-c", { hasText: "ordinateur portable" });
  await captureStep(page, "purchases", "liste-annotee", [
    { label: "Ouvrir le détail de la commande", locator: row },
  ]);
  await row.click();
  await page.waitForTimeout(400);
  await captureStep(page, "purchases", "detail-reception");
});

test("Détail — Historique comptable (filtrage)", async () => {
  await gotoTab("journal");
  const body = page.locator("body");
  await captureStep(page, "journal", "filtres-vides", [
    { label: "Filtrer par type d'opération", locator: fieldByLabel(body, "Type d'opération") },
  ]);
  await fieldByLabel(body, "Type d'opération").selectOption({ label: "Demande d'achat" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "journal", "filtre-applique");
});

test("Détail — Journal de caisse (saisie manuelle)", async () => {
  await gotoTab("cash_journal");
  const newBtn = page.getByRole("button", { name: "Saisie manuelle" });
  await captureStep(page, "cash_journal", "bouton-saisie", [
    { label: "Saisir un mouvement de caisse", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "cash_journal", "formulaire-vide", [
    { label: "Libellé de l'opération", locator: fieldByLabel(panel, "Action") },
  ]);

  await fieldByLabel(panel, "Action").fill("Achat de fournitures de nettoyage");
  await fieldByLabel(panel, "Prestataire").fill("Droguerie Al Wafa");
  await fieldByLabel(panel, "Montant (DH)").fill("380");
  await fieldByLabel(panel, "Justificatif").fill("BL-2214");

  const submitBtn = panel.getByRole("button", { name: "Enregistrer" });
  await captureStep(page, "cash_journal", "formulaire-rempli", [
    { label: "Enregistrer le mouvement", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "cash_journal", "nouvelle-ligne");
});

test("Détail — Chèques & virements (inscription d'une pièce)", async () => {
  await gotoTab("cheques");
  const newBtn = page.getByRole("button", { name: "Inscrire un chèque" });
  await captureStep(page, "cheques", "bouton-inscrire", [
    { label: "Inscrire un chèque reçu", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "cheques", "formulaire-vide", [
    { label: "Montant du chèque", locator: panel.locator('input[type="number"]') },
  ]);

  // Pas de <label>/htmlFor ici (juste des <div> stylés) : ciblage par
  // position/placeholder plutôt que par libellé pour ce formulaire précis.
  await panel.locator('input[type="number"]').fill("1500");
  await panel.getByPlaceholder("ex. 4581203").fill("CH-000456");
  await panel.getByPlaceholder("ex. BMCE").fill("Banque Populaire");

  const submitBtn = panel.getByRole("button", { name: "Inscrire", exact: true });
  await captureStep(page, "cheques", "formulaire-rempli", [
    { label: "Inscrire la pièce au registre", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "cheques", "nouvelle-ligne");
});

test("Détail — Validations (approbation N+1 centralisée)", async () => {
  await gotoTab("validations");
  const card = page.locator(".dash-card", { hasText: "Squalli" });
  const approveBtn = card.getByRole("button", { name: "Approuver" });
  await captureStep(page, "validations", "avant-approbation", [
    { label: "Approuver la note de frais de mission", locator: approveBtn },
  ]);
  const approveResponse = page.waitForResponse(r => r.url().includes("/mission-notes/") && r.url().includes("/approve"));
  await approveBtn.click();
  await approveResponse;
  await page.waitForTimeout(500);
  await captureStep(page, "validations", "apres-approbation");
});

test("Détail — Budgets (budget sur période)", async () => {
  await gotoTab("budgets");
  const newBtn = page.getByRole("button", { name: "Nouveau budget" });
  await captureStep(page, "budgets", "bouton-nouveau", [
    { label: "Créer un nouveau budget", locator: newBtn },
  ]);
  await newBtn.click();
  const panel = await waitForModal(page);
  await captureStep(page, "budgets", "formulaire-vide", [
    { label: "Choisir la catégorie", locator: fieldByLabel(panel, "Catégorie") },
  ]);

  await fieldByLabel(panel, "Catégorie").selectOption({ label: "Équipement informatique" });
  await fieldByLabel(panel, "Agenda début").fill("2026-10-01");
  await fieldByLabel(panel, "Agenda fin").fill("2026-12-31");
  await fieldByLabel(panel, "Montant prévu (MAD)").fill("10000");

  const submitBtn = panel.getByRole("button", { name: "Créer le budget" });
  await captureStep(page, "budgets", "formulaire-rempli", [
    { label: "Valider le budget", locator: submitBtn },
  ]);
  await submitBtn.click();
  await panel.waitFor({ state: "hidden" }).catch(() => {});
  await page.waitForTimeout(400);
  await captureStep(page, "budgets", "nouvelle-ligne");
});
