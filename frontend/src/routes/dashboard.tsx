import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home, BookOpen, ClipboardList, GraduationCap, CalendarDays, Video, Bell,
  Layers, Users, LogOut, X, IdCard, FileText, CalendarClock, Megaphone, Wallet, ShoppingCart,
  UserCog, CalendarRange, Library, Presentation, ListChecks,
  User, RefreshCw, Briefcase, Landmark, MessageCircle, Building2, TrendingUp,
  ChevronDown, Plus,
} from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { DashAvatar } from "@/components/dashboard/ui";
import { PlatformCopilot } from "@/components/PlatformCopilot";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(48% 0.02 180)",
  mid:     "oklch(62% 0.085 170)",
  pale:    "oklch(94% 0.025 165)",
  cream:   "oklch(97% 0.012 90)",
  paper:   "oklch(99% 0.005 160)",
  danger:  "oklch(64% 0.18 25)",
  lineSoft:"oklch(92% 0.012 170)",
};
const sans = '"Manrope", system-ui, sans-serif';

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: DashboardLayout,
});

type NavLeaf = {
  type: "leaf"; key: string; to: string; icon: typeof Home;
  exact?: boolean; badge?: boolean; label?: string; search?: Record<string, string>;
};
type NavGroup = {
  type: "group"; key: string; icon: typeof Home; homeTo?: string; exact?: boolean; children: NavLeaf[];
};
type NavEntry = NavLeaf | NavGroup;

function leaf(partial: Omit<NavLeaf, "type">): NavLeaf {
  return { type: "leaf", ...partial };
}
function group(partial: Omit<NavGroup, "type">): NavGroup {
  return { type: "group", ...partial };
}

type Specialty = { id: string; name: string; type: "formation_initiale" | "formation_continue" };

