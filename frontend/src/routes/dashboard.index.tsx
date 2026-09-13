import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Bell, Home, Users, Activity, ListChecks } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CountUp } from "@/components/CountUp";
import { ListSkeleton } from "@/components/Skeletons";
import { PageHead, SectionLabel } from "@/components/dashboard/ui";
import { AgendaGestionPage } from "./dashboard.agenda-gestion";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async () => {
    // Comptable externe (aucun autre rôle métier) : l'Aperçu académique ne le
    // concerne pas — direction immédiate vers son espace comptable exclusif.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const roles = (data ?? []).map((r) => r.role);
    if (roles.length > 0 && roles.every((r) => r === "accountant")) {
      throw redirect({ to: "/dashboard/accounting", search: { tab: "overview", scope: undefined } });
    }
  },
  component: DashboardHome,
});

type Stats = {
  unread: number;
};

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

type AdminOverview = {
  total_students: number;
  students_by_class: { class_id: string; class_name: string; count: number }[];
  documents_total: number;
  documents_today: number;
  recent_activity: AuditEntry[];
};

async function fetchStats(userId: string): Promise<Stats> {
  const { count: unread = 0 } = await supabase
    .from("notifications").select("*", { count: "exact", head: true })
    .eq("user_id", userId).eq("read", false);
  return { unread: unread ?? 0 };
}

function DashboardHome() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf  = roles.includes("professor");
  const role    = isAdmin ? "admin" : isProf ? "professor" : "student";

  const hasHrRole = roles.includes("rh") || roles.includes("assistant_rh");
  const isComptabilite = roles.includes("comptabilite");
  const showAgendaGestion = isAdmin || hasHrRole || isComptabilite;
  const extraTabsVisible = showAgendaGestion;

  type OverviewTab = "apercu" | "agenda-gestion";
  const [tab, setTab] = useState<OverviewTab>("apercu");

  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [overview,        setOverview]        = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchStats(user.id)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [user]);

  // Admin real-time overview — effectifs, documents générés, activité récente.
  // Poll every 30s; a future iteration can swap this for a Supabase Realtime
  // subscription on the same tables (classes/documents/audit_log) for instant updates.
  useEffect(() => {
    if (!user || !isAdmin) return;
    setOverviewLoading(true);
    const load = () => api.get("/api/dashboard/admin-overview")
      .then((data: AdminOverview) => setOverview(data))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [user, isAdmin]);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0];
  const today = new Date().toLocaleDateString(
    lang === "ar" ? "ar-MA" : lang === "fr" ? "fr-FR" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={today}
        title={
          <span>
            {lang === "fr" ? "Bonjour" : lang === "ar" ? "مرحباً" : "Hello"}
            {firstName ? (
              <>
                , <em style={{ fontStyle: "italic", color: "var(--pal-primary)" }}>{firstName}</em>
              </>
            ) : null}
            .
          </span>
        }
        sub={lang === "fr"
          ? `Voici un aperçu de votre espace ${t(`dash.role.${role}`).toLowerCase()}.`
          : lang === "ar"
          ? `هذه نظرة عامة على فضائك.`
          : `Here's an overview of your ${t(`dash.role.${role}`).toLowerCase()} space.`}
      />

      {extraTabsVisible && (
        <div style={{ display: "flex", gap: 6, marginBottom: 4, borderBottom: "1px solid var(--pal-line)", flexWrap: "wrap" }}>
          {([
            { key: "apercu" as const, label: lang === "fr" ? "Aperçu" : lang === "ar" ? "نظرة عامة" : "Overview", icon: Home, show: true },
            { key: "agenda-gestion" as const, label: t("dash.agendaGestion"), icon: ListChecks, show: showAgendaGestion },
          ]).filter(x => x.show).map(x => {
            const active = tab === x.key;
            const Icon = x.icon;
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => setTab(x.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "10px 16px", marginBottom: -1,
                  border: "none", borderBottom: active ? "2px solid var(--pal-primary)" : "2px solid transparent",
                  background: "transparent", cursor: "pointer",
                  fontFamily: '"Manrope", system-ui, sans-serif', fontSize: 13.5, fontWeight: active ? 700 : 600,
                  color: active ? "var(--pal-ink)" : "var(--pal-muted)",
                }}
              >
                <Icon size={15} strokeWidth={1.7} />
                {x.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "agenda-gestion" && showAgendaGestion && <AgendaGestionPage />}

      {tab === "apercu" && (
      <>
      {stats && stats.unread > 0 && (
        <Link to="/dashboard/notifications" className="block no-underline">
          <div className="dash-card lift-c flex items-center gap-3 px-5 py-4">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}
            >
              <Bell className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--pal-ink)" }}>
                {stats.unread}{" "}
                {lang === "fr" ? stats.unread === 1 ? "nouvelle notification" : "nouvelles notifications" : stats.unread === 1 ? "new notification" : "new notifications"}
              </p>
              <p className="text-xs" style={{ color: "var(--pal-muted)" }}>
                {lang === "fr" ? "Cliquez pour les consulter" : "Click to view them"}
              </p>
            </div>
            <span
              className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
              style={{ background: "var(--pal-danger)", color: "var(--pal-paper)" }}
            >
              {stats.unread}
            </span>
          </div>
        </Link>
      )}

      {/* ── Admin — L2 Gestion Administrative real-time overview ────────── */}
      {isAdmin && (
        <div>
          <SectionLabel>Vue d'ensemble administrative</SectionLabel>

          {overviewLoading && !overview ? (
            <ListSkeleton rows={2} />
          ) : overview ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="dash-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}>
                    <Users className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                  <span className="eyebrow">Effectifs</span>
                </div>
                <div className="stat-num mt-3">
                  <CountUp value={overview.total_students} duration={700} />
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {overview.students_by_class.slice(0, 5).map(c => (
                    <div key={c.class_id} className="flex items-center justify-between text-xs" style={{ color: "var(--pal-muted)" }}>
                      <span>{c.class_name}</span>
                      <span style={{ fontWeight: 700, color: "var(--pal-ink)" }}>{c.count}</span>
                    </div>
                  ))}
                  {overview.students_by_class.length === 0 && (
                    <span className="text-xs" style={{ color: "var(--pal-muted)" }}>Aucune classe.</span>
                  )}
                </div>
              </div>

              <div className="dash-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}>
                    <FileText className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                  <span className="eyebrow">Documents générés</span>
                </div>
                <div className="stat-num mt-3">
                  <CountUp value={overview.documents_total} duration={700} />
                </div>
                <div className="mt-3 text-xs" style={{ color: "var(--pal-muted)" }}>
                  {overview.documents_today} aujourd'hui
                </div>
              </div>

              <div className="dash-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}>
                    <Activity className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                  <span className="eyebrow">Activité récente</span>
                </div>
                <div className="mt-3 flex flex-col gap-1.5 max-h-[104px] overflow-y-auto">
                  {overview.recent_activity.slice(0, 5).map(a => (
                    <div key={a.id} className="text-xs" style={{ color: "var(--pal-muted)" }}>
                      <span style={{ fontWeight: 700, color: "var(--pal-ink)" }}>{a.action}</span>
                      {" · "}
                      {new Date(a.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ))}
                  {overview.recent_activity.length === 0 && (
                    <span className="text-xs" style={{ color: "var(--pal-muted)" }}>Aucune activité récente.</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      </>
      )}
    </div>
  );
}
