import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, CalendarClock, MapPin, Repeat } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/schedules")({
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
  component: SchedulesPage,
});

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
  danger:  "oklch(64% 0.18 25)",
};
const sans = '"Manrope", system-ui, sans-serif';
const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

type ClassItem = { id: string; name: string };
type Prof = { id: string; full_name: string | null; email: string | null };
type Schedule = {
  id: string;
  class_id: string | null;
  class_name: string | null;
  professor_id: string | null;
  room: string;
  title: string | null;
  start_time: string;
  end_time: string;
  recurrence: "once" | "weekly";
};

function fmt(dt: string) {
  const d = new Date(dt);
  return `${WEEKDAYS[d.getDay()]} ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function CreateModal({ classes, profs, onClose, onCreated }: { classes: ClassItem[]; profs: Prof[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ room: "", class_id: "", professor_id: "", title: "", start_time: "", end_time: "", recurrence: "once" as "once" | "weekly" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.room.trim()) { toast.error("La salle est requise."); return; }
    if (!form.start_time || !form.end_time) { toast.error("Les horaires sont requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/schedules", {
        room: form.room,
        class_id: form.class_id || null,
        professor_id: form.professor_id || null,
        title: form.title || null,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        recurrence: form.recurrence,
      });
      toast.success("Créneau créé !");
      onCreated();
      onClose();
    } catch (err: any) {
      // Backend returns 409 with {detail: {message, conflicts}} on room/instructor overlap
      let msg = "Erreur lors de la création.";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed?.detail?.message) msg = `Conflit détecté : ${parsed.detail.message} (${parsed.detail.conflicts?.length ?? 0} créneau(x) en collision)`;
        else if (typeof parsed?.detail === "string") msg = parsed.detail;
      } catch {
        if (err?.message) msg = err.message;
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouveau créneau
        </h2>

        <label style={labelStyle}>Titre (optionnel)</label>
        <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex : Soins infirmiers — TP" className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Salle *</label>
        <input type="text" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="Ex : Salle B12" className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Classe (optionnel)</label>
        <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Aucune —</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={labelStyle}>Formateur (optionnel)</label>
        <select value={form.professor_id} onChange={e => setForm(f => ({ ...f, professor_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Aucun —</option>
          {profs.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Début *</label>
            <input type="datetime-local" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Fin *</label>
            <input type="datetime-local" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Récurrence</label>
        <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value as "once" | "weekly" }))} className="u-input" style={{ ...fieldStyle, marginBottom: 24 }}>
          <option value="once">Ponctuel</option>
          <option value="weekly">Hebdomadaire</option>
        </select>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Création…" : "Créer le créneau"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [profs, setProfs] = useState<Prof[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data: Schedule[] = await api.get("/api/schedules");
      setSchedules(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get("/api/classes/all").then((d: ClassItem[]) => setClasses(d ?? [])).catch(() => {});
    api.get("/api/users").then((d: any[]) => setProfs((d ?? []).filter(u => u.roles?.includes("professor")))).catch(() => {});
  }, []);

  const profMap = Object.fromEntries(profs.map(p => [p.id, p.full_name || p.email || "—"]));

  async function remove(s: Schedule) {
    if (!window.confirm("Supprimer ce créneau ?")) return;
    try {
      await api.delete(`/api/schedules/${s.id}`);
      toast.success("Créneau supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  return (
    <div style={{ fontFamily: sans }}>
      {showCreate && (
        <CreateModal classes={classes} profs={profs} onClose={() => setShowCreate(false)} onCreated={load} />
      )}

      <PageHead
        eyebrow="Gestion administrative"
        title="Emploi du temps"
        sub="Créneaux, salles et formateurs — conflits détectés automatiquement."
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
            <Plus size={15} strokeWidth={1.7} />Nouveau créneau
          </button>
        }
      />

      <SectionLabel>{schedules.length} créneau{schedules.length !== 1 ? "x" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 26, width: "55%", borderRadius: 8, marginTop: 14 }} />
        </div>
      ) : schedules.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<CalendarClock size={28} strokeWidth={1.7} />}
            text={
              <span className="flex flex-col items-center gap-3">
                Aucun créneau planifié.
                <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-ghost btn-c-sm">
                  Créer le premier créneau
                </button>
              </span>
            }
          />
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {schedules.map(s => (
            <div key={s.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: PAL.primary }}>
                <CalendarClock size={20} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>
                  {s.title || s.class_name || "Créneau"}
                </div>
                <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={11} strokeWidth={1.7} />{s.room}</span>
                  {s.professor_id && <span>{profMap[s.professor_id] ?? "—"}</span>}
                  {s.class_name && <span>{s.class_name}</span>}
                  {s.recurrence === "weekly" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Repeat size={11} strokeWidth={1.7} />Hebdomadaire</span>
                  )}
                </div>
              </div>
              <span className="chip-c" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5 }}>
                {fmt(s.start_time)}
              </span>
              <button
                type="button"
                onClick={() => remove(s)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer"
                title="Supprimer"
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
