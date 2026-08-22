import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock } from "lucide-react";
import { ComingSoonPage } from "@/components/dashboard/ui";

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
  component: () => (
    <ComingSoonPage
      eyebrow="Aperçu"
      title="Agenda Formateur"
      sub="Vue consolidée des interventions de chaque formateur, tous groupes confondus."
      icon={<CalendarClock size={28} strokeWidth={1.6} />}
    />
  ),
});
