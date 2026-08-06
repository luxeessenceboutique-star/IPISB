import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Wallet, AlertTriangle, ChevronLeft, ChevronRight, Users, Check,
  Pencil, Plus, Trash2, Banknote, Clock, Search, X, FileDown,
} from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";
import { useAuth } from "@/lib/auth";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

// ── Types ────────────────────────────────────────────────────────────────
type ClassSummary = {
  class_id: string; class_name: string; nb_students: number;
  total_budget: number; total_paye: number; total_reste: number;
  nb_en_retard: number; montant_retard: number;
};
type AlertRow = { class_id: string; class_name: string; student_id: string; full_name: string; reste: number; late_amount: number };
type Alerts = { items: AlertRow[]; total: number; montant_total: number };
type SearchHit = {
  class_id: string; class_name: string; student_id: string;
  full_name: string; enrollment_number: string | null; enrollment_status: string;
};
type StudentBrief = {
  class_id: string; class_name: string; student_id: string;
  full_name: string; enrollment_number: string | null; enrollment_status: string;
  total_paye: number; reste: number; alert: string; late_amount: number; late_behavior_count: number;
};
type MonthCol = { key: string; label: string };
type MonthCell = {
  paid: number; cumul_expected: number; cumul_paid: number; missing: number; credit: number; due: boolean;
  paid_late: boolean; late_days: number; deadline: string | null; paid_on_eff: string | null;
};
type StudentRow = {
  student_id: string; full_name: string; email: string | null;
  enrollment_number: string | null; enrollment_date: string | null; enrollment_status: string;
  payment_comment: string | null;
  monthly_fee: number; advance: number; annual_budget: number;
  by_month: Record<string, number>;
  month_detail: Record<string, MonthCell>;
  total_paye: number; expected_to_date: number; reste: number; late_amount: number; alert: string;
  due_day: number; grace_days: number; late_behavior_count: number; late_behavior_max_days: number;
  overdue_level: "rappel" | "danger" | "critique" | null; overdue_days: number;
};
type RawPayment = {
  id: string; student_id: string; period_key: string; period_month: string | null;
  amount: number; method: string | null; note: string | null; paid_on: string | null;
  reference?: string | null; comment?: string | null;
};
type ClassMatrix = {
  class_id: string; class_name: string; payment_start_month: string; installments_count: number;
  months: MonthCol[]; students: StudentRow[]; payments: RawPayment[];
};

const ENROLL: Record<string, { label: string; tone: string }> = {
  actif:    { label: "Actif",    tone: "chip-c-green" },
  abandon:  { label: "Abandon",  tone: "chip-c-red" },
  absent:   { label: "Absent",   tone: "chip-c-amber" },
  suspendu: { label: "Suspendu", tone: "chip-c-amber" },
  diplome:  { label: "Diplômé",  tone: "chip-c-blue" },
};
const ENROLL_OPTIONS = ["actif", "abandon", "absent", "suspendu", "diplome"];
const METHODS = ["espèce", "chèque", "virement", "autre"];

// États d'alerte de paiement (manque cumulé = total dû à ce jour − total payé)
const ALERT: Record<string, { tint: string; color: string; label: (v: string) => string }> = {
  retard:  { tint: "oklch(97% 0.03 25)",  color: "oklch(55% 0.18 25)",  label: v => `Manque ${v}` },
  rappel:  { tint: "oklch(98% 0.03 85)",  color: "oklch(58% 0.14 75)",  label: v => `Manque ${v}` },
  a_jour:  { tint: "transparent",         color: "oklch(55% 0.13 155)", label: () => "À jour" },
  abandon: { tint: "oklch(97% 0.005 160)", color: "oklch(48% 0.02 180)", label: () => "Abandon" },
};

// Retard échelonné sur le MOIS COURANT (temporel, distinct du manque d'argent).
// Gradation : rappel (échéance dépassée) → danger (J+5) → critique (J+10).
const OVERDUE: Record<"rappel" | "danger" | "critique", { bg: string; fg: string; bd: string; label: (d: number) => string }> = {
  rappel:   { bg: "oklch(96% 0.035 85)",  fg: "oklch(52% 0.11 72)",  bd: "oklch(88% 0.06 82)",  label: () => "Échéance dépassée" },
  danger:   { bg: "oklch(95% 0.055 55)",  fg: "oklch(52% 0.15 48)",  bd: "oklch(85% 0.09 55)",  label: d => `Retard ${d} j` },
  critique: { bg: "oklch(95.5% 0.035 25)", fg: "oklch(49% 0.17 25)", bd: "oklch(85% 0.09 25)",  label: d => `Critique · ${d} j` },
};

const num = (v: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v || 0);

// ── Filtre par statut de paiement (matrice d'une promo) ─────────────────────
type PayFilter = "all" | "a_jour" | "rappel" | "retard" | "late" | "unpaid" | "abandon";
const FILTERS: { key: PayFilter; label: string }[] = [
  { key: "all",     label: "Tous" },
  { key: "a_jour",  label: "À jour" },
  { key: "unpaid",  label: "Rien payé" },
  { key: "rappel",  label: "Rappel" },
  { key: "retard",  label: "En retard" },
  { key: "late",    label: "Payé en retard" },
  { key: "abandon", label: "Abandon" },
];

/** Un élève correspond-il au filtre de statut choisi ?
 *  - a_jour  : à jour (mensualités couvertes à ce jour)
 *  - unpaid  : aucun versement encaissé
 *  - rappel  : mensualité du mois courant encore à régler
 *  - retard  : manque d'argent sur des mois clos
 *  - late    : au moins un mois réglé en retard (comportement)
 *  - abandon : inscription abandonnée */
type Classifiable = { enrollment_status: string; alert: string; late_behavior_count: number; total_paye: number };
function matchFilter(s: Classifiable, f: PayFilter): boolean {
  if (f === "all") return true;
  if (f === "abandon") return s.enrollment_status === "abandon";
  if (s.enrollment_status === "abandon") return false;  // exclu des autres filtres
  switch (f) {
    case "a_jour": return s.alert === "a_jour";
    case "rappel": return s.alert === "rappel";
    case "retard": return s.alert === "retard";
    case "late":   return s.late_behavior_count > 0;
    case "unpaid": return (s.total_paye || 0) <= 0.5;
    default:       return true;
  }
}

