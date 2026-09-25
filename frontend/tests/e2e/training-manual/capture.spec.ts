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
