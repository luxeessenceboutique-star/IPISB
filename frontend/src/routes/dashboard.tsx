import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  GraduationCap,
  CalendarDays,
  Bell,
  Users,
  LogOut,
  Video,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { t } = useI18n();
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();

  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const role = isAdmin ? "admin" : isProf ? "professor" : "student";

  const items = [
    { to: "/dashboard", label: t("dash.overview"), icon: LayoutDashboard, exact: true },
    { to: "/dashboard/courses", label: t("dash.courses"), icon: BookOpen },
    { to: "/dashboard/assignments", label: t("dash.assignments"), icon: FileText },
    { to: "/dashboard/exams", label: t("dash.exams"), icon: GraduationCap },
    { to: "/dashboard/agenda", label: t("dash.agenda"), icon: CalendarDays },
    { to: "/dashboard/notifications", label: t("dash.notifications"), icon: Bell },
    { to: "/dashboard/meetings", label: t("dash.meetings"), icon: Video },
    ...(isAdmin ? [{ to: "/dashboard/users", label: t("dash.users"), icon: Users }] : []),
  ] as const;

  async function handleLogout() {
    await signOut();
    navigate({ to: "/" });
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-soft">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="flex items-center gap-2.5 px-4 py-5">
              <Logo size={30} />
              <span className="font-display text-base font-semibold">IPISBE</span>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>{t("nav.dashboard")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild>
                        <Link
                          to={item.to}
                          activeOptions={{ exact: !!(item as { exact?: boolean }).exact }}
                          activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
                          className="hover:bg-muted/60"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="hidden text-sm md:block">
                <span className="text-muted-foreground">{t("dash.welcome")}, </span>
                <span className="font-medium">{user?.user_metadata?.full_name || user?.email}</span>
                <span className="ml-2 rounded-full bg-gradient-brand px-2.5 py-0.5 text-xs text-white">
                  {t(`dash.role.${role}`)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LangSwitcher />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
