import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserCog, Wallet, ListChecks, RefreshCw, AlertTriangle, CalendarClock, Clock3, CalendarDays, ChevronRight } from "lucide-react";
import { PageHead, EmptyHint, SectionLabel, SegTabs } from "@/components/dashboard/ui";
import { AgendaCalendar } from "@/components/agenda/AgendaCalendar";

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
const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

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
const SEVERITY_META: Record<Severity, { label: string; chip: string; icon: typeof AlertTriangle; hint: string }> = {
  overdue: { label: "En retard", chip: "chip-c-red", icon: AlertTriangle, hint: "échéance dépassée" },
  today: { label: "Aujourd'hui", chip: "chip-c-amber", icon: CalendarClock, hint: "à traiter dans la journée" },
  soon: { label: "À venir", chip: "chip-c-blue", icon: Clock3, hint: "dans les prochains jours" },
};

// « J-3 », « Retard 2 j », « Auj. » — calcul en dates locales.
function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const [y, m, d] = due.slice(0, 10).split("-").map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Auj.";
  return diff < 0 ? `Retard ${-diff} j` : `J-${diff}`;
}
const SEVERITY_ORDER: Severity[] = ["overdue", "today", "soon"];

function ItemRow({ item, onOpen }: { item: AgendaItem; onOpen: () => void }) {
  const Icon = CATEGORY_ICON[item.category] ?? ListChecks;
  const due = dueLabel(item.due_date);
  return (
    <button type="button" className={`row-c agd-row agd-${item.severity}`} onClick={onOpen}>
      <span className="agd-ico"><Icon size={15} strokeWidth={1.8} /></span>
      <div className="min-w-0 flex-1">
        <div className="agd-title">{item.title}</div>
        <div className="agd-meta">
          {CATEGORY_LABEL[item.category] ?? item.category}
          {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
          {` · ${item.responsible.length} responsable${item.responsible.length > 1 ? "s" : ""}`}
        </div>
      </div>
      {due && <span className="agd-due">{due}</span>}
      <ChevronRight size={15} strokeWidth={1.8} className="agd-go" />
    </button>
  );
}

export function AgendaGestionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"calendar" | "todo">("calendar");

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

      <div className="agd-sev-row">
        {SEVERITY_ORDER.map((sev, i) => {
          const meta = SEVERITY_META[sev];
          const Icon = meta.icon;
          return (
            <button key={sev} type="button" className={`dash-card agd-sev agd-${sev}`} style={{ ["--i" as string]: i } as CSSProperties}
              onClick={() => setTab("todo")}>
              <span className="agd-sev-ico"><Icon size={16} strokeWidth={1.9} /></span>
              <span className="agd-sev-v">{loading ? "–" : grouped[sev].length}</span>
              <span className="agd-sev-l"><b>{meta.label}</b>{meta.hint}</span>
            </button>
          );
        })}
      </div>

      <SegTabs
        label="Affichage de l'agenda"
        value={tab}
        onChange={k => setTab(k)}
        items={[
          { key: "calendar", label: "Calendrier", icon: CalendarDays },
          { key: "todo", label: `À traiter (${items.length})`, icon: ListChecks },
        ]}
      />

      <div className="pouls-pane" key={tab}>
      {tab === "calendar" ? (
        <AgendaCalendar onOpen={ev => navigate({ to: ev.link as "/dashboard" })} />
      ) : loading ? (
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
    </div>
  );
}
