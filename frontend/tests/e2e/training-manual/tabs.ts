/** Les 19 onglets visibles par un compte admin dans le module Comptabilité
 * (cf. TABS_BY_ROLE.admin dans dashboard.accounting.tsx). "Mes saisies"
 * (réservé au rôle caissier) est capturé séparément, hors de cette liste. */
export type TabKey =
  | "validations" | "overview" | "tuition" | "revenues" | "invoices"
  | "purchase_requests" | "purchases" | "payments" | "inventory" | "locaux"
  | "budgets" | "suppliers" | "categories" | "cash_journal" | "bank_journal"
  | "cheques" | "cash_notes" | "mission_notes" | "journal";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "validations", label: "Validations" },
  { key: "overview", label: "Vue d'ensemble" },
  { key: "tuition", label: "Paiements scolarité" },
  { key: "revenues", label: "Recettes" },
  { key: "invoices", label: "Factures" },
  { key: "purchase_requests", label: "Demandes d'achat" },
  { key: "purchases", label: "Livraisons" },
  { key: "payments", label: "Paiements" },
  { key: "inventory", label: "Inventaire" },
  { key: "locaux", label: "Locaux" },
  { key: "budgets", label: "Budgets" },
  { key: "suppliers", label: "Fournisseurs" },
  { key: "categories", label: "Catégories" },
  { key: "cash_journal", label: "Journal de caisse" },
  { key: "bank_journal", label: "Journal des comptes" },
  { key: "cheques", label: "Chèques & virements" },
  { key: "cash_notes", label: "Notes de caisse" },
  { key: "mission_notes", label: "Frais de mission" },
  { key: "journal", label: "Historique comptable" },
];
