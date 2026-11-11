import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Users, CalendarClock, Wallet, TrendingUp, Briefcase, UserPlus, GraduationCap, Target, Network, Boxes, Settings } from "lucide-react";
import { PageHead, SegTabs } from "@/components/dashboard/ui";
import { RhEmployees } from "@/components/rh/Employees";
import { RhLeaves } from "@/components/rh/Leaves";
import { RhPayroll } from "@/components/rh/Payroll";
import { RhPerformance } from "@/components/rh/Performance";
import { RhRecruitment } from "@/components/rh/Recruitment";
import { RhOnboarding } from "@/components/rh/Onboarding";
import { RhTraining } from "@/components/rh/Training";
import { RhTalents } from "@/components/rh/Talents";
import { RhOrgChart } from "@/components/rh/OrgChart";
import { RhAssets } from "@/components/rh/Assets";
import { RhSettings } from "@/components/rh/Settings";

export const Route = createFileRoute("/dashboard/rh")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "rh", "assistant_rh"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: RhPage,
});

const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

type Tab = "employees" | "leaves" | "payroll" | "performance" | "recruitment" | "onboarding" | "training" | "talents" | "orgchart" | "assets" | "settings";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "employees",   label: "Employés",      icon: Users         },
  { key: "leaves",      label: "Congés",        icon: CalendarClock },
  { key: "payroll",     label: "Paie",          icon: Wallet        },
  { key: "performance", label: "Évaluations",   icon: TrendingUp    },
  { key: "recruitment", label: "Recrutement",   icon: Briefcase     },
  { key: "onboarding",  label: "Intégration",   icon: UserPlus      },
  { key: "training",    label: "Formation",     icon: GraduationCap },
  { key: "talents",     label: "Talents",       icon: Target        },
  { key: "orgchart",    label: "Organigramme",  icon: Network       },
  { key: "assets",      label: "Matériel",      icon: Boxes         },
  { key: "settings",    label: "Paramètres",    icon: Settings      },
];

function RhPage() {
  // Onglet initial : ?tab= (deep-link depuis une notification/rappel), sinon Employés.
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return TABS.some(x => x.key === t) ? (t as Tab) : "employees";
  });
  const { roles } = useAuth();
  const canSeePayroll = roles.includes("admin") || roles.includes("rh");
  const visibleTabs = canSeePayroll ? TABS : TABS.filter(t => t.key !== "payroll");

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion administrative"
        title="Ressources humaines"
        sub="Employés, congés, paie et évaluations — centralisés."
      />

      <SegTabs items={visibleTabs} value={tab} onChange={k => setTab(k)} />

      <div className="rh-pane" key={tab}>
      {tab === "employees"   && <RhEmployees />}
      {tab === "leaves"      && <RhLeaves />}
      {tab === "payroll"     && <RhPayroll />}
      {tab === "performance" && <RhPerformance />}
      {tab === "recruitment" && <RhRecruitment />}
      {tab === "onboarding"  && <RhOnboarding />}
      {tab === "training"    && <RhTraining />}
      {tab === "talents"     && <RhTalents />}
      {tab === "orgchart"    && <RhOrgChart />}
      {tab === "assets"      && <RhAssets />}
      {tab === "settings"    && <RhSettings />}
      </div>
    </div>
  );
}
