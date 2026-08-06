import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, ShoppingCart, Trash2, X, Upload, Download, FileText, ChevronLeft, ChevronRight, Check, Pencil } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

type Category = { id: string; name: string };
type Supplier = { id: string; company_name: string };
type Purchase = {
  id: string;
  purchase_number: string;
  title: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  vat_percent: number;
  total_incl_vat: number;
  currency: string;
  purchase_date: string;
  payment_status: "pending" | "partially_paid" | "paid";
  payment_method: string | null;
  notes: string | null;
  comment: string | null;
  purchase_request_id: string | null;
  valide_responsable_at: string | null;
  valide_comptable_at: string | null;
};
type Attachment = { id: string; kind: string; file_name: string; file_type: string; file_size: number; created_at: string };

const STATUS_LABEL: Record<string, string> = { pending: "En attente", partially_paid: "Partiellement payé", paid: "Payé" };
const STATUS_TONE: Record<string, string> = { pending: "", partially_paid: "chip-c-green", paid: "chip-c-green" };
const ATTACHMENT_KINDS = [
  { value: "quotation", label: "Devis" },
  { value: "invoice", label: "Facture" },
  { value: "receipt", label: "Reçu" },
  { value: "document", label: "Autre document" },
];

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const emptyForm = {
  title: "", description: "", category_id: "", supplier_id: "",
  quantity: "1", unit_price: "0", vat_percent: "20", currency: "MAD",
  purchase_date: new Date().toISOString().slice(0, 10),
  payment_status: "pending", payment_method: "", notes: "", comment: "",
};

