import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid, ShoppingCart, Building2, Tags, TrendingUp, Receipt, FileText, PiggyBank, BarChart3, ClipboardList, History, CreditCard, Package, Wallet, ShieldCheck, Inbox, NotebookPen, Plane, Landmark, ScrollText } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { AccountingValidations, MySubmissions } from "@/components/accounting/Approvals";
import { AccountingOverview } from "@/components/accounting/Overview";
import { AccountingAnalytics } from "@/components/accounting/Analytics";
import { AccountingPurchases } from "@/components/accounting/Purchases";
import { AccountingPurchaseRequests } from "@/components/accounting/PurchaseRequests";
import { AccountingSuppliers } from "@/components/accounting/Suppliers";
import { AccountingCategories } from "@/components/accounting/Categories";
import { AccountingRevenues } from "@/components/accounting/Revenues";
import { AccountingExpenses } from "@/components/accounting/Expenses";
import { AccountingInvoices } from "@/components/accounting/Invoices";
import { AccountingBudgets } from "@/components/accounting/Budgets";
import { AccountingJournal } from "@/components/accounting/Journal";
import { AccountingCashJournal } from "@/components/accounting/CashJournal";
import { AccountingBankJournal } from "@/components/accounting/BankJournal";
import { AccountingCheques } from "@/components/accounting/Cheques";
import { AccountingCashNotes } from "@/components/accounting/CashNotes";
import { AccountingMissionNotes } from "@/components/accounting/MissionNotes";
import { AccountingPayments } from "@/components/accounting/Payments";
import { AccountingInventory } from "@/components/accounting/Inventory";
import { AccountingTuitionTracking } from "@/components/accounting/TuitionTracking";

export const Route = createFileRoute("/dashboard/accounting")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    // Admin (plein accès), comptable (lecture seule) et caissier (saisie → validation).
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "accountant", "cashier"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: AccountingPage,
});

const sans = '"Manrope", system-ui, sans-serif';

type Tab = "overview" | "analytics" | "tuition" | "revenues" | "expenses" | "invoices" | "purchase_requests" | "purchases" | "payments" | "inventory" | "budgets" | "suppliers" | "categories" | "cash_journal" | "bank_journal" | "cheques" | "cash_notes" | "mission_notes" | "journal" | "validations" | "mine";

const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { key: "validations",       label: "Validations",      icon: ShieldCheck   },
  { key: "overview",          label: "Vue d'ensemble",   icon: LayoutGrid    },
  { key: "analytics",         label: "Analytique",       icon: BarChart3     },
  { key: "tuition",           label: "Suivi scolarité",  icon: Wallet        },
  { key: "mine",              label: "Mes saisies",      icon: Inbox         },
  { key: "revenues",          label: "Recettes",         icon: TrendingUp    },
  { key: "expenses",          label: "Dépenses",         icon: Receipt       },
  { key: "invoices",          label: "Factures",         icon: FileText      },
  { key: "purchase_requests", label: "Demandes d'achat", icon: ClipboardList },
  { key: "purchases",         label: "Achats",           icon: ShoppingCart  },
  { key: "payments",          label: "Paiements",        icon: CreditCard    },
  { key: "inventory",         label: "Inventaire",       icon: Package       },
  { key: "budgets",           label: "Budgets",          icon: PiggyBank     },
  { key: "suppliers",         label: "Fournisseurs",     icon: Building2     },
  { key: "categories",        label: "Catégories",       icon: Tags          },
  { key: "cash_journal",      label: "Journal de caisse", icon: Wallet       },
  { key: "bank_journal",      label: "Journal des comptes", icon: Landmark   },
  { key: "cheques",           label: "Chèques & virements", icon: ScrollText   },
  { key: "cash_notes",        label: "Notes de caisse",   icon: NotebookPen  },
  { key: "mission_notes",     label: "Frais de mission",  icon: Plane        },
  { key: "journal",           label: "Journal comptable", icon: History      },
];

// Onglets visibles par rôle.
//  - admin      : tout (dont Validations N+1)
//  - comptable  : lecture seule (données + calculs) — pas de CRUD transactionnel
//  - caissier   : saisie de scolarité + suivi de ses saisies
// Le journal des comptes (trésorerie : virements, OV, chèques) relève de
// l'administration et de la comptabilité — le caissier tient la caisse espèces.
const TABS_BY_ROLE: Record<"admin" | "accountant" | "cashier", Tab[]> = {
  admin: ["validations", "overview", "analytics", "tuition", "revenues", "expenses", "invoices", "purchase_requests", "purchases", "payments", "inventory", "budgets", "suppliers", "categories", "cash_journal", "bank_journal", "cheques", "cash_notes", "mission_notes", "journal"],
  accountant: ["overview", "tuition", "purchase_requests", "cash_journal", "bank_journal", "cheques", "cash_notes", "mission_notes", "journal"],
  cashier: ["tuition", "purchase_requests", "cash_journal", "cash_notes", "mission_notes", "mine"],
};

function AccountingPage() {
  const { roles } = useAuth();
  const role: "admin" | "accountant" | "cashier" =
    roles.includes("admin") ? "admin" : roles.includes("accountant") ? "accountant" : "cashier";
  const readOnly = role === "accountant";
  const visibleKeys = TABS_BY_ROLE[role];
  const visibleTabs = TABS.filter(t => visibleKeys.includes(t.key));
  const [tab, setTab] = useState<Tab>(visibleTabs[0]?.key ?? "tuition");

  const sub = role === "admin"
    ? "Achats, fournisseurs, catégories et suivi budgétaire — centralisés."
    : role === "accountant"
      ? "Consultation des données et calculs — lecture seule."
      : "Saisie des paiements de scolarité (soumis à validation) et suivi de vos saisies.";

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion administrative"
        title="Comptabilité"
        sub={sub}
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: "1px solid var(--pal-line)", flexWrap: "wrap" }}>
        {visibleTabs.map(t => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 16px", marginBottom: -1,
                border: "none", borderBottom: active ? "2px solid var(--pal-primary)" : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                fontFamily: sans, fontSize: 13.5, fontWeight: active ? 700 : 600,
                color: active ? "var(--pal-ink)" : "var(--pal-muted)",
              }}
            >
              <Icon size={15} strokeWidth={1.7} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "validations"       && <AccountingValidations />}
      {tab === "mine"              && <MySubmissions />}
      {tab === "overview"          && <AccountingOverview />}
      {tab === "analytics"         && <AccountingAnalytics />}
      {tab === "tuition"           && <AccountingTuitionTracking readOnly={readOnly} />}
      {tab === "revenues"          && <AccountingRevenues />}
      {tab === "expenses"          && <AccountingExpenses />}
      {tab === "invoices"          && <AccountingInvoices />}
      {tab === "purchase_requests" && <AccountingPurchaseRequests canDecide={role === "admin"} />}
      {tab === "purchases"         && <AccountingPurchases />}
      {tab === "payments"          && <AccountingPayments />}
      {tab === "inventory"         && <AccountingInventory />}
      {tab === "budgets"           && <AccountingBudgets />}
      {tab === "suppliers"         && <AccountingSuppliers />}
      {tab === "categories"        && <AccountingCategories />}
      {tab === "cash_journal"      && <AccountingCashJournal />}
      {tab === "bank_journal"      && <AccountingBankJournal />}
      {tab === "cheques"           && <AccountingCheques />}
      {tab === "cash_notes"        && <AccountingCashNotes />}
      {tab === "mission_notes"     && <AccountingMissionNotes />}
      {tab === "journal"           && <AccountingJournal />}
    </div>
  );
}

