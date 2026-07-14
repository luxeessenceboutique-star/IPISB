import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Plus, Search, Trash2, X, FileText, ChevronRight, Calendar, ArrowRightLeft } from "lucide-react";
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
  payment_method: "ov_permanent" | "ov_ponctuel" | "cheque" | "versement" | "espece" | "autre";
  reference: string | null;
  purchase_title: string | null;
  purchase_number: string | null;
};

const PAYMENT_METHODS: Record<string, string> = {
  ov_permanent: "Virement Permanent",
  ov_ponctuel: "Virement Ponctuel",
  cheque: "Chèque",
  versement: "Versement",
  espece: "Espèces",
  autre: "Autre",
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

function AddPaymentModal({ purchase, onClose, onSaved }: { purchase: Purchase; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "cheque",
    reference: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Le montant doit être supérieur à zéro."); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/payments", {
        purchase_id: purchase.id,
        amount: amt,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference: form.reference || null,
      });
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
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>Enregistrer un versement</h2>
        <div style={{ fontSize: 13.5, color: PAL.muted, marginBottom: 16 }}>
          Pour l'achat : <strong>{purchase.title}</strong> ({purchase.purchase_number})
        </div>

        <label style={labelStyle}>Montant (MAD) *</label>
        <input type="number" step="any" placeholder="Ex: 5000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Mode de paiement</label>
            <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date du paiement</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Référence (N° Chèque, virement…)</label>
        <input type="text" placeholder="Ex: CH-874291" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} className="u-input" style={fieldStyle} />

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
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);

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

  useEffect(() => {
    loadPayments();
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

  return (
    <div className="dash-card" style={{ flex: "1 1 360px", minWidth: 0, padding: "20px 22px" }}>
      {showAddPayment && <AddPaymentModal purchase={purchase} onClose={() => setShowAddPayment(false)} onSaved={() => { loadPayments(); onChanged(); }} />}

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel>Versements effectués</SectionLabel>
        {balance > 0 && (
          <button onClick={() => setShowAddPayment(true)} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 12px" }}>
            <Plus size={13} /> Enregistrer
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
                  <span>{PAYMENT_METHODS[p.payment_method]}</span>
                  <span style={{ fontFamily: mono }}>{fmtMAD(p.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: PAL.muted, marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Calendar size={11} /> {new Date(p.payment_date).toLocaleDateString("fr-FR")}</span>
                  {p.reference && <span>Réf: {p.reference}</span>}
                </div>
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