function FormModal({ categories, suppliers, onClose, onSaved }: { categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const qty = parseFloat(form.quantity) || 0;
  const unitPrice = parseFloat(form.unit_price) || 0;
  const vat = parseFloat(form.vat_percent) || 0;
  const totalHT = qty * unitPrice;
  const totalTTC = totalHT * (1 + vat / 100);

  async function submit() {
    if (!form.title.trim()) { toast.error("Le titre est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/purchases", {
        title: form.title,
        description: form.description || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        quantity: qty,
        unit_price: unitPrice,
        vat_percent: vat,
        currency: form.currency,
        purchase_date: form.purchase_date,
        payment_status: form.payment_status,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        comment: form.comment || null,
      });
      toast.success("Achat créé !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 520, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouvel achat
        </h2>

        <label style={labelStyle}>Titre *</label>
        <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Quantité</label>
            <input type="number" min="0" step="any" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Prix unitaire</label>
            <input type="number" min="0" step="any" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>TVA (%)</label>
            <input type="number" min="0" step="any" value={form.vat_percent} onChange={e => setForm(f => ({ ...f, vat_percent: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: PAL.muted, marginBottom: 16, padding: "10px 14px", background: "var(--pal-pale)", borderRadius: 10 }}>
          <span>Total HT : <strong style={{ color: PAL.ink }}>{fmtMAD(totalHT)}</strong></span>
          <span>Total TTC : <strong style={{ color: PAL.ink }}>{fmtMAD(totalTTC)}</strong></span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Date d'achat</label>
            <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Statut de paiement</label>
            <select value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <label style={labelStyle}>Méthode de paiement</label>
        <input type="text" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} placeholder="Virement, chèque, espèces…" className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Création…" : "Créer l'achat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ purchase, onClose, onChanged }: { purchase: Purchase; onClose: () => void; onChanged: () => void }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadKind, setUploadKind] = useState("quotation");
  const [uploading, setUploading] = useState(false);

  // Phase 3 states for receptions
  const [receptions, setReceptions] = useState<any[]>([]);
  const [loadingReceptions, setLoadingReceptions] = useState(true);
  const [showAddReception, setShowAddReception] = useState(false);
  const [recForm, setRecForm] = useState({
    received_quantity: "1",
    quality_status: "conforme",
    comment: "",
  });
  const [savingReception, setSavingReception] = useState(false);

  // Édition d'une réception existante
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    quality_status: "conforme",
    comment: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadAttachments() {
    setLoading(true);
    try {
      const detail = await api.get(`/api/accounting/purchases/${purchase.id}`);
      setAttachments(detail.attachments ?? []);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadReceptions() {
    setLoadingReceptions(true);
    try {
      const res = await api.get(`/api/accounting/receptions?purchase_id=${purchase.id}`);
      setReceptions(res.items ?? []);
    } catch {
      setReceptions([]);
    } finally {
      setLoadingReceptions(false);
    }
  }

  useEffect(() => {
    loadAttachments();
    loadReceptions();
  }, [purchase.id]);

  async function uploadFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", uploadKind);
      const res = await fetch(`${BASE}/api/accounting/purchases/${purchase.id}/attachments`, {
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
      const res = await api.get(`/api/accounting/purchases/attachments/${a.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  async function removeAttachment(a: Attachment) {
    if (!window.confirm(`Supprimer « ${a.file_name} » ?`)) return;
    try {
      await api.delete(`/api/accounting/purchases/attachments/${a.id}`);
      toast.success("Document supprimé.");
      loadAttachments();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function removePurchase() {
    if (!window.confirm(`Supprimer l'achat « ${purchase.title} » et tous ses documents ?`)) return;
    try {
      await api.delete(`/api/accounting/purchases/${purchase.id}`);
      toast.success("Achat supprimé.");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function handleSaveReception() {
    const qty = parseFloat(recForm.received_quantity);
    if (isNaN(qty) || qty <= 0) { toast.error("La quantité reçue doit être supérieure à zéro."); return; }
    setSavingReception(true);
    try {
      await api.post("/api/accounting/receptions", {
        purchase_id: purchase.id,
        received_quantity: qty,
        quality_status: recForm.quality_status,
        comment: recForm.comment || null,
      });
      toast.success("Réception enregistrée !");
      setShowAddReception(false);
      setRecForm({
        received_quantity: "1",
        quality_status: "conforme",
        comment: "",
      });
      loadReceptions();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setSavingReception(false);
    }
  }

  function startEditReception(r: any) {
    setEditingRecId(r.id);
    setEditForm({
      quality_status: r.quality_status ?? "conforme",
      comment: r.comment ?? "",
    });
  }

  async function handleUpdateReception() {
    if (!editingRecId) return;
    setSavingEdit(true);
    try {
      await api.patch(`/api/accounting/receptions/${editingRecId}`, {
        quality_status: editForm.quality_status,
        comment: editForm.comment,
      });
      toast.success("Réception mise à jour.");
      setEditingRecId(null);
      loadReceptions();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la mise à jour.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteReception(id: string) {
    if (!window.confirm("Supprimer cette réception ?")) return;
    try {
      await api.delete(`/api/accounting/receptions/${id}`);
      toast.success("Réception supprimée.");
      loadReceptions();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function downloadPO() {
    try {
      await api.download(`/api/accounting/purchases/${purchase.id}/pdf`, `Bon_de_commande_${(purchase as any).purchase_number ?? "CMD"}.pdf`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  return (
    <div className="dash-card" style={{ flex: "1 1 340px", minWidth: 0, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5, color: PAL.muted, display: "flex", alignItems: "center", gap: 8 }}>
            {purchase.purchase_number}
            {purchase.valide_comptable_at && (
              <button onClick={downloadPO} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "2px 6px", fontSize: 10 }}>
                Bon de commande PDF
              </button>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink, marginTop: 4 }}>{purchase.title}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={removePurchase} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
            <Trash2 size={15} strokeWidth={1.7} />
          </button>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 16 }}>
        <Row label="Catégorie" value={purchase.category_name} />
        <Row label="Fournisseur" value={purchase.supplier_name} />
        <Row label="Quantité × Prix" value={`${purchase.quantity} × ${fmtMAD(purchase.unit_price)}`} />
        <Row label="Total TTC" value={fmtMAD(purchase.total_incl_vat)} />
        <Row label="Statut" value={STATUS_LABEL[purchase.payment_status]} />
        {purchase.purchase_request_id && (
          <Row label="Validation commande" value={(purchase.valide_comptable_at || purchase.valide_responsable_at) ? new Date((purchase.valide_comptable_at || purchase.valide_responsable_at)!).toLocaleDateString("fr-FR") : "En attente"} />
        )}
      </div>

      {purchase.comment && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 6 }}>Commentaire</div>
          <p style={{ fontSize: 12.5, color: PAL.ink, lineHeight: 1.5, margin: 0 }}>{purchase.comment}</p>
        </div>
      )}

      <div style={{ height: 1, background: PAL.line, margin: "4px 0 16px" }} />

      {/* Receptions Section (Phase 3) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>
          Réceptions & QHSE
        </div>
        {purchase.valide_comptable_at && !showAddReception && (
          <button onClick={() => setShowAddReception(true)} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "4px 8px", fontSize: 11 }}>
            <Plus size={11} /> Réceptionner
          </button>
        )}
      </div>

      {showAddReception && (
        <div style={{ background: "var(--pal-pale)", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12.5 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10.5, color: PAL.muted }}>Qté Reçue</label>
              <input type="number" step="any" value={recForm.received_quantity} onChange={e => setRecForm(rf => ({ ...rf, received_quantity: e.target.value }))} className="u-input" style={{ width: "100%", padding: "5px 8px", fontSize: 12, marginTop: 3, border: `1px solid ${PAL.line}`, borderRadius: 6 }} />
            </div>
            <div>
              <label style={{ fontSize: 10.5, color: PAL.muted }}>Conformité</label>
              <select value={recForm.quality_status} onChange={e => setRecForm(rf => ({ ...rf, quality_status: e.target.value }))} className="u-input" style={{ width: "100%", padding: "5px 8px", fontSize: 12, marginTop: 3, border: `1px solid ${PAL.line}`, borderRadius: 6 }}>
                <option value="conforme">Conforme</option>
                <option value="non_conforme_partiel">Non Conforme Partiel</option>
                <option value="non_conforme_total">Non Conforme Total</option>
                <option value="retourne">Retourné</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10.5, color: PAL.muted }}>Note / Commentaire qualité</label>
            <textarea value={recForm.comment} onChange={e => setRecForm(rf => ({ ...rf, comment: e.target.value }))} rows={2} placeholder="Observations..." className="u-input" style={{ width: "100%", padding: "5px 8px", fontSize: 12, marginTop: 3, border: `1px solid ${PAL.line}`, borderRadius: 6, resize: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setShowAddReception(false)} className="btn-c btn-c-sm btn-c-ghost" style={{ padding: "4px 8px" }}>Annuler</button>
            <button disabled={savingReception} onClick={handleSaveReception} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "4px 12px" }}>Enregistrer</button>
          </div>
        </div>
      )}

      {loadingReceptions ? (
        <div className="shimmer" style={{ height: 30, borderRadius: 8, marginBottom: 12 }} />
      ) : receptions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "8px 0", color: PAL.muted, fontSize: 12.5, marginBottom: 12 }}>Aucune réception enregistrée.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {receptions.map(r => (
            <div key={r.id} style={{ padding: 8, borderRadius: 8, border: `1px solid ${PAL.line}`, background: "var(--pal-pale)", fontSize: 12 }}>
              {editingRecId === r.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10.5, color: PAL.muted }}>Conformité</label>
                    <select value={editForm.quality_status} onChange={e => setEditForm(f => ({ ...f, quality_status: e.target.value }))} className="u-input" style={{ width: "100%", padding: "5px 8px", fontSize: 12, marginTop: 3, border: `1px solid ${PAL.line}`, borderRadius: 6 }}>
                      <option value="conforme">Conforme</option>
                      <option value="non_conforme_partiel">Non Conforme Partiel</option>
                      <option value="non_conforme_total">Non Conforme Total</option>
                      <option value="retourne">Retourné</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10.5, color: PAL.muted }}>Note / Commentaire qualité</label>
                    <textarea value={editForm.comment} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} rows={2} placeholder="Observations..." className="u-input" style={{ width: "100%", padding: "5px 8px", fontSize: 12, marginTop: 3, border: `1px solid ${PAL.line}`, borderRadius: 6, resize: "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditingRecId(null)} className="btn-c btn-c-sm btn-c-ghost" style={{ padding: "4px 8px" }}>Annuler</button>
                    <button disabled={savingEdit} onClick={handleUpdateReception} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "4px 12px" }}>Enregistrer</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: PAL.ink }}>
                    <span>Reçu : {r.received_quantity} u</span>
                    <span style={{ fontSize: 11, color: "var(--pal-primary)" }}>{r.quality_status.replace(/_/g, " ").toUpperCase()}</span>
                  </div>
                  <div style={{ color: PAL.muted, fontSize: 11, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>{new Date(r.received_at).toLocaleDateString("fr-FR")}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => startEditReception(r)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, padding: 0 }} title="Modifier">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDeleteReception(r.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)", padding: 0 }} title="Supprimer">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {r.comment && <div style={{ fontSize: 11, fontStyle: "italic", marginTop: 4, color: PAL.ink }}>Note : {r.comment}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

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

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--pal-muted)" }}>{label}</span>
      <span style={{ color: "var(--pal-ink)", fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

export function AccountingPurchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Purchase | null>(null);

  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (categoryId) params.set("category_id", categoryId);
      if (supplierId) params.set("supplier_id", supplierId);
      if (statusFilter) params.set("payment_status", statusFilter);
      const res = await api.get(`/api/accounting/purchases?${params.toString()}`);
      setPurchases(res.items ?? []);
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
  }, [q, categoryId, supplierId, statusFilter, page]);

  useEffect(() => {
    api.get("/api/accounting/categories").then(setCategories).catch(() => {});
    api.get("/api/accounting/suppliers").then((d: Supplier[]) => setSuppliers(d ?? [])).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {showCreate && (
        <FormModal categories={categories} suppliers={suppliers} onClose={() => setShowCreate(false)} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input
            type="text"
            value={q}
            onChange={e => { setPage(1); setQ(e.target.value); }}
            placeholder="Rechercher un achat…"
            className="u-input"
            style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
        <select value={categoryId} onChange={e => { setPage(1); setCategoryId(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={supplierId} onChange={e => { setPage(1); setSupplierId(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous fournisseurs</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvel achat
        </button>
      </div>

      <SectionLabel>{total} achat{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : purchases.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<ShoppingCart size={28} strokeWidth={1.7} />} text="Aucun achat trouvé." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div className="dash-card overflow-hidden">
              {purchases.map(p => (
                <div key={p.id} className="row-c flex-wrap" onClick={() => setSelected(p)} style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--pal-pale)" : undefined }}>
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                    <ShoppingCart size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{p.title}</div>
                    <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                      {p.supplier_name || "—"}{p.category_name ? ` · ${p.category_name}` : ""} · {new Date(p.purchase_date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: PAL.ink }}>
                    {fmtMAD(p.total_incl_vat)}
                  </span>
                  {p.purchase_request_id && (
                    (p.valide_comptable_at || p.valide_responsable_at)
                      ? <span className="chip-c chip-c-green" title="Commande validée par l'administration">Commande validée</span>
                      : <span className="chip-c chip-c-amber" title="Commande issue d'une DA — à valider">À valider</span>
                  )}
                  <span className={`chip-c ${STATUS_TONE[p.payment_status]}`}>{STATUS_LABEL[p.payment_status]}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft size={14} strokeWidth={1.7} />
              </button>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}>
                <ChevronRight size={14} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          {selected && (
            <DetailPanel purchase={selected} onClose={() => setSelected(null)} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
