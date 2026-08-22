import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";
import { ComingSoonPage } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/architecture")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
  },
  component: () => (
    <ComingSoonPage
      eyebrow="Aperçu"
      title="Architecture de l'institut"
      sub="Plan des salles et des espaces de l'institut."
      icon={<Building2 size={28} strokeWidth={1.6} />}
    />
  ),
});
