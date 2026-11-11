import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SegTabs } from "@/components/dashboard/ui";
import { Landmark, GraduationCap } from "lucide-react";
import { GovernanceInstances } from "@/components/governance/GovernanceInstances";

export const Route = createFileRoute("/dashboard/reunions-instances")({
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
  component: ReunionsInstancesPage,
});

const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

function ReunionsInstancesPage() {
  const [niveau, setNiveau] = useState<1 | 2>(1);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion"
        title="Réunions / instances"
        sub="Conseils, comités et instances de gouvernance de l'institut."
      />

      <SegTabs
        label="Niveau d'instance"
        value={String(niveau) as "1" | "2"}
        onChange={k => setNiveau(k === "1" ? 1 : 2)}
        items={[
          { key: "1", label: "Niveau ① · Direction", icon: Landmark },
          { key: "2", label: "Niveau ② · Pédagogie", icon: GraduationCap },
        ]}
      />

      <div className="pouls-pane" key={niveau}>
        <GovernanceInstances niveau={niveau} />
      </div>
    </div>
  );
}