/** Date du jour au format ISO (YYYY-MM-DD), en heure locale. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Code couleur du comportement de paiement (par cellule / mois) ────────────
type Tone = "green" | "yellow" | "orange" | "red";
const TONE_BG: Record<Tone, string> = {
  green:  "oklch(93% 0.06 155)",
  yellow: "oklch(94% 0.09 100)",
  orange: "oklch(92% 0.1 62)",
  red:    "oklch(92% 0.07 25)",
};
const TONE_BORDER: Record<Tone, string> = {
  green:  "oklch(78% 0.12 155)",
  yellow: "oklch(80% 0.12 100)",
  orange: "oklch(75% 0.14 62)",
  red:    "oklch(72% 0.16 25)",
};
const TONE_LABEL: Record<Tone, string> = {
  green:  "Payé (mois réglé)",
  yellow: "Payé en partie / en retard",
  orange: "Mois sauté mais compensé",
  red:    "Manque d'argent",
};

// Comportement « payé en retard » : le mois est bien couvert, mais réglé après
// l'échéance tolérée (due_day + grace_days). L'argent est là → on garde une base
// « payée », et on SIGNALE le retard en ambre DOUX (tokens design system, chip-c-amber)
// pour tracer le comportement sans alourdir la colonne.
const LATE_BG = "oklch(96.5% 0.03 88)";     // fond ambre très doux
const LATE_BAR = "oklch(80% 0.1 75)";       // liseré gauche subtil
const LATE_TEXT = "oklch(52% 0.12 65)";     // texte/icône ambre lisible (contraste AA)

/** Date ISO → « JJ/MM » (fr). Renvoie "" si vide/invalide. */
function fmtDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Comportement de paiement d'un mois échu, pour un élève.
 *  - vert  : la mensualité du mois est réglée (montant ≥ mensualité)
 *  - jaune : payé, mais partiellement (retard / paiement incomplet ce mois)
 *  - orange: rien payé ce mois MAIS l'élève est globalement à jour → compensé ailleurs
 *  - rouge : rien (ou pas assez) payé ET l'élève est globalement en retard → argent manquant */
function monthTone(due: boolean, monthly: number, paid: number, behind: boolean): Tone | null {
  if (!due || monthly <= 0) return null;
  if (paid + 0.5 >= monthly) return "green";
  if (paid > 0) return "yellow";
  return behind ? "red" : "orange";
}

function LegendSwatch({ tone }: { tone: Tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 15, height: 15, borderRadius: 4, background: TONE_BG[tone], border: `1px solid ${TONE_BORDER[tone]}`, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: PAL.muted }}>{TONE_LABEL[tone]}</span>
    </span>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: PAL.muted, borderBottom: `1px solid ${PAL.line}`, whiteSpace: "nowrap", background: PAL.paper };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: PAL.ink, borderBottom: `1px solid ${PAL.line}`, whiteSpace: "nowrap" };
const tdNum: React.CSSProperties = { ...td, fontFamily: mono, textAlign: "right" };
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const fieldStyle: React.CSSProperties = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" };

// ── Helpers UI ─────────────────────────────────────────────────────────────
function Backdrop({ children, width = 480 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 25, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{children}</h2>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={labelStyle}>{label}</span>{children}</label>;
}

function EditableNumber({ value, onChange, min = 0, max, width = 74 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; width?: number;
}) {
  const [val, setVal] = useState(String(value));
  useEffect(() => { setVal(String(value)); }, [value]);
  const changed = (parseFloat(val) || 0) !== value;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <input
        type="number" min={min} max={max} step="any" value={val}
        onChange={e => {
          setVal(e.target.value);
          let n = parseFloat(e.target.value);
          if (isNaN(n)) n = min;
          if (n < min) n = min;
          if (max != null && n > max) n = max;
          onChange(n);
        }}
        style={{ width, padding: "5px 7px", border: `1px solid ${PAL.line}`, borderRadius: 7, fontFamily: mono, fontSize: 12.5, textAlign: "right", color: PAL.ink, background: changed ? "oklch(98% 0.03 85)" : PAL.paper, outline: "none" }}
      />
    </span>
  );
}

