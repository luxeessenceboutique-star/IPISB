import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, GraduationCap, Sparkles } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const CATEGORIES = ["technique", "soft_skills", "compliance", "management", "langue", "securite"];
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const LEVEL_LABEL: Record<string, string> = { beginner: "Débutant", intermediate: "Intermédiaire", advanced: "Avancé", expert: "Expert" };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 440, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function StatsHeader() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api.get("/api/rh/training/stats").then(setStats).catch(() => {}); }, []);
  if (!stats) return null;
  const cells = [
    { label: "Total", value: stats.total },
    { label: "Terminées", value: stats.completed },
    { label: "Taux de complétion", value: `${stats.completion_rate}%` },
    { label: "Budget total", value: `${stats.total_budget_dh.toLocaleString("fr-FR")} DH` },
    { label: "Heures complétées", value: stats.total_hours_completed },
  ];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      {cells.map(c => (
        <div key={c.label} className="dash-card" style={{ padding: "12px 18px", flex: "1 1 140px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const }}>{c.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: PAL.ink, marginTop: 2 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Catalog ──────────────────────────────────────────────────────────────

type Training = { id: string; title: string; category: string; provider: string | null; duration_hours: number; cost_dh: number; description: string | null };

function CatalogPanel() {
  const [items, setItems] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Training | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try { setItems(await api.get("/api/rh/training/catalog")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(t: Training) {
    if (!window.confirm(`Retirer « ${t.title} » du catalogue ?`)) return;
    try { await api.delete(`/api/rh/training/catalog/${t.id}`); toast.success("Formation retirée."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modal.open && <TrainingFormModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvelle formation</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<GraduationCap size={26} strokeWidth={1.7} />} text="Catalogue vide." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {items.map(t => (
            <div key={t.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{t.title}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>{t.category} · {t.duration_hours}h · {t.cost_dh} DH{t.provider ? ` · ${t.provider}` : ""}</div>
              </div>
              <button onClick={() => setModal({ open: true, editing: t })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={14} strokeWidth={1.7} /></button>
              <button onClick={() => remove(t)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingFormModal({ editing, onClose, onSaved }: { editing: Training | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: editing?.title ?? "", category: editing?.category ?? "technique", provider: editing?.provider ?? "",
    duration_hours: String(editing?.duration_hours ?? 0), cost_dh: String(editing?.cost_dh ?? 0), description: editing?.description ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.title.trim()) { toast.error("Le titre est requis."); return; }
    setBusy(true);
    const payload = { ...form, duration_hours: parseInt(form.duration_hours, 10) || 0, cost_dh: parseFloat(form.cost_dh) || 0, provider: form.provider || null, description: form.description || null };
    try {
      if (editing) await api.patch(`/api/rh/training/catalog/${editing.id}`, payload);
      else await api.post("/api/rh/training/catalog", payload);
      toast.success("Formation enregistrée.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? "Modifier la formation" : "Nouvelle formation"} onClose={onClose}>
      <label style={labelStyle}>Titre *</label>
      <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={fieldStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Catégorie</label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={fieldStyle}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Prestataire</label><input type="text" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} style={fieldStyle} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={labelStyle}>Durée (h)</label><input type="number" min="0" value={form.duration_hours} onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Coût (DH)</label><input type="number" min="0" value={form.cost_dh} onChange={e => setForm(f => ({ ...f, cost_dh: e.target.value }))} style={fieldStyle} /></div>
      </div>
      <label style={labelStyle}>Description</label>
      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ── Assignments ──────────────────────────────────────────────────────────

type Assignment = { id: string; employee_id: string; employee_name: string | null; training_id: string; training_title: string | null; status: string; score: number | null };
const ASSIGN_STATUS: Record<string, string> = { planned: "Planifiée", in_progress: "En cours", completed: "Terminée", cancelled: "Annulée" };

function AssignmentsPanel({ employees, catalog }: { employees: Employee[]; catalog: Training[] }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", training_id: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems(await api.get("/api/rh/training/assignments")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!form.employee_id || !form.training_id) { toast.error("Sélectionnez un employé et une formation."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/training/assignments", form);
      toast.success("Formation affectée.");
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(a: Assignment, status: string) {
    try { await api.patch(`/api/rh/training/assignments/${a.id}`, { status }); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function remove(a: Assignment) {
    try { await api.delete(`/api/rh/training/assignments/${a.id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modalOpen && (
        <Modal title="Affecter une formation" onClose={() => setModalOpen(false)}>
          <label style={labelStyle}>Employé *</label>
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={fieldStyle}>
            <option value="">— Sélectionner —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <label style={labelStyle}>Formation *</label>
          <select value={form.training_id} onChange={e => setForm(f => ({ ...f, training_id: e.target.value }))} style={{ ...fieldStyle, marginBottom: 20 }}>
            <option value="">— Sélectionner —</option>
            {catalog.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModalOpen(false)} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
            <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Affecter"}</button>
          </div>
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvelle affectation</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<GraduationCap size={26} strokeWidth={1.7} />} text="Aucune affectation." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {items.map(a => (
            <div key={a.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{a.employee_name || "—"}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>{a.training_title || "—"}</div>
              </div>
              <select value={a.status} onChange={e => setStatus(a, e.target.value)} className="u-input" style={{ padding: "6px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12, background: PAL.paper }}>
                {Object.entries(ASSIGN_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={() => remove(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skills ───────────────────────────────────────────────────────────────

type Skill = { id: string; name: string; category: string };
type EmployeeSkill = { id: string; employee_id: string; skill_id: string; skill_name: string | null; level: string };

function SkillsPanel({ employees }: { employees: Employee[] }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [matrix, setMatrix] = useState<EmployeeSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSkill, setNewSkill] = useState({ name: "", category: "technique" });
  const [assign, setAssign] = useState({ employee_id: "", skill_id: "", level: "beginner" });

  async function load() {
    setLoading(true);
    try {
      const [sk, mx] = await Promise.all([api.get("/api/rh/training/skills"), api.get("/api/rh/training/employee-skills")]);
      setSkills(sk ?? []);
      setMatrix(mx ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function addSkill() {
    if (!newSkill.name.trim()) { toast.error("Le nom est requis."); return; }
    try { await api.post("/api/rh/training/skills", newSkill); setNewSkill({ name: "", category: "technique" }); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function removeSkill(s: Skill) {
    try { await api.delete(`/api/rh/training/skills/${s.id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function assignSkill() {
    if (!assign.employee_id || !assign.skill_id) { toast.error("Sélectionnez un employé et une compétence."); return; }
    try { await api.post("/api/rh/training/employee-skills", assign); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function removeMatrixEntry(e: EmployeeSkill) {
    try { await api.delete(`/api/rh/training/employee-skills/${e.id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="dash-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PAL.ink, marginBottom: 10 }}>Référentiel de compétences</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input type="text" placeholder="Nom de la compétence" value={newSkill.name} onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, flex: "1 1 180px" }} />
          <select value={newSkill.category} onChange={e => setNewSkill(s => ({ ...s, category: e.target.value }))} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5 }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={addSkill} className="btn-c btn-c-sm btn-c-primary"><Plus size={13} strokeWidth={1.7} />Ajouter</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {skills.map(s => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--pal-pale)", color: PAL.ink }}>
              {s.name}
              <button onClick={() => removeSkill(s)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, display: "flex" }}><Trash2 size={11} strokeWidth={1.7} /></button>
            </span>
          ))}
        </div>
      </div>

      <div className="dash-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: PAL.ink, marginBottom: 10 }}>Matrice de compétences</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={assign.employee_id} onChange={e => setAssign(a => ({ ...a, employee_id: e.target.value }))} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, flex: "1 1 160px" }}>
            <option value="">Employé…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <select value={assign.skill_id} onChange={e => setAssign(a => ({ ...a, skill_id: e.target.value }))} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, flex: "1 1 160px" }}>
            <option value="">Compétence…</option>
            {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={assign.level} onChange={e => setAssign(a => ({ ...a, level: e.target.value }))} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5 }}>
            {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
          <button type="button" onClick={assignSkill} className="btn-c btn-c-sm btn-c-primary"><Sparkles size={13} strokeWidth={1.7} />Évaluer</button>
        </div>

        {loading ? (
          <div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} />
        ) : matrix.length === 0 ? (
          <EmptyHint text="Aucune évaluation de compétence." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matrix.map(m => {
              const emp = employees.find(e => e.id === m.employee_id);
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, border: `1px solid ${PAL.line}`, fontSize: 12.5 }}>
                  <span style={{ flex: 1, fontWeight: 600, color: PAL.ink }}>{emp?.full_name ?? "—"}</span>
                  <span style={{ flex: 1, color: PAL.muted }}>{m.skill_name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}>{LEVEL_LABEL[m.level] ?? m.level}</span>
                  <button onClick={() => removeMatrixEntry(m)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={12} strokeWidth={1.7} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────

type SubTab = "catalog" | "assignments" | "skills";
const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "catalog", label: "Catalogue" }, { key: "assignments", label: "Affectations" }, { key: "skills", label: "Compétences" },
];

export function RhTraining() {
  const [subtab, setSubtab] = useState<SubTab>("catalog");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [catalog, setCatalog] = useState<Training[]>([]);

  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);
  useEffect(() => { api.get("/api/rh/training/catalog").then(setCatalog).catch(() => {}); }, [subtab]);

  return (
    <div>
      <StatsHeader />
      <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
        {SUBTABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSubtab(t.key)} style={{
            padding: "6px 14px", borderRadius: 999, border: `1px solid ${subtab === t.key ? "var(--pal-primary)" : PAL.line}`,
            background: subtab === t.key ? "var(--pal-pale)" : "transparent", cursor: "pointer",
            fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: subtab === t.key ? "var(--pal-primary-deep)" : PAL.muted,
          }}>{t.label}</button>
        ))}
      </div>
      {subtab === "catalog" && <CatalogPanel />}
      {subtab === "assignments" && <AssignmentsPanel employees={employees} catalog={catalog} />}
      {subtab === "skills" && <SkillsPanel employees={employees} />}
    </div>
  );
}
