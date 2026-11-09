import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, TrendingUp, Trash2, ChevronLeft, ChevronRight, Pencil, Wallet, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Plus Jakarta Sans", system-ui, sans-serif';
const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", submitted: "Soumise", acknowledged: "Validée" };
const REVIEW_TYPES = [
  { key: "monthly", label: "Mensuelle" },
  { key: "semestrial", label: "Semestrielle" },
  { key: "annual", label: "Annuelle" },
  { key: "custom", label: "Personnalisée" },
] as const;
type ReviewType = (typeof REVIEW_TYPES)[number]["key"];
export const REVIEW_TYPE_LABEL: Record<string, string> = { monthly: "Mensuelle", semestrial: "Semestrielle", annual: "Annuelle", custom: "Personnalisée" };

/** "2026-10-01/2026-10-10" → "01/10/2026 → 10/10/2026" ; les autres périodes restent telles quelles. */
export function fmtPeriod(p: string): string {
  if (!p.includes("/")) return p;
  return p.split("/").map(d => d.split("-").reverse().join("/")).join(" → ");
}
const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export type Review = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  review_type: ReviewType;
  period: string;
  score: number | null;
  feedback: string | null;
  objectives: string | null;
  achievements: string | null;
  improvements: string | null;
  status: string;
  task_count: number | null;
  bonus_suggested: number | null;
  bonus_decided: number | null;
  payroll_record_id: string | null;
  evolution: number | null;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function fmtMAD(v: number | null | undefined) {
  return `${(v ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

/** Compose/décompose la période selon le type — mensuelle "YYYY-MM",
 * semestrielle "YYYY-S1"/"YYYY-S2", annuelle "YYYY" — pour fiabiliser le
 * calcul de l'évolution (annuelle) et l'application de la prime (mensuelle)
 * côté backend, qui parsent ce format. */
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

/** Calendrier de sélection de jours : 1er clic = début, 2e clic = fin (inversés
 * si besoin) ; un 3e clic recommence. Période stockée "AAAA-MM-JJ/AAAA-MM-JJ". */
function RangeCalendar({ period, setPeriod }: { period: string; setPeriod: (p: string) => void }) {
  const [a0, b0] = period.includes("/") ? period.split("/") : [isoDay(new Date()), isoDay(new Date())];
  const [start, setStart] = useState(a0);
  const [end, setEnd] = useState<string | null>(b0);
  const first = new Date(`${a0}T00:00:00`);
  const [cur, setCur] = useState(new Date(first.getFullYear(), first.getMonth(), 1));
  const todayIso = isoDay(new Date());

  function pick(d: string) {
    if (end !== null) { setStart(d); setEnd(null); return; }   // nouvelle sélection
    const [s, e] = d < start ? [d, start] : [start, d];
    setStart(s); setEnd(e); setPeriod(`${s}/${e}`);
  }
  const lead = (cur.getDay() + 6) % 7;
  const count = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(i + 1)}`)];
  const lo = start, hi = end ?? start;
  const nDays = Math.round((Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / 86_400_000) + 1;
  const arrow = { background: "none", border: 0, cursor: "pointer", color: PAL.ink, display: "flex", padding: 4 } as const;

  return (
    <div style={{ marginTop: 8, marginBottom: 16, border: `1px solid ${PAL.line}`, borderRadius: 12, padding: 12, background: PAL.paper }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" aria-label="Mois précédent" style={arrow} onClick={() => setCur(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: PAL.ink }}>{MONTHS[cur.getMonth()]} {cur.getFullYear()}</span>
        <button type="button" aria-label="Mois suivant" style={arrow} onClick={() => setCur(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
        {WEEK.map((w, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: PAL.muted, padding: "4px 0" }}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const inRange = d >= lo && d <= hi;
          const edge = d === lo || d === hi;
          return (
            <button key={d} type="button" onClick={() => pick(d)} style={{
              border: d === todayIso && !inRange ? "1px solid var(--pal-primary)" : 0, cursor: "pointer", fontFamily: sans, fontSize: 13, height: 34,
              fontWeight: edge ? 700 : 500, background: edge ? "var(--pal-primary)" : inRange ? "var(--pal-pale)" : "transparent",
              color: edge ? "#fff" : PAL.ink, borderRadius: edge ? 999 : inRange ? 0 : 999,
            }}>{Number(d.slice(8))}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: PAL.muted, fontFamily: sans }}>
        {end === null ? "Choisissez le dernier jour…" : `${fmtPeriod(`${lo}/${hi}`)} · ${nDays} jour${nDays > 1 ? "s" : ""}`}
      </div>
    </div>
  );
}

function periodPicker(type: ReviewType, period: string, setPeriod: (p: string) => void) {
  if (type === "custom") return <RangeCalendar period={period} setPeriod={setPeriod} />;
  return <PeriodCalendar type={type} period={period} setPeriod={setPeriod} />;
}

/** Sélecteur de période façon calendrier : navigation ‹ année › sans limite,
 * grille des 12 mois (mensuelle), deux semestres, ou grille d'années (annuelle). */
function PeriodCalendar({ type, period, setPeriod }: { type: ReviewType; period: string; setPeriod: (p: string) => void }) {
  const year = parseInt(period.split("-")[0], 10) || CURRENT_YEAR;
  const [view, setView] = useState(year);              // année affichée (mensuelle / semestrielle)
  const [pageStart, setPageStart] = useState(year - (year % 12)); // 1re année de la page (annuelle)
  const month = parseInt(period.split("-")[1], 10) || 0;
  const sem = period.split("-")[1] || "";

  const cell = (active: boolean, current: boolean) => ({
    padding: "10px 6px", borderRadius: 10, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? "transparent" : current ? "var(--pal-primary)" : PAL.line}`,
    background: active ? "var(--pal-primary)" : PAL.paper, color: active ? "#fff" : PAL.ink,
  } as const);
  const nav = (label: string, prev: () => void, next: () => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <button type="button" onClick={prev} aria-label="Précédent" style={{ background: "none", border: 0, cursor: "pointer", color: PAL.ink, display: "flex", padding: 4 }}><ChevronLeft size={18} /></button>
      <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: PAL.ink }}>{label}</span>
      <button type="button" onClick={next} aria-label="Suivant" style={{ background: "none", border: 0, cursor: "pointer", color: PAL.ink, display: "flex", padding: 4 }}><ChevronRight size={18} /></button>
    </div>
  );
  const box = { marginTop: 8, marginBottom: 16, border: `1px solid ${PAL.line}`, borderRadius: 12, padding: 12, background: PAL.paper } as const;

  if (type === "annual") {
    return (
      <div style={box}>
        {nav(`${pageStart} – ${pageStart + 11}`, () => setPageStart(p => p - 12), () => setPageStart(p => p + 12))}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {Array.from({ length: 12 }, (_, i) => pageStart + i).map(y => (
            <button key={y} type="button" onClick={() => setPeriod(String(y))} style={cell(y === year, y === CURRENT_YEAR)}>{y}</button>
          ))}
        </div>
      </div>
    );
  }
  if (type === "semestrial") {
    return (
      <div style={box}>
        {nav(String(view), () => setView(v => v - 1), () => setView(v => v + 1))}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {([["S1", "Semestre 1", "Janv. – Juin"], ["S2", "Semestre 2", "Juil. – Déc."]] as const).map(([k, l, r]) => (
            <button key={k} type="button" onClick={() => setPeriod(`${view}-${k}`)} style={cell(year === view && sem === k, false)}>
              {l}<div style={{ fontSize: 11, fontWeight: 400, opacity: .8 }}>{r}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const nowM = new Date().getMonth() + 1;
  return (
    <div style={box}>
      {nav(String(view), () => setView(v => v - 1), () => setView(v => v + 1))}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {MONTHS.map((m, i) => (
          <button key={m} type="button" onClick={() => setPeriod(`${view}-${String(i + 1).padStart(2, "0")}`)}
            style={cell(year === view && month === i + 1, view === CURRENT_YEAR && nowM === i + 1)}>{m}</button>
        ))}
      </div>
    </div>
  );
}

function defaultPeriod(type: ReviewType): string {
  const m = new Date().getMonth() + 1;
  if (type === "custom") { const t = isoDay(new Date()); return `${t}/${t}`; }
  if (type === "annual") return String(CURRENT_YEAR);
  if (type === "semestrial") return `${CURRENT_YEAR}-${m <= 6 ? "S1" : "S2"}`;
  return `${CURRENT_YEAR}-${String(m).padStart(2, "0")}`;
}

export function FormModal({ employees, fixedEmployeeId, editing, onClose, onSaved }: { employees?: Employee[]; fixedEmployeeId?: string; editing: Review | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    employee_id: fixedEmployeeId ?? editing?.employee_id ?? "",
    review_type: editing?.review_type ?? ("monthly" as ReviewType),
    period: editing?.period ?? defaultPeriod("monthly"),
    score: editing?.score ?? 12,
    feedback: editing?.feedback ?? "",
    objectives: editing?.objectives ?? "",
    achievements: editing?.achievements ?? "",
    improvements: editing?.improvements ?? "",
    status: editing?.status ?? "draft",
    task_count: editing?.task_count ?? null as number | null,
    bonus_suggested: editing?.bonus_suggested ?? null as number | null,
    bonus_decided: editing?.bonus_decided ?? null as number | null,
  });
  const [busy, setBusy] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  async function loadMonthlySummary() {
    if (!form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    const [yearStr, monthStr] = form.period.split("-");
    setLoadingSummary(true);
    try {
      const res = await api.get(`/api/rh/daily-tasks/monthly-summary?employee_id=${form.employee_id}&year=${yearStr}&month=${parseInt(monthStr, 10)}`);
      setForm(f => ({
        ...f, task_count: res.task_count, bonus_suggested: res.bonus_suggested,
        bonus_decided: f.bonus_decided ?? res.bonus_suggested,
        score: res.avg_note != null ? res.avg_note : f.score,
      }));
      toast.success(`${res.task_count} tâche(s) validée(s) ce mois — note moyenne ${res.avg_note ?? "—"}/20.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement du résumé.");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function submit() {
    if (!editing && !form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    if (!form.period.trim()) { toast.error("La période est requise."); return; }
    setBusy(true);
    try {
      const payload = {
        score: form.score, feedback: form.feedback || null, objectives: form.objectives || null,
        achievements: form.achievements || null, improvements: form.improvements || null, status: form.status,
      };
      if (editing) {
        await api.patch(`/api/rh/performance/${editing.id}`, { ...payload, bonus_decided: form.bonus_decided });
      } else {
        await api.post("/api/rh/performance", {
          employee_id: form.employee_id, review_type: form.review_type, period: form.period,
          task_count: form.task_count, bonus_suggested: form.bonus_suggested, bonus_decided: form.bonus_decided,
          ...payload,
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

  const isMonthly = (editing?.review_type ?? form.review_type) === "monthly";

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 540, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: 26, fontWeight: 700, color: PAL.ink, margin: "0 0 20px" }}>
          {editing ? "Modifier l'évaluation" : "Nouvelle évaluation"}
        </h2>

        {!editing && !fixedEmployeeId && (
          <>
            <label style={labelStyle}>Employé *</label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Sélectionner —</option>
              {(employees ?? []).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </>
        )}
        {!editing && (
          <>
            <label style={labelStyle}>Type d'évaluation</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 16 }}>
              {REVIEW_TYPES.map(rt => (
                <button key={rt.key} type="button"
                  onClick={() => setForm(f => ({ ...f, review_type: rt.key, period: defaultPeriod(rt.key) }))}
                  className={`chip-c ${form.review_type === rt.key ? "chip-c-blue" : ""}`}
                  style={{ cursor: "pointer", border: form.review_type === rt.key ? "none" : `1px solid ${PAL.line}` }}>
                  {rt.label}
                </button>
              ))}
            </div>
          </>
        )}

        <label style={labelStyle}>Période *</label>
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          {editing ? <div style={{ ...fieldStyle, marginTop: 0, marginBottom: 0, color: PAL.muted }}>{fmtPeriod(editing.period)}</div>
            : periodPicker(form.review_type, form.period, p => setForm(f => ({ ...f, period: p })))}
        </div>

        <label style={labelStyle}>Statut</label>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="draft">Brouillon</option>
          <option value="submitted">Soumise</option>
          <option value="acknowledged">Validée</option>
        </select>

        <label style={labelStyle}>Note / 20</label>
        <input type="number" min={0} max={20} step="any" value={form.score} onChange={e => setForm(f => ({ ...f, score: parseFloat(e.target.value) || 0 }))} className="u-input" style={fieldStyle} />

        {isMonthly && (
          <div style={{ background: "var(--pal-pale)", border: `1px dashed ${PAL.line}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".06em", textTransform: "uppercase" }}>
                Rendement du mois (tâches quotidiennes)
              </span>
              {!editing && (
                <button type="button" onClick={loadMonthlySummary} disabled={loadingSummary} className="btn-c btn-c-ghost btn-c-sm">
                  <RefreshCw size={12} className={loadingSummary ? "animate-spin" : ""} />Charger le résumé
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
              <div>Tâches validées : <strong>{form.task_count ?? "—"}</strong></div>
              <div>Prime suggérée : <strong>{form.bonus_suggested != null ? fmtMAD(form.bonus_suggested) : "—"}</strong></div>
            </div>
            <label style={{ ...labelStyle, marginTop: 10, display: "block" }}>Prime décidée (MAD) — modifiable</label>
            <input type="number" min={0} step="any" value={form.bonus_decided ?? ""} placeholder="Aucune"
              onChange={e => setForm(f => ({ ...f, bonus_decided: e.target.value === "" ? null : parseFloat(e.target.value) }))}
              className="u-input" style={{ ...fieldStyle, marginBottom: 0 }} />
          </div>
        )}

        <label style={labelStyle}>Objectifs</label>
        <textarea value={form.objectives} onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} rows={2} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Réalisations {form.review_type === "semestrial" ? "/ Projets" : ""}</label>
        <textarea value={form.achievements} onChange={e => setForm(f => ({ ...f, achievements: e.target.value }))} rows={2} className="u-input" style={fieldStyle}
          placeholder={form.review_type === "semestrial" ? "Projets menés, résultats à moyen/long terme…" : undefined} />

        <label style={labelStyle}>Axes d'amélioration</label>
        <textarea value={form.improvements} onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))} rows={2} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Commentaire général {form.review_type === "annual" ? "/ Conclusion" : ""}</label>
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
  const [typeFilter, setTypeFilter] = useState<ReviewType | "">("");
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Review | null }>({ open: false, editing: null });
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (typeFilter) params.set("review_type", typeFilter);
      const res = await api.get(`/api/rh/performance?${params.toString()}`);
      setReviews(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, typeFilter]);
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

  async function applyBonus(r: Review) {
    const amount = r.bonus_decided ?? r.bonus_suggested;
    if (amount == null) { toast.error("Aucun montant de prime à appliquer."); return; }
    if (!window.confirm(`Appliquer ${fmtMAD(amount)} de prime sur la fiche de paie de « ${r.employee_name} » (${r.period}) ?`)) return;
    setApplyingId(r.id);
    try {
      await api.post(`/api/rh/performance/${r.id}/apply-bonus`, {});
      toast.success("Prime appliquée sur la fiche de paie.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'application de la prime.");
    } finally {
      setApplyingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modal.open && (
        <FormModal employees={employees} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => { setTypeFilter(""); setPage(1); }}
            className={`chip-c ${typeFilter === "" ? "chip-c-blue" : ""}`} style={{ cursor: "pointer", border: typeFilter === "" ? "none" : `1px solid ${PAL.line}` }}>Toutes</button>
          {REVIEW_TYPES.map(rt => (
            <button key={rt.key} type="button" onClick={() => { setTypeFilter(rt.key); setPage(1); }}
              className={`chip-c ${typeFilter === rt.key ? "chip-c-blue" : ""}`} style={{ cursor: "pointer", border: typeFilter === rt.key ? "none" : `1px solid ${PAL.line}` }}>{rt.label}</button>
          ))}
        </div>
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
            {reviews.map(r => {
              const bonusAmount = r.bonus_decided ?? r.bonus_suggested;
              return (
                <div key={r.id} className="row-c flex-wrap">
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                    <TrendingUp size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{r.employee_name || "—"}</div>
                    <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>{REVIEW_TYPE_LABEL[r.review_type] ?? r.review_type} · {fmtPeriod(r.period)}</div>
                  </div>
                  {r.score != null && (
                    <span className="chip-c" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{r.score}/20</span>
                  )}
                  {r.review_type === "annual" && r.evolution != null && (
                    <span className={`chip-c ${r.evolution >= 0 ? "chip-c-green" : "chip-c-red"}`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {r.evolution >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {r.evolution >= 0 ? "+" : ""}{r.evolution}
                    </span>
                  )}
                  {r.review_type === "monthly" && r.task_count != null && (
                    <span className="chip-c">{r.task_count} tâche{r.task_count !== 1 ? "s" : ""}</span>
                  )}
                  {r.review_type === "monthly" && bonusAmount != null && bonusAmount > 0 && (
                    r.payroll_record_id ? (
                      <span className="chip-c chip-c-green">{fmtMAD(bonusAmount)} appliquée</span>
                    ) : (
                      <button onClick={() => applyBonus(r)} disabled={applyingId === r.id} className="btn-c btn-c-sm btn-c-soft" title="Appliquer sur la fiche de paie">
                        <Wallet size={12} />{applyingId === r.id ? "…" : `Appliquer ${fmtMAD(bonusAmount)}`}
                      </button>
                    )
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: "var(--pal-muted)", background: "var(--pal-pale)" }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <button onClick={() => setModal({ open: true, editing: r })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
                  <button onClick={() => remove(r)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
                </div>
              );
            })}
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
