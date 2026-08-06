import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, PiggyBank, Trash2, Pencil, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const MONTHS =["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

type Category = { id: string; name: string };
type Budget = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  year: number;
  month: number | null;
  amount: number;
  reference?: string | null;
  comment?: string | null;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function periodLabel(b: Budget) {
  return b.month == null ? "Année entière" : MONTHS[b.month - 1];
}

function FormModal({ categories, defaultYear, editing, onClose, onSaved }: {
  categories: Category[]; defaultYear: number; editing: Budget | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    category_id: editing?.category_id ?? "",
    year: String(editing?.year ?? defaultYear),
    scope: editing == null ? "year" : editing.month == null ? "year" : "month",
    month: String(editing?.month ?? 1),
    amount: editing ? String(editing.amount) : "0",
    comment: editing?.comment ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.category_id) { toast.error("La catégorie est requise."); return; }
    setBusy(true);
    const payload = {
      category_id: form.category_id,
      year: parseInt(form.year, 10),
      month: form.scope === "month" ? parseInt(form.month, 10) : null,
      amount: parseFloat(form.amount) || 0,
      comment: form.comment || null,
    };
    try {
      if (editing) await api.patch(`/api/accounting/budgets/${editing.id}`, payload);
      else await api.post("/api/accounting/budgets", payload);
      toast.success(editing ? "Budget modifié !" : "Budget créé !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur : un budget existe peut-être déjà pour cette période.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 460, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
            {editing ? "Modifier le budget" : "Nouveau budget"}
          </h2>
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 0, lineHeight: 0 }}><X size={20} /></button>
        </div>

        <label style={labelStyle}>Catégorie *</label>
        <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Choisir —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Année</label>
            <select value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="u-input" style={fieldStyle}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Période</label>
            <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="year">Année entière</option>
              <option value="month">Mois précis</option>
            </select>
          </div>
        </div>

        {form.scope === "month" && (
          <>
            <label style={labelStyle}>Mois</label>
            <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="u-input" style={fieldStyle}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </>
        )}

        <label style={labelStyle}>Montant prévu (MAD)</label>
        <input type="number" min="0" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le budget"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountingBudgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [modal, setModal] = useState<{ open: boolean; editing: Budget | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try {
      const data: Budget[] = await api.get(`/api/accounting/budgets?year=${year}`);
      setBudgets(data ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    api.get("/api/accounting/categories").then(setCategories).catch(() => {});
  }, []);

  async function remove(b: Budget) {
    if (!window.confirm(`Supprimer ce budget (${b.category_name || "?"} · ${periodLabel(b)}) ?`)) return;
    try {
      await api.delete(`/api/accounting/budgets/${b.id}`);
      toast.success("Budget supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalBudget = budgets.reduce((sum, b) => sum + (b.amount || 0), 0);

  return (
    <div>
      {modal.open && (
        <FormModal categories={categories} defaultYear={year} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          {YEARS.map(y => <option key={y} value={y}>Exercice {y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouveau budget
        </button>
      </div>

      <SectionLabel action={<span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: "var(--pal-primary-deep)" }}>{fmtMAD(totalBudget)}</span>}>
        Budget total {year} — {budgets.length} ligne{budgets.length !== 1 ? "s" : ""}
      </SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : budgets.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<PiggyBank size={28} strokeWidth={1.7} />} text={`Aucun budget défini pour ${year}.`} />
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {budgets.map(b => (
            <div key={b.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                <PiggyBank size={18} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{b.category_name || "Sans catégorie"}</div>
                {b.reference && <div style={{ fontFamily: mono, fontSize: 10.5, color: PAL.muted, marginTop: 2 }}>{b.reference}</div>}
                <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>{periodLabel(b)} {b.year}</div>
              </div>
              <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(b.amount)}</span>
              <button onClick={() => setModal({ open: true, editing: b })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
              <button onClick={() => remove(b)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
