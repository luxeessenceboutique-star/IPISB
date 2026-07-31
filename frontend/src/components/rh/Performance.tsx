import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, TrendingUp, Trash2, ChevronLeft, ChevronRight, Pencil, Star } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", submitted: "Soumise", acknowledged: "Validée" };

type Review = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  period: string;
  score: number | null;
  feedback: string | null;
  objectives: string | null;
  achievements: string | null;
  improvements: string | null;
  status: string;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function ScorePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ background: "none", border: 0, cursor: "pointer", padding: 2 }}>
          <Star size={22} strokeWidth={1.7} fill={n <= value ? "var(--pal-warn)" : "none"} color={n <= value ? "var(--pal-warn)" : PAL.line} />
        </button>
      ))}
    </div>
  );
}

function FormModal({ employees, editing, onClose, onSaved }: { employees: Employee[]; editing: Review | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    employee_id: editing?.employee_id ?? "",
    period: editing?.period ?? "",
    score: editing?.score ?? 3,
    feedback: editing?.feedback ?? "",
    objectives: editing?.objectives ?? "",
    achievements: editing?.achievements ?? "",
    improvements: editing?.improvements ?? "",
    status: editing?.status ?? "draft",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!editing && !form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    if (!form.period.trim()) { toast.error("La période est requise."); return; }
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/rh/performance/${editing.id}`, {
          score: form.score, feedback: form.feedback || null, objectives: form.objectives || null,
          achievements: form.achievements || null, improvements: form.improvements || null, status: form.status,
        });
      } else {
        await api.post("/api/rh/performance", {
          employee_id: form.employee_id, period: form.period, score: form.score,
          feedback: form.feedback || null, objectives: form.objectives || null,
          achievements: form.achievements || null, improvements: form.improvements || null, status: form.status,
        });
      }
      toast.success(editing ? "Évaluation modifiée !" : "Évaluation créée !");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 520, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          {editing ? "Modifier l'évaluation" : "Nouvelle évaluation"}
        </h2>

        {!editing && (
          <>
            <label style={labelStyle}>Employé *</label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Sélectionner —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Période *</label>
            <input type="text" placeholder="ex. 2026-T1" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} disabled={!!editing} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Statut</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="draft">Brouillon</option>
              <option value="submitted">Soumise</option>
              <option value="acknowledged">Validée</option>
            </select>
          </div>
        </div>

        <label style={labelStyle}>Score</label>
        <ScorePicker value={form.score} onChange={v => setForm(f => ({ ...f, score: v }))} />

        <label style={labelStyle}>Objectifs</label>
        <textarea value={form.objectives} onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} rows={2} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Réalisations</label>
        <textarea value={form.achievements} onChange={e => setForm(f => ({ ...f, achievements: e.target.value }))} rows={2} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Axes d'amélioration</label>
        <textarea value={form.improvements} onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))} rows={2} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Commentaire général</label>
        <textarea value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'évaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RhPerformance() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Review | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      const res = await api.get(`/api/rh/performance?${params.toString()}`);
      setReviews(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);
  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

  async function remove(r: Review) {
    if (!window.confirm(`Supprimer l'évaluation de « ${r.employee_name} » (${r.period}) ?`)) return;
    try {
      await api.delete(`/api/rh/performance/${r.id}`);
      toast.success("Évaluation supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modal.open && (
        <FormModal employees={employees} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle évaluation
        </button>
      </div>

      <SectionLabel>{total} évaluation{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : reviews.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<TrendingUp size={28} strokeWidth={1.7} />} text="Aucune évaluation trouvée." />
        </div>
      ) : (
        <>
          <div className="dash-card overflow-hidden">
            {reviews.map(r => (
              <div key={r.id} className="row-c flex-wrap">
                <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                  <TrendingUp size={18} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{r.employee_name || "—"}</div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>{r.period}</div>
                </div>
                {r.score != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={13} strokeWidth={1.7} fill={n <= r.score! ? "var(--pal-warn)" : "none"} color={n <= r.score! ? "var(--pal-warn)" : PAL.line} />
                    ))}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: "var(--pal-muted)", background: "var(--pal-pale)" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                <button onClick={() => setModal({ open: true, editing: r })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
                <button onClick={() => remove(r)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} strokeWidth={1.7} /></button>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} strokeWidth={1.7} /></button>
          </div>
        </>
      )}
    </div>
  );
}
