import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Trash2, X, ClipboardCheck, ChevronDown, ChevronUp, Check, Undo2,
  Pencil, Settings2, ListTree,
} from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const titleFont = '"Cormorant Garamond", Georgia, serif';

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const };

const STATUS_LABEL: Record<string, string> = { submitted: "Soumise", validated: "Validée", returned: "Retournée" };
const STATUS_TONE: Record<string, string> = { submitted: "chip-c-blue", validated: "chip-c-green", returned: "chip-c-red" };

type Heading = { id: string; label: string; coefficient: number; parent_id: string | null; children?: Heading[] };
type JobDescription = { id: string; department: string; position: string; mission: string | null; headings: Heading[] };

type DailyTask = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  department: string | null;
  position: string | null;
  heading_id: string | null;
  label: string;
  coefficient: number;
  task_date: string;
  due_date: string | null;
  employee_comment: string | null;
  status: "submitted" | "validated" | "returned";
  note: number | null;
  manager_comment: string | null;
};

/* ─── Fiche de poste : gestion des rubriques (grands titres / sous-titres) ─── */
function JobDescriptionPanel({ department, position, onChanged }: { department: string; position: string; onChanged: () => void }) {
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingRoot, setAddingRoot] = useState(false);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", coefficient: "1" });
  const [mission, setMission] = useState("");
  const [editingMission, setEditingMission] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/api/rh/job-descriptions/by-position?department=${encodeURIComponent(department)}&position=${encodeURIComponent(position)}`);
      setJd(res);
      setMission(res?.mission ?? "");
    } catch {
      setJd(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [department, position]);

  async function ensureJd(): Promise<string> {
    if (jd) return jd.id;
    const created = await api.post("/api/rh/job-descriptions", { department, position });
    return created.id;
  }

  async function addHeading(parentId: string | null) {
    if (!form.label.trim()) { toast.error("Le libellé est requis."); return; }
    try {
      const jdId = await ensureJd();
      await api.post(`/api/rh/job-descriptions/${jdId}/headings`, {
        parent_id: parentId, label: form.label.trim(), coefficient: parseFloat(form.coefficient) || 1,
      });
      toast.success("Rubrique ajoutée.");
      setForm({ label: "", coefficient: "1" });
      setAddingRoot(false);
      setAddingUnder(null);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout.");
    }
  }

  async function removeHeading(id: string) {
    if (!window.confirm("Supprimer cette rubrique (et ses sous-titres) ?")) return;
    try {
      await api.delete(`/api/rh/job-descriptions/headings/${id}`);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  async function saveMission() {
    try {
      const jdId = await ensureJd();
      await api.patch(`/api/rh/job-descriptions/${jdId}`, { mission: mission || null });
      toast.success("Mission enregistrée.");
      setEditingMission(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    }
  }

  if (loading) return <div className="shimmer" style={{ height: 60, borderRadius: 10, marginBottom: 16 }} />;

  return (
    <div className="dash-card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <ListTree size={16} strokeWidth={1.8} style={{ color: "var(--pal-primary)" }} />
        <span style={{ fontFamily: titleFont, fontSize: 17, fontWeight: 500, color: PAL.ink }}>
          Fiche de poste — {position} ({department})
        </span>
      </div>

      {editingMission ? (
        <div style={{ marginBottom: 12 }}>
          <textarea value={mission} onChange={e => setMission(e.target.value)} rows={2} className="u-input" style={fieldStyle} placeholder="Mission du poste…" />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveMission} className="btn-c btn-c-primary btn-c-sm">Enregistrer</button>
            <button onClick={() => setEditingMission(false)} className="btn-c btn-c-ghost btn-c-sm">Annuler</button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditingMission(true)} style={{ cursor: "pointer", fontSize: 12.5, color: jd?.mission ? PAL.ink : PAL.muted, marginBottom: 12, fontStyle: jd?.mission ? "normal" : "italic" }}>
          {jd?.mission || "Ajouter une mission…"}
        </div>
      )}

      {(jd?.headings ?? []).map(h => (
        <div key={h.id} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--pal-pale)", borderRadius: 8 }}>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{h.label}</span>
            <span className="chip-c" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11 }}>coef. {h.coefficient}</span>
            <button onClick={() => setAddingUnder(addingUnder === h.id ? null : h.id)} className="btn-c btn-c-ghost btn-c-sm" title="Ajouter un sous-titre"><Plus size={12} /></button>
            <button onClick={() => removeHeading(h.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={13} /></button>
          </div>
          {(h.children ?? []).map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 26px", fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>↳ {c.label}</span>
              <span className="chip-c" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5 }}>coef. {c.coefficient}</span>
              <button onClick={() => removeHeading(c.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={12} /></button>
            </div>
          ))}
          {addingUnder === h.id && (
            <div style={{ display: "flex", gap: 6, padding: "6px 10px 6px 26px" }}>
              <input placeholder="Sous-titre" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0, flex: 2 }} />
              <input type="number" step="any" placeholder="Coef." value={form.coefficient} onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0, width: 70 }} />
              <button onClick={() => addHeading(h.id)} className="btn-c btn-c-primary btn-c-sm">OK</button>
            </div>
          )}
        </div>
      ))}

      {addingRoot ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input placeholder="Grand titre" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0, flex: 2 }} />
          <input type="number" step="any" placeholder="Coef." value={form.coefficient} onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0, width: 70 }} />
          <button onClick={() => addHeading(null)} className="btn-c btn-c-primary btn-c-sm">Ajouter</button>
          <button onClick={() => { setAddingRoot(false); setForm({ label: "", coefficient: "1" }); }} className="btn-c btn-c-ghost btn-c-sm"><X size={13} /></button>
        </div>
      ) : (
        <button onClick={() => setAddingRoot(true)} className="btn-c btn-c-ghost btn-c-sm" style={{ marginTop: 8 }}>
          <Plus size={13} />Ajouter un grand titre
        </button>
      )}
    </div>
  );
}

/* ─── Formulaire de saisie d'une tâche quotidienne ─── */
function TaskFormModal({ employee, jd, onClose, onSaved }: { employee: Employee; jd: JobDescription | null; onClose: () => void; onSaved: () => void }) {
  const flatHeadings = useMemo(() => {
    const out: { id: string; label: string; coefficient: number; indent: boolean }[] = [];
    for (const h of jd?.headings ?? []) {
      out.push({ id: h.id, label: h.label, coefficient: h.coefficient, indent: false });
      for (const c of h.children ?? []) out.push({ id: c.id, label: c.label, coefficient: c.coefficient, indent: true });
    }
    return out;
  }, [jd]);

  const [headingId, setHeadingId] = useState<string>("__other__");
  const [form, setForm] = useState({ label: "", coefficient: "1", due_date: "", employee_comment: "" });
  const [busy, setBusy] = useState(false);

  function pickHeading(id: string) {
    setHeadingId(id);
    if (id !== "__other__") {
      const h = flatHeadings.find(x => x.id === id);
      if (h) setForm(f => ({ ...f, label: f.label.trim() ? f.label : h.label, coefficient: String(h.coefficient) }));
    }
  }

  async function submit() {
    if (!form.label.trim()) { toast.error("Le libellé de la tâche est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/daily-tasks", {
        employee_id: employee.id,
        heading_id: headingId === "__other__" ? null : headingId,
        label: form.label.trim(),
        coefficient: parseFloat(form.coefficient) || 1,
        due_date: form.due_date || null,
        employee_comment: form.employee_comment || null,
      });
      toast.success("Tâche soumise !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 23, fontWeight: 500, color: PAL.ink, margin: "0 0 4px" }}>Nouvelle tâche</h2>
        <p style={{ fontSize: 12.5, color: PAL.muted, margin: "0 0 16px" }}>{employee.full_name} — {employee.position} ({employee.department})</p>

        <label style={labelStyle}>Rubrique (fiche de poste)</label>
        <select value={headingId} onChange={e => pickHeading(e.target.value)} className="u-input" style={fieldStyle}>
          <option value="__other__">Autre tâche (libre)</option>
          {flatHeadings.map(h => (
            <option key={h.id} value={h.id}>{h.indent ? "  ↳ " : ""}{h.label} (coef. {h.coefficient})</option>
          ))}
        </select>

        <label style={labelStyle}>Libellé de la tâche *</label>
        <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="u-input" style={fieldStyle} />

        {headingId === "__other__" && (
          <>
            <label style={labelStyle}>Coefficient</label>
            <input type="number" step="any" min="0.1" value={form.coefficient} onChange={e => setForm(f => ({ ...f, coefficient: e.target.value }))} className="u-input" style={fieldStyle} />
          </>
        )}

        <label style={labelStyle}>Délai de réalisation</label>
        <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.employee_comment} onChange={e => setForm(f => ({ ...f, employee_comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, marginBottom: 22 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Envoi…" : "Soumettre"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Une ligne de tâche + actions de validation ─── */
function TaskRow({ task, onChanged }: { task: DailyTask; onChanged: () => void }) {
  const [reviewing, setReviewing] = useState<"validate" | "return" | null>(null);
  const [note, setNote] = useState("15");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ label: task.label, due_date: task.due_date ?? "", employee_comment: task.employee_comment ?? "" });
  const [busy, setBusy] = useState(false);

  async function decide(decision: "validate" | "return") {
    if (!comment.trim()) { toast.error("Un commentaire est requis."); return; }
    if (decision === "validate") {
      const n = parseFloat(note);
      if (isNaN(n) || n < 0 || n > 20) { toast.error("Note entre 0 et 20 requise."); return; }
    }
    setBusy(true);
    try {
      await api.post(`/api/rh/daily-tasks/${task.id}/validate`, {
        decision, note: decision === "validate" ? parseFloat(note) : null, manager_comment: comment.trim(),
      });
      toast.success(decision === "validate" ? "Tâche validée." : "Tâche retournée.");
      setReviewing(null);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await api.patch(`/api/rh/daily-tasks/${task.id}`, {
        label: editForm.label, due_date: editForm.due_date || null, employee_comment: editForm.employee_comment || null,
      });
      toast.success("Tâche corrigée et re-soumise.");
      setEditing(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    try {
      await api.delete(`/api/rh/daily-tasks/${task.id}`);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  return (
    <div className="dash-card" style={{ padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{task.employee_name}</div>
          <div style={{ fontSize: 12, color: PAL.muted }}>{task.position} · {task.department}</div>
        </div>
        <div style={{ flex: "2 1 260px", minWidth: 0 }}>
          {editing ? (
            <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0 }} />
          ) : (
            <div style={{ fontSize: 13.5, color: PAL.ink }}>{task.label}</div>
          )}
          <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 2 }}>
            {task.task_date}{task.due_date ? ` · délai ${task.due_date}` : ""} · coef. {task.coefficient}
          </div>
        </div>
        <span className={`chip-c ${STATUS_TONE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        {task.note != null && <span className="chip-c" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{task.note}/20</span>}
        {task.status === "submitted" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setReviewing(reviewing === "validate" ? null : "validate")} className="btn-c btn-c-sm btn-c-soft"><Check size={12} />Valider</button>
            <button onClick={() => setReviewing(reviewing === "return" ? null : "return")} className="btn-c btn-c-sm btn-c-ghost"><Undo2 size={12} />Retourner</button>
          </div>
        )}
        {task.status === "returned" && !editing && (
          <button onClick={() => setEditing(true)} className="btn-c btn-c-sm btn-c-ghost"><Pencil size={12} />Corriger</button>
        )}
        {editing && (
          <button onClick={saveEdit} disabled={busy} className="btn-c btn-c-sm btn-c-primary">{busy ? "…" : "Re-soumettre"}</button>
        )}
        {task.status !== "validated" && (
          <button onClick={remove} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} /></button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0 }} />
          <input placeholder="Commentaire" value={editForm.employee_comment} onChange={e => setEditForm(f => ({ ...f, employee_comment: e.target.value }))} className="u-input" style={{ ...fieldStyle, margin: 0 }} />
        </div>
      )}

      {(task.employee_comment || task.manager_comment) && !editing && (
        <div style={{ marginTop: 8, fontSize: 12, color: PAL.muted, display: "flex", flexDirection: "column", gap: 2 }}>
          {task.employee_comment && <div>💬 Salarié : {task.employee_comment}</div>}
          {task.manager_comment && <div>📝 Responsable : {task.manager_comment}</div>}
        </div>
      )}

      {reviewing && (
        <div style={{ marginTop: 10, padding: 10, background: "var(--pal-pale)", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {reviewing === "validate" && (
            <input type="number" min={0} max={20} step="any" value={note} onChange={e => setNote(e.target.value)} className="u-input" style={{ ...fieldStyle, margin: 0, width: 70 }} placeholder="Note /20" />
          )}
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Commentaire (obligatoire)" className="u-input" style={{ ...fieldStyle, margin: 0, flex: 1, minWidth: 160 }} />
          <button onClick={() => decide(reviewing)} disabled={busy} className="btn-c btn-c-sm btn-c-primary">{busy ? "…" : reviewing === "validate" ? "Confirmer" : "Confirmer le retour"}</button>
          <button onClick={() => setReviewing(null)} className="btn-c btn-c-sm btn-c-ghost"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}

/* ─── Page principale ─── */
export function RhDailyTasks() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJd, setShowJd] = useState(false);
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { api.get("/api/rh/employees?page_size=500").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))) as string[], [employees]);
  const positions = useMemo(() => Array.from(new Set(employees.filter(e => !department || e.department === department).map(e => e.position).filter(Boolean))) as string[], [employees, department]);
  const filteredEmployees = useMemo(() => employees.filter(e => (!department || e.department === department) && (!position || e.position === position)), [employees, department, position]);
  const selectedEmployee = useMemo(() => employees.find(e => e.id === employeeId) ?? null, [employees, employeeId]);

  async function loadTasks() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (employeeId) params.set("employee_id", employeeId);
      else {
        if (department) params.set("department", department);
        if (position) params.set("position", position);
      }
      if (status) params.set("status", status);
      const res = await api.get(`/api/rh/daily-tasks?${params.toString()}`);
      setTasks(res.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadTasks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [department, position, employeeId, status]);

  useEffect(() => {
    if (selectedEmployee?.department && selectedEmployee?.position) {
      api.get(`/api/rh/job-descriptions/by-position?department=${encodeURIComponent(selectedEmployee.department)}&position=${encodeURIComponent(selectedEmployee.position)}`)
        .then(setJd).catch(() => setJd(null));
    } else {
      setJd(null);
    }
  }, [selectedEmployee]);

  return (
    <div>
      {showForm && selectedEmployee && (
        <TaskFormModal employee={selectedEmployee} jd={jd} onClose={() => setShowForm(false)} onSaved={loadTasks} />
      )}

      <div className="dash-card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={department} onChange={e => { setDepartment(e.target.value); setPosition(""); setEmployeeId(""); }} className="u-input" style={{ ...fieldStyle, margin: 0, width: 170 }}>
          <option value="">Tous services</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={position} onChange={e => { setPosition(e.target.value); setEmployeeId(""); }} className="u-input" style={{ ...fieldStyle, margin: 0, width: 190 }}>
          <option value="">Tous postes</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="u-input" style={{ ...fieldStyle, margin: 0, width: 200 }}>
          <option value="">Tous salariés</option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="u-input" style={{ ...fieldStyle, margin: 0, width: 150 }}>
          <option value="">Tous statuts</option>
          <option value="submitted">Soumises</option>
          <option value="validated">Validées</option>
          <option value="returned">Retournées</option>
        </select>

        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          {department && position && (
            <button onClick={() => setShowJd(v => !v)} className="btn-c btn-c-ghost btn-c-sm">
              <Settings2 size={13} />Fiche de poste {showJd ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <button onClick={() => selectedEmployee ? setShowForm(true) : toast.error("Sélectionnez un salarié précis d'abord.")} className="btn-c btn-c-primary btn-c-sm">
            <Plus size={13} />Nouvelle tâche
          </button>
        </div>
      </div>

      {showJd && department && position && (
        <JobDescriptionPanel department={department} position={position} onChanged={() => {
          if (selectedEmployee) {
            api.get(`/api/rh/job-descriptions/by-position?department=${encodeURIComponent(department)}&position=${encodeURIComponent(position)}`).then(setJd).catch(() => {});
          }
        }} />
      )}

      <SectionLabel>{tasks.length} tâche{tasks.length !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : tasks.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<ClipboardCheck size={28} strokeWidth={1.7} />} text="Aucune tâche pour ces filtres." /></div>
      ) : (
        tasks.map(t => <TaskRow key={t.id} task={t} onChanged={loadTasks} />)
      )}
    </div>
  );
}
