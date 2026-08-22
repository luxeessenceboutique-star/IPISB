import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp } from "lucide-react";
import { ComingSoonPage } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/performance")({
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
      title="Graphes de performance"
      sub="Indicateurs de réussite et de suivi, tous groupes confondus."
      icon={<TrendingUp size={28} strokeWidth={1.6} />}
    />
  ),
});
