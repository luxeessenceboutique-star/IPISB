import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, FileText, Trash2, ChevronLeft, ChevronRight, Pencil, AlertTriangle, Download, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

const STATUS_LABEL: Record<string, string> = { pending: "En attente", partially_paid: "Partiellement payé", paid: "Payé" };
const STATUS_TONE: Record<string, string> = { pending: "chip-c-amber", partially_paid: "chip-c-blue", paid: "chip-c-green" };
const RECEPTION_TONE: Record<string, string> = { pending: "chip-c-amber", partial: "chip-c-blue", received: "chip-c-green" };
const METHOD_LABEL: Record<string, string> = {
  ov_permanent: "OV permanent", ov_ponctuel: "OV ponctuel", cheque: "Chèque",
  versement: "Versement", espece: "Espèces", autre: "Autre",
};

type Supplier = { id: string; company_name: string };
type ClassOption = { id: string; name: string };
type StudentOption = { id: string; full_name: string | null; email: string | null };
type PurchaseOption = { id: string; purchase_number: string; title: string };
type Invoice = {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_id: string | null;
  purchase_number: string | null;
  class_id: string | null;
  student_id: string | null;
  class_name: string | null;
  student_name: string | null;
  invoice_date: string;
  due_date: string | null;
  amount: number;
  vat_percent: number;
  total_incl_vat: number;
  payment_status: string;
  payment_date: string | null;
  payment_method: string | null;
  reception_status: "pending" | "partial" | "received" | null;
  reception_status_label: string | null;
  reception_date: string | null;
  reference?: string | null;
  comment?: string | null;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const th: React.CSSProperties = { padding: "9px 12px", borderBottom: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: PAL.muted, background: "oklch(97% 0.008 170)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 12px", borderBottom: `1px solid ${PAL.line}`, fontSize: 12.5, color: PAL.ink, whiteSpace: "nowrap", verticalAlign: "middle" };

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleDateString("fr-FR") : "—";
}

function isOverdue(inv: Invoice) {
  return inv.payment_status !== "paid" && inv.due_date != null && inv.due_date < new Date().toISOString().slice(0, 10);
}

