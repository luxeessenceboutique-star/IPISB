import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Plus, Search, Trash2, X, FileText, ChevronRight, Calendar, ArrowRightLeft, Paperclip, NotebookPen, FileDown, Plane } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)",
  muted: "oklch(48% 0.02 180)",
  line: "oklch(88% 0.015 170)",
  paper: "oklch(99% 0.005 160)",
  pale: "var(--pal-pale)",
  primary: "var(--pal-primary)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

type Purchase = {
  id: string;
  purchase_number: string;
  title: string;
  supplier_name: string | null;
  total_incl_vat: number;
  payment_status: "pending" | "partially_paid" | "paid";
  purchase_date: string;
};

type Payment = {
  id: string;
  purchase_id: string;
  amount: number;
  payment_date: string;
  payment_method: "ov_permanent" | "ov_ponctuel" | "cheque" | "caisse_sociale" | "autre";
  recu_number?: string | null;   // n° de reçu auto (RCU-AAAA-NNNN)
  reference: string | null;      // réf bancaire/chèque saisie
  comment?: string | null;
  installment_id?: string | null; // échéance planifiée réglée (échéancier du bon de commande)
  purchase_title: string | null;
  purchase_number: string | null;
};

// Échéance planifiée (échéancier du bon de commande, défini côté DA).
type Installment = {
  id: string;
  rank: number;
  label: string | null;
  amount: number;
  payment_mode: string;
  nc: "noir" | "comptable";
  due_date: string | null;
};

// Versement pré-rempli depuis une échéance planifiée.
type Preset = { amount?: number; method?: string; installmentId?: string; label?: string };

// Tous les modes de règlement (dont Caisse comptable) sont rattachés au
// journal comptable — plus de distinction « caisse sociale/comptable ».
const PAYMENT_METHODS: Record<string, string> = {
  ov_permanent: "Virement Permanent",
  ov_ponctuel: "Virement Ponctuel",
  cheque: "Chèque",
  caisse_sociale: "Caisse comptable",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Non payé",
  partially_paid: "Partiellement payé",
  paid: "Payé",
};

const STATUS_TONES: Record<string, string> = {
  pending: "chip-c-red",
  partially_paid: "chip-c-amber",
  paid: "chip-c-green",
};

