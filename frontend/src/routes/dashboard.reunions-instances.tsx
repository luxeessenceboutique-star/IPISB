import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Landmark } from "lucide-react";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";

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

const sans = '"Manrope", system-ui, sans-serif';

function ReunionsInstancesPage() {
  const [niveau, setNiveau] = useState<1 | 2>(1);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion"
        title="Réunions / instances"
        sub="Conseils, comités et instances de gouvernance de l'institut."
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--pal-line)" }}>
        {([1, 2] as const).map(n => {
          const active = niveau === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setNiveau(n)}
              style={{
                padding: "10px 16px", marginBottom: -1,
                border: "none", borderBottom: active ? "2px solid var(--pal-primary)" : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                fontFamily: sans, fontSize: 13.5, fontWeight: active ? 700 : 600,
                color: active ? "var(--pal-ink)" : "var(--pal-muted)",
              }}
            >
              Niveau {n === 1 ? "①" : "②"}
            </button>
          );
        })}
      </div>

      <div className="dash-card" style={{ padding: 0 }}>
        <EmptyHint
          icon={<Landmark size={28} strokeWidth={1.6} />}
          text={`Niveau ${niveau === 1 ? "① — instances de direction" : "② — instances pédagogiques"} : cette section arrive bientôt.`}
        />
      </div>
    </div>
  );
}
