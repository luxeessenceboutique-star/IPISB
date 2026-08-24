import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarClock, Search, Clock3, BookOpen, Layers } from "lucide-react";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/agenda-formateur")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "professor"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: AgendaFormateurPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

type SessionRow = {
  id: string;
  status: "active" | "completed" | "cancelled" | "scheduled";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  course_title: string;
  class_name: string;
  professor_id: string | null;
  professor_name: string;
};

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  active: { label: "En cours", chip: "chip-c-blue" },
  completed: { label: "Terminée", chip: "chip-c-green" },
  cancelled: { label: "Annulée", chip: "chip-c-red" },
  scheduled: { label: "Planifiée", chip: "chip-c-amber" },
};

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function AgendaFormateurPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = (await api.get("/api/teaching-sessions")) as SessionRow[];
        if (!cancelled) setSessions(data);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message ?? "Erreur lors du chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const byTrainer = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; sessions: SessionRow[] }>();
    for (const s of sessions) {
      const id = s.professor_id ?? s.professor_name;
      if (!groups.has(id)) groups.set(id, { id, name: s.professor_name, sessions: [] });
      groups.get(id)!.sessions.push(s);
    }
    for (const g of groups.values()) {
      g.sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
    }
    const list = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    const q = search.trim().toLowerCase();
    return q ? list.filter(g => g.name.toLowerCase().includes(q)) : list;
  }, [sessions, search]);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Aperçu"
        title="Agenda Formateur"
        sub="Vue consolidée des interventions de chaque formateur, tous groupes confondus."
      />

      {isAdmin && (
        <div style={{ position: "relative", maxWidth: 320, marginBottom: 18 }}>
          <Search size={14} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un formateur…" className="u-input"
            style={{ width: "100%", padding: "9px 12px 9px 34px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
      )}

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : byTrainer.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<CalendarClock size={26} strokeWidth={1.7} />} text="Aucune séance enregistrée." /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {byTrainer.map(g => (
            <div key={g.id} className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${PAL.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: PAL.ink }}>{g.name}</span>
                <span className="chip-c" style={{ fontSize: 11 }}>{g.sessions.length} séance{g.sessions.length > 1 ? "s" : ""}</span>
              </div>
              <div>
                {g.sessions.map(s => (
                  <div key={s.id} className="row-c flex-wrap">
                    <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: PAL.ink }}>
                        <BookOpen size={13} strokeWidth={1.8} style={{ color: "var(--pal-primary)", flexShrink: 0 }} />
                        {s.course_title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PAL.muted, marginTop: 3 }}>
                        <Layers size={12} strokeWidth={1.7} />{s.class_name}
                        <span style={{ opacity: .5 }}>·</span>
                        {new Date(s.started_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        <span style={{ opacity: .5 }}>·</span>
                        <Clock3 size={12} strokeWidth={1.7} />{formatDuration(s.duration_seconds)}
                      </div>
                    </div>
                    <span className={`chip-c ${STATUS_LABEL[s.status]?.chip ?? ""}`} style={{ fontSize: 11 }}>
                      {STATUS_LABEL[s.status]?.label ?? s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
