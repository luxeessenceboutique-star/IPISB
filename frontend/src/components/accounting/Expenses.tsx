import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Receipt, Trash2, ChevronLeft, ChevronRight, Pencil, Upload, Download, FileText, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
const PAYMENT_METHODS = ["Virement", "Chèque", "Espèces", "Carte bancaire", "Prélèvement"];

type Category = { id: string; name: string };
type Supplier = { id: string; company_name: string };
type Expense = {
  id: string;
  title: string;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  description: string | null;
};
type Attachment = { id: string; kind: string; file_name: string; file_type: string; file_size: number; created_at: string };

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const ATTACHMENT_KINDS = [
  { value: "invoice", label: "Facture" },
  { value: "receipt", label: "Reçu" },
  { value: "document", label: "Autre document" },
];

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function FormModal({ categories, suppliers, editing, onClose, onSaved }: {
  categories: Category[]; suppliers: Supplier[]; editing: Expense | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    category_id: editing?.category_id ?? "",
    supplier_id: editing?.supplier_id ?? "",
    amount: editing ? String(editing.amount) : "0",
    expense_date: editing?.expense_date ?? new Date().toISOString().slice(0, 10),
    payment_method: editing?.payment_method ?? "",
    description: editing?.description ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.title.trim()) { toast.error("Le libellé est requis."); return; }
    setBusy(true);
    const payload = {
      title: form.title,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      amount: parseFloat(form.amount) || 0,
      expense_date: form.expense_date,
      payment_method: form.payment_method || null,
      description: form.description || null,
    };
    try {
      if (editing) await api.patch(`/api/accounting/expenses/${editing.id}`, payload);
      else await api.post("/api/accounting/expenses", payload);
      toast.success(editing ? "Dépense modifiée !" : "Dépense créée !");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 500, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          {editing ? "Modifier la dépense" : "Nouvelle dépense"}
        </h2>

        <label style={labelStyle}>Libellé *</label>
        <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Aucune —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fournisseur</label>
            <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="">— Aucun —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Montant (MAD)</label>
            <input type="number" min="0" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Mode de paiement</label>
        <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Non précisé —</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la dépense"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ expense, onClose, onChanged }: { expense: Expense; onClose: () => void; onChanged: () => void }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadKind, setUploadKind] = useState("invoice");
  const [uploading, setUploading] = useState(false);

  async function loadAttachments() {
    setLoading(true);
    try {
      const detail = await api.get(`/api/accounting/expenses/${expense.id}`);
      setAttachments(detail.attachments ?? []);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAttachments(); }, [expense.id]);

  async function uploadFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", uploadKind);
      const res = await fetch(`${BASE}/api/accounting/expenses/${expense.id}/attachments`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Document ajouté.");
      loadAttachments();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  async function download(a: Attachment) {
    try {
      const res = await api.get(`/api/accounting/expenses/attachments/${a.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  async function removeAttachment(a: Attachment) {
    if (!window.confirm(`Supprimer « ${a.file_name} » ?`)) return;
    try {
      await api.delete(`/api/accounting/expenses/attachments/${a.id}`);
      toast.success("Document supprimé.");
      loadAttachments();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function removeExpense() {
    if (!window.confirm(`Supprimer la dépense « ${expense.title} » et ses documents ?`)) return;
    try {
      await api.delete(`/api/accounting/expenses/${expense.id}`);
      toast.success("Dépense supprimée.");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  return (
    <div className="dash-card" style={{ flex: "1 1 340px", minWidth: 0, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink }}>{expense.title}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={removeExpense} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
            <Trash2 size={15} strokeWidth={1.7} />
          </button>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 16 }}>
        <Row label="Catégorie" value={expense.category_name} />
        <Row label="Fournisseur" value={expense.supplier_name} />
        <Row label="Montant" value={fmtMAD(expense.amount)} />
        <Row label="Date" value={new Date(expense.expense_date).toLocaleDateString("fr-FR")} />
        <Row label="Mode de paiement" value={expense.payment_method} />
      </div>

      <div style={{ height: 1, background: PAL.line, margin: "4px 0 16px" }} />

      <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 10 }}>
        Documents
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={uploadKind} onChange={e => setUploadKind(e.target.value)} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, background: PAL.paper }}>
          {ATTACHMENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <label className="btn-c btn-c-sm btn-c-ghost" style={{ cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
          <Upload size={13} strokeWidth={1.7} />
          {uploading ? "Envoi…" : "Ajouter (PDF/JPG/PNG, 20 Mo max)"}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
          />
        </label>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 40, borderRadius: 8 }} />
      ) : attachments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "16px 0", color: PAL.muted, fontSize: 13 }}>Aucun document.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${PAL.line}`, background: "var(--pal-pale)" }}>
              <FileText size={14} strokeWidth={1.7} style={{ color: "var(--pal-primary)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{a.file_name}</div>
                <div style={{ fontSize: 10.5, color: PAL.muted }}>{ATTACHMENT_KINDS.find(k => k.value === a.kind)?.label ?? a.kind} · {(a.file_size / 1024).toFixed(0)} Ko</div>
              </div>
              <button onClick={() => download(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Télécharger">
                <Download size={14} strokeWidth={1.7} />
              </button>
              <button onClick={() => removeAttachment(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
                <Trash2 size={13} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--pal-muted)" }}>{label}</span>
      <span style={{ color: "var(--pal-ink)", fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

export function AccountingExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing: Expense | null }>({ open: false, editing: null });
  const [selected, setSelected] = useState<Expense | null>(null);

  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (categoryId) params.set("category_id", categoryId);
      const res = await api.get(`/api/accounting/expenses?${params.toString()}`);
      setExpenses(res.items ?? []);
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
  }, [q, categoryId, page]);

  useEffect(() => {
    api.get("/api/accounting/categories").then(setCategories).catch(() => {});
    api.get("/api/accounting/suppliers").then((d: Supplier[]) => setSuppliers(d ?? [])).catch(() => {});
  }, []);

  async function remove(e: Expense) {
    if (!window.confirm(`Supprimer la dépense « ${e.title} » ?`)) return;
    try {
      await api.delete(`/api/accounting/expenses/${e.id}`);
      toast.success("Dépense supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modal.open && (
        <FormModal categories={categories} suppliers={suppliers} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input type="text" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} placeholder="Rechercher une dépense…" className="u-input" style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <select value={categoryId} onChange={e => { setPage(1); setCategoryId(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle dépense
        </button>
      </div>

      <SectionLabel>{total} dépense{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : expenses.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Receipt size={28} strokeWidth={1.7} />} text="Aucune dépense trouvée." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div className="dash-card overflow-hidden">
              {expenses.map(e => (
                <div key={e.id} className="row-c flex-wrap" onClick={() => setSelected(e)} style={{ cursor: "pointer", background: selected?.id === e.id ? "var(--pal-pale)" : undefined }}>
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                    <Receipt size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{e.title}</div>
                    <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                      {e.category_name || "Sans catégorie"}{e.supplier_name ? ` · ${e.supplier_name}` : ""} · {new Date(e.expense_date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(e.amount)}</span>
                  <button onClick={(event) => { event.stopPropagation(); setModal({ open: true, editing: e }); }} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
                  <button onClick={(event) => { event.stopPropagation(); remove(e); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} strokeWidth={1.7} /></button>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} strokeWidth={1.7} /></button>
            </div>
          </div>

          {selected && (
            <DetailPanel expense={selected} onClose={() => setSelected(null)} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
