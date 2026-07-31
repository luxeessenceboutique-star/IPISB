import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Wallet, Trash2, ChevronLeft, ChevronRight, Download, Sparkles, CheckCircle2 } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const STATUS_LABEL: Record<string, string> = { draft: "Brouillon", validated: "Validé", paid: "Payé" };

export function fmtMAD(v: number | null | undefined) {
  return `${(v ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

type PayrollRecord = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  month: number;
  year: number;
  base_salary: number;
  bonuses: number;
  deductions: number;
  cnss: number;
  ir: number;
  net_salary: number;
  gross_salary: number;
  status: string;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function statusColor(status: string) {
  if (status === "paid") return "var(--pal-good)";
  if (status === "validated") return "var(--pal-primary)";
  return "var(--pal-muted)";
}

function FormModal({ employees, month, year, onClose, onSaved }: { employees: Employee[]; month: number; year: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ employee_id: "", month: String(month), year: String(year), base_salary: "", bonuses: "0", deductions: "0", notes: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    const base = parseFloat(form.base_salary);
    if (!base || base <= 0) { toast.error("Le salaire de base doit être positif."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/payroll", {
        employee_id: form.employee_id,
        month: parseInt(form.month, 10), year: parseInt(form.year, 10),
        base_salary: base,
        bonuses: parseFloat(form.bonuses) || 0,
        deductions: parseFloat(form.deductions) || 0,
        notes: form.notes || null,
      });
      toast.success("Fiche de paie créée !");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 460, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouvelle fiche de paie
        </h2>

        <label style={labelStyle}>Employé *</label>
        <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Sélectionner —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Mois</label>
            <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="u-input" style={fieldStyle}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Année</label>
            <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Salaire de base (MAD) *</label>
        <input type="number" min="0" step="any" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Primes (MAD)</label>
            <input type="number" min="0" step="any" value={form.bonuses} onChange={e => setForm(f => ({ ...f, bonuses: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Autres retenues (MAD)</label>
            <input type="number" min="0" step="any" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} className="u-input" style={{ ...fieldStyle, marginBottom: 24 }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : "Créer la fiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RhPayroll() {
  const now = new Date();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), month: String(month), year: String(year) });
      const res = await api.get(`/api/rh/payroll?${params.toString()}`);
      setRecords(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month, year, page]);
  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

  async function generateBulk() {
    setGenerating(true);
    try {
      const res = await api.post(`/api/rh/payroll/generate-bulk?month=${month}&year=${year}`, undefined);
      toast.success(`${res.created} fiche(s) générée(s), ${res.skipped} déjà existante(s).`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la génération.");
    } finally {
      setGenerating(false);
    }
  }

  async function markPaid(r: PayrollRecord) {
    try {
      await api.patch(`/api/rh/payroll/${r.id}`, { status: "paid" });
      toast.success("Fiche marquée comme payée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  async function downloadPdf(r: PayrollRecord) {
    try {
      await api.download(`/api/rh/payroll/${r.id}/pdf`, `Bulletin_Paie_${r.year}_${r.month}_${(r.employee_name || "employe").replace(/\s+/g, "_")}.pdf`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  async function remove(r: PayrollRecord) {
    if (!window.confirm("Supprimer cette fiche de paie ?")) return;
    try {
      await api.delete(`/api/rh/payroll/${r.id}`);
      toast.success("Fiche supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modalOpen && <FormModal employees={employees} month={month} year={year} onClose={() => setModalOpen(false)} onSaved={load} />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={month} onChange={e => { setPage(1); setMonth(parseInt(e.target.value, 10)); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => { setPage(1); setYear(parseInt(e.target.value, 10) || now.getFullYear()); }} className="u-input" style={{ width: 90, padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }} />
        <button type="button" onClick={generateBulk} disabled={generating} className="btn-c btn-c-ghost" style={{ opacity: generating ? 0.6 : 1 }}>
          <Sparkles size={14} strokeWidth={1.7} />{generating ? "Génération…" : "Générer la paie du mois"}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle fiche
        </button>
      </div>

      <SectionLabel>{total} fiche{total !== 1 ? "s" : ""} de paie</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : records.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Wallet size={28} strokeWidth={1.7} />} text="Aucune fiche de paie pour cette période." />
        </div>
      ) : (
        <>
          <div className="dash-card overflow-hidden">
            {records.map(r => (
              <div key={r.id} className="row-c flex-wrap">
                <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                  <Wallet size={18} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{r.employee_name || "—"}</div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                    {MONTHS[r.month - 1]} {r.year} · Base {fmtMAD(r.base_salary)}
                  </div>
                </div>
                <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(r.net_salary)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: statusColor(r.status), background: "var(--pal-pale)" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                {r.status !== "paid" && (
                  <button onClick={() => markPaid(r)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-good)" }} title="Marquer comme payé"><CheckCircle2 size={16} strokeWidth={1.7} /></button>
                )}
                <button onClick={() => downloadPdf(r)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Télécharger le bulletin"><Download size={15} strokeWidth={1.7} /></button>
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
