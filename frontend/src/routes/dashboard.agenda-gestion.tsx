import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserCog, Wallet, ListChecks, RefreshCw, AlertTriangle, CalendarClock, Clock3 } from "lucide-react";
import { PageHead, EmptyHint, SectionLabel } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/agenda-gestion")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "rh", "assistant_rh", "comptabilite"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: AgendaGestionPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

type Severity = "overdue" | "today" | "soon";
type AgendaItem = {
  category: string; domain: string; title: string; due_date: string | null;
  severity: Severity; responsible: string[]; link: string;
};

const CATEGORY_ICON: Record<string, typeof ListChecks> = {
  task: ListChecks, hr_leave: UserCog, hr_contract: UserCog, hr_probation: UserCog, accounting_approval: Wallet,
};
const CATEGORY_LABEL: Record<string, string> = {
  task: "Tâche", hr_leave: "Congé", hr_contract: "Contrat", hr_probation: "Période d'essai", accounting_approval: "Approbation",
};
const SEVERITY_META: Record<Severity, { label: string; chip: string; icon: typeof AlertTriangle }> = {
  overdue: { label: "En retard", chip: "chip-c-red", icon: AlertTriangle },
  today: { label: "Aujourd'hui", chip: "chip-c-amber", icon: CalendarClock },
  soon: { label: "À venir", chip: "chip-c-blue", icon: Clock3 },
};
const SEVERITY_ORDER: Severity[] = ["overdue", "today", "soon"];

function ItemRow({ item, onOpen }: { item: AgendaItem; onOpen: () => void }) {
  const Icon = CATEGORY_ICON[item.category] ?? ListChecks;
  return (
    <div className="row-c" style={{ cursor: "pointer" }} onClick={onOpen}>
      <span
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{ width: 34, height: 34, background: "var(--pal-cream)", color: "var(--pal-primary-deep)" }}
      >
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700, color: PAL.ink }}>{item.title}</div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: PAL.muted, marginTop: 2 }}>
          {CATEGORY_LABEL[item.category] ?? item.category}
          {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
        </div>
      </div>
      <span className="chip-c" style={{ fontSize: 10.5 }}>{item.responsible.length} responsable{item.responsible.length > 1 ? "s" : ""}</span>
    </div>
  );
}

export function AgendaGestionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/api/agenda-gestion/overview");
      setItems(res?.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function scanNow() {
    setScanning(true);
    try {
      const res = await api.post("/api/agenda-gestion/scan-now", {});
      toast.success(`${res.reminders_sent} rappel${res.reminders_sent > 1 ? "s" : ""} envoyé${res.reminders_sent > 1 ? "s" : ""}.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la relance.");
    } finally {
      setScanning(false);
    }
  }

  const grouped = useMemo(() => {
    const g: Record<Severity, AgendaItem[]> = { overdue: [], today: [], soon: [] };
    for (const it of items) g[it.severity]?.push(it);
    return g;
  }, [items]);

  const byDomain = useMemo(() => {
    const counts = { rh: 0, comptabilite: 0, general: 0, scolarite: 0 } as Record<string, number>;
    for (const it of items) counts[it.domain] = (counts[it.domain] ?? 0) + 1;
    return counts;
  }, [items]);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Aperçu"
        title="Agenda de gestion"
        sub="RH, Comptabilité et Tâches réunis — tout ce qui requiert une action ou approche son échéance."
        actions={
          <button type="button" onClick={scanNow} disabled={scanning} className="btn-c btn-c-ghost btn-c-sm">
            <RefreshCw size={14} strokeWidth={1.7} style={scanning ? { animation: "spin 1s linear infinite" } : undefined} />
            {scanning ? "Relance…" : "Relancer maintenant"}
          </button>
        }
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <span className="chip-c chip-c-blue" style={{ fontSize: 11.5 }}><UserCog size={12} strokeWidth={1.8} />RH · {byDomain.rh} échéance{byDomain.rh !== 1 ? "s" : ""}</span>
        <span className="chip-c chip-c-green" style={{ fontSize: 11.5 }}><Wallet size={12} strokeWidth={1.8} />Comptabilité · {byDomain.comptabilite} échéance{byDomain.comptabilite !== 1 ? "s" : ""}</span>
        <span className="chip-c" style={{ fontSize: 11.5 }}><ListChecks size={12} strokeWidth={1.8} />Tâches · {(byDomain.general ?? 0) + (byDomain.scolarite ?? 0)} échéance{((byDomain.general ?? 0) + (byDomain.scolarite ?? 0)) !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<ListChecks size={26} strokeWidth={1.7} />} text="Rien n'attend d'action pour l'instant." /></div>
      ) : (
        SEVERITY_ORDER.map(sev => {
          const list = grouped[sev];
          if (list.length === 0) return null;
          const meta = SEVERITY_META[sev];
          const Icon = meta.icon;
          return (
            <div key={sev} style={{ marginBottom: 22 }}>
              <SectionLabel>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon size={13} strokeWidth={1.8} />{meta.label} ({list.length})
                </span>
              </SectionLabel>
              <div className="dash-card overflow-hidden">
                {list.map((it, i) => (
                  <ItemRow key={`${it.category}-${i}`} item={it} onOpen={() => navigate({ to: it.link as "/dashboard" })} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