function FormModal({ suppliers, classes, purchases, editing, onClose, onSaved }: {
  suppliers: Supplier[]; classes: ClassOption[]; purchases: PurchaseOption[]; editing: Invoice | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    invoice_number: editing?.invoice_number ?? "",
    supplier_id: editing?.supplier_id ?? "",
    purchase_id: editing?.purchase_id ?? "",
    class_id: editing?.class_id ?? "",
    student_id: editing?.student_id ?? "",
    invoice_date: editing?.invoice_date ?? new Date().toISOString().slice(0, 10),
    due_date: editing?.due_date ?? "",
    amount: editing ? String(editing.amount) : "0",
    vat_percent: editing ? String(editing.vat_percent) : "20",
    payment_status: editing?.payment_status ?? "pending",
    payment_date: editing?.payment_date ?? "",
    payment_method: editing?.payment_method ?? "",
    comment: editing?.comment ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Charge les élèves de la classe sélectionnée (pour le sélecteur Élève).
  useEffect(() => {
    if (!form.class_id) { setStudents([]); return; }
    setStudentsLoading(true);
    api.get(`/api/classes/${form.class_id}/students`)
      .then((d: StudentOption[]) => setStudents(d ?? []))
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [form.class_id]);

  const amount = parseFloat(form.amount) || 0;
  const vat = parseFloat(form.vat_percent) || 0;
  const ttc = amount * (1 + vat / 100);

  async function submit() {
    if (!form.invoice_number.trim()) { toast.error("Le numéro de facture est requis."); return; }
    setBusy(true);
    const payload = {
      invoice_number: form.invoice_number,
      supplier_id: form.supplier_id || null,
      purchase_id: form.purchase_id || null,
      class_id: form.class_id || null,
      student_id: form.student_id || null,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      amount, vat_percent: vat,
      payment_status: form.payment_status,
      payment_date: form.payment_date || null,
      payment_method: form.payment_method || null,
      comment: form.comment || null,
    };
    try {
      if (editing) await api.patch(`/api/accounting/invoices/${editing.id}`, payload);
      else await api.post("/api/accounting/invoices", payload);
      toast.success(editing ? "Facture modifiée !" : "Facture créée !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 520, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
            {editing ? "Modifier la facture" : "Nouvelle facture"}
          </h2>
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 0, lineHeight: 0 }}><X size={20} /></button>
        </div>

        <label style={labelStyle}>Numéro de facture *</label>
        <input type="text" value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="FAC-2026-001" className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Fournisseur</label>
            <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Aucun —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>N° de commande</label>
            <select value={form.purchase_id} onChange={e => setForm(f => ({ ...f, purchase_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Aucune —</option>
              {purchases.map(p => <option key={p.id} value={p.id}>{p.purchase_number} — {p.title}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Classe (promo)</label>
            <select
              value={form.class_id}
              onChange={e => setForm(f => ({ ...f, class_id: e.target.value, student_id: "" }))}
              className="u-input" style={fieldStyle}
            >
              <option value="">— Aucune —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Élève</label>
            <select
              value={form.student_id}
              onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
              disabled={!form.class_id || studentsLoading}
              className="u-input" style={{ ...fieldStyle, opacity: !form.class_id ? 0.55 : 1 }}
            >
              <option value="">{!form.class_id ? "— Choisir une classe —" : studentsLoading ? "Chargement…" : "— Aucun —"}</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email || "—"}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Date de facture</label>
            <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Échéance</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Montant HT (MAD)</label>
            <input type="number" min="0" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>TVA (%)</label>
            <input type="number" min="0" step="any" value={form.vat_percent} onChange={e => setForm(f => ({ ...f, vat_percent: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13, color: PAL.muted, marginBottom: 16, padding: "10px 14px", background: "var(--pal-pale)", borderRadius: 10 }}>
          <span>Total TTC : <strong style={{ color: PAL.ink }}>{fmtMAD(ttc)}</strong></span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Statut de paiement</label>
            <select value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date de paiement</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Mode de paiement</label>
        <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Non précisé —</option>
          {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la facture"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountingInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOption[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing: Invoice | null }>({ open: false, editing: null });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (statusFilter) params.set("payment_status", statusFilter);
      const res = await api.get(`/api/accounting/invoices?${params.toString()}`);
      setInvoices(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter, page]);

  useEffect(() => {
    api.get("/api/accounting/suppliers").then((d: Supplier[]) => setSuppliers(d ?? [])).catch(() => {});
    api.get("/api/classes/all").then((d: ClassOption[]) => setClasses(d ?? [])).catch(() => {});
    api.get("/api/accounting/purchases?page_size=100&sort_by=purchase_date&sort_dir=desc")
      .then(r => setPurchases((r.items ?? []).map((p: any) => ({ id: p.id, purchase_number: p.purchase_number, title: p.title }))))
      .catch(() => {});
  }, []);

  async function remove(inv: Invoice) {
    if (!window.confirm(`Supprimer la facture « ${inv.invoice_number} » ?`)) return;
    try {
      await api.delete(`/api/accounting/invoices/${inv.id}`);
      toast.success("Facture supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modal.open && (
        <FormModal suppliers={suppliers} classes={classes} purchases={purchases} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input type="text" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} placeholder="Rechercher un n° de facture…" className="u-input" style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <select value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button
          type="button"
          onClick={() => api.download(`/api/accounting/invoices/export/xlsx?status=${statusFilter || "unpaid"}`, "Suivi_factures.xlsx").catch((e: any) => toast.error(e?.message ?? "Erreur lors de l'export."))}
          className="btn-c btn-c-soft"
          title="Télécharger le suivi des factures fournisseurs (Excel)"
        >
          <Download size={15} strokeWidth={1.7} />Export Excel
        </button>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle facture
        </button>
      </div>

      <SectionLabel>{total} facture{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<FileText size={28} strokeWidth={1.7} />} text="Aucune facture trouvée." />
        </div>
      ) : (
        <>
          <div className="dash-card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280 }}>
              <thead>
                <tr>
                  {["Date", "N° Facture", "Fournisseur", "Montant TTC", "N° Commande", "État réception", "État paiement", "Mode paiement", "Commentaire", ""].map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const overdue = isOverdue(inv);
                  return (
                    <tr key={inv.id}>
                      <td style={td}>{fmtDate(inv.invoice_date)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                          {inv.invoice_number}
                          {overdue && <span style={{ display: "inline-flex", color: "var(--pal-danger)" }} title="Échéance dépassée"><AlertTriangle size={12} strokeWidth={1.9} /></span>}
                        </div>
                        {inv.reference && <div style={{ fontFamily: mono, fontSize: 10, color: PAL.muted, marginTop: 2 }}>{inv.reference}</div>}
                        {(inv.class_name || inv.student_name) && (
                          <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {inv.class_name && <span className="chip-c chip-c-blue" style={{ fontSize: 10 }}>{inv.class_name}</span>}
                            {inv.student_name && <span className="chip-c chip-c-green" style={{ fontSize: 10 }}>{inv.student_name}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "normal", maxWidth: 180 }}>{inv.supplier_name || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmtMAD(inv.total_incl_vat)}</td>
                      <td style={{ ...td, fontFamily: mono, fontSize: 11.5 }}>{inv.purchase_number || "—"}</td>
                      <td style={td}>
                        {inv.reception_status ? (
                          <>
                            <span className={`chip-c ${RECEPTION_TONE[inv.reception_status] ?? ""}`}>{inv.reception_status_label}</span>
                            {inv.reception_date && <div style={{ fontSize: 10.5, color: PAL.muted, marginTop: 3 }}>{fmtDate(inv.reception_date)}</div>}
                          </>
                        ) : "—"}
                      </td>
                      <td style={td}>
                        <span className={`chip-c ${STATUS_TONE[inv.payment_status]}`}>{STATUS_LABEL[inv.payment_status]}</span>
                        {inv.payment_date && <div style={{ fontSize: 10.5, color: PAL.muted, marginTop: 3 }}>{fmtDate(inv.payment_date)}</div>}
                        {!inv.payment_date && inv.due_date && <div style={{ fontSize: 10.5, color: PAL.muted, marginTop: 3 }}>échéance {fmtDate(inv.due_date)}</div>}
                      </td>
                      <td style={td}>{inv.payment_method ? (METHOD_LABEL[inv.payment_method] ?? inv.payment_method) : "—"}</td>
                      <td style={{ ...td, whiteSpace: "normal", maxWidth: 200, color: PAL.muted }}>{inv.comment || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => setModal({ open: true, editing: inv })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
                          <button onClick={() => remove(inv)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
