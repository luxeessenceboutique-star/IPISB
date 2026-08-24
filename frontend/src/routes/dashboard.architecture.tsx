import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Building2, Layers, User, Clock3 } from "lucide-react";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/architecture")({
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
  component: ArchitecturePage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

type Slot = { day_of_week: number; start_time: string; end_time: string; subject: string | null; class_name: string | null; professor_name: string | null };
type RoomUsage = { room: string; slot_count: number; slots: Slot[] };

function timeShort(t: string) {
  return t.slice(0, 5);
}

function RoomCard({ r }: { r: RoomUsage }) {
  const byDay = DAYS.map((_, i) => r.slots.filter(s => s.day_of_week === i).sort((a, b) => a.start_time.localeCompare(b.start_time)));
  return (
    <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${PAL.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={15} strokeWidth={1.8} style={{ color: "var(--pal-primary)" }} />
          <span style={{ fontWeight: 700, fontSize: 14.5, color: PAL.ink }}>{r.room}</span>
        </div>
        <span className="chip-c" style={{ fontSize: 11 }}>{r.slot_count} créneau{r.slot_count > 1 ? "x" : ""}/semaine</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
        {DAYS.map((day, i) => (
          <div key={day} style={{ padding: "12px 10px", borderInlineEnd: i < 4 ? `1px solid ${PAL.line}` : undefined }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: PAL.muted, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 8 }}>{day}</div>
            {byDay[i].length === 0 ? (
              <div style={{ fontSize: 11.5, color: PAL.muted, fontStyle: "italic" as const }}>—</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byDay[i].map((s, j) => (
                  <div key={j} style={{ background: "var(--pal-cream)", borderRadius: 8, padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: PAL.muted, fontWeight: 600 }}>
                      <Clock3 size={10} strokeWidth={1.8} />{timeShort(s.start_time)}–{timeShort(s.end_time)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: PAL.ink, marginTop: 2 }}>{s.subject || "—"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                      <Layers size={10} strokeWidth={1.8} />{s.class_name || "—"}
                    </div>
                    {s.professor_name && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: PAL.muted, marginTop: 1 }}>
                        <User size={10} strokeWidth={1.8} />{s.professor_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchitecturePage() {
  const [rooms, setRooms] = useState<RoomUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = (await api.get("/api/timetables/rooms/usage")) as RoomUsage[];
        if (!cancelled) setRooms(data);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message ?? "Erreur lors du chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Aperçu"
        title="Architecture de l'institut"
        sub="Occupation réelle des salles, d'après le dernier emploi du temps validé de chaque classe."
      />

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : rooms.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Building2 size={26} strokeWidth={1.7} />} text="Aucune salle renseignée — les créneaux d'emploi du temps validés n'indiquent pas encore de salle." />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {rooms.map(r => <RoomCard key={r.room} r={r} />)}
        </div>
      )}
    </div>
  );
}
