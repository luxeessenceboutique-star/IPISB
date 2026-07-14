import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Search, ClipboardList, Trash2, ChevronLeft, ChevronRight,
  Check, RotateCcw, X, FileText, ShoppingCart, Star,
} from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

const STATUS: Record<string, { label: string; tone: string }> = {
  brouillon:       { label: "Brouillon",       tone: "chip-c" },
  besoin_valide:   { label: "Besoin validé",   tone: "chip-c-blue" },
  en_consultation: { label: "En consultation", tone: "chip-c-amber" },
  devis_valide:    { label: "Devis validé",    tone: "chip-c-blue" },
  commande_emise:  { label: "Commande émise",  tone: "chip-c-green" },
  retournee:       { label: "Retournée",       tone: "chip-c-amber" },
  annulee:         { label: "Annulée",         tone: "chip-c-red" },
};
const CAT: Record<string, string> = { consommable: "Consommable", equipement: "Équipement", locaux: "Locaux", service: "Service" };
const REQ_TYPE: Record<string, string> = { nouveau_besoin: "Nouveau besoin", renouvellement: "Renouvellement" };
const PAY_MODE: Record<string, string> = { ov_permanent: "OV permanent", ov_ponctuel: "OV ponctuel", cheque: "Chèque", versement: "Versement", espece: "Espèce" };

