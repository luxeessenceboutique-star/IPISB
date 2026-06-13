import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Video, Plus, Clock, User as UserIcon, Trash2 } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/meetings")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: MeetingsPage,
});

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  text:    "oklch(34% 0.03 180)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  mid:     "oklch(62% 0.085 170)",
  soft:    "oklch(82% 0.045 165)",
  pale:    "oklch(94% 0.025 165)",
  cream:   "oklch(97% 0.012 90)",
  paper:   "oklch(99% 0.005 160)",
  danger:  "oklch(64% 0.18 25)",
  success: "oklch(55% 0.14 150)",
  line:    "oklch(88% 0.015 170)",
};
const sans  = '"Manrope", system-ui, sans-serif';
const serif = '"Cormorant Garamond", Georgia, serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  class_id: string | null;
  created_by: string | null;
  scheduled_at: string;
  duration_minutes: number;
  room_id: string;
  is_active: boolean;
  created_at: string;
  course_title?: string;
  class_name?: string;
  host_name?: string;
};

type Course = { id: string; title: string };
type ClassItem = { id: string; name: string };

function meetingStatus(m: Meeting, now: Date): "live" | "upcoming" | "past" {
  const start = new Date(m.scheduled_at);
  const end   = new Date(start.getTime() + m.duration_minutes * 60_000);
  if (now > end)    return "past";
  if (now >= start) return "live";
  return "upcoming";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "short", year: "numeric", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Full-screen Jitsi room ────────────────────────────────────────────────────
function JitsiRoom({ meeting, userName, onLeave }: { meeting: Meeting; userName: string; onLeave: () => void }) {
  const src = `https://meet.jit.si/${meeting.room_id}#userInfo.displayName="${encodeURIComponent(userName)}"&config.prejoinPageEnabled=false&config.disableDeepLinking=true&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_POWERED_BY=false`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
      {/* top bar */}
      <div style={{ height: 52, background: "#111", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: PAL.danger, boxShadow: `0 0 8px ${PAL.danger}` }} />
          <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: "#fff" }}>{meeting.title}</span>
          {meeting.course_title && (
            <span style={{ fontFamily: mono, fontSize: 11, color: "#666" }}>{meeting.course_title}</span>
          )}
        </div>
        <button
          onClick={onLeave}
          style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: "#fff", background: PAL.danger, border: 0, borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}
        >
          Quitter ✕
        </button>
      </div>
      <iframe
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        style={{ flex: 1, border: 0, width: "100%", background: "#0a0a0a" }}
        title={meeting.title}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function MeetingsPage() {
  const { user, roles } = useAuth();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [courses,  setCourses]  = useState<Course[]>([]);
  const [classes,  setClasses]  = useState<ClassItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [active,   setActive]   = useState<Meeting | null>(null);
  const [now,      setNow]      = useState(() => new Date());

  const [showCreate, setShowCreate] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [form, setForm] = useState({ title: "", description: "", course_id: "", class_id: "", scheduled_at: "", duration_minutes: "60" });

  async function load() {
    setLoading(true);
    try {
      // Use the backend API so role-based filtering is enforced server-side.
      // The backend returns meetings already enriched with course_title, class_name, host_name.
      const data: Meeting[] = await api.get("/api/meetings");

      // Auto-deactivate stale meetings client-side (no DB write needed here —
      // the backend activate/deactivate endpoints handle state; this is purely
      // a visual correction for meetings whose window has passed).
      const now = new Date();
      data.forEach((m) => {
        if (m.is_active) {
          const end = new Date(new Date(m.scheduled_at).getTime() + m.duration_minutes * 60_000);
          if (now > end) m.is_active = false;
        }
      });

      setMeetings(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des réunions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get("/api/courses/list").then((d: Course[]) => setCourses(d ?? [])).catch(() => {});
    api.get("/api/classes/all").then((d: ClassItem[]) => setClasses(d ?? [])).catch(() => {});

    // Tick `now` every 30 s so status computations stay current without a reload.
    const tick  = setInterval(() => setNow(new Date()), 30_000);
    // Re-fetch from server every 60 s to sync is_active state.
    const timer = setInterval(load, 60_000);
    return () => { clearInterval(tick); clearInterval(timer); };
  }, []);

  if (!user) return null;

  const isAdmin   = roles.includes("admin");
  const canCreate = isAdmin || roles.includes("professor");
  const isStudent = !isAdmin && !roles.includes("professor");
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Participant";

  async function joinMeeting(m: Meeting) {
    if (meetingStatus(m, now) === "past") return; // expired — read-only
    if (canCreate && !m.is_active) {
      try {
        await api.put(`/api/meetings/${m.id}/activate`);
      } catch {
        // Non-fatal: the meeting room still opens even if activation fails
      }
    }
    setActive(m);
  }

  async function leaveMeeting() {
    if (active && canCreate && active.created_by === user?.id) {
      try {
        await api.put(`/api/meetings/${active.id}/deactivate`);
      } catch {
        // Non-fatal
      }
    }
    setActive(null);
    load();
  }

  async function deleteMeeting(id: string) {
    try {
      await api.delete(`/api/meetings/${id}`);
      toast.success("Réunion supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function createMeeting() {
    if (!form.title.trim())    { toast.error("Le titre est requis."); return; }
    if (!form.scheduled_at)    { toast.error("La date est requise."); return; }
    setCreating(true);
    try {
      await api.post("/api/meetings", {
        title:            form.title,
        description:      form.description || null,
        course_id:        form.course_id   || null,
        class_id:         form.class_id    || null,
        scheduled_at:     new Date(form.scheduled_at).toISOString(),
        duration_minutes: parseInt(form.duration_minutes) || 60,
      });
      toast.success("Réunion créée !");
      setShowCreate(false);
      setForm({ title: "", description: "", course_id: "", class_id: "", scheduled_at: "", duration_minutes: "60" });
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setCreating(false);
    }
  }

  if (active) {
    return <JitsiRoom meeting={active} userName={displayName} onLeave={leaveMeeting} />;
  }

  const live     = meetings.filter(m => meetingStatus(m, now) === "live");
  const upcoming = meetings.filter(m => meetingStatus(m, now) === "upcoming");
  const past     = meetings.filter(m => meetingStatus(m, now) === "past");
  const hero     = live[0] ?? upcoming[0] ?? null;
  const planned  = [...live, ...upcoming].filter(m => m.id !== hero?.id);

  const meetingRow = (m: Meeting, inHistory = false) => {
    const status = meetingStatus(m, now);
    const isHost = m.created_by === user!.id;
    const canDelete = !isStudent && canCreate && (isHost || isAdmin) && !inHistory;
    return (
      <div key={m.id} className="row-c flex-wrap" style={inHistory ? { opacity: 0.72 } : undefined}>
        <span className="flex shrink-0" style={{ color: inHistory ? "var(--pal-muted)" : "var(--pal-primary)" }}>
          <Video size={20} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: inHistory ? "var(--pal-muted)" : "var(--pal-ink)" }}>{m.title}</div>
          <div className="mt-0.5" style={{ fontSize: 12, color: "var(--pal-muted)" }}>
            {m.host_name}
            {m.course_title ? ` · ${m.course_title}` : ""}
            {m.class_name ? ` · ${m.class_name}` : ""}
            {` · ${m.duration_minutes} min`}
          </div>
          {m.description && <div className="mt-0.5" style={{ fontSize: 12, color: "var(--pal-muted)" }}>{m.description}</div>}
        </div>
        <span className={`chip-c ${status === "live" ? "chip-c-red" : status === "upcoming" ? "chip-c-green" : ""}`}
          style={inHistory ? { fontFamily: "var(--font-mono, monospace)", fontSize: 10, opacity: 0.7 } : undefined}>
          {status === "live" ? "● En direct" : fmtDate(m.scheduled_at)}
        </span>
        {/* Expired meetings: no join button, read-only indicator */}
        {inHistory ? (
          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, fontWeight: 600, color: "var(--pal-muted)", letterSpacing: ".06em", userSelect: "none" }}>
            ARCHIVÉ
          </span>
        ) : (
          <button
            type="button"
            className={`btn-c btn-c-sm ${status === "live" ? "btn-c-green" : "btn-c-ghost"}`}
            onClick={() => joinMeeting(m)}
          >
            {status === "live" ? "Rejoindre" : "Ouvrir la salle"}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => { if (window.confirm("Supprimer cette réunion ?")) deleteMeeting(m.id); }}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
            aria-label="Supprimer"
            title="Supprimer"
          >
            <Trash2 size={14} strokeWidth={1.7} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Visioconférences"
        title="Réunions"
        sub="Vos sessions en ligne avec professeurs et administration."
        actions={!isStudent ? (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
            <Plus size={15} strokeWidth={1.7} />Nouvelle réunion
          </button>
        ) : undefined}
      />

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 26, width: "55%", borderRadius: 8, marginTop: 14 }} />
          <div className="shimmer" style={{ height: 13, width: "40%", borderRadius: 6, marginTop: 10 }} />
        </div>
      ) : meetings.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<Video size={28} strokeWidth={1.7} />}
            text={
              <span className="flex flex-col items-center gap-3">
                Aucune réunion pour l'instant.
                {!isStudent && (
                  <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-ghost btn-c-sm">
                    Créer une réunion
                  </button>
                )}
              </span>
            }
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Hero — imminent / live session (ink card) */}
          {hero && (
            <div className="dash-card card-pop" style={{ background: "var(--pal-ink)", border: 0, padding: 26, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <span className="eyebrow" style={{ color: "var(--pal-soft)" }}>
                  {meetingStatus(hero, now) === "live" ? "En direct · " : "Prochaine session · "}{fmtDate(hero.scheduled_at)}
                </span>
                <h2 className="h-serif" style={{ fontSize: 27, color: "var(--pal-paper)", margin: "8px 0 6px" }}>{hero.title}</h2>
                <div style={{ color: "oklch(75% 0.03 170)", fontSize: 13, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {hero.host_name && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><UserIcon size={14} strokeWidth={1.7} />{hero.host_name}</span>}
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} strokeWidth={1.7} />{hero.duration_minutes} min</span>
                  {hero.course_title && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Video size={14} strokeWidth={1.7} />{hero.course_title}</span>}
                </div>
              </div>
              <button type="button" className="btn-c btn-c-green" style={{ fontSize: 14, padding: "12px 24px" }} onClick={() => joinMeeting(hero)}>
                <Video size={17} strokeWidth={1.7} />Rejoindre la salle
              </button>
            </div>
          )}

          {planned.length > 0 && (
            <div>
              <SectionLabel>Sessions planifiées</SectionLabel>
              <div className="dash-card overflow-hidden">{planned.map(m => meetingRow(m))}</div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <SectionLabel>
                Historique
                <span style={{ marginInlineStart: 8, fontFamily: "var(--font-mono, monospace)", fontSize: 10, fontWeight: 600, color: "var(--pal-muted)", letterSpacing: ".06em", verticalAlign: "middle" }}>
                  · lecture seule
                </span>
              </SectionLabel>
              <div className="dash-card overflow-hidden" style={{ borderStyle: "dashed", opacity: 0.9 }}>
                {past.map(m => meetingRow(m, true))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
            <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 500, color: PAL.ink, margin: "0 0 24px" }}>Nouvelle réunion</h2>

            <Field label="Titre *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Ex : Cours d'anatomie" />

            {/* Class selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>
                Classe concernée{classes.length === 0 ? " (aucune classe)" : ""}
              </label>
              <select
                value={form.class_id}
                onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                className="u-input"
                style={{ marginTop: 8, width: "100%", padding: "11px 14px", border: `1px solid ${form.class_id ? PAL.primary : PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: form.class_id ? PAL.ink : PAL.muted, background: PAL.paper, outline: "none", transition: "border-color .2s" }}
              >
                <option value="">— Sélectionner une classe (optionnel) —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {form.class_id && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: PAL.primary }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: PAL.primary }} />
                  Classe : <strong>{classes.find(c => c.id === form.class_id)?.name}</strong>
                </div>
              )}
            </div>

            {/* Course selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>
                Cours lié{courses.length === 0 ? " (aucun cours disponible)" : ""}
              </label>
              <select
                value={form.course_id}
                onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                className="u-input"
                style={{ marginTop: 8, width: "100%", padding: "11px 14px", border: `1px solid ${form.course_id ? PAL.primary : PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: form.course_id ? PAL.ink : PAL.muted, background: PAL.paper, outline: "none", transition: "border-color .2s" }}
              >
                <option value="">— Sélectionner un cours (optionnel) —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {form.course_id && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: PAL.primary }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: PAL.primary }} />
                  Cours : <strong>{courses.find(c => c.id === form.course_id)?.title}</strong>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <Field label="Date & heure *" type="datetime-local" value={form.scheduled_at} onChange={v => setForm(f => ({ ...f, scheduled_at: v }))} />
              <Field label="Durée (min)" type="number" value={form.duration_minutes} onChange={v => setForm(f => ({ ...f, duration_minutes: v }))} placeholder="60" />
            </div>

            <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Optionnel" />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
              <button onClick={createMeeting} disabled={creating} className="u-hover-lift" style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: creating ? "not-allowed" : "pointer", opacity: creating ? .6 : 1 }}>
                {creating ? "Création…" : "Créer la réunion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, type = "text", placeholder, value, onChange }: { label: string; type?: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="u-input" style={{ marginTop: 8, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
    </div>
  );
}
