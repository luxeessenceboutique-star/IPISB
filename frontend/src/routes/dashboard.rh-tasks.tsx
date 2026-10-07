import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/components/dashboard/ui";
import { RhDailyTasks } from "@/components/rh/DailyTasks";

export const Route = createFileRoute("/dashboard/rh-tasks")({
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
  component: RhTasksPage,
});

const sans = '"Manrope", system-ui, sans-serif';

function RhTasksPage() {
  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion administrative"
        title="Tâches quotidiennes"
        sub="Saisie, validation et notation des tâches — alimente l'évaluation mensuelle et la prime de rendement."
      />
      <RhDailyTasks />
    </div>
  );
}
