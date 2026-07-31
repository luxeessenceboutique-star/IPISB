import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Briefcase, UserRound, CalendarClock, Clock, ArrowUpRight } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── Job ads ──────────────────────────────────────────────────────────────

type Ad = { id: string; poste: string; description: string | null; competences: string | null; experience: string | null; contenu: string; is_active: boolean };

function AdsPanel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Ad | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try { setAds(await api.get("/api/rh/recruitment/ads")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(a: Ad) {
    if (!window.confirm(`Supprimer l'annonce « ${a.poste} » ?`)) return;
    try { await api.delete(`/api/rh/recruitment/ads/${a.id}`); toast.success("Annonce supprimée."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modal.open && <AdFormModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvelle annonce</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : ads.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Briefcase size={26} strokeWidth={1.7} />} text="Aucune annonce." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {ads.map(a => (
            <div key={a.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{a.poste}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>{a.experience || "—"}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: a.is_active ? "var(--pal-good)" : "var(--pal-muted)", background: "var(--pal-pale)" }}>
                {a.is_active ? "Active" : "Inactive"}
              </span>
              <button onClick={() => setModal({ open: true, editing: a })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={14} strokeWidth={1.7} /></button>
              <button onClick={() => remove(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdFormModal({ editing, onClose, onSaved }: { editing: Ad | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    poste: editing?.poste ?? "", description: editing?.description ?? "", competences: editing?.competences ?? "",
    experience: editing?.experience ?? "", contenu: editing?.contenu ?? "", is_active: editing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.poste.trim() || !form.contenu.trim()) { toast.error("Le poste et le contenu sont requis."); return; }
    setBusy(true);
    try {
      if (editing) await api.patch(`/api/rh/recruitment/ads/${editing.id}`, form);
      else await api.post("/api/rh/recruitment/ads", form);
      toast.success("Annonce enregistrée.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? "Modifier l'annonce" : "Nouvelle annonce"} onClose={onClose}>
      <label style={labelStyle}>Poste *</label>
      <input type="text" value={form.poste} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))} style={fieldStyle} />
      <label style={labelStyle}>Description</label>
      <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={fieldStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Compétences</label>
          <input type="text" value={form.competences} onChange={e => setForm(f => ({ ...f, competences: e.target.value }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Expérience</label>
          <input type="text" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} style={fieldStyle} />
        </div>
      </div>
      <label style={labelStyle}>Contenu de l'annonce *</label>
      <textarea value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} rows={5} style={{ ...fieldStyle, resize: "vertical" as const }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: PAL.ink, marginBottom: 20 }}>
        <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
        Annonce active
      </label>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ── Candidates ───────────────────────────────────────────────────────────

type Candidate = { id: string; full_name: string; email: string | null; phone: string | null; position: string | null; notes: string | null };

function CandidatesPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [promoting, setPromoting] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", position: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setCandidates(await api.get("/api/rh/recruitment/candidates")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.full_name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/candidates", {
        full_name: form.full_name, email: form.email || null, phone: form.phone || null,
        position: form.position || null, notes: form.notes || null,
      });
      toast.success("Candidat ajouté.");
      setForm({ full_name: "", email: "", phone: "", position: "", notes: "" });
      setAddOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Candidate) {
    if (!window.confirm(`Supprimer le candidat « ${c.full_name} » ?`)) return;
    try { await api.delete(`/api/rh/recruitment/candidates/${c.id}`); toast.success("Candidat supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {addOpen && (
        <Modal title="Nouveau candidat" onClose={() => setAddOpen(false)}>
          <label style={labelStyle}>Nom complet *</label>
          <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={fieldStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Téléphone</label><input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={fieldStyle} /></div>
          </div>
          <label style={labelStyle}>Poste visé</label>
          <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} style={fieldStyle} />
          <label style={labelStyle}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 20 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setAddOpen(false)} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
            <button onClick={create} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Ajouter"}</button>
          </div>
        </Modal>
      )}
      {promoting && <PromoteModal candidate={promoting} onClose={() => setPromoting(null)} onSaved={load} />}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setAddOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouveau candidat</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : candidates.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<UserRound size={26} strokeWidth={1.7} />} text="Aucun candidat." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {candidates.map(c => (
            <div key={c.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{c.full_name}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>{c.position || "—"}{c.email ? ` · ${c.email}` : ""}</div>
              </div>
              <button onClick={() => setPromoting(c)} className="btn-c btn-c-sm btn-c-ghost"><ArrowUpRight size={13} strokeWidth={1.7} />Promouvoir</button>
              <button onClick={() => remove(c)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromoteModal({ candidate, onClose, onSaved }: { candidate: Candidate; onClose: () => void; onSaved: () => void }) {
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [position, setPosition] = useState(candidate.position ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/api/rh/recruitment/candidates/${candidate.id}/promote`, { hire_date: hireDate, position: position || null });
      toast.success(`${candidate.full_name} promu en employé.`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Promouvoir ${candidate.full_name}`} onClose={onClose}>
      <label style={labelStyle}>Date d'embauche</label>
      <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={fieldStyle} />
      <label style={labelStyle}>Poste</label>
      <input type="text" value={position} onChange={e => setPosition(e.target.value)} style={{ ...fieldStyle, marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Promouvoir"}</button>
      </div>
    </Modal>
  );
}

// ── Interviews ───────────────────────────────────────────────────────────

type Interview = { id: string; candidate_id: string; candidate_name: string | null; date: string; start_time: string; end_time: string; type: string; status: string };
const INTERVIEW_TYPES = [{ value: "rh", label: "RH" }, { value: "technical", label: "Technique" }, { value: "final", label: "Final" }];
const INTERVIEW_STATUS: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", completed: "Terminé", cancelled: "Annulé" };

function InterviewsPanel() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ candidate_id: "", date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "09:30", type: "rh", meet_link: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setInterviews(await api.get("/api/rh/recruitment/interviews")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get("/api/rh/recruitment/candidates").then(setCandidates).catch(() => {}); }, []);

  async function submit() {
    if (!form.candidate_id) { toast.error("Sélectionnez un candidat."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/interviews", { ...form, meet_link: form.meet_link || null, notes: form.notes || null });
      toast.success("Entretien planifié.");
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(i: Interview, status: string) {
    try { await api.patch(`/api/rh/recruitment/interviews/${i.id}/status?status=${status}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function remove(i: Interview) {
    if (!window.confirm("Supprimer cet entretien ?")) return;
    try { await api.delete(`/api/rh/recruitment/interviews/${i.id}`); toast.success("Entretien supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modalOpen && (
        <Modal title="Nouvel entretien" onClose={() => setModalOpen(false)}>
          <label style={labelStyle}>Candidat *</label>
          <select value={form.candidate_id} onChange={e => setForm(f => ({ ...f, candidate_id: e.target.value }))} style={fieldStyle}>
            <option value="">— Sélectionner —</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Début</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Fin</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={fieldStyle} /></div>
          </div>
          <label style={labelStyle}>Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={fieldStyle}>
            {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label style={labelStyle}>Lien visio</label>
          <input type="text" value={form.meet_link} onChange={e => setForm(f => ({ ...f, meet_link: e.target.value }))} style={{ ...fieldStyle, marginBottom: 20 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModalOpen(false)} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
            <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Planifier"}</button>
          </div>
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvel entretien</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : interviews.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<CalendarClock size={26} strokeWidth={1.7} />} text="Aucun entretien planifié." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {interviews.map(i => (
            <div key={i.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{i.candidate_name || "—"}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>
                  {INTERVIEW_TYPES.find(t => t.value === i.type)?.label} · {new Date(i.date).toLocaleDateString("fr-FR")} {i.start_time}-{i.end_time}
                </div>
              </div>
              <select value={i.status} onChange={e => setStatus(i, e.target.value)} className="u-input" style={{ padding: "6px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12, background: PAL.paper }}>
                {Object.entries(INTERVIEW_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={() => remove(i)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slots ────────────────────────────────────────────────────────────────

type Slot = { id: string; date: string; start_time: string; end_time: string; status: string };

function SlotsPanel() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "09:30" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setSlots(await api.get("/api/rh/recruitment/slots")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addSlot() {
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/slots", [form]);
      toast.success("Créneau ajouté.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Slot) {
    try { await api.delete(`/api/rh/recruitment/slots/${s.id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      <div className="dash-card" style={{ padding: 18, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div><label style={labelStyle}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <div><label style={labelStyle}>Début</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <div><label style={labelStyle}>Fin</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <button type="button" onClick={addSlot} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}><Plus size={14} strokeWidth={1.7} />Ajouter</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : slots.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Clock size={26} strokeWidth={1.7} />} text="Aucun créneau." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {slots.map(s => (
            <div key={s.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>
                {new Date(s.date).toLocaleDateString("fr-FR")} · {s.start_time}-{s.end_time}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: s.status === "reserved" ? "var(--pal-warn)" : "var(--pal-good)", background: "var(--pal-pale)" }}>
                {s.status === "reserved" ? "Réservé" : "Libre"}
              </span>
              <button onClick={() => remove(s)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────

type SubTab = "ads" | "candidates" | "interviews" | "slots";
const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "ads", label: "Annonces" }, { key: "candidates", label: "Candidats" },
  { key: "interviews", label: "Entretiens" }, { key: "slots", label: "Créneaux" },
];

export function RhRecruitment() {
  const [subtab, setSubtab] = useState<SubTab>("ads");

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
        {SUBTABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSubtab(t.key)} style={{
            padding: "6px 14px", borderRadius: 999, border: `1px solid ${subtab === t.key ? "var(--pal-primary)" : PAL.line}`,
            background: subtab === t.key ? "var(--pal-pale)" : "transparent", cursor: "pointer",
            fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: subtab === t.key ? "var(--pal-primary-deep)" : PAL.muted,
          }}>{t.label}</button>
        ))}
      </div>
      {subtab === "ads" && <AdsPanel />}
      {subtab === "candidates" && <CandidatesPanel />}
      {subtab === "interviews" && <InterviewsPanel />}
      {subtab === "slots" && <SlotsPanel />}
    </div>
  );
}
