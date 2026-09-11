import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, Briefcase, Calendar, MapPin, Home, Clock3, Languages,
  GraduationCap, Award, FileText, FileDown, ArrowUpRight, Trash2, Plus, CalendarClock,
} from "lucide-react";
import { EmptyHint } from "@/components/dashboard/ui";
import {
  Modal, DetailField, CvUploadZone, CandidateComments, PromoteModal,
  InterviewerPicker, slotLabel,
  type Candidate, type Interview, type Interviewer, type Slot,
  INTERVIEW_TYPES, INTERVIEW_STATUS, MAX_INTERVIEWERS,
} from "@/components/rh/Recruitment";
import { InterviewEvaluationPanel } from "@/components/rh/InterviewEvaluation";

export const Route = createFileRoute("/dashboard/rh_/candidates_/$candidateId")({
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
  component: CandidateDetailPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

/* ─── Profil tab ─── */
function ProfilTab({ candidate, onChanged }: { candidate: Candidate; onChanged: () => void }) {
  const [promoting, setPromoting] = useState(false);
  const empty = (v?: string | null) => !v || !v.trim();

  async function downloadCv() {
    try {
      const res = await api.get(`/api/rh/recruitment/candidates/${candidate.id}/cv-url`);
      if (res.signed_url) window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "CV introuvable.");
    }
  }

  async function uploadCv(c: Candidate, file: File) {
    const fd = new FormData();
    fd.append("cv", file);
    try {
      await api.uploadFile(`/api/rh/recruitment/candidates/${c.id}/cv`, fd);
      toast.success("CV importé et analysé.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'import du CV.");
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer le candidat « ${candidate.full_name} » ?`)) return;
    try {
      await api.delete(`/api/rh/recruitment/candidates/${candidate.id}`);
      toast.success("Candidat supprimé.");
      window.location.href = "/dashboard/rh";
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  return (
    <div>
      {promoting && <PromoteModal candidate={candidate} onClose={() => setPromoting(false)} onSaved={onChanged} />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <DetailField icon={<Mail size={12} strokeWidth={1.8} />} label="Email" color="var(--pal-primary)">{candidate.email || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
        <DetailField icon={<Phone size={12} strokeWidth={1.8} />} label="Téléphone" color="var(--pal-good)">{candidate.phone || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
        <DetailField icon={<Briefcase size={12} strokeWidth={1.8} />} label="Poste visé" color={PAL.muted}>{candidate.position || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
        <DetailField icon={<Calendar size={12} strokeWidth={1.8} />} label="Reçue le" color="var(--pal-warn)">
          {candidate.created_at ? new Date(candidate.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}
        </DetailField>
      </div>

      {(!empty(candidate.city) || !empty(candidate.address)) && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {!empty(candidate.city) && <DetailField icon={<MapPin size={12} strokeWidth={1.8} />} label="Ville" color="var(--pal-good)">{candidate.city}</DetailField>}
          {!empty(candidate.address) && <DetailField icon={<Home size={12} strokeWidth={1.8} />} label="Adresse" color="var(--pal-good)">{candidate.address}</DetailField>}
        </div>
      )}

      {(candidate.years_experience != null || !empty(candidate.languages)) && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {candidate.years_experience != null && (
            <DetailField icon={<Clock3 size={12} strokeWidth={1.8} />} label="Années d'expérience" color="var(--pal-warn)">
              {candidate.years_experience} an{candidate.years_experience >= 2 ? "s" : ""}
            </DetailField>
          )}
          {!empty(candidate.languages) && <DetailField icon={<Languages size={12} strokeWidth={1.8} />} label="Langues" color="var(--pal-good)">{candidate.languages}</DetailField>}
        </div>
      )}
      {!empty(candidate.education) && (
        <div style={{ marginTop: 10 }}><DetailField icon={<GraduationCap size={12} strokeWidth={1.8} />} label="Formation" color="var(--pal-primary)">{candidate.education}</DetailField></div>
      )}
      {!empty(candidate.experience_summary) && (
        <div style={{ marginTop: 10 }}><DetailField icon={<Briefcase size={12} strokeWidth={1.8} />} label="Expérience" color="var(--pal-primary)">{candidate.experience_summary}</DetailField></div>
      )}
      {!empty(candidate.skills) && (
        <div style={{ marginTop: 10 }}><DetailField icon={<Award size={12} strokeWidth={1.8} />} label="Compétences" color="var(--pal-primary)">{candidate.skills}</DetailField></div>
      )}
      {!empty(candidate.notes) && (
        <div style={{ marginTop: 10 }}><DetailField icon={<FileText size={12} strokeWidth={1.8} />} label="Notes" color={PAL.muted}>{candidate.notes}</DetailField></div>
      )}
      {!candidate.cv_path && <CvUploadZone candidate={candidate} onUploadCv={uploadCv} />}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${PAL.line}` }}>
        <CandidateComments candidateId={candidate.id} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${PAL.line}` }}>
        {candidate.cv_path && (
          <button onClick={downloadCv} className="btn-c btn-c-sm btn-c-ghost"><FileDown size={13} strokeWidth={1.7} />Télécharger le CV</button>
        )}
        <button onClick={() => setPromoting(true)} className="btn-c btn-c-sm btn-c-ghost"><ArrowUpRight size={13} strokeWidth={1.7} />Promouvoir</button>
        <button onClick={remove} className="btn-c btn-c-sm" style={{ color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} />Supprimer</button>
      </div>
    </div>
  );
}

/* ─── Nouvel entretien (candidat fixé) ─── */
function ScheduleInterviewModal({ candidateId, onClose, onCreated }: { candidateId: string; onClose: () => void; onCreated: () => void }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [interviewerPool, setInterviewerPool] = useState<Interviewer[]>([]);
  const [form, setForm] = useState({ slot_id: "", type: "rh", meet_link: "", interviewer_ids: [] as string[] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/rh/recruitment/slots").then(setSlots).catch(() => {});
    api.get("/api/rh/recruitment/interviewers").then(setInterviewerPool).catch(() => {});
  }, []);

  const availableSlots = slots.filter(s => s.status !== "reserved");

  async function submit() {
    const slot = availableSlots.find(s => s.id === form.slot_id);
    if (!slot) { toast.error("Sélectionnez un créneau."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/interviews", {
        candidate_id: candidateId, slot_id: slot.id,
        date: slot.date, start_time: slot.start_time, end_time: slot.end_time,
        type: form.type, meet_link: form.meet_link || null,
        interviewer_ids: form.interviewer_ids,
      });
      toast.success("Entretien planifié.");
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nouvel entretien" onClose={onClose}>
      <label style={labelStyle}>Créneau *</label>
      {availableSlots.length === 0 ? (
        <div style={{ ...fieldStyle, color: PAL.muted, fontSize: 12.5, display: "flex", alignItems: "center" }}>
          Aucun créneau disponible — créez-en un dans Recrutement → Créneaux.
        </div>
      ) : (
        <select value={form.slot_id} onChange={e => setForm(f => ({ ...f, slot_id: e.target.value }))} style={fieldStyle}>
          <option value="">— Sélectionner un créneau —</option>
          {availableSlots.map(s => <option key={s.id} value={s.id}>{slotLabel(s)}</option>)}
        </select>
      )}
      <label style={labelStyle}>Type</label>
      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={fieldStyle}>
        {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label style={labelStyle}>Interviewers ({form.interviewer_ids.length}/{MAX_INTERVIEWERS})</label>
      <InterviewerPicker interviewers={interviewerPool} selected={form.interviewer_ids} onChange={ids => setForm(f => ({ ...f, interviewer_ids: ids }))} />
      <label style={labelStyle}>Lien visio</label>
      <input type="text" value={form.meet_link} onChange={e => setForm(f => ({ ...f, meet_link: e.target.value }))} style={{ ...fieldStyle, marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy || availableSlots.length === 0} className="btn-c btn-c-primary">{busy ? "…" : "Planifier"}</button>
      </div>
    </Modal>
  );
}

/* ─── Entretiens tab ─── */
function EntretiensTab({ candidate, currentUserName, onChanged }: { candidate: Candidate; currentUserName: string; onChanged: () => void }) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  async function load() {
    setLoading(true);
    try { setInterviews(await api.get(`/api/rh/recruitment/interviews?candidate_id=${candidate.id}`)); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candidate.id]);

  return (
    <div>
      {scheduleOpen && (
        <ScheduleInterviewModal candidateId={candidate.id} onClose={() => setScheduleOpen(false)} onCreated={load} />
      )}
      {promoting && <PromoteModal candidate={candidate} onClose={() => setPromoting(false)} onSaved={onChanged} />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setScheduleOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvel entretien</button>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : interviews.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<CalendarClock size={26} strokeWidth={1.7} />} text="Aucun entretien planifié pour ce candidat." /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {interviews.map(i => (
            <div key={i.id}>
              <div
                onClick={() => setActiveId(activeId === i.id ? null : i.id)}
                className="dash-card"
                style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>
                    {INTERVIEW_TYPES.find(t => t.value === i.type)?.label} · {new Date(i.date).toLocaleDateString("fr-FR")} {i.start_time}-{i.end_time}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {i.interviewers.length === 0 ? (
                      <span style={{ fontSize: 11, color: PAL.muted, fontStyle: "italic" }}>Aucun interviewer assigné</span>
                    ) : i.interviewers.map(iv => (
                      <span key={iv.id} className="chip-c chip-c-blue" style={{ fontSize: 11 }}>{iv.full_name}</span>
                    ))}
                  </div>
                </div>
                <span className="chip-c">{INTERVIEW_STATUS[i.status] ?? i.status}</span>
              </div>
              {activeId === i.id && (
                <div style={{ marginTop: 8 }}>
                  <InterviewEvaluationPanel interviewId={i.id} currentUserName={currentUserName} onChanged={load} onPromote={() => setPromoting(true)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Page ─── */
function CandidateDetailPage() {
  const { candidateId } = Route.useParams();
  const { user } = useAuth();
  const currentUserName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"profil" | "entretiens">("profil");

  async function load() {
    try {
      setCandidate(await api.get(`/api/rh/recruitment/candidates/${candidateId}`));
    } catch {
      setNotFound(true);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candidateId]);

  if (notFound) {
    return (
      <div style={{ fontFamily: sans }}>
        <EmptyHint icon={<FileText size={28} strokeWidth={1.7} />} text="Candidat introuvable." />
      </div>
    );
  }
  if (!candidate) {
    return (
      <div className="dash-card" style={{ padding: 26, fontFamily: sans }}>
        <div className="shimmer" style={{ height: 22, width: "40%", borderRadius: 8 }} />
      </div>
    );
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "profil", label: "Profil" },
    { key: "entretiens", label: "Entretiens" },
  ];

  return (
    <div style={{ fontFamily: sans }}>
      <Link to="/dashboard/rh" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: PAL.muted, textDecoration: "none", marginBottom: 16 }}>
        <ArrowLeft size={14} strokeWidth={1.7} />Recrutement
      </Link>

      <div className="dash-card" style={{ padding: 24, marginBottom: 22 }}>
        <h1 className="h-serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{candidate.full_name}</h1>
        <div style={{ fontSize: 13, color: PAL.muted, marginTop: 5 }}>{candidate.position || "—"}</div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${PAL.line}`, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{
              fontFamily: sans, fontSize: 13.5, fontWeight: 600, padding: "10px 16px",
              background: "transparent", border: 0, cursor: "pointer",
              color: tab === t.key ? "var(--pal-primary)" : PAL.muted,
              borderBottom: tab === t.key ? "2px solid var(--pal-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profil" && <ProfilTab candidate={candidate} onChanged={load} />}
      {tab === "entretiens" && <EntretiensTab candidate={candidate} currentUserName={currentUserName} onChanged={load} />}
    </div>
  );
}