function DashboardLayout() {
  const { user, roles, signOut } = useAuth();
  const { t, lang } = useI18n();
  const { isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
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
  // Personnel non-académique (finance et/ou RH) SANS être admin ni prof :
  // accès limité aux seules sections dont il dispose (pas de cours / classes).
  const isRestrictedStaff = (hasFinanceRole || hasHrRole) && !isAdmin && !isProf;
  const canManageClasses = isAdmin || isProf || isCashier;

  // Filières (specialties), pour peupler Formation initiale / Formation
  // continue dans la barre latérale — un seul appel léger, uniquement pour
  // les rôles qui gèrent des classes.
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  useEffect(() => {
    if (!user || !canManageClasses) { setSpecialties([]); return; }
    api.get("/api/specialties").then(setSpecialties).catch(() => setSpecialties([]));
  }, [user, canManageClasses]);

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

  // Visibilité par rubrique — un seul calcul, partagé par tous les rôles
  // (remplace les deux tableaux dupliqués restrictedItems/allItems d'avant).
  const showRh = isAdmin || hasHrRole;
  const showAccounting = isAdmin || hasFinanceRole;
  const showTasks = isAdmin || isProf || hasFinanceRole || hasHrRole;
  const showDocuments = isAdmin;
  const showUsers = isAdmin || isProf;
  const showAcademicExtras = isAdmin || isProf; // Séances, Emplois du temps, Bibliothèque
  const showStudents = isAdmin;
  const showSchedules = isAdmin;
  const showAnnouncements = isAdmin;
  const showPurchaseRequests = !isAdmin && !isRestrictedStaff; // professeur, étudiant

  function filiereChildren(filiereType: Specialty["type"], addLabel: string): NavLeaf[] {
    const items: NavLeaf[] = specialties
      .filter(s => s.type === filiereType)
      .map(s => leaf({
        key: s.id, label: s.name, to: "/dashboard/classes", icon: Layers,
        search: { specialty: s.id },
      }));
    if (isAdmin) {
      items.push(leaf({
        key: `add-${filiereType}`, label: addLabel, to: "/dashboard/classes", icon: Plus,
        search: { manage: "specialties" },
      }));
    }
    return items;
  }

  const navEntries: NavEntry[] = [
    // Notifications en tout premier, visible par tous.
    leaf({ key: "dash.notifications", to: "/dashboard/notifications", icon: Bell, badge: true }),

    // Aperçu — Vue d'ensemble pour tous ; le reste réservé à l'encadrement
    // académique (repli automatique en simple lien si aucun enfant en plus).
    group({
      key: "dash.overview", icon: Home, homeTo: "/dashboard", exact: true,
      children: [
        leaf({ key: "dash.overview", to: "/dashboard", icon: Home, exact: true }),
        ...(isAdmin || isProf ? [
          leaf({ key: "dash.agendaFormateur", to: "/dashboard/agenda-formateur", icon: CalendarClock }),
          leaf({ key: "dash.architecture", to: "/dashboard/architecture", icon: Building2 }),
          leaf({ key: "dash.performance", to: "/dashboard/performance", icon: TrendingUp }),
        ] : []),
      ],
    }),

    // Tronc académique commun (élèves inclus) — inchangé par rapport à avant.
    ...(!isRestrictedStaff ? [
      leaf({ key: "dash.courses",     to: "/dashboard/courses",     icon: BookOpen }),
      leaf({ key: "dash.assignments", to: "/dashboard/assignments", icon: ClipboardList }),
      leaf({ key: "dash.exams",       to: "/dashboard/exams",       icon: GraduationCap }),
      leaf({ key: "dash.agenda",      to: "/dashboard/agenda",      icon: CalendarDays }),
      leaf({ key: "dash.meetings",    to: "/dashboard/meetings",    icon: Video }),
    ] : []),

    // Formation initiale / continue — filières dynamiques (Classes → Filières).
    ...(canManageClasses ? [
      group({ key: "dash.formationInitiale", icon: User, children: filiereChildren("formation_initiale", t("dash.addFiliere")) }),
      group({ key: "dash.formationContinue", icon: RefreshCw, children: filiereChildren("formation_continue", t("dash.addFiliere")) }),
    ] : []),

    // Académique (outils étendus admin/professeur) + Classes non filtrées.
    group({
      key: "dash.academique", icon: BookOpen,
      children: [
        ...(canManageClasses ? [leaf({ key: "dash.classes", to: "/dashboard/classes", icon: Layers })] : []),
        ...(showAcademicExtras ? [
          leaf({ key: "dash.teachingSessions", to: "/dashboard/teaching-sessions", icon: Presentation }),
          leaf({ key: "dash.timetables", to: "/dashboard/timetables", icon: CalendarRange }),
          leaf({ key: "dash.library", to: "/dashboard/library", icon: Library }),
        ] : []),
        ...(showStudents ? [leaf({ key: "dash.students", to: "/dashboard/students", icon: IdCard })] : []),
        ...(showSchedules ? [leaf({ key: "dash.schedules", to: "/dashboard/schedules", icon: CalendarClock })] : []),
        ...(showAnnouncements ? [leaf({ key: "dash.announcements", to: "/dashboard/announcements", icon: Megaphone })] : []),
      ],
    }),

    // Gestion — RH, Tâches, Comptabilité, Communication, Réunions/instances,
    // Documents, Utilisateurs.
    group({
      key: "dash.gestion", icon: Briefcase,
      children: [
        ...(showRh ? [leaf({ key: "dash.rh", to: "/dashboard/rh", icon: UserCog })] : []),
        ...(showTasks ? [leaf({ key: "dash.tasks", to: "/dashboard/tasks", icon: ListChecks })] : []),
        ...(showAccounting ? [leaf({ key: "dash.accounting", to: "/dashboard/accounting", icon: Wallet })] : []),
        ...(isAdmin ? [
          leaf({ key: "dash.communication", to: "/dashboard/communication", icon: MessageCircle }),
          leaf({ key: "dash.reunionsInstances", to: "/dashboard/reunions-instances", icon: Landmark }),
        ] : []),
        ...(showDocuments ? [leaf({ key: "dash.documents", to: "/dashboard/documents", icon: FileText })] : []),
        ...(showUsers ? [leaf({ key: "dash.users", to: "/dashboard/users", icon: Users })] : []),
      ],
    }),

    // Demandes d'achat : professeur/étudiant seulement (l'admin y accède via Comptabilité).
    ...(showPurchaseRequests ? [
      leaf({ key: "dash.purchase_requests", to: "/dashboard/purchase-requests", icon: ShoppingCart }),
    ] : []),
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
    navigate({ to: "/" });
  }

  const Sidebar = (
    <aside style={{
      background: PAL.paper,
      borderInlineEnd: `1px solid ${PAL.lineSoft}`,
      padding: "22px 16px",
      display: "flex", flexDirection: "column", gap: 22,
      width: isTablet ? 280 : "auto",
      height: isTablet ? "100%" : "auto",
      minHeight: 0,
    }}>
      <div style={{ padding: "0 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <Wordmark size={36} />
        </Link>
        {isTablet && (
          <button onClick={() => setDrawerOpen(false)} aria-label="Close" style={{
            background: "none", border: 0, cursor: "pointer", color: PAL.muted, lineHeight: 1, display: "flex", padding: 4,
          }}><X size={18} /></button>
        )}
      </div>

      <nav className="scroll-y" style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0 }}>
        <span className="eyebrow" style={{ padding: "2px 12px 8px", fontSize: 9.5 }}>{spaceLabel}</span>
        {visibleEntries.map((it) => {
          if (it.type === "leaf") {
            const isActive = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            const I = it.icon;
            return (
              <Link key={it.key} to={it.to as "/dashboard"} search={it.search}
                className={isActive ? "side-link is-active" : "side-link"}
                style={{ textDecoration: "none", fontFamily: sans }}>
                <I size={17} strokeWidth={1.7} />
                {it.label ?? t(it.key)}
                {it.badge && unread > 0 && (
                  <span style={{ marginInlineStart: "auto", fontSize: 10, fontWeight: 800, color: PAL.paper, background: PAL.danger, padding: "2px 7px", borderRadius: 999 }}>{unread}</span>
                )}
              </Link>
            );
          }

          const GI = it.icon;
          const isGroupActive = it.children.some(c => pathname.startsWith(c.to));
          const isCollapsed = collapsedGroups.has(it.key);
          return (
            <div key={it.key}>
              <button
                type="button"
                onClick={() => toggleGroup(it.key)}
                className={isGroupActive ? "side-link is-active" : "side-link"}
                style={{ textDecoration: "none", fontFamily: sans, width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "start" }}
              >
                <GI size={17} strokeWidth={1.7} />
                {t(it.key)}
                <ChevronDown size={14} strokeWidth={2}
                  style={{ marginInlineStart: "auto", transition: "transform .15s ease", transform: isCollapsed ? "rotate(-90deg)" : "none", opacity: .6 }} />
              </button>
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                  {it.children.map(c => {
                    const isActive = c.exact ? pathname === c.to : pathname.startsWith(c.to);
                    const CI = c.icon;
                    return (
                      <Link key={c.key} to={c.to as "/dashboard"} search={c.search}
                        className={isActive ? "side-link is-active" : "side-link"}
                        style={{ textDecoration: "none", fontFamily: sans, paddingInlineStart: 34, fontSize: 13 }}>
                        <CI size={15} strokeWidth={1.7} />
                        {c.label ?? t(c.key)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ height: 1, background: PAL.lineSoft }} />

      {/* user card */}
      <div style={{ padding: 12, borderRadius: 14, background: PAL.pale, display: "flex", flexDirection: "column", gap: 10 }}>
        <Link to="/dashboard/profile" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <DashAvatar name={fullName} size={34} tone="primary" />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {fullName}
            </span>
            <span style={{ fontSize: 10.5, color: PAL.muted }}>{roleLabel}</span>
          </div>
        </Link>
        <button onClick={handleLogout} className="btn-c btn-c-ghost btn-c-sm" style={{ width: "100%" }}>
          <LogOut size={14} strokeWidth={1.7} />
          {t("dash.logout")}
        </button>
      </div>
    </aside>
  );

  // ── Mobile / tablet layout: top bar + drawer ──────────────────────
  if (isTablet) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", background: PAL.cream, fontFamily: sans }}>
        {/* Top bar */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: PAL.paper, borderBottom: `1px solid ${PAL.lineSoft}`,
          padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <button onClick={() => setDrawerOpen(true)} aria-label="Menu" style={{
            display: "flex", flexDirection: "column", gap: 4, background: "none", border: 0, cursor: "pointer", padding: 6,
          }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 22, height: 2, background: PAL.ink, borderRadius: 2, display: "block" }} />)}
          </button>
          <Link to="/" style={{ textDecoration: "none" }}><Wordmark size={26} /></Link>
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
              {Sidebar}
            </div>
          </>
        )}

        {/* Main */}
        <main style={{ padding: "20px 16px", overflow: "auto" }}>
          <div key={pathname} className="page-enter" style={{ maxWidth: 1180, margin: "0 auto" }}>
            <Outlet />
          </div>
        </main>
        <PlatformCopilot />
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100vh", overflow: "hidden", display: "grid", gridTemplateColumns: "248px 1fr", background: PAL.cream, fontFamily: sans }}>
      {Sidebar}
      <main className="scroll-y" style={{ minHeight: 0, padding: "30px 36px" }}>
        <div key={pathname} className="page-enter" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Outlet />
        </div>
      </main>
      <PlatformCopilot />
    </div>
  );
}