function AddPaymentModal({ purchase, preset, onClose, onSaved }: { purchase: Purchase; preset?: Preset; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    amount: preset?.amount != null ? String(preset.amount) : "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: preset?.method ?? "cheque",
    comment: "",
  });
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanKind, setScanKind] = useState("receipt"); // invoice | receipt | document
  const [scanNumber, setScanNumber] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Le montant doit être supérieur à zéro."); return; }
    if (scanFile && scanFile.size > 20 * 1024 * 1024) { toast.error("Le scan dépasse 20 Mo."); return; }
    setBusy(true);
    try {
      const created = await api.post("/api/accounting/payments", {
        purchase_id: purchase.id,
        amount: amt,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference: null,
        comment: form.comment || null,
        installment_id: preset?.installmentId ?? null,
      });
      // Décaissement bancaire (chèque, versement, virement, OV) : mis en attente
      // de validation N+1 — aucun paiement n'existe encore, donc rien à quoi
      // rattacher le scan.
      if (created?.pending) {
        toast.success(created.message ?? "Paiement soumis à validation.");
        if (scanFile) toast.warning("Le scan devra être joint au paiement après validation du règlement.");
        onSaved();
        onClose();
        return;
      }
      // Scan de la pièce justificative → détermine le n/c dans le journal de caisse.
      if (scanFile && created?.id) {
        const fd = new FormData();
        fd.append("file", scanFile);
        fd.append("kind", scanKind);
        if (scanNumber.trim()) fd.append("reference_number", scanNumber.trim());
        await api.uploadFile(`/api/accounting/payments/${created.id}/attachments`, fd);
      }
      toast.success("Paiement enregistré !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>Enregistrer un versement</h2>
        <div style={{ fontSize: 13.5, color: PAL.muted, marginBottom: preset?.label ? 8 : 16 }}>
          Pour l'achat : <strong>{purchase.title}</strong> ({purchase.purchase_number})
        </div>
        {preset?.label && (
          <div className="chip-c chip-c-blue" style={{ marginBottom: 16 }}>Règlement de l'échéance : {preset.label}</div>
        )}

        <label style={labelStyle}>Montant (MAD) *</label>
        <input type="number" step="any" placeholder="Ex: 5000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Mode de paiement</label>
            {preset?.method ? (
              <div style={{ ...fieldStyle, display: "flex", alignItems: "center", background: "var(--pal-pale)", color: PAL.ink, fontWeight: 600 }}>
                {PAYMENT_METHODS[form.payment_method] ?? form.payment_method}
              </div>
            ) : (
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={labelStyle}>Date du paiement</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Scan de la pièce justificative</label>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginTop: 6, marginBottom: 4 }}>
          <select value={scanKind} onChange={e => setScanKind(e.target.value)} className="u-input" style={{ ...fieldStyle, marginTop: 0, marginBottom: 0 }}>
            <option value="invoice">Facture</option>
            <option value="receipt">Reçu</option>
            <option value="document">Autre</option>
          </select>
          <label className="btn-c btn-c-ghost" style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 0 }}>
            <Paperclip size={14} strokeWidth={1.8} />
            {scanFile ? "Changer le fichier" : "Choisir un fichier"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
              onChange={e => { setScanFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </div>
        <label style={labelStyle}>Numéro de pièce</label>
        <input type="text" placeholder="Ex: FA-2026-0123" value={scanNumber} onChange={e => setScanNumber(e.target.value)} className="u-input" style={fieldStyle} />
        <div style={{ fontSize: 11.5, color: scanFile ? "var(--pal-primary)" : PAL.muted, marginBottom: 12, marginTop: -8 }}>
          {scanFile ? `📎 ${scanFile.name}` : "PDF/JPG/PNG, 20 Mo max (facultatif)."}
        </div>

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={submit} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchasePaymentsPanel({ purchase, onClose, onChanged }: { purchase: Purchase; onClose: () => void; onChanged: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [payFor, setPayFor] = useState<Installment | "free" | null>(null);

  async function loadPayments() {
    setLoading(true);
    try {
      const res = await api.get(`/api/accounting/payments?purchase_id=${purchase.id}`);
      setPayments(res.items ?? []);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }
  async function loadInstallments() {
    try {
      setInstallments((await api.get(`/api/accounting/purchases/${purchase.id}/installments`)) ?? []);
    } catch {
      setInstallments([]);
    }
  }

  useEffect(() => {
    loadPayments();
    loadInstallments();
  }, [purchase.id]);

  async function removePayment(p: Payment) {
    if (!window.confirm(`Supprimer ce versement de ${fmtMAD(p.amount)} ?`)) return;
    try {
      await api.delete(`/api/accounting/payments/${p.id}`);
      toast.success("Versement supprimé.");
      loadPayments();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, purchase.total_incl_vat - totalPaid);

  // Rapprochement paiements ↔ échéances planifiées.
  const paidByInst: Record<string, number> = {};
  payments.forEach(p => { if (p.installment_id) paidByInst[p.installment_id] = (paidByInst[p.installment_id] ?? 0) + p.amount; });
  const instById: Record<string, Installment> = {};
  installments.forEach(i => { instById[i.id] = i; });
  const instLabel = (inst: Installment) => inst.label || `Échéance ${inst.rank}`;
  const modalPreset: Preset | undefined =
    payFor && payFor !== "free"
      ? { amount: Math.max(0, payFor.amount - (paidByInst[payFor.id] ?? 0)), method: payFor.payment_mode, installmentId: payFor.id, label: instLabel(payFor) }
      : undefined;

  return (
    <div className="dash-card" style={{ flex: "1 1 360px", minWidth: 0, padding: "20px 22px" }}>
      {payFor && <AddPaymentModal purchase={purchase} preset={modalPreset} onClose={() => setPayFor(null)} onSaved={() => { loadPayments(); onChanged(); }} />}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.muted }}>{purchase.purchase_number}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: PAL.ink }}>{purchase.title}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--pal-pale)", padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: PAL.muted }}>Total TTC</span>
          <span style={{ fontFamily: mono, fontWeight: 700, color: PAL.ink }}>{fmtMAD(purchase.total_incl_vat)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: PAL.muted }}>Déjà payé</span>
          <span style={{ fontFamily: mono, fontWeight: 700, color: "var(--pal-primary)" }}>{fmtMAD(totalPaid)}</span>
        </div>
        <div style={{ height: 1, background: PAL.line }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: PAL.ink }}>Solde restant dû</span>
          <span style={{ fontFamily: mono, color: balance > 0 ? "var(--pal-danger)" : "green" }}>{fmtMAD(balance)}</span>
        </div>
      </div>

      {/* Échéancier planifié (lecture seule — défini sur le bon de commande, côté DA) */}
      {installments.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel>Échéancier planifié</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {installments.map(inst => {
              const paid = paidByInst[inst.id] ?? 0;
              const isPaid = paid >= inst.amount - 0.005;
              return (
                <div key={inst.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, background: isPaid ? "var(--pal-pale)" : PAL.paper }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 700, color: PAL.ink }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instLabel(inst)}</span>
                      <span style={{ fontFamily: mono }}>{fmtMAD(inst.amount)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                      <span style={{ fontSize: 11, color: PAL.muted }}>{PAYMENT_METHODS[inst.payment_mode] ?? inst.payment_mode}</span>
                      {inst.due_date && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: PAL.muted, fontFamily: mono }}><Calendar size={11} />{new Date(inst.due_date).toLocaleDateString("fr-FR")}</span>}
                      {paid > 0 && !isPaid && <span style={{ fontSize: 11, color: PAL.muted }}>· payé {fmtMAD(paid)}</span>}
                    </div>
                  </div>
                  {isPaid ? (
                    <span className="chip-c chip-c-green">Payé</span>
                  ) : (
                    <button onClick={() => setPayFor(inst)} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                      <CreditCard size={13} /> Payer{paid > 0 ? " le reste" : ""}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel>Versements effectués</SectionLabel>
        {balance > 0 && (
          <button onClick={() => setPayFor("free")} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 12px" }}>
            <Plus size={13} /> {installments.length > 0 ? "Versement libre" : "Enregistrer"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 60, borderRadius: 8 }} />
      ) : payments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: PAL.muted, fontSize: 13 }}>Aucun versement enregistré.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {payments.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, background: PAL.paper }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: PAL.ink }}>
                  <span>{PAYMENT_METHODS[p.payment_method] ?? p.payment_method}</span>
                  <span style={{ fontFamily: mono }}>{fmtMAD(p.amount)}</span>
                </div>
                {p.recu_number && <div style={{ fontFamily: mono, fontSize: 10.5, color: "var(--pal-primary)", marginTop: 3 }}>{p.recu_number}</div>}
                {p.installment_id && instById[p.installment_id] && <div style={{ fontSize: 10.5, color: PAL.muted, marginTop: 3 }}>↳ {instLabel(instById[p.installment_id])}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: PAL.muted, marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Calendar size={11} /> {new Date(p.payment_date).toLocaleDateString("fr-FR")}</span>
                  {p.reference && <span style={{ fontFamily: mono }}>{p.reference}</span>}
                </div>
                {p.comment && <div style={{ fontSize: 10.5, color: PAL.muted, marginTop: 3 }}>{p.comment}</div>}
              </div>
              <button onClick={() => removePayment(p)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)", marginLeft: 4 }} title="Supprimer">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Avances de caisse approuvées, à régler ───────────────────────────────────
type CashNoteToPay = {
  id: string;
  reference: string | null;
  note_date: string;
  beneficiary_name: string;
  objet: string | null;
  total: number;
  nc: "noir" | "comptable";
  approved_by_name: string | null;
};

function PayCashNoteModal({ note, onClose, onPaid }: { note: CashNoteToPay; onClose: () => void; onPaid: () => void }) {
  const [form, setForm] = useState({
    payment_method: "cheque",
    payment_reference: "",
    payment_date: new Date().toISOString().slice(0, 10),
  });
  const [docKind, setDocKind] = useState("receipt"); // invoice | receipt | document
  const [docNumber, setDocNumber] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (docFile && docFile.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    setBusy(true);
    try {
      const res = await api.post(`/api/accounting/cash-notes/${note.id}/pay`, {
        payment_method: form.payment_method,
        payment_reference: form.payment_reference || null,
        payment_date: form.payment_date,
      });
      if (docFile) {
        const fd = new FormData();
        fd.append("file", docFile);
        fd.append("kind", docKind);
        if (docNumber.trim()) fd.append("reference_number", docNumber.trim());
        await api.uploadFile(`/api/accounting/cash-notes/${note.id}/attachments`, fd);
      }
      // Décaissement bancaire → validation N+1 avant règlement (l37, l38).
      toast.success(res?.pending
        ? (res.message ?? "Règlement soumis à validation.")
        : "Avance réglée et comptabilisée au journal de caisse.");
      onPaid();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'exécution du paiement.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 8px" }}>Exécuter le paiement</h2>
        <div style={{ fontSize: 13.5, color: PAL.muted, marginBottom: 6 }}>
          Avance de caisse : <strong>{note.beneficiary_name}</strong> {note.reference ? `(${note.reference})` : ""}
        </div>
        {note.objet && <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 12 }}>{note.objet}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--pal-pale)", padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: PAL.muted }}>Montant à décaisser</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: "var(--pal-primary)" }}>{fmtMAD(note.total)}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Mode de règlement</label>
            <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date du paiement</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Justification</label>
        <input type="text" placeholder="Ex: CH-874291" value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Type de pièce</label>
            <select value={docKind} onChange={e => setDocKind(e.target.value)} className="u-input" style={fieldStyle}>
              <option value="invoice">Facture</option>
              <option value="receipt">Reçu</option>
              <option value="document">Autre</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Numéro</label>
            <input type="text" placeholder="Ex: FA-2026-0123" value={docNumber} onChange={e => setDocNumber(e.target.value)} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Pièce jointe</label>
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <label className="btn-c btn-c-ghost" style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}>
            <Paperclip size={14} strokeWidth={1.8} />
            {docFile ? "Changer le fichier" : "Choisir un fichier"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
              onChange={e => { setDocFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </div>
        <div style={{ fontSize: 11.5, color: docFile ? "var(--pal-primary)" : PAL.muted, marginBottom: 12 }}>
          {docFile ? `📎 ${docFile.name}` : "PDF/JPG/PNG, 20 Mo max (facultatif)."}
        </div>

        <div style={{ fontSize: 11.5, color: PAL.muted, marginBottom: 12 }}>
          Le décaissement sera comptabilisé au journal de caisse.
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={submit} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Exécution…" : "Payer & comptabiliser"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CashNotesToPay() {
  const [notes, setNotes] = useState<CashNoteToPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [payNote, setPayNote] = useState<CashNoteToPay | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/api/accounting/cash-notes?status=approved");
      setNotes(res.items ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function downloadPdf(n: CashNoteToPay) {
    api.download(`/api/accounting/cash-notes/${n.id}/pdf`, `Note_de_caisse_${n.reference ?? n.id}.pdf`).catch(() => {});
  }

  if (loading) return <div className="shimmer" style={{ height: 70, borderRadius: 10, marginBottom: 18 }} />;
  if (notes.length === 0) return null;

  const total = notes.reduce((s, n) => s + (n.total || 0), 0);

  return (
    <div className="dash-card" style={{ padding: "18px 20px", marginBottom: 20, borderLeft: "3px solid var(--pal-primary)" }}>
      {payNote && <PayCashNoteModal note={payNote} onClose={() => setPayNote(null)} onPaid={load} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotebookPen size={17} style={{ color: "var(--pal-primary)" }} />
          <SectionLabel>Avances de caisse à régler</SectionLabel>
          <span className="chip-c chip-c-amber">{notes.length}</span>
        </div>
        <span style={{ fontFamily: mono, fontSize: 12.5, color: PAL.muted }}>Total : <strong style={{ color: PAL.ink }}>{fmtMAD(total)}</strong></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.map(n => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, background: PAL.paper }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{n.beneficiary_name}</span>
              </div>
              <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                {n.reference ? `${n.reference} · ` : ""}{n.objet || "—"}
                {n.approved_by_name ? ` · approuvée par ${n.approved_by_name}` : ""}
              </div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink, whiteSpace: "nowrap" }}>{fmtMAD(n.total)}</span>
            <button onClick={() => downloadPdf(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Télécharger le PDF">
              <FileDown size={15} strokeWidth={1.7} />
            </button>
            <button onClick={() => setPayNote(n)} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
              <CreditCard size={13} /> Payer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Avances de frais de mission approuvées, à régler ─────────────────────────
type MissionNoteToPay = {
  id: string;
  reference: string | null;
  note_date: string;
  beneficiary_name: string;
  objet: string | null;
  total: number;
  nc: "noir" | "comptable";
  approved_by_name: string | null;
};

function PayMissionNoteModal({ note, onClose, onPaid }: { note: MissionNoteToPay; onClose: () => void; onPaid: () => void }) {
  const [form, setForm] = useState({
    payment_method: "cheque",
    payment_reference: "",
    payment_date: new Date().toISOString().slice(0, 10),
  });
  const [docKind, setDocKind] = useState("receipt"); // invoice | receipt | document
  const [docNumber, setDocNumber] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (docFile && docFile.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    setBusy(true);
    try {
      const res = await api.post(`/api/accounting/mission-notes/${note.id}/pay`, {
        payment_method: form.payment_method,
        payment_reference: form.payment_reference || null,
        payment_date: form.payment_date,
      });
      if (docFile) {
        const fd = new FormData();
        fd.append("file", docFile);
        fd.append("kind", docKind);
        if (docNumber.trim()) fd.append("reference_number", docNumber.trim());
        await api.uploadFile(`/api/accounting/mission-notes/${note.id}/attachments`, fd);
      }
      // Règlement par chèque → validation N+1 avant décaissement (l37).
      toast.success(res?.pending
        ? (res.message ?? "Règlement soumis à validation.")
        : "Avance réglée et comptabilisée au journal de caisse.");
      onPaid();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'exécution du paiement.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 8px" }}>Exécuter le paiement</h2>
        <div style={{ fontSize: 13.5, color: PAL.muted, marginBottom: 6 }}>
          Frais de mission : <strong>{note.beneficiary_name}</strong> {note.reference ? `(${note.reference})` : ""}
        </div>
        {note.objet && <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 12 }}>{note.objet}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--pal-pale)", padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: PAL.muted }}>Montant à décaisser</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: "var(--pal-primary)" }}>{fmtMAD(note.total)}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Mode de règlement</label>
            <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date du paiement</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Justification</label>
        <input type="text" placeholder="Ex: CH-874291" value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Type de pièce</label>
            <select value={docKind} onChange={e => setDocKind(e.target.value)} className="u-input" style={fieldStyle}>
              <option value="invoice">Facture</option>
              <option value="receipt">Reçu</option>
              <option value="document">Autre</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Numéro</label>
            <input type="text" placeholder="Ex: FA-2026-0123" value={docNumber} onChange={e => setDocNumber(e.target.value)} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Pièce jointe</label>
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <label className="btn-c btn-c-ghost" style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}>
            <Paperclip size={14} strokeWidth={1.8} />
            {docFile ? "Changer le fichier" : "Choisir un fichier"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
              onChange={e => { setDocFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </div>
        <div style={{ fontSize: 11.5, color: docFile ? "var(--pal-primary)" : PAL.muted, marginBottom: 12 }}>
          {docFile ? `📎 ${docFile.name}` : "PDF/JPG/PNG, 20 Mo max (facultatif)."}
        </div>

        <div style={{ fontSize: 11.5, color: PAL.muted, marginBottom: 12 }}>
          Le décaissement sera comptabilisé au journal de caisse.
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={submit} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Exécution…" : "Payer & comptabiliser"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MissionNotesToPay() {
  const [notes, setNotes] = useState<MissionNoteToPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [payNote, setPayNote] = useState<MissionNoteToPay | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/api/accounting/mission-notes?status=approved");
      setNotes(res.items ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function downloadPdf(n: MissionNoteToPay) {
    api.download(`/api/accounting/mission-notes/${n.id}/pdf`, `Note_frais_mission_${n.reference ?? n.id}.pdf`).catch(() => {});
  }

  if (loading) return <div className="shimmer" style={{ height: 70, borderRadius: 10, marginBottom: 18 }} />;
  if (notes.length === 0) return null;

  const total = notes.reduce((s, n) => s + (n.total || 0), 0);

  return (
    <div className="dash-card" style={{ padding: "18px 20px", marginBottom: 20, borderLeft: "3px solid var(--pal-primary)" }}>
      {payNote && <PayMissionNoteModal note={payNote} onClose={() => setPayNote(null)} onPaid={load} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Plane size={17} style={{ color: "var(--pal-primary)" }} />
          <SectionLabel>Frais de mission à régler</SectionLabel>
          <span className="chip-c chip-c-amber">{notes.length}</span>
        </div>
        <span style={{ fontFamily: mono, fontSize: 12.5, color: PAL.muted }}>Total : <strong style={{ color: PAL.ink }}>{fmtMAD(total)}</strong></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.map(n => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, background: PAL.paper }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{n.beneficiary_name}</span>
              </div>
              <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                {n.reference ? `${n.reference} · ` : ""}{n.objet || "—"}
                {n.approved_by_name ? ` · approuvée par ${n.approved_by_name}` : ""}
              </div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink, whiteSpace: "nowrap" }}>{fmtMAD(n.total)}</span>
            <button onClick={() => downloadPdf(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Télécharger le PDF">
              <FileDown size={15} strokeWidth={1.7} />
            </button>
            <button onClick={() => setPayNote(n)} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
              <CreditCard size={13} /> Payer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountingPayments() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
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
    load();
  }, [q, statusFilter]);

  return (
    <div style={{ fontFamily: sans }}>
      {/* Avances approuvées (N+1) — à exécuter/comptabiliser */}
      <CashNotesToPay />
      <MissionNotesToPay />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input
            type="text"
            placeholder="Rechercher un achat..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="u-input"
            style={{ width: "100%", padding: "8px 10px 8px 34px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 13, background: PAL.paper }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="u-input" style={{ padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 100, borderRadius: 10 }} />
      ) : purchases.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<CreditCard size={28} />} text="Aucun achat trouvé." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className="dash-card overflow-hidden">
              {purchases.map(p => (
                <div
                  key={p.id}
                  className="row-c"
                  onClick={() => setSelected(p)}
                  style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--pal-pale)" : undefined }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ color: PAL.primary }}><FileText size={16} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                        {p.purchase_number} · {p.supplier_name || "—"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700 }}>{fmtMAD(p.total_incl_vat)}</span>
                    <span className={`chip-c ${STATUS_TONES[p.payment_status]}`}>{STATUS_LABELS[p.payment_status]}</span>
                    <ChevronRight size={15} style={{ color: PAL.muted }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selected && (
            <PurchasePaymentsPanel purchase={selected} onClose={() => setSelected(null)} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
