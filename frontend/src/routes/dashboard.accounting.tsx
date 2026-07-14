import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid, ShoppingCart, Building2, Tags, TrendingUp, Receipt, FileText, PiggyBank, BarChart3, ClipboardList, History, CreditCard, Package } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
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
import { AccountingPayments } from "@/components/accounting/Payments";
import { AccountingInventory } from "@/components/accounting/Inventory";

export const Route = createFileRoute("/dashboard/accounting")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "admin");
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: AccountingPage,
});

const sans = '"Manrope", system-ui, sans-serif';

type Tab = "overview" | "analytics" | "revenues" | "expenses" | "invoices" | "purchase_requests" | "purchases" | "payments" | "inventory" | "budgets" | "suppliers" | "categories" | "journal";

const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview",          label: "Vue d'ensemble",   icon: LayoutGrid    },
  { key: "analytics",         label: "Analytique",       icon: BarChart3     },
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
  { key: "journal",           label: "Journal",          icon: History       },
];

function AccountingPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion administrative"
        title="Comptabilité"
        sub="Achats, fournisseurs, catégories et suivi budgétaire — centralisés."
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: "1px solid var(--pal-line)", flexWrap: "wrap" }}>
        {TABS.map(t => {
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

      {tab === "overview"          && <AccountingOverview />}
      {tab === "analytics"         && <AccountingAnalytics />}
      {tab === "revenues"          && <AccountingRevenues />}
      {tab === "expenses"          && <AccountingExpenses />}
      {tab === "invoices"          && <AccountingInvoices />}
      {tab === "purchase_requests" && <AccountingPurchaseRequests />}
      {tab === "purchases"         && <AccountingPurchases />}
      {tab === "payments"          && <AccountingPayments />}
      {tab === "inventory"         && <AccountingInventory />}
      {tab === "budgets"           && <AccountingBudgets />}
      {tab === "suppliers"         && <AccountingSuppliers />}
      {tab === "categories"        && <AccountingCategories />}
      {tab === "journal"           && <AccountingJournal />}
    </div>
  );
}

