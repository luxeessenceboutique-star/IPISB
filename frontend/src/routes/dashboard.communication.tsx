import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle } from "lucide-react";
import { ComingSoonPage } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/communication")({
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
  component: () => (
    <ComingSoonPage
      eyebrow="Gestion"
      title="Communication"
      sub="Diffusion interne et communication institutionnelle."
      icon={<MessageCircle size={28} strokeWidth={1.6} />}
    />
  ),
});
