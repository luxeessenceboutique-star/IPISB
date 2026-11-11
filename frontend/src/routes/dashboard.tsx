import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Home, ClipboardList, GraduationCap, Bell,
  Users, FileText, Wallet,
  UserCog, LayoutGrid, History, ScrollText,
  RefreshCw, Briefcase, Landmark, MessageCircle,
  Kanban, Video,
} from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { DashAvatar } from "@/components/dashboard/ui";
import { PlatformCopilot } from "@/components/PlatformCopilot";
import { DashboardSidebar, leaf, group, type NavEntry } from "@/components/dashboard/DashboardSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { BreadcrumbLabelProvider } from "@/lib/breadcrumbLabel";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  cream:   "oklch(97% 0.012 90)",
};

const SB_DEFAULT = 248, SB_MIN = 200, SB_MAX = 420, SB_COLLAPSE_AT = 150;

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    // Plateforme administrative réservée au personnel : un compte qui n'a que
    // le rôle stagiaire relève de la plateforme pédagogique.
    const { data: rows } = await supabase
      .from("user_roles").select("role").eq("user_id", data.session.user.id);
    const userRoles = (rows ?? []).map(r => r.role as string);
    if (userRoles.includes("student") && !userRoles.some(r => r !== "student")) {
      await supabase.auth.signOut();
      toast.error("Les comptes stagiaires utilisent la plateforme pédagogique.");
      throw redirect({ to: "/auth" });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, roles, signOut } = useAuth();
  const { t, lang } = useI18n();
  const { isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "1"; } catch { return false; }
  });
  // Largeur de la barre latérale, réglable en faisant glisser sa poignée
  // (mémorisée dans ce navigateur). Double-clic : largeur par défaut.
  const [sbWidth, setSbWidth] = useState(() => {
    try { const v = Number(localStorage.getItem("sidebar-width")); return v >= SB_MIN && v <= SB_MAX ? v : SB_DEFAULT; } catch { return SB_DEFAULT; }
  });
  const [resizing, setResizing] = useState(false);
  function saveWidth(w: number) {
    try { localStorage.setItem("sidebar-width", String(w)); } catch { /* ignore */ }
  }
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = railCollapsed ? 84 : sbWidth;
    let last = railCollapsed ? sbWidth : startW;
    let collapsed = railCollapsed;
    setResizing(true);
    document.body.classList.add("sb-resizing");
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX);
      if (w < SB_COLLAPSE_AT) {
        // Tirer très à gauche replie la barre en rail d'icônes.
        if (!collapsed) { collapsed = true; setRail(true); }
        return;
      }
      if (collapsed) { collapsed = false; setRail(false); }
      last = Math.max(SB_MIN, Math.min(SB_MAX, w));
      setSbWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("sb-resizing");
      setResizing(false);
      saveWidth(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function resizeKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (railCollapsed) { if (e.key === "ArrowRight") setRail(false); return; }
    const w = Math.max(SB_MIN, Math.min(SB_MAX, sbWidth + (e.key === "ArrowRight" ? 16 : -16)));
    setSbWidth(w); saveWidth(w);
  }
  function setRail(v: boolean) {
    setRailCollapsed(v);
    try { localStorage.setItem("sidebar-collapsed", v ? "1" : "0"); } catch { /* ignore */ }
  }

  function toggleRail() {
    setRailCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  // Close drawer on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // Live unread-notification count for the sidebar badge
  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("read", false);
      if (active) setUnread(count ?? 0);
    };
    fetchUnread();
    const channel = supabase.channel("sidebar-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, fetchUnread)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user, pathname]);

  const isAdmin = roles.includes("admin");
  const isProf  = roles.includes("professor");
  const isCashier = roles.includes("cashier");
  const isAccountant = roles.includes("accountant");
  const isComptabilite = roles.includes("comptabilite");
  const isRh = roles.includes("rh");
  const isAssistantRh = roles.includes("assistant_rh");
  const hasFinanceRole = isCashier || isAccountant || isComptabilite;
  const hasHrRole = isRh || isAssistantRh;
  const roleLabel = isAdmin ? t("dash.role.admin")
    : isProf ? t("dash.role.professor")
    : isRh ? t("dash.role.rh")
    : isAssistantRh ? t("dash.role.assistant_rh")
    : isComptabilite ? t("dash.role.comptabilite")
    : isCashier ? t("dash.role.cashier")
    : isAccountant ? t("dash.role.accountant")
    : t("dash.role.student");
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "?";
  const spaceLabel = lang === "fr"
    ? `Espace ${roleLabel.toLowerCase()}`
    : lang === "ar" ? `فضاء ${roleLabel}` : `${roleLabel} space`;

  // Visibilité par rubrique — un seul calcul, partagé par tous les rôles.
  const showRh = isAdmin || hasHrRole;
  const showAccounting = isAdmin || hasFinanceRole;
  const showDocuments = isAdmin;
  const isStaff = isAdmin || isProf || hasFinanceRole || hasHrRole;
  // Utilisateurs : personnel uniquement, géré par l'administrateur (les
  // stagiaires sont gérés dans la plateforme pédagogique).
  const showUsers = isAdmin;
  // Canal V0/V1/V2 (questionnaire des canaux Comptabilité) — cashier n'en
  // fait pas partie (jamais mentionné dans le questionnaire).
  const showAccountingTasks = isAdmin || isComptabilite || isAccountant || isProf || isAssistantRh;

  // Comptable externe (le cabinet ne fait pas partie de l'équipe) : aucun
  // autre rôle métier — sa barre latérale se réduit à son seul espace,
  // sans Aperçu/Pédagogique/Gestion qui ne le concernent pas.
  const isAccountantOnly = isAccountant && !isAdmin && !isProf && !isRh && !isAssistantRh && !isCashier && !isComptabilite;

  const navEntries: NavEntry[] = isAccountantOnly ? [
    // Espace comptable exclusif — comptable externe, aucune autre rubrique.
    leaf({ key: "dash.notifications", to: "/dashboard/notifications", icon: Bell, badge: true }),
    leaf({ key: "dash.accountingSpace", to: "/dashboard/accounting", icon: Wallet, label: spaceLabel, search: { tab: "overview" } }),
  ] : [
    // Notifications en tout premier, visible par tous.
    leaf({ key: "dash.notifications", to: "/dashboard/notifications", icon: Bell, badge: true }),

    // Tâches Comptabilité (canaux V0/V1/V2) — même raccourci direct, page
    // isolée (pas de découpage par domaine dans le module Tâches générique).
    ...(showAccountingTasks ? [leaf({ key: "dash.accountingTasks", to: "/dashboard/accounting-tasks", icon: Kanban })] : []),

    // Aperçu — page d'accueil (dashboard.index.tsx).
    leaf({ key: "dash.overview", to: "/dashboard", icon: Home, exact: true }),

    // Gestion — RH, Comptabilité (sous-menu vers ses propres onglets),
    // Communication, Réunions/instances, Documents.
    group({
      key: "dash.gestion", icon: Briefcase,
      children: [
        ...(showRh ? [leaf({ key: "dash.rh", to: "/dashboard/rh", icon: UserCog })] : []),
        ...(showAccounting ? [
          group({
            key: "dash.accounting", icon: Wallet,
            children: [
              leaf({ key: "dash.accounting.overview", to: "/dashboard/accounting", icon: LayoutGrid, search: { tab: "overview" } }),
              leaf({ key: "dash.accounting.purchaseRequests", to: "/dashboard/accounting", icon: ClipboardList, search: { tab: "purchase_requests" } }),
              leaf({ key: "dash.accounting.revenuesEcole", to: "/dashboard/accounting", icon: GraduationCap, search: { tab: "revenues", scope: "formation_initiale" } }),
              leaf({ key: "dash.accounting.revenuesFC", to: "/dashboard/accounting", icon: RefreshCw, search: { tab: "revenues", scope: "formation_continue" } }),
              leaf({ key: "dash.accounting.journal", to: "/dashboard/accounting", icon: History, search: { tab: "journal" } }),
              leaf({ key: "dash.accounting.cheques", to: "/dashboard/accounting", icon: ScrollText, search: { tab: "cheques" } }),
            ],
          }),
        ] : []),
        // Communication : visible à tout le staff (pas juste admin) — un
        // groupe de discussion lié à une tâche multi-assignés peut concerner
        // n'importe quel rôle, pas seulement les administrateurs.
        leaf({ key: "dash.communication", to: "/dashboard/communication", icon: MessageCircle }),
        // Salle de conférence (Jitsi) : tout le personnel.
        ...(isStaff ? [leaf({ key: "dash.salleConference", to: "/dashboard/salle-conference", icon: Video })] : []),
        ...(isAdmin ? [
          leaf({ key: "dash.reunionsInstances", to: "/dashboard/reunions-instances", icon: Landmark }),
        ] : []),
        ...(showDocuments ? [leaf({ key: "dash.documents", to: "/dashboard/documents", icon: FileText })] : []),
      ],
    }),

    // Utilisateurs — au même niveau que Gestion, pas dedans.
    ...(showUsers ? [leaf({ key: "dash.users", to: "/dashboard/users", icon: Users })] : []),
  ];

  // Un groupe sans enfant disparaît ; un groupe avec un seul enfant ET une
  // destination propre (homeTo) se réduit à un simple lien — c'est le cas
  // "Aperçu" pour un étudiant ou un membre du personnel restreint.
  const visibleEntries: NavEntry[] = navEntries.flatMap((it): NavEntry[] => {
    if (it.type === "leaf") return [it];
    if (it.children.length === 0) return [];
    if (it.children.length === 1 && it.homeTo) {
      return [leaf({ key: it.key, to: it.homeTo, icon: it.icon, exact: it.exact })];
    }
    return [it];
  });

  async function handleLogout() {
    await signOut();
    navigate({ to: "/auth" });
  }

  const sidebarNode = (onClose?: () => void) => (
    <DashboardSidebar
      entries={visibleEntries}
      unread={unread}
      fullName={fullName}
      roleLabel={roleLabel}
      spaceLabel={spaceLabel}
      onLogout={handleLogout}
      t={t}
      width={isTablet ? 280 : "auto"}
      height={isTablet ? "100%" : "auto"}
      onClose={onClose}
      collapsed={!isTablet && railCollapsed}
      onToggleCollapse={!isTablet ? toggleRail : undefined}
    />
  );

  // ── Mobile / tablet layout: top bar + drawer ──────────────────────
  if (isTablet) {
    return (
      <BreadcrumbLabelProvider>
        <div style={{ width: "100%", minHeight: "100vh", background: PAL.cream }}>
          {/* Top bar */}
          <header style={{
            position: "sticky", top: 0, zIndex: 30,
            background: "var(--pal-paper)", borderBottom: "1px solid var(--pal-line-soft)",
            padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <button onClick={() => setDrawerOpen(true)} aria-label="Menu" style={{
              display: "flex", flexDirection: "column", gap: 4, background: "none", border: 0, cursor: "pointer", padding: 6,
            }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 22, height: 2, background: PAL.ink, borderRadius: 2, display: "block" }} />)}
            </button>
            <Link to="/dashboard" style={{ textDecoration: "none" }}><Wordmark size={26} /></Link>
            <Link to="/dashboard/profile" aria-label={t("dash.profile")} style={{ textDecoration: "none" }}>
              <DashAvatar name={fullName} size={30} tone="primary" />
            </Link>
          </header>

          {/* Drawer overlay */}
          {drawerOpen && (
            <>
              <div onClick={() => setDrawerOpen(false)} className="anim-fade" style={{ position: "fixed", inset: 0, background: "oklch(0% 0 0 / .4)", zIndex: 40, backdropFilter: "blur(2px)" }} />
              <div style={{ position: "fixed", top: 0, insetInlineStart: 0, bottom: 0, zIndex: 41, animation: "drawer-in .28s cubic-bezier(.22,1,.36,1)", boxShadow: "8px 0 32px oklch(0% 0 0 / .12)" }}>
                <style>{`@keyframes drawer-in{from{transform:translateX(-100%)}to{transform:none}}`}</style>
                {sidebarNode(() => setDrawerOpen(false))}
              </div>
            </>
          )}

          {/* Main */}
          <main style={{ padding: "20px 16px", overflow: "auto" }}>
            <div key={pathname} className="page-enter dash-glow" style={{ maxWidth: 1180, margin: "0 auto" }}>
              <Outlet />
            </div>
          </main>

          {/* Barre d'onglets mobile « Pouls » — accès direct, le menu complet reste dans le tiroir */}
          <nav className="pouls-tabbar" aria-label="Navigation mobile">
            {([
              { to: "/dashboard", label: t("dash.overview"), icon: Home, exact: true },
              { to: "/dashboard/accounting-tasks", label: "Tâches", icon: Kanban, exact: false },
              { to: "/dashboard/notifications", label: "Alertes", icon: Bell, exact: false, badge: unread },
            ] as const).map(tb => {
              const on = tb.exact ? pathname === tb.to || pathname === tb.to + "/" : pathname.startsWith(tb.to);
              const Icon = tb.icon;
              return (
                <Link key={tb.to} to={tb.to} className={"pouls-ti" + (on ? " on" : "")}>
                  <span className="pl"><Icon size={20} strokeWidth={1.8} />{"badge" in tb && tb.badge > 0 && <span className="bd">{tb.badge > 99 ? "99+" : tb.badge}</span>}</span>
                  {tb.label}
                </Link>
              );
            })}
            <button type="button" className={"pouls-ti" + (drawerOpen ? " on" : "")} onClick={() => setDrawerOpen(true)}>
              <span className="pl"><LayoutGrid size={20} strokeWidth={1.8} /></span>Menu
            </button>
          </nav>
          <PlatformCopilot />
        </div>
      </BreadcrumbLabelProvider>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────
  return (
    <BreadcrumbLabelProvider>
      <div style={{ width: "100%", height: "100vh", overflow: "hidden", display: "grid", gridTemplateColumns: `${railCollapsed ? 84 : sbWidth}px minmax(0, 1fr)`, transition: resizing ? "none" : "grid-template-columns .5s cubic-bezier(.2,.8,.2,1)", background: PAL.cream }}>
        <div style={{ position: "relative", minHeight: 0, display: "grid" }}>
          {sidebarNode()}
          <div
            className={resizing ? "sb-handle is-active" : "sb-handle"}
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner la barre latérale"
            aria-valuemin={SB_MIN} aria-valuemax={SB_MAX} aria-valuenow={railCollapsed ? 84 : sbWidth}
            tabIndex={0}
            title="Glisser pour redimensionner · double-clic : taille par défaut"
            onPointerDown={startResize}
            onKeyDown={resizeKey}
            onDoubleClick={() => { setRail(false); setSbWidth(SB_DEFAULT); saveWidth(SB_DEFAULT); }}
          >
            <span className="sb-handle-grip" />
          </div>
        </div>
        <div style={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <DashboardHeader unread={unread} />
          <main className="scroll-y" style={{ minHeight: 0, flex: 1, padding: "30px 36px" }}>
            <div key={pathname} className="page-enter dash-glow" style={{ maxWidth: 1180, margin: "0 auto" }}>
              <Outlet />
            </div>
          </main>
        </div>
        <PlatformCopilot />
      </div>
    </BreadcrumbLabelProvider>
  );
}