type Supplier = { id: string; company_name: string };
type Quote = {
  id: string; purchase_request_id: string; supplier_id: string | null; supplier_name: string | null;
  quote_number: string; quote_date: string | null; expiration_date: string | null;
  amount: number; currency: string; rank: number; retenu: boolean;
};
type Order = {
  id: string; purchase_number: string; supplier_name: string | null; total_incl_vat: number;
  valide_responsable_at: string | null; valide_comptable_at: string | null; payment_status: string;
};
type PR = {
  id: string; request_number: string; company: string | null; service: string | null;
  requester_name: string | null; project: string | null; activity: string | null; justification: string | null;
  request_type: string; asset_category: string; characteristics: string | null;
  article_code: string | null; quantity: number; budget_estimate: number; duration: string | null;
  need_decision: string; need_decision_comment: string | null;
  quote_synthesis: string | null; payment_mode: string | null; payment_terms_days: number | null;
  quote_decision: string; status: string; created_at: string;
};
type PRDetail = PR & { quotations: Quote[]; order: Order | null };

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function Backdrop({ children, onClose, width = 560 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 30, width, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 18px" }}>{children}</h2>;
}

// ── Modal de création (stepper 2 étapes) ─────────────────────────────────────
function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    company: "", service: "", requester_name: "", project: "", activity: "", justification: "",
    request_type: "nouveau_besoin", asset_category: "consommable", characteristics: "",
    article_code: "", quantity: "1", budget_estimate: "0", duration: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.justification.trim()) { toast.error("La justification du besoin est requise."); setStep(1); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/purchase-requests", {
        ...form,
        quantity: parseFloat(form.quantity) || 1,
        budget_estimate: parseFloat(form.budget_estimate) || 0,
      });
      toast.success("Demande d'achat créée !");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally { setBusy(false); }
  }

  return (
    <Backdrop onClose={onClose} width={580}>
      <H2>Nouvelle demande d'achat</H2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["Expression de besoin", "Classement"].map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 9, fontSize: 12, fontWeight: 700, background: step === i + 1 ? "var(--pal-primary)" : "var(--pal-pale)", color: step === i + 1 ? "#fff" : PAL.muted }}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Société</label><input className="u-input" style={fieldStyle} value={form.company} onChange={e => set("company", e.target.value)} /></div>
            <div><label style={labelStyle}>Service</label><input className="u-input" style={fieldStyle} value={form.service} onChange={e => set("service", e.target.value)} /></div>
            <div><label style={labelStyle}>Demandeur</label><input className="u-input" style={fieldStyle} value={form.requester_name} onChange={e => set("requester_name", e.target.value)} /></div>
            <div><label style={labelStyle}>Projet</label><input className="u-input" style={fieldStyle} value={form.project} onChange={e => set("project", e.target.value)} /></div>
          </div>
          <label style={labelStyle}>Activité</label>
          <input className="u-input" style={fieldStyle} value={form.activity} onChange={e => set("activity", e.target.value)} />
          <label style={labelStyle}>Justification du besoin *</label>
          <textarea className="u-input" style={{ ...fieldStyle, minHeight: 70, resize: "vertical" }} value={form.justification} onChange={e => set("justification", e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Type du besoin</label>
              <select className="u-input" style={fieldStyle} value={form.request_type} onChange={e => set("request_type", e.target.value)}>
                {Object.entries(REQ_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <select className="u-input" style={fieldStyle} value={form.asset_category} onChange={e => set("asset_category", e.target.value)}>
                {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <label style={labelStyle}>Caractéristiques / CDC</label>
          <textarea className="u-input" style={{ ...fieldStyle, minHeight: 56, resize: "vertical" }} value={form.characteristics} onChange={e => set("characteristics", e.target.value)} />
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Code article</label><input className="u-input" style={fieldStyle} value={form.article_code} onChange={e => set("article_code", e.target.value)} /></div>
            <div><label style={labelStyle}>Quantité</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={form.quantity} onChange={e => set("quantity", e.target.value)} /></div>
            <div><label style={labelStyle}>Estimation budget (MAD)</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={form.budget_estimate} onChange={e => set("budget_estimate", e.target.value)} /></div>
            <div><label style={labelStyle}>Durée</label><input className="u-input" style={fieldStyle} placeholder="ex. 12 mois" value={form.duration} onChange={e => set("duration", e.target.value)} /></div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 12 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <div style={{ display: "flex", gap: 10 }}>
          {step === 2 && <button onClick={() => setStep(1)} className="btn-c btn-c-soft"><ChevronLeft size={15} />Précédent</button>}
          {step === 1 && <button onClick={() => setStep(2)} className="btn-c btn-c-primary">Suivant<ChevronRight size={15} /></button>}
          {step === 2 && <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Créer la DA"}</button>}
        </div>
      </div>
    </Backdrop>
  );
}

// ── Modal d'ajout de devis ───────────────────────────────────────────────────
function QuoteFormModal({ prId, nextRank, suppliers, onClose, onSaved }: {
  prId: string; nextRank: number; suppliers: Supplier[]; onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "", quote_number: "", quote_date: new Date().toISOString().slice(0, 10),
    expiration_date: "", amount: "0", currency: "MAD", rank: String(nextRank),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.quote_number.trim()) { toast.error("Le numéro de devis est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/quotations", {
        purchase_request_id: prId,
        supplier_id: form.supplier_id || null,
        quote_number: form.quote_number,
        quote_date: form.quote_date || null,
        expiration_date: form.expiration_date || null,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        rank: parseInt(form.rank, 10) || nextRank,
      });
      toast.success("Devis ajouté !");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout.");
    } finally { setBusy(false); }
  }

  return (
    <Backdrop onClose={onClose} width={460}>
      <H2>Ajouter un devis</H2>
      <label style={labelStyle}>Fournisseur</label>
      <select className="u-input" style={fieldStyle} value={form.supplier_id} onChange={e => set("supplier_id", e.target.value)}>
        <option value="">— Aucun —</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={labelStyle}>N° devis *</label><input className="u-input" style={fieldStyle} value={form.quote_number} onChange={e => set("quote_number", e.target.value)} /></div>
        <div><label style={labelStyle}>Rang (1–5)</label><input type="number" min="1" max="5" className="u-input" style={fieldStyle} value={form.rank} onChange={e => set("rank", e.target.value)} /></div>
        <div><label style={labelStyle}>Montant</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={form.amount} onChange={e => set("amount", e.target.value)} /></div>
        <div><label style={labelStyle}>Devise</label><input className="u-input" style={fieldStyle} value={form.currency} onChange={e => set("currency", e.target.value)} /></div>
        <div><label style={labelStyle}>Date devis</label><input type="date" className="u-input" style={fieldStyle} value={form.quote_date} onChange={e => set("quote_date", e.target.value)} /></div>
        <div><label style={labelStyle}>Échéance</label><input type="date" className="u-input" style={fieldStyle} value={form.expiration_date} onChange={e => set("expiration_date", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Ajout…" : "Ajouter"}</button>
      </div>
    </Backdrop>
  );
}

// ── Modal détail (décisions + devis + commande) ──────────────────────────────
function DetailModal({ prId, suppliers, onClose, onChanged }: {
  prId: string; suppliers: Supplier[]; onClose: () => void; onChanged: () => void;
}) {
  const [pr, setPr] = useState<PRDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoteForm, setQuoteForm] = useState(false);

  async function load() {
    try { setPr(await api.get(`/api/accounting/purchase-requests/${prId}`)); }
    catch (err: any) { toast.error(err?.message ?? "Erreur de chargement."); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [prId]);

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setBusy(false); }
  }

  function needDecision(decision: string) {
    let comment: string | null = null;
    if (decision !== "validation") {
      comment = window.prompt(decision === "retour" ? "Commentaire (retour) :" : "Motif d'annulation :") || "";
    }
    act(() => api.post(`/api/accounting/purchase-requests/${prId}/need-decision`, { decision, comment }),
      decision === "validation" ? "Besoin validé." : decision === "retour" ? "Demande retournée." : "Demande annulée.");
  }
  function retainQuote(q: Quote) {
    act(() => api.post(`/api/accounting/purchase-requests/${prId}/quote-decision`, { quotation_id: q.id, decision: "validation" }),
      `Devis ${q.quote_number} retenu.`);
  }
  function quoteDecision(decision: string) {
    const comment = window.prompt(decision === "retour" ? "Commentaire (retour) :" : "Motif d'annulation :") || "";
    // on cible le 1er devis pour satisfaire l'API (le retour/annulation ne dépend pas du devis)
    const anyQuote = pr?.quotations[0];
    if (!anyQuote) { toast.error("Aucun devis."); return; }
    act(() => api.post(`/api/accounting/purchase-requests/${prId}/quote-decision`, { quotation_id: anyQuote.id, decision, comment }),
      decision === "retour" ? "Demande retournée." : "Demande annulée.");
  }
  function createOrder() {
    act(() => api.post(`/api/accounting/purchase-requests/${prId}/create-order`, {}), "Commande créée.");
  }
  function deleteQuote(q: Quote) {
    if (!window.confirm(`Supprimer le devis ${q.quote_number} ?`)) return;
    act(() => api.delete(`/api/accounting/quotations/${q.id}`), "Devis supprimé.");
  }
  function validate(kind: "responsable" | "comptable") {
    if (!pr?.order) return;
    act(() => api.post(`/api/accounting/purchases/${pr.order!.id}/validate-${kind}`, {}),
      `Validation ${kind} enregistrée.`);
  }

  if (!pr) return <Backdrop onClose={onClose} width={720}><div style={{ padding: 20, color: PAL.muted }}>Chargement…</div></Backdrop>;

  const st = STATUS[pr.status];
  const canDecideNeed = pr.status === "brouillon" || pr.status === "retournee";
  const canQuote = pr.status === "besoin_valide" || pr.status === "en_consultation";
  const nextRank = ([1, 2, 3, 4, 5].find(r => !pr.quotations.some(q => q.rank === r))) ?? pr.quotations.length + 1;
  const info = (l: string, v: any) => v ? <div style={{ fontSize: 12.5 }}><span style={{ color: PAL.muted }}>{l} : </span><strong style={{ color: PAL.ink }}>{v}</strong></div> : null;

  return (
    <Backdrop onClose={onClose} width={760}>
      {quoteForm && <QuoteFormModal prId={prId} nextRank={nextRank} suppliers={suppliers} onClose={() => setQuoteForm(false)} onSaved={() => { load(); onChanged(); }} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <H2>{pr.request_number}</H2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => api.download(`/api/accounting/purchase-requests/${prId}/pdf`, `Demande_achat_${pr.request_number ?? prId}.pdf`).catch((e: any) => toast.error(e?.message ?? "Erreur lors du téléchargement."))} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "3px 8px", fontSize: 11 }}>
            Télécharger PDF
          </button>
          <span className={`chip-c ${st?.tone}`}>{st?.label ?? pr.status}</span>
        </div>
      </div>

      {/* Expression de besoin */}
      <SectionLabel>Expression de besoin</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px", margin: "8px 0 16px" }}>
        {info("Type", REQ_TYPE[pr.request_type])}
        {info("Catégorie", CAT[pr.asset_category])}
        {info("Société", pr.company)} {info("Service", pr.service)}
        {info("Demandeur", pr.requester_name)} {info("Projet", pr.project)}
        {info("Activité", pr.activity)}
        {info("Quantité", pr.quantity)} {info("Code article", pr.article_code)}
        {info("Budget estimé", fmtMAD(pr.budget_estimate))} {info("Durée", pr.duration)}
      </div>
      {pr.justification && <div style={{ fontSize: 13, color: PAL.ink, background: "var(--pal-pale)", padding: "10px 14px", borderRadius: 10, marginBottom: 8 }}>{pr.justification}</div>}
      {pr.characteristics && <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 14 }}>{pr.characteristics}</div>}
      {pr.need_decision_comment && <div style={{ fontSize: 12.5, color: "var(--pal-danger)", marginBottom: 10 }}>Commentaire décision : {pr.need_decision_comment}</div>}

      {canDecideNeed && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button disabled={busy} onClick={() => needDecision("validation")} className="btn-c btn-c-primary"><Check size={15} />Valider le besoin</button>
          <button disabled={busy} onClick={() => needDecision("retour")} className="btn-c btn-c-soft"><RotateCcw size={14} />Retourner</button>
          <button disabled={busy} onClick={() => needDecision("annulation")} className="btn-c btn-c-danger"><X size={15} />Annuler</button>
        </div>
      )}

      {/* Consultation / devis */}
      {(canQuote || pr.quotations.length > 0) && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <SectionLabel>Consultation — devis ({pr.quotations.length}/5)</SectionLabel>
            {canQuote && pr.quotations.length < 5 && <button onClick={() => setQuoteForm(true)} className="btn-c btn-c-sm btn-c-soft"><Plus size={14} />Ajouter</button>}
          </div>
          {pr.quotations.length === 0 ? (
            <div style={{ fontSize: 12.5, color: PAL.muted, margin: "8px 0 16px" }}>Aucun devis. Ajoutez jusqu'à 5 devis à comparer.</div>
          ) : (
            <div style={{ overflowX: "auto", margin: "8px 0 14px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                <thead><tr>
                  {pr.quotations.map(q => (
                    <th key={q.id} style={{ padding: "8px 12px", borderBottom: `1px solid ${PAL.line}`, textAlign: "left", minWidth: 150, background: q.retenu ? "var(--pal-pale)" : undefined }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: PAL.ink }}>
                        {q.retenu && <Star size={13} fill="var(--pal-primary)" color="var(--pal-primary)" />}
                        Devis {q.rank}
                      </div>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={cell}>{q.supplier_name || "—"}</td>)}</tr>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, color: PAL.muted }}>{q.quote_number}</td>)}</tr>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, fontFamily: mono, fontWeight: 700 }}>{fmtMAD(q.amount)} {q.currency}</td>)}</tr>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, color: PAL.muted, fontSize: 11.5 }}>{q.expiration_date ? `échéance ${new Date(q.expiration_date).toLocaleDateString("fr-FR")}` : ""}</td>)}</tr>
                  <tr>{pr.quotations.map(q => (
                    <td key={q.id} style={cell}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canQuote && !q.retenu && <button disabled={busy} onClick={() => retainQuote(q)} className="btn-c btn-c-sm btn-c-primary"><Star size={12} />Retenir</button>}
                        {q.retenu && <span className="chip-c chip-c-green">Retenu</span>}
                        {canQuote && !q.retenu && <button disabled={busy} onClick={() => deleteQuote(q)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  ))}</tr>
                </tbody>
              </table>
            </div>
          )}
          {canQuote && pr.quotations.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button disabled={busy} onClick={() => quoteDecision("retour")} className="btn-c btn-c-sm btn-c-soft"><RotateCcw size={13} />Retourner</button>
              <button disabled={busy} onClick={() => quoteDecision("annulation")} className="btn-c btn-c-sm btn-c-danger"><X size={14} />Annuler la DA</button>
            </div>
          )}
        </>
      )}

      {/* Commande */}
      {(pr.status === "devis_valide" || pr.order) && (
        <>
          <SectionLabel>Commande</SectionLabel>
          {!pr.order ? (
            <div style={{ margin: "8px 0" }}>
              <button disabled={busy} onClick={createOrder} className="btn-c btn-c-primary"><ShoppingCart size={15} />Créer la commande</button>
            </div>
          ) : (
            <div className="dash-card" style={{ padding: 16, margin: "8px 0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <FileText size={16} style={{ color: "var(--pal-primary)" }} />
                <strong style={{ fontSize: 14, color: PAL.ink }}>{pr.order.purchase_number}</strong>
                <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(pr.order.total_incl_vat)}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {pr.order.valide_responsable_at
                  ? <span className="chip-c chip-c-green"><Check size={12} />Responsable validé</span>
                  : <button disabled={busy} onClick={() => validate("responsable")} className="btn-c btn-c-sm btn-c-soft">Valider (responsable)</button>}
                {pr.order.valide_comptable_at
                  ? <span className="chip-c chip-c-green"><Check size={12} />Comptable validé</span>
                  : <button disabled={busy || !pr.order.valide_responsable_at} onClick={() => validate("comptable")} className="btn-c btn-c-sm btn-c-soft">Valider (comptable)</button>}
              </div>
              {pr.status === "commande_emise" && <div style={{ marginTop: 10 }}><span className="chip-c chip-c-green">Commande émise ✓</span></div>}
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Fermer</button>
      </div>
    </Backdrop>
  );
}
const cell: React.CSSProperties = { padding: "7px 12px", borderBottom: `1px solid ${PAL.line}`, fontSize: 12.5, color: PAL.ink, whiteSpace: "nowrap" };

// ── Écran principal ──────────────────────────────────────────────────────────
export function AccountingPurchaseRequests() {
  const [items, setItems] = useState<PR[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get(`/api/accounting/purchase-requests?${params.toString()}`);
      setItems(res.items ?? []); setTotal(res.total ?? 0);
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement."); }
    finally { setLoading(false); }
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, statusFilter, page]);
  useEffect(() => { api.get("/api/accounting/suppliers").then((d: Supplier[]) => setSuppliers(d ?? [])).catch(() => {}); }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onSaved={load} />}
      {detailId && <DetailModal prId={detailId} suppliers={suppliers} onClose={() => setDetailId(null)} onChanged={load} />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input value={q} onChange={e => { setPage(1); setQ(e.target.value); }} placeholder="Rechercher (n° DA, justification)…" className="u-input" style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <select value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" onClick={() => setCreateOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvelle DA</button>
      </div>

      <SectionLabel>{total} demande{total !== 1 ? "s" : ""} d'achat</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<ClipboardList size={28} strokeWidth={1.7} />} text="Aucune demande d'achat." /></div>
      ) : (
        <>
          <div className="dash-card overflow-hidden">
            {items.map(pr => {
              const st = STATUS[pr.status];
              return (
                <div key={pr.id} className="row-c flex-wrap" style={{ cursor: "pointer" }} onClick={() => setDetailId(pr.id)}>
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><ClipboardList size={18} strokeWidth={1.7} /></span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{pr.request_number}</div>
                    <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                      {CAT[pr.asset_category]} · {pr.justification || "—"}
                    </div>
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(pr.budget_estimate)}</span>
                  <span className={`chip-c ${st?.tone}`}>{st?.label ?? pr.status}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} /></button>
          </div>
        </>
      )}
    </div>
  );
}
