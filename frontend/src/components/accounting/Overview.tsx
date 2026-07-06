import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShoppingCart, Wallet, CheckCircle2, AlertCircle, CalendarClock, Building2, ClipboardList } from "lucide-react";
import { CountUp } from "@/components/CountUp";

type Summary = {
  total_purchases: number;
  total_purchases_amount: number;
  total_paid: number;
  total_unpaid: number;
  monthly_expenses: number;
  supplier_count: number;
  purchase_request_count: number;
};

function fmtMAD(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MAD";
}

export function AccountingOverview() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/accounting/purchases/dashboard/summary")
      .then(setSummary)
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dash-card" style={{ padding: 26 }}>
        <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        <div className="shimmer" style={{ height: 26, width: "55%", borderRadius: 8, marginTop: 14 }} />
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    { label: "Total achats",        value: summary.total_purchases_amount, money: true, icon: ShoppingCart,  tone: "primary" },
    { label: "Total payé",          value: summary.total_paid,             money: true, icon: CheckCircle2,  tone: "success" },
    { label: "Total impayé",        value: summary.total_unpaid,           money: true, icon: AlertCircle,   tone: "danger"  },
    { label: "Dépenses du mois",    value: summary.monthly_expenses,       money: true, icon: CalendarClock, tone: "primary" },
    { label: "Fournisseurs",        value: summary.supplier_count,         money: false, icon: Building2,     tone: "primary" },
    { label: "Demandes d'achat",    value: summary.purchase_request_count, money: false, icon: ClipboardList, tone: "primary" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(c => (
        <div key={c.label} className="dash-card p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: c.tone === "danger" ? "oklch(94% 0.05 25)" : c.tone === "success" ? "oklch(94% 0.06 150)" : "var(--pal-pale)",
                color: c.tone === "danger" ? "oklch(55% 0.18 25)" : c.tone === "success" ? "oklch(50% 0.14 150)" : "var(--pal-primary-deep)",
              }}
            >
              <c.icon className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <span className="eyebrow">{c.label}</span>
          </div>
          <div className="stat-num mt-3">
            {c.money ? (
              <>
                <CountUp value={Math.round(c.value)} duration={700} />
                <span style={{ fontSize: 15, marginInlineStart: 6, fontWeight: 600, color: "var(--pal-muted)" }}>MAD</span>
              </>
            ) : (
              <CountUp value={c.value} duration={700} />
            )}
          </div>
        </div>
      ))}

      <div className="dash-card p-5 sm:col-span-2 lg:col-span-3" style={{ opacity: 0.75 }}>
        <p style={{ fontFamily: '"Manrope", system-ui, sans-serif', fontSize: 12.5, color: "var(--pal-muted)" }}>
          Graphiques (dépenses par mois, par catégorie, budget vs réel, top fournisseurs) et suivi budgétaire arrivent dans une prochaine itération, une fois les modules Dépenses et Budgets branchés.
        </p>
      </div>
    </div>
  );
}

export { fmtMAD };