// ── Modal : versements d'un mois (voir / ajouter / supprimer) ───────────────
function PaymentModal({ classId, student, months, payments, defaultMonth, onClose, onSaved, canDelete = true }: {
  classId: string; student: StudentRow; months: MonthCol[]; payments: RawPayment[];
  defaultMonth?: string; onClose: () => void; onSaved: () => void; canDelete?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const fallback = defaultMonth || (months[0]?.key ?? "");
  const [form, setForm] = useState({ period_month: fallback, amount: String(student.monthly_fee || ""), method: "espèce", note: "", paid_on: todayISO(), comment: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const existing = payments.filter(p => p.student_id === student.student_id && p.period_key === form.period_month);

  async function submit() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) { toast.error("Montant invalide."); return; }
    if (!form.period_month) { toast.error("Choisissez un mois."); return; }
    if (!form.paid_on) { toast.error("Saisissez la date de règlement."); return; }
    setBusy(true);
    try {
      const res = await api.post("/api/accounting/tuition/payment", {
        class_id: classId, student_id: student.student_id,
        period_month: `${form.period_month}-01`,
        amount, method: form.method, note: form.note || null,
        paid_on: form.paid_on || null,
        comment: form.comment || null,
      });
      // Caissier : la saisie part en validation N+1 (le backend renvoie {pending:true}).
      if (res?.pending) toast.success("Envoyé pour validation N+1 ✅");
      else {
        toast.success("Paiement enregistré — facture générée.");
        // Génère la facture dès l'enregistrement (chemin admin : le versement existe).
        if (res?.id) {
          api.download(`/api/accounting/tuition/payment/${res.id}/facture`, `Facture_${res.reference ?? res.id}.pdf`)
            .catch((e: any) => toast.error(e?.message ?? "Facture indisponible."));
        }
      }
      onSaved(); onClose();
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'enregistrement."); }
    finally { setBusy(false); }
  }

  async function del(id: string) {
    setBusy(true);
    try {
      await api.delete(`/api/accounting/tuition/payment/${id}`);
      toast.success("Versement supprimé.");
      onSaved();  // recharge la matrice → la liste ci-dessous se met à jour
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de la suppression."); }
    finally { setBusy(false); }
  }

  return (
    <Backdrop width={460}>
      <H2>Versements — {months.find(m => m.key === form.period_month)?.label ?? ""}</H2>
      <p style={{ fontSize: 13, color: PAL.muted, margin: "-8px 0 16px" }}>{student.full_name}</p>
      <Field label="Mois">
        <select value={form.period_month} onChange={e => set("period_month", e.target.value)} style={fieldStyle}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </Field>

      {existing.length > 0 && (
        <div style={{ margin: "-4px 0 16px", border: `1px solid ${PAL.line}`, borderRadius: 10, overflow: "hidden" }}>
          {existing.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${PAL.line}` }}>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink, minWidth: 68, textAlign: "right" }}>{num(p.amount)}</span>
              <span style={{ flex: 1, fontSize: 12, color: PAL.muted }}>
                {p.reference && <span style={{ fontFamily: mono, color: PAL.ink }}>{p.reference}</span>}
                {p.reference ? " · " : ""}{p.method || "—"}{p.paid_on ? ` · ${p.paid_on}` : ""}{p.note ? ` · ${p.note}` : ""}{p.comment ? ` · ${p.comment}` : ""}
              </span>
              <button onClick={() => api.download(`/api/accounting/tuition/payment/${p.id}/facture`, `Facture_${p.reference ?? p.id}.pdf`).catch((e: any) => toast.error(e?.message ?? "Erreur lors du téléchargement."))}
                title="Télécharger la facture"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: "pointer", color: PAL.ink }}>
                <FileDown size={14} />
              </button>
              {canDelete && (
                <button onClick={() => del(p.id)} disabled={busy} title="Supprimer ce versement"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: "pointer", color: "oklch(55% 0.18 25)" }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: PAL.muted, margin: "4px 0 8px" }}>Ajouter un versement</div>
      <Field label="Montant (MAD)">
        <input type="number" min="0" step="any" value={form.amount} onChange={e => set("amount", e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} autoFocus />
      </Field>
      <Field label="Mode de règlement">
        <select value={form.method} onChange={e => set("method", e.target.value)} style={fieldStyle}>
          {METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>
      </Field>
      <Field label="Date de règlement *">
        <input type="date" required value={form.paid_on} onChange={e => set("paid_on", e.target.value)} style={fieldStyle} />
      </Field>
      <Field label="Note (optionnel)">
        <input type="text" value={form.note} onChange={e => set("note", e.target.value)} style={fieldStyle} placeholder="ex. rattrapage juillet" />
      </Field>
      <Field label="Commentaire (optionnel)">
        <textarea value={form.comment} onChange={e => set("comment", e.target.value)} rows={2} style={{ ...fieldStyle, resize: "vertical" }} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Fermer</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Ajouter"}</button>
      </div>
    </Backdrop>
  );
}

// ── Modal : plan de paiement d'un élève ────────────────────────────────────
function PlanModal({ classId, student, months, onClose, onSaved }: {
  classId: string; student: StudentRow; months: number; onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    monthly_fee: String(student.monthly_fee || ""),
    advance: String(student.advance || ""),
    enrollment_number: student.enrollment_number || "",
    enrollment_date: student.enrollment_date || "",
    enrollment_status: student.enrollment_status || "actif",
    payment_comment: student.payment_comment || "",
    due_day: String(student.due_day || 1),
    grace_days: String(student.grace_days ?? 9),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Mensualité SAISIE (standardisée) ; budget de scolarité = Mensualité × nb de mois.
  // Les frais d'inscription sont un poste séparé (hors budget).
  const monthly = parseFloat(form.monthly_fee) || 0;
  const advance = parseFloat(form.advance) || 0;
  const budget = monthly * months;

  async function submit() {
    setBusy(true);
    try {
      await api.patch(`/api/accounting/tuition/class/${classId}/student/${student.student_id}/plan`, {
        monthly_fee: monthly,
        advance,
        enrollment_date: form.enrollment_date || null,
        enrollment_status: form.enrollment_status,
        payment_comment: form.payment_comment || null,
        due_day: Math.min(28, Math.max(1, parseInt(form.due_day) || 1)),
        grace_days: Math.min(27, Math.max(0, parseInt(form.grace_days) || 0)),
      });
      toast.success("Plan de paiement mis à jour.");
      onSaved(); onClose();
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'enregistrement."); }
    finally { setBusy(false); }
  }

  return (
    <Backdrop width={480}>
      <H2>Plan de paiement — {student.full_name}</H2>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Mensualité (MAD)"><input type="number" min="0" step="any" value={form.monthly_fee} onChange={e => set("monthly_fee", e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} placeholder="ex. 2000" autoFocus /></Field></div>
        <div style={{ flex: 1 }}><Field label="Frais d'inscription (optionnel)"><input type="number" min="0" step="any" value={form.advance} onChange={e => set("advance", e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} placeholder="0" /></Field></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "-4px 0 16px", padding: "10px 14px", borderRadius: 10, background: "oklch(97% 0.02 175)", border: `1px solid ${PAL.line}` }}>
        <span style={{ fontSize: 12.5, color: PAL.muted }}>Budget scolarité <span style={{ fontSize: 11 }}>(Mensualité × {months} mois — hors frais d'inscription)</span></span>
        <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: "var(--pal-primary)" }}>{fmtMAD(budget)}</span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="N° d'inscription"><input type="text" value={form.enrollment_number || "—"} readOnly style={{ ...fieldStyle, fontFamily: mono, color: PAL.ink, background: "oklch(97% 0.01 175)", cursor: "default" }} tabIndex={-1} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Date d'inscription"><input type="date" value={form.enrollment_date} onChange={e => set("enrollment_date", e.target.value)} style={fieldStyle} /></Field></div>
      </div>
      <Field label="Statut">
        <select value={form.enrollment_status} onChange={e => set("enrollment_status", e.target.value)} style={fieldStyle}>
          {ENROLL_OPTIONS.map(s => <option key={s} value={s}>{ENROLL[s].label}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Jour d'échéance">
            <input type="number" min="1" max="28" value={form.due_day} onChange={e => set("due_day", e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} placeholder="1" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Tolérance (jours)">
            <input type="number" min="0" max="27" value={form.grace_days} onChange={e => set("grace_days", e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} placeholder="9" />
          </Field>
        </div>
      </div>
      <p style={{ fontSize: 12, color: PAL.muted, margin: "-8px 0 14px", lineHeight: 1.45 }}>
        La mensualité est due le <strong style={{ color: PAL.ink }}>{Math.min(28, Math.max(1, parseInt(form.due_day) || 1))}</strong> du mois.
        Au-delà du <strong style={{ color: PAL.ink }}>{Math.min(28, Math.max(1, parseInt(form.due_day) || 1)) + (Math.min(27, Math.max(0, parseInt(form.grace_days) || 0)))}</strong> (tolérance incluse), le paiement est compté <span style={{ color: LATE_TEXT, fontWeight: 700 }}>en retard</span>.
      </p>
      <Field label="Commentaire"><input type="text" value={form.payment_comment} onChange={e => set("payment_comment", e.target.value)} style={fieldStyle} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Backdrop>
  );
}

// ── Composant principal ────────────────────────────────────────────────────
export function AccountingTuitionTracking({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isCashier = roles.includes("cashier");
  // Droits : admin = édition complète ; caissier = saisie de paiements (→ validation N+1) ;
  // comptable (readOnly) = consultation seule.
  const canEdit = isAdmin && !readOnly;                 // plans, statut, commentaires, suppression
  const canPay = (isAdmin || isCashier) && !readOnly;   // saisir un versement

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [alerts, setAlerts] = useState<Alerts>({ items: [], total: 0, montant_total: 0 });
  const [loading, setLoading] = useState(true);
  const [showAlerts, setShowAlerts] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<ClassMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Recherche globale d'un élève (nom ou n° d'inscription), tous promos confondus.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);  // student_id à mettre en évidence

  // Filtre global par statut de paiement (page d'accueil, toutes promos confondues).
  const [filter, setFilter] = useState<PayFilter>("all");
  const [allStudents, setAllStudents] = useState<StudentBrief[]>([]);

  const [payFor, setPayFor] = useState<{ student: StudentRow; month?: string } | null>(null);
  const [planFor, setPlanFor] = useState<StudentRow | null>(null);
  const [pendingPlans, setPendingPlans] = useState<Record<string, { advance?: number; monthly_fee?: number; payment_comment?: string; due_day?: number; grace_days?: number }>>({});

  async function loadOverview() {
    try {
      const [cls, al, studs] = await Promise.all([
        api.get("/api/accounting/tuition/classes"),
        api.get("/api/accounting/tuition/alerts"),
        api.get("/api/accounting/tuition/students"),
      ]);
      setClasses(cls ?? []);
      setAlerts(al ?? { items: [], total: 0, montant_total: 0 });
      setAllStudents(studs?.items ?? []);
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement."); }
    finally { setLoading(false); }
  }

  async function loadMatrix(classId: string) {
    setMatrixLoading(true);
    try { setMatrix(await api.get(`/api/accounting/tuition/class/${classId}`)); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement de la promo."); }
    finally { setMatrixLoading(false); }
  }

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { if (selected) loadMatrix(selected); else setMatrix(null); setFilter("all"); }, [selected]);

  // Recherche débouncée (300 ms) : nom ou numéro d'inscription.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await api.get(`/api/accounting/tuition/search?q=${encodeURIComponent(term)}`);
        setHits(res?.items ?? []);
      } catch { setHits([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  /** Ouvre la promo d'un élève (résultat de recherche ou de filtre) et le met en évidence. */
  function openHit(hit: { class_id: string; student_id: string }) {
    setQuery("");
    setHits([]);
    setHighlight(hit.student_id);
    setSelected(hit.class_id);
  }

  // Fait défiler jusqu'à l'élève mis en évidence, puis retire le surlignage après 4 s.
  const highlightRow = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!highlight || !matrix || !highlightRow.current) return;
    highlightRow.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
  }, [highlight, matrix]);

  function reloadAll() {
    loadOverview();
    if (selected) loadMatrix(selected);
  }

  async function setStatus(student: StudentRow, status: string) {
    if (!selected) return;
    try {
      await api.patch(`/api/accounting/tuition/class/${selected}/student/${student.student_id}/plan`, { enrollment_status: status });
      reloadAll();
    } catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  function updateDraftPlan(studentId: string, field: "advance" | "monthly_fee" | "due_day" | "grace_days", value: number) {
    setPendingPlans(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [field]: value },
    }));
  }

  function updateDraftComment(studentId: string, value: string) {
    setPendingPlans(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), payment_comment: value },
    }));
  }

  async function saveAllPendingPlans() {
    if (!selected) return;
    const updates = Object.entries(pendingPlans)
      .filter(([, plan]) => Object.keys(plan).length > 0)
      .map(([student_id, plan]) => {
        const payload: Record<string, unknown> = { student_id, ...plan };
        if (typeof payload.payment_comment === "string") {
          payload.payment_comment = (payload.payment_comment as string).trim() || null;
        }
        return payload;
      });
    if (updates.length === 0) return;
    try {
      await api.patch(`/api/accounting/tuition/class/${selected}/students/plan`, { updates });
      toast.success(`${updates.length} modification(s) enregistrée(s).`);
      setPendingPlans({});
      reloadAll();
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'enregistrement groupé."); }
  }

  // Filtre global (page d'accueil) : élèves correspondants + compteur par filtre.
  const filteredStudents = allStudents.filter(s => matchFilter(s, filter));
  const counts: Record<PayFilter, number> = FILTERS.reduce((acc, f) => {
    acc[f.key] = allStudents.filter(s => matchFilter(s, f.key)).length;
    return acc;
  }, {} as Record<PayFilter, number>);

  // ── Vue liste des promos ──────────────────────────────────────────────
  if (!selected) {
    return (
      <div style={{ fontFamily: sans }}>
        {/* Bandeau d'alertes */}
        {alerts.total > 0 && (
          <div className="dash-card anim-rise" style={{ padding: "16px 20px", marginBottom: 18, border: "1px solid oklch(70% 0.14 25)", background: "oklch(97% 0.03 25)" }}>
            <button onClick={() => setShowAlerts(s => !s)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
              <AlertTriangle size={20} strokeWidth={1.9} style={{ color: "oklch(55% 0.18 25)", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: PAL.ink }}>{alerts.total} élève{alerts.total > 1 ? "s" : ""} en retard de paiement</div>
                <div style={{ fontSize: 12.5, color: PAL.muted }}>Montant à recouvrer : <strong style={{ fontFamily: mono, color: "oklch(50% 0.18 25)" }}>{fmtMAD(alerts.montant_total)}</strong></div>
              </div>
              <ChevronRight size={18} style={{ color: PAL.muted, transform: showAlerts ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showAlerts && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${PAL.line}`, paddingTop: 8 }}>
                {alerts.items.map(a => (
                  <button key={`${a.class_id}:${a.student_id}`} onClick={() => setSelected(a.class_id)} className="row-c" style={{ width: "100%", gap: 10, cursor: "pointer", background: "transparent", border: 0, textAlign: "left" }}>
                    <span style={{ flex: 1, fontSize: 13, color: PAL.ink }}>{a.full_name} <span style={{ color: PAL.muted }}>· {a.class_name}</span></span>
                    <span className="chip-c chip-c-red">Retard {fmtMAD(a.late_amount)}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: PAL.muted }}>Reste {fmtMAD(a.reste)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recherche globale : nom ou n° d'inscription, tous promos confondus */}
        <div style={{ position: "relative", marginBottom: 18 }}>
          <div style={{ position: "relative" }}>
            <Search size={16} strokeWidth={2} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted, pointerEvents: "none" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un élève par nom ou n° d'inscription…"
              style={{ width: "100%", padding: "12px 40px", border: `1px solid ${PAL.line}`, borderRadius: 12, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" }}
            />
            {query && (
              <button onClick={() => setQuery("")} title="Effacer" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: 0, background: "transparent", cursor: "pointer", color: PAL.muted }}>
                <X size={15} />
              </button>
            )}
          </div>
          {query.trim().length >= 2 && (
            <div className="anim-fade" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 12, boxShadow: "0 18px 44px rgba(0,0,0,.12)", overflow: "hidden", maxHeight: 360, overflowY: "auto" }}>
              {searching ? (
                <div style={{ padding: "14px 16px", fontSize: 13, color: PAL.muted }}>Recherche…</div>
              ) : hits.length === 0 ? (
                <div style={{ padding: "14px 16px", fontSize: 13, color: PAL.muted }}>Aucun élève trouvé.</div>
              ) : hits.map(h => (
                <button key={`${h.class_id}:${h.student_id}`} onClick={() => openHit(h)} className="row-c"
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: 0, borderBottom: `1px solid ${PAL.line}`, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ flex: 1, fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>{h.full_name}</span>
                  {h.enrollment_number && <span style={{ fontFamily: mono, fontSize: 12, color: PAL.muted }}>{h.enrollment_number}</span>}
                  <span className={`chip-c ${ENROLL[h.enrollment_status]?.tone ?? ""}`} style={{ fontSize: 11 }}>{ENROLL[h.enrollment_status]?.label ?? h.enrollment_status}</span>
                  <span style={{ fontSize: 12, color: PAL.muted }}>{h.class_name}</span>
                  <ChevronRight size={15} style={{ color: PAL.muted, flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtres globaux par statut de paiement (toutes promos confondues) */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: PAL.muted, marginRight: 2 }}>Filtrer :</span>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999,
                  border: `1px solid ${active ? "var(--pal-primary)" : PAL.line}`,
                  background: active ? "var(--pal-primary)" : PAL.paper,
                  color: active ? "#fff" : PAL.ink,
                  fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                }}>
                {f.label}
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, padding: "0 6px", borderRadius: 999, background: active ? "rgba(255,255,255,.22)" : "oklch(95% 0.01 175)", color: active ? "#fff" : PAL.muted }}>{counts[f.key]}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => api.download("/api/accounting/tuition/students/export/xlsx", "Paiements_etudiants.xlsx").catch((e: any) => toast.error(e?.message ?? "Erreur lors de l'export."))}
            className="btn-c btn-c-sm btn-c-soft"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Télécharger les paiements étudiants (Excel)"
          >
            <Wallet size={13} strokeWidth={1.8} /> Export Excel
          </button>
        </div>

        {filter !== "all" ? (
          // ── Liste des élèves correspondant au filtre, toutes promos confondues ──
          <>
            <SectionLabel>{FILTERS.find(f => f.key === filter)?.label} — {filteredStudents.length} élève{filteredStudents.length > 1 ? "s" : ""}</SectionLabel>
            {loading ? (
              <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 220, borderRadius: 999 }} /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="dash-card"><EmptyHint icon={<Users size={28} strokeWidth={1.7} />} text="Aucun élève ne correspond à ce filtre." /></div>
            ) : (
              <div className="dash-card" style={{ padding: 0, overflow: "hidden", marginTop: 6 }}>
                {filteredStudents.map(s => (
                  <button key={`${s.class_id}:${s.student_id}`} onClick={() => openHit(s)} className="row-c"
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "transparent", border: 0, borderBottom: `1px solid ${PAL.line}`, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flex: 1, fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>{s.full_name}</span>
                    {s.enrollment_number && <span style={{ fontFamily: mono, fontSize: 12, color: PAL.muted }}>{s.enrollment_number}</span>}
                    {s.alert === "retard" && <span className="chip-c chip-c-red" style={{ fontSize: 11 }}>Manque {fmtMAD(s.late_amount)}</span>}
                    {s.alert === "rappel" && <span className="chip-c chip-c-amber" style={{ fontSize: 11 }}>Rappel</span>}
                    {s.late_behavior_count > 0 && <span className="chip-c chip-c-amber" style={{ fontSize: 11 }}>{s.late_behavior_count} payé(s) en retard</span>}
                    <span style={{ fontFamily: mono, fontSize: 12, color: s.reste > 0 ? "oklch(50% 0.18 25)" : PAL.muted }}>Reste {fmtMAD(s.reste)}</span>
                    <span style={{ fontSize: 12, color: PAL.muted, minWidth: 90, textAlign: "right" }}>{s.class_name}</span>
                    <ChevronRight size={15} style={{ color: PAL.muted, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          // ── Grille des promos (vue par défaut) ──
          <>
            <SectionLabel>Suivi de scolarité — choisir une promo</SectionLabel>
            {loading ? (
              <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 220, borderRadius: 999 }} /></div>
            ) : classes.length === 0 ? (
              <div className="dash-card"><EmptyHint icon={<Wallet size={28} strokeWidth={1.7} />} text="Aucune promo. Créez d'abord une classe et inscrivez des élèves." /></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 6 }}>
                {classes.map(c => (
                  <button key={c.class_id} onClick={() => setSelected(c.class_id)} className="dash-card anim-rise" style={{ padding: "18px 20px", textAlign: "left", cursor: "pointer", border: `1px solid ${PAL.line}`, background: PAL.paper }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: PAL.ink }}>{c.class_name}</span>
                      {c.nb_en_retard > 0 && <span className="chip-c chip-c-red">{c.nb_en_retard} en retard</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PAL.muted, marginBottom: 8 }}>
                      <Users size={13} strokeWidth={1.8} /> {c.nb_students} élève{c.nb_students > 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: PAL.muted }}>Encaissé</span>
                      <span style={{ fontFamily: mono, color: PAL.ink }}>{fmtMAD(c.total_paye)} <span style={{ color: PAL.muted }}>/ {fmtMAD(c.total_budget)}</span></span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ color: PAL.muted }}>Reste à percevoir</span>
                      <span style={{ fontFamily: mono, color: c.total_reste > 0 ? "oklch(50% 0.18 25)" : PAL.ink }}>{fmtMAD(c.total_reste)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Vue matrice d'une promo ───────────────────────────────────────────
  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setSelected(null)} className="btn-c btn-c-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={16} /> Promos
        </button>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: 0, flex: 1 }}>
          {matrix?.class_name ?? "…"}
        </h2>
        {canEdit && (
          <button onClick={saveAllPendingPlans} disabled={Object.keys(pendingPlans).length === 0} className="btn-c btn-c-primary">
            Enregistrer les modifications
          </button>
        )}
      </div>

      {matrixLoading || !matrix ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 220, borderRadius: 999 }} /></div>
      ) : matrix.students.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Users size={28} strokeWidth={1.7} />} text="Aucun élève inscrit dans cette promo. Inscrivez des élèves depuis la fiche de la classe." /></div>
      ) : (
        <>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, rowGap: 8, marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "oklch(98% 0.004 160)", border: `1px solid ${PAL.line}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: PAL.ink }}>Comportement de paiement (par mois) :</span>
          <LegendSwatch tone="green" />
          <LegendSwatch tone="yellow" />
          <LegendSwatch tone="orange" />
          <LegendSwatch tone="red" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: 4, background: LATE_BG, border: `1px solid ${LATE_BAR}`, flexShrink: 0 }}>
              <Clock size={9} strokeWidth={2.6} style={{ color: LATE_TEXT }} />
            </span>
            <span style={{ fontSize: 12, color: PAL.muted }}>Payé en retard (comportement)</span>
          </span>
        </div>
        <div className="dash-card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: "sticky", left: 0, zIndex: 1 }}>Statut</th>
                <th style={th}>Élève</th>
                <th style={th}>N° insc.</th>
                <th style={thNum}>Frais d'inscription</th>
                <th style={thNum}>Mensualité</th>
                <th style={thNum} title="Jour d'échéance de la mensualité (1–28). Le paiement est compté en retard au-delà de ce jour + la tolérance.">Éch.</th>
                <th style={thNum}>Budget</th>
                <th style={thNum}>Total payé</th>
                <th style={thNum}>Reste</th>
                {matrix.months.map(m => <th key={m.key} style={thNum}>{m.label}</th>)}
                <th style={th}>Commentaire</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {matrix.students.map(s => {
                const faded = s.enrollment_status === "abandon";
                const isHi = s.student_id === highlight;   // élève ciblé par la recherche
                const stickyBg = isHi ? "oklch(96% 0.05 175)" : faded ? "oklch(97% 0.005 160)" : PAL.paper;
                const behind = !faded && s.late_amount > 0.5;   // globalement en retard (tolérance d'arrondi)
                const badge = (s.alert === "retard" || s.alert === "rappel") ? ALERT[s.alert] : null;
                return (
                  <tr key={s.student_id} ref={isHi ? highlightRow : undefined}
                      style={{ opacity: faded ? 0.7 : 1, background: isHi ? "oklch(97% 0.035 175)" : undefined, transition: "background .4s", boxShadow: isHi ? "inset 3px 0 0 var(--pal-primary)" : undefined }}>
                    <td style={{ ...td, position: "sticky", left: 0, background: stickyBg, zIndex: 1 }}>
                      {canEdit ? (
                        <select value={s.enrollment_status} onChange={e => setStatus(s, e.target.value)}
                          className={`chip-c ${ENROLL[s.enrollment_status]?.tone ?? ""}`}
                          style={{ border: 0, cursor: "pointer", fontFamily: sans, fontWeight: 600, fontSize: 11.5, padding: "3px 8px" }}>
                          {ENROLL_OPTIONS.map(o => <option key={o} value={o}>{ENROLL[o].label}</option>)}
                        </select>
                      ) : (
                        <span className={`chip-c ${ENROLL[s.enrollment_status]?.tone ?? ""}`} style={{ fontSize: 11.5, fontWeight: 600 }}>
                          {ENROLL[s.enrollment_status]?.label ?? s.enrollment_status}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{s.full_name}</div>
                      {(badge || (!faded && (s.late_behavior_count > 0 || s.overdue_level))) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                          {!faded && s.overdue_level && (() => {
                            const o = OVERDUE[s.overdue_level];
                            return (
                              <span
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: o.bg, color: o.fg, border: `1px solid ${o.bd}`, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}
                                title={`Mensualité du mois en cours non réglée. Échéance le ${s.due_day} du mois — ${s.overdue_days} j de retard${s.overdue_level === "critique" ? " (critique, ≥ 10 j)" : s.overdue_level === "danger" ? " (danger, ≥ 5 j)" : ""}.`}>
                                {s.overdue_level === "rappel"
                                  ? <Clock size={11} strokeWidth={2.4} />
                                  : <AlertTriangle size={11} strokeWidth={2.4} />}
                                {o.label(s.overdue_days)}
                              </span>
                            );
                          })()}
                          {badge && (() => {
                            const soft = s.alert === "retard"
                              ? { bg: "oklch(95.5% 0.03 25)", fg: "oklch(50% 0.16 25)", bd: "oklch(88% 0.06 25)" }
                              : { bg: "oklch(96% 0.035 80)", fg: "oklch(52% 0.11 70)", bd: "oklch(88% 0.06 80)" };
                            return (
                              <span
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: soft.bg, color: soft.fg, border: `1px solid ${soft.bd}`, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}
                                title={s.alert === "retard"
                                  ? `Manque d'argent : il manque ${fmtMAD(s.late_amount)} à ce jour (total payé < total dû sur les mois échus).`
                                  : `Mensualité du mois en cours non réglée : il manque ${fmtMAD(s.late_amount)}.`}>
                                <Banknote size={11} strokeWidth={2.2} /> Manque {fmtMAD(s.late_amount)}
                              </span>
                            );
                          })()}
                          {!faded && s.late_behavior_count > 0 && (
                            <span
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: LATE_BG, color: LATE_TEXT, border: `1px solid ${LATE_BAR}`, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`Comportement : ${s.late_behavior_count} mois réglé(s) en retard (jusqu'à ${s.late_behavior_max_days} j de retard). Échéance le ${s.due_day} du mois + ${s.grace_days} j de tolérance.`}>
                              <Clock size={11} strokeWidth={2.4} /> {s.late_behavior_count} en retard
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{s.enrollment_number || "—"}</td>
                    <td style={tdNum}>{canEdit ? <EditableNumber value={pendingPlans[s.student_id]?.advance ?? s.advance} onChange={v => updateDraftPlan(s.student_id, "advance", v)} /> : num(s.advance)}</td>
                    <td style={tdNum}>{canEdit ? <EditableNumber value={pendingPlans[s.student_id]?.monthly_fee ?? s.monthly_fee} onChange={v => updateDraftPlan(s.student_id, "monthly_fee", v)} /> : num(s.monthly_fee)}</td>
                    <td style={tdNum} title={`Jour d'échéance : le ${pendingPlans[s.student_id]?.due_day ?? s.due_day} du mois (+ ${s.grace_days} j de tolérance). Au-delà, le mois est compté en retard.`}>
                      {canEdit ? <EditableNumber value={pendingPlans[s.student_id]?.due_day ?? s.due_day} onChange={v => updateDraftPlan(s.student_id, "due_day", Math.round(v))} min={1} max={28} width={46} /> : (s.due_day || "—")}
                    </td>
                    <td style={{ ...tdNum, color: PAL.muted }} title="Budget scolarité = Mensualité × nb de mois (hors frais d'inscription)">
                      {num((pendingPlans[s.student_id]?.monthly_fee ?? s.monthly_fee) * matrix.installments_count)}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{num(s.total_paye)}</td>
                    <td style={{ ...tdNum, fontWeight: s.reste > 0 && !faded ? 700 : 400, color: faded ? PAL.muted : s.reste > 0 ? "oklch(50% 0.18 25)" : s.reste < 0 ? "oklch(48% 0.13 155)" : PAL.muted }}
                        title={faded ? undefined : s.reste > 0 ? `Reste à percevoir : ${fmtMAD(s.reste)}` : s.reste < 0 ? `Trop-perçu (crédit) : ${fmtMAD(-s.reste)}` : "Soldé"}>{num(s.reste)}</td>
                    {matrix.months.map(m => {
                      const cell = s.month_detail?.[m.key];
                      const amt = cell?.paid ?? (s.by_month[m.key] || 0);
                      const missing = !faded && cell?.due ? cell.missing : 0;
                      const credit = !faded && cell?.due ? cell.credit : 0;
                      const tone = monthTone(!faded && !!cell?.due, s.monthly_fee || 0, amt, behind);
                      // Comportement : mois couvert MAIS réglé après l'échéance tolérée.
                      const late = !faded && !!cell?.paid_late;
                      // Cases épurées : montant seul. Le détail reste visible au survol.
                      const parts = [
                        tone ? TONE_LABEL[tone] + "." : null,
                        late
                          ? `Réglé en retard de ${cell!.late_days} j — échéance le ${fmtDay(cell!.deadline)}, encaissé le ${fmtDay(cell!.paid_on_eff)}.`
                          : null,
                        missing > 0
                          ? `Il manque ${num(missing)} MAD à ce jour (cumul reporté).`
                          : credit > 0
                          ? `Avance de ${num(credit)} MAD (trop-perçu reporté sur les mois suivants).`
                          : null,
                      ].filter(Boolean);
                      const clickHint = canPay ? (amt > 0 ? "Cliquer pour voir / ajouter un versement." : "Cliquer pour saisir un paiement.") : "";
                      const title = `${parts.length ? parts.join(" ") + " " : ""}${clickHint}`.trim();
                      // En retard : fond ambre TRÈS doux + fin liseré (l'argent est là,
                      // seul le comportement est signalé — pas de masse de couleur).
                      const cellBg = late ? LATE_BG : tone ? TONE_BG[tone] : undefined;
                      const cellBar = late ? LATE_BAR : tone ? TONE_BORDER[tone] : undefined;
                      return (
                        <td key={m.key} style={{ ...tdNum, cursor: canPay ? "pointer" : "default", lineHeight: 1.2, background: cellBg, boxShadow: cellBar ? `inset 3px 0 0 ${cellBar}` : undefined }} onClick={canPay ? () => setPayFor({ student: s, month: m.key }) : undefined} title={title}>
                          {amt > 0 ? (
                            <span style={{ color: PAL.ink, display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                              {late
                                ? <Clock size={11} strokeWidth={2.6} style={{ color: LATE_TEXT, flexShrink: 0 }} />
                                : tone === "green" && <Check size={11} strokeWidth={3.2} style={{ color: TONE_BORDER.green, flexShrink: 0 }} />}
                              {num(amt)}
                            </span>
                          ) : tone === "orange" ? (
                            <span title="Mois sauté mais compensé par un autre mois" style={{ color: TONE_BORDER.orange, fontWeight: 800, fontSize: 11 }}>compensé</span>
                          ) : <span style={{ color: PAL.line }}>+</span>}
                          {late && (
                            <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 700, letterSpacing: ".02em", color: LATE_TEXT }} title={`Réglé en retard de ${cell!.late_days} j (échéance le ${fmtDay(cell!.deadline)})`}>retard {cell!.late_days} j</div>
                          )}
                          {missing > 0 && tone !== "orange" && (
                            <div style={{ display: "inline-block", marginTop: 3, padding: "1px 6px", borderRadius: 6, background: "oklch(100% 0 0 / .75)", border: "1px solid oklch(72% 0.16 25)", fontSize: 10, fontWeight: 800, color: "oklch(48% 0.18 25)" }} title={`Manque d'argent : il manque ${num(missing)} MAD à ce jour (cumul reporté)`}>−{num(missing)}</div>
                          )}
                          {missing === 0 && credit > 0 && (
                            <div style={{ display: "inline-block", marginTop: 3, padding: "1px 6px", borderRadius: 6, background: "oklch(100% 0 0 / .75)", border: "1px solid oklch(75% 0.13 155)", fontSize: 10, fontWeight: 800, color: "oklch(45% 0.13 155)" }} title={`Avance de ${num(credit)} MAD (trop-perçu reporté sur les mois suivants)`}>+{num(credit)}</div>
                          )}
                        </td>
                      );
                    })}
                    <td style={td}>
                      {canEdit ? (() => {
                        const draft = pendingPlans[s.student_id]?.payment_comment;
                        const changed = draft !== undefined && (draft.trim() || null) !== ((s.payment_comment ?? "").trim() || null);
                        return (
                          <input
                            type="text"
                            value={draft ?? s.payment_comment ?? ""}
                            onChange={e => updateDraftComment(s.student_id, e.target.value)}
                            placeholder="Ajouter une note…"
                            title="Note libre sur cet élève (motif de retard, arrangement, etc.). Cliquez sur « Enregistrer les modifications » pour sauvegarder."
                            style={{
                              width: 190, padding: "6px 9px",
                              border: `1px solid ${changed ? "var(--pal-primary)" : PAL.line}`,
                              borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink,
                              background: changed ? "oklch(98% 0.03 85)" : PAL.paper, outline: "none",
                            }}
                          />
                        );
                      })() : (
                        <span style={{ fontSize: 12.5, color: PAL.muted }}>{s.payment_comment || "—"}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {canPay && <button onClick={() => setPayFor({ student: s })} title="Ajouter un paiement" style={iconBtn}><Plus size={14} /></button>}
                        {canEdit && <button onClick={() => setPlanFor(s)} title="Modifier le plan" style={iconBtn}><Pencil size={14} /></button>}
                        {!canPay && !canEdit && <span style={{ color: PAL.line }}>—</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: PAL.paper, fontWeight: 700 }}>
                <td style={{ ...td, position: "sticky", left: 0, background: PAL.paper }} colSpan={3}>Totaux ({matrix.students.length})</td>
                <td style={tdNum}>{num(sum(matrix.students, s => s.advance))}</td>
                <td style={tdNum} />
                <td style={tdNum} />
                <td style={tdNum}>{num(sum(matrix.students, s => s.annual_budget))}</td>
                <td style={tdNum}>{num(sum(matrix.students, s => s.total_paye))}</td>
                <td style={tdNum}>{num(sum(matrix.students, s => s.reste))}</td>
                {matrix.months.map(m => <td key={m.key} style={tdNum}>{num(sum(matrix.students, s => s.by_month[m.key] || 0))}</td>)}
                <td style={td}></td>
                <td style={td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}

      {payFor && matrix && (
        <PaymentModal classId={matrix.class_id} student={payFor.student} months={matrix.months} payments={matrix.payments}
          defaultMonth={payFor.month} onClose={() => setPayFor(null)} onSaved={reloadAll} canDelete={canEdit} />
      )}
      {planFor && matrix && (
        <PlanModal classId={matrix.class_id} student={planFor} months={matrix.installments_count}
          onClose={() => setPlanFor(null)} onSaved={reloadAll} />
      )}
    </div>
  );

}

const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: "pointer", color: PAL.muted };

function sum(rows: StudentRow[], pick: (s: StudentRow) => number): number {
  return rows.reduce((acc, s) => acc + (pick(s) || 0), 0);
}
