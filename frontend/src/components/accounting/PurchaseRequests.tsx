import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Plus, Search, ClipboardList, Trash2, ChevronLeft, ChevronRight,
  Check, RotateCcw, X, FileText, ShoppingCart, Star, Truck, Paperclip,
  CalendarClock, Pencil, Download,
} from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { usePermissions } from "@/lib/permissions";
import { useDeepLinkFocus } from "@/lib/deep-link";
import { fmtMAD } from "./Overview";
import { SupplierFormModal } from "./Suppliers";

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
// Liste des services de l'établissement (ajustez selon votre organisation)
const SERVICES = ["Direction", "Scolarité", "Comptabilité", "Ressources humaines", "Informatique", "Économat / Logistique", "Pédagogie", "Communication", "Maintenance"];
const REQ_TYPE: Record<string, string> = { nouveau_besoin: "Nouveau besoin", renouvellement: "Renouvellement" };
// Critères de conformité standard (cases à cocher).
const CONFORMITY: Record<string, string> = {
  frais: "Produit frais",
  congele: "Produit congelé",
  scelle: "Emballage scellé / fermé",
  peremption: "Date de péremption valide",
  certificat: "Certificat / norme de conformité",
  qhse: "Contrôle QHSE effectué",
};
const PAY_MODE: Record<string, string> = { ov_permanent: "OV permanent", ov_ponctuel: "OV ponctuel", cheque: "Chèque", caisse_sociale: "Caisse comptable" };

type Supplier = { id: string; company_name: string };
type Quote = {
  id: string; purchase_request_id: string; supplier_id: string | null; supplier_name: string | null;
  quote_number: string; quote_date: string | null; expiration_date: string | null;
  amount: number; currency: string; rank: number; retenu: boolean;
  comment: string | null; attachment_name: string | null; attachment_path: string | null;
  delivery_required: boolean; delivery_cost: number | null; delivery_included: boolean;
  vat_percent: number; total_incl_vat: number;
};
// Formatage nombre SANS suffixe (fmtMAD ajoute déjà « MAD » → évite le doublon).
const fmtNum = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
// Total du devis : si la livraison est payante ET non incluse, on l'écrit en
// décomposé « 4 800 + 50 » (sans additionner). Coût inconnu → « 4 800 + livraison ».
function quoteAmountLabel(q: Quote): string {
  const base = fmtNum(q.amount);
  const cur = q.currency || "MAD";
  if (q.delivery_required && !q.delivery_included) {
    if (q.delivery_cost == null) return `${base} + livraison ${cur}`;
    if (q.delivery_cost > 0) return `${base} + ${fmtNum(q.delivery_cost)} ${cur}`;
  }
  return `${base} ${cur}`;
}
// Total RÉELLEMENT dû (TTC), calculé côté base (colonne générée
// total_incl_vat = (amount + livraison éventuelle) × (1 + vat_percent/100))
// — contrairement à quoteAmountLabel, qui ne fait qu'afficher la
// décomposition HT « 4 800 + 50 » sans additionner ni appliquer la TVA. À
// utiliser partout où un montant chiffré/comparable est requis (échéancier,
// écarts, commande).
function quoteTrueTotal(q: Quote): number {
  return q.total_incl_vat;
}
type Order = {
  id: string; purchase_number: string; supplier_name: string | null; total_incl_vat: number;
  valide_responsable_at: string | null; valide_comptable_at: string | null; payment_status: string;
};
type PR = {
  id: string; request_number: string; company: string | null; service: string | null;
  requester_name: string | null; project: string | null; activity: string | null; justification: string | null;
  request_type: string; asset_category: string; characteristics: string | null;
  cdc_attachment_name: string | null; cdc_attachment_path: string | null;
  conformity_note: string | null; conformity_criteria: string[] | null;
  article_code: string | null; quantity: number; budget_estimate: number; duration: string | null;
  need_decision: string; need_decision_comment: string | null;
  quote_synthesis: string | null; payment_mode: string | null; payment_terms_days: number | null;
  quote_decision: string; status: string; created_at: string;
};
type PRDetail = PR & { quotations: Quote[]; order: Order | null };

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function Backdrop({ children, width = 560, z = 200, dim = 0.45 }: { children: React.ReactNode; width?: number; z?: number; dim?: number }) {
  // Aligné en haut + scroll du fond : l'en-tête reste visible même si le
  // contenu dépasse l'écran (évite le modal « coupé en haut »).
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${dim})`, zIndex: z, display: "flex", alignItems: "flex-start", justifyContent: "center", backdropFilter: "blur(2px)", overflowY: "auto", padding: "2vh 12px" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: "26px 30px", width, maxWidth: "96vw", margin: "auto 0", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 18px" }}>{children}</h2>;
}

// ── Modal de création (formulaire unique : besoin + classement) ──────────────
function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const ownerName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    company: "", service: "", requester_name: ownerName, project: "", activity: "", justification: "",
    request_type: "nouveau_besoin", asset_category: "consommable", characteristics: "", conformity_note: "",
    article_code: "", quantity: "1", budget_estimate: "0", duration: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [criteria, setCriteria] = useState<string[]>([]);
  const toggleCriterion = (k: string) =>
    setCriteria(cs => cs.includes(k) ? cs.filter(c => c !== k) : [...cs, k]);
  const [cdcFile, setCdcFile] = useState<File | null>(null);

  // Le demandeur est toujours le propriétaire du compte connecté.
  useEffect(() => { setForm(f => ({ ...f, requester_name: ownerName })); }, [ownerName]);

  async function submit() {
    if (!form.justification.trim()) { toast.error("La justification du besoin est requise."); return; }
    setBusy(true);
    try {
      const pr = await api.post("/api/accounting/purchase-requests", {
        ...form,
        quantity: parseFloat(form.quantity) || 1,
        budget_estimate: parseFloat(form.budget_estimate) || 0,
        conformity_criteria: criteria,
      });
      // Cahier des charges (optionnel) — envoyé une fois la DA créée.
      if (cdcFile && pr?.id) {
        const fd = new FormData();
        fd.append("file", cdcFile);
        await api.uploadFile(`/api/accounting/purchase-requests/${pr.id}/cdc`, fd);
      }
      toast.success("Demande d'achat créée !");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally { setBusy(false); }
  }

  return (
    <Backdrop width={580}>
      <H2>Nouvelle demande d'achat</H2>

      <SectionLabel>Expression de besoin</SectionLabel>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={labelStyle}>Société</label><input className="u-input" style={fieldStyle} value={form.company} onChange={e => set("company", e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Service</label>
            <select className="u-input" style={fieldStyle} value={form.service} onChange={e => set("service", e.target.value)}>
              <option value="">— Choisir un service —</option>
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Demandeur</label>
            <input className="u-input" style={{ ...fieldStyle, background: "var(--pal-pale)", cursor: "not-allowed" }} value={form.requester_name} readOnly title="Le demandeur est le titulaire du compte connecté" />
          </div>
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
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><Paperclip size={12} /> Cahier des charges (fichier, facultatif)</label>
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setCdcFile(e.target.files?.[0] ?? null)} style={{ ...fieldStyle, padding: "9px 10px" }} className="u-input" />
        <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: -8, marginBottom: 14 }}>Formats acceptés : PDF, JPG ou PNG.{cdcFile ? ` Sélectionné : ${cdcFile.name}` : ""}</div>
      </div>

      <div style={{ marginTop: 8 }}><SectionLabel>Conformité</SectionLabel></div>
      <label style={{ ...labelStyle, display: "block", marginTop: 12 }}>Exigences (texte libre)</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 52, resize: "vertical" }} placeholder="ex. bœuf congelé, produit frais du jour…" value={form.conformity_note} onChange={e => set("conformity_note", e.target.value)} />
      <label style={{ ...labelStyle, display: "block" }}>Critères standard</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px", marginTop: 8 }}>
        {Object.entries(CONFORMITY).map(([k, v]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={criteria.includes(k)} onChange={() => toggleCriterion(k)} style={{ width: 16, height: 16, accentColor: "var(--pal-primary)" }} />
            {v}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 8 }}><SectionLabel>Classement</SectionLabel></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div><label style={labelStyle}>Code article</label><input className="u-input" style={fieldStyle} value={form.article_code} onChange={e => set("article_code", e.target.value)} /></div>
        <div><label style={labelStyle}>Quantité</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={form.quantity} onChange={e => set("quantity", e.target.value)} /></div>
        <div><label style={labelStyle}>Estimation budget (MAD)</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={form.budget_estimate} onChange={e => set("budget_estimate", e.target.value)} /></div>
        <div><label style={labelStyle}>Durée</label><input className="u-input" style={fieldStyle} placeholder="ex. 12 mois" value={form.duration} onChange={e => set("duration", e.target.value)} /></div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 18 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Créer la DA"}</button>
      </div>
    </Backdrop>
  );
}

// ── Modal d'ajout de devis ───────────────────────────────────────────────────
function QuoteFormModal({ prId, nextRank, suppliers, onClose, onSaved }: {
  prId: string; nextRank: number; suppliers: Supplier[]; onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // Création d'un fournisseur à la volée : ouvre le vrai formulaire Fournisseur
  // (SupplierFormModal, réutilisé depuis Suppliers.tsx) par-dessus ce modal,
  // au lieu d'un simple champ nom — puis le sélectionne une fois créé.
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [extraSupplier, setExtraSupplier] = useState<Supplier | null>(null);
  // Livraison : « none » (non concernée), « free » (gratuite), « paid » (payante).
  const [deliveryMode, setDeliveryMode] = useState<"none" | "free" | "paid">("none");
  const [deliveryIncluded, setDeliveryIncluded] = useState(false);  // livraison comprise dans le total du devis ?
  const [form, setForm] = useState({
    supplier_id: "", quote_number: "", quote_date: new Date().toISOString().slice(0, 10),
    expiration_date: "", amount: "0", currency: "MAD", comment: "", delivery_cost: "", vat_percent: "20",
  });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  // Aperçu TTC en direct (même formule que la colonne générée total_incl_vat
  // en base) — purement visuel, la valeur enregistrée reste calculée côté DB.
  const previewDeliveryExtra = deliveryMode === "paid" && !deliveryIncluded ? (parseFloat(form.delivery_cost) || 0) : 0;
  const previewHt = (parseFloat(form.amount) || 0) + previewDeliveryExtra;
  const previewTtc = previewHt * (1 + (parseFloat(form.vat_percent) || 0) / 100);

  async function submit() {
    if (!form.quote_number.trim()) { toast.error("Le numéro de devis est requis."); return; }
    setBusy(true);
    try {
      const quote = await api.post("/api/accounting/quotations", {
        purchase_request_id: prId,
        supplier_id: form.supplier_id || null,
        quote_number: form.quote_number,
        quote_date: form.quote_date || null,
        expiration_date: form.expiration_date || null,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        rank: nextRank,
        comment: form.comment.trim() || null,
        vat_percent: parseFloat(form.vat_percent) || 0,
        delivery_required: deliveryMode !== "none",
        delivery_cost:
          deliveryMode === "free" ? 0
          : deliveryMode === "paid"
            ? (form.delivery_cost.trim() === "" ? null : (parseFloat(form.delivery_cost) || 0))
            : null,  // « none » → pas de livraison
        delivery_included: deliveryMode === "paid" ? deliveryIncluded : false,
      });
      // Pièce jointe du devis (optionnelle) — envoyée après création.
      if (file && quote?.id) {
        const fd = new FormData();
        fd.append("file", file);
        await api.uploadFile(`/api/accounting/quotations/${quote.id}/attachment`, fd);
      }
      toast.success("Devis ajouté !");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout.");
    } finally { setBusy(false); }
  }

  const noMargin = { marginTop: 6, marginBottom: 0 };
  const req = <span style={{ color: "var(--pal-danger)", marginLeft: 2 }}>*</span>;
  // Contrôle segmenté « montant + devise » (un seul champ visuel).
  const segWrap: React.CSSProperties = { display: "flex", alignItems: "stretch", border: `1px solid ${PAL.line}`, borderRadius: 10, background: PAL.paper, overflow: "hidden", marginTop: 6 };
  const segInput: React.CSSProperties = { flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", padding: "10px 13px", fontFamily: sans, fontSize: 14, color: PAL.ink };
  const segSelect: React.CSSProperties = { border: 0, outline: "none", background: "var(--pal-pale)", padding: "0 10px", fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.ink, cursor: "pointer", borderLeft: `1px solid ${PAL.line}` };

  const cellInput = { ...fieldStyle, ...noMargin };
  return (
    <Backdrop width={720} z={300} dim={0.62}>
      {/* ── En-tête ── */}
      <div style={{ borderBottom: `1px solid ${PAL.line}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--pal-primary)", marginBottom: 4 }}>Consultation fournisseurs</div>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 27, fontWeight: 500, color: PAL.ink, margin: 0 }}>Ajouter un devis</h2>
      </div>

      {/* ── Corps : 2 colonnes ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 22px", alignItems: "start" }}>
        {/* Fournisseur (pleine largeur) */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Fournisseur</label>
          <select
            className="u-input" style={cellInput} value={form.supplier_id}
            onChange={e => {
              if (e.target.value === "__new__") { setShowSupplierForm(true); return; }
              set("supplier_id", e.target.value);
            }}
          >
            <option value="">— Aucun —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            {extraSupplier && !suppliers.some(s => s.id === extraSupplier.id) && (
              <option value={extraSupplier.id}>{extraSupplier.company_name}</option>
            )}
            <option value="__new__">➕ Créer un fournisseur…</option>
          </select>
        </div>
        {showSupplierForm && (
          <SupplierFormModal
            zIndex={400}
            onClose={() => setShowSupplierForm(false)}
            onSaved={sup => {
              if (sup) { setExtraSupplier(sup); set("supplier_id", sup.id); }
              setShowSupplierForm(false);
            }}
          />
        )}

        {/* N° devis | Montant HT */}
        <div><label style={labelStyle}>N° devis{req}</label><input className="u-input" style={cellInput} placeholder="ex. DV-2026-014" value={form.quote_number} onChange={e => set("quote_number", e.target.value)} /></div>
        <div>
          <label style={labelStyle}>Montant du devis (HT, sans taxes)</label>
          <div style={{ ...segWrap, marginTop: 6 }}>
            <input type="number" min="0" step="any" style={segInput} value={form.amount} onChange={e => set("amount", e.target.value)} />
            <select style={segSelect} value={form.currency} onChange={e => set("currency", e.target.value)}>
              <option value="MAD">MAD</option><option value="EUR">EUR</option><option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* TVA (%) | Montant TTC (calculé, lecture seule) */}
        <div>
          <label style={labelStyle}>TVA (%)</label>
          <input type="number" min="0" max="100" step="any" className="u-input" style={cellInput} value={form.vat_percent} onChange={e => set("vat_percent", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Montant du devis (TTC)</label>
          <div style={{ ...cellInput, display: "flex", alignItems: "center", background: "var(--pal-pale)", fontWeight: 700, color: PAL.ink }}>
            {fmtNum(previewTtc)} {form.currency}
          </div>
        </div>

        {/* Date | Échéance */}
        <div><label style={labelStyle}>Date du devis</label><input type="date" className="u-input" style={cellInput} value={form.quote_date} onChange={e => set("quote_date", e.target.value)} /></div>
        <div><label style={labelStyle}>Échéance</label><input type="date" className="u-input" style={cellInput} value={form.expiration_date} onChange={e => set("expiration_date", e.target.value)} /></div>

        {/* Livraison (pleine largeur) */}
        <div style={{ gridColumn: "1 / -1" }} className="anim-fade">
          <div style={{ border: `1px solid ${deliveryMode !== "none" ? "var(--pal-primary)" : PAL.line}`, borderRadius: 12, padding: "12px 14px", background: deliveryMode !== "none" ? "var(--pal-pale)" : PAL.paper, transition: "border-color .15s, background .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Truck size={16} style={{ color: deliveryMode !== "none" ? "var(--pal-primary)" : PAL.muted }} />
                <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: PAL.ink }}>Livraison</span>
              </div>
              <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}>
                {([
                  { v: "none", label: "Non concernée" },
                  { v: "free", label: "Gratuite" },
                  { v: "paid", label: "Payante" },
                ] as const).map(opt => {
                  const active = deliveryMode === opt.v;
                  return (
                    <button key={opt.v} type="button" onClick={() => setDeliveryMode(opt.v)}
                      style={{ flex: 1, padding: "9px 6px", borderRadius: 9, cursor: "pointer", fontFamily: sans, fontSize: 12.5, fontWeight: 700,
                        border: `1px solid ${active ? "var(--pal-primary)" : PAL.line}`, background: active ? "var(--pal-primary)" : PAL.paper,
                        color: active ? "#fff" : PAL.muted, transition: "all .12s" }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {deliveryMode === "paid" && (
                <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                  <div style={{ ...segWrap, marginTop: 0, width: 210 }}>
                    <input type="number" min="0" step="any" style={segInput} value={form.delivery_cost} onChange={e => set("delivery_cost", e.target.value)} placeholder="Coût — vide si inconnu" />
                    <span style={{ ...segSelect, display: "flex", alignItems: "center" }}>MAD</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Comprise dans le total&nbsp;?</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {([{ v: false, label: "En sus" }, { v: true, label: "Incluse" }] as const).map(opt => {
                        const active = deliveryIncluded === opt.v;
                        return (
                          <button key={String(opt.v)} type="button" onClick={() => setDeliveryIncluded(opt.v)}
                            style={{ padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontFamily: sans, fontSize: 12, fontWeight: 700,
                              border: `1px solid ${active ? "var(--pal-primary)" : PAL.line}`, background: active ? "var(--pal-primary)" : PAL.paper,
                              color: active ? "#fff" : PAL.muted, transition: "all .12s" }}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ flexBasis: "100%", fontSize: 11.5, color: PAL.muted }}>
                    « En sus » : le coût s'ajoute au montant (affiché « {form.amount || "0"} + {form.delivery_cost.trim() || "livraison"} »). « Incluse » : déjà compris dans le montant.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Commentaire | Pièce jointe */}
        <div>
          <label style={labelStyle}>Commentaire</label>
          <textarea className="u-input" style={{ ...cellInput, minHeight: 78, resize: "vertical" }} placeholder="Observations sur ce devis…" value={form.comment} onChange={e => set("comment", e.target.value)} />
        </div>
        <div>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}><Paperclip size={12} /> Pièce jointe (devis)</label>
          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ ...cellInput, padding: "9px 10px" }} />
          <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 6 }}>Formats acceptés : PDF, JPG ou PNG.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${PAL.line}` }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Ajout…" : "Ajouter le devis"}</button>
      </div>
    </Backdrop>
  );
}

// ── Modal détail (décisions + devis + commande) ──────────────────────────────
// canDecide : barème par montant (permissions.ts, "accounting.purchase_requests")
// — ≤500 MAD comptabilite décide seule, 500–10 000 MAD admin décide en dernier
// ressort, au-delà de 10 000 MAD admin exclusivement. Calculé ici (pas en prop)
// car il dépend du budget_estimate de CETTE demande, connu seulement une fois
// chargée.
function DetailModal({ prId, suppliers, onClose, onChanged }: {
  prId: string; suppliers: Supplier[]; onClose: () => void; onChanged: () => void;
}) {
  const { can } = usePermissions();
  const [pr, setPr] = useState<PRDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoteForm, setQuoteForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editCriteria, setEditCriteria] = useState<string[]>([]);

  async function load() {
    try { setPr(await api.get(`/api/accounting/purchase-requests/${prId}`)); }
    catch (err: any) { toast.error(err?.message ?? "Erreur de chargement."); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [prId]);

  function startEdit(p: PR) {
    setEditForm({
      company: p.company ?? "", service: p.service ?? "", requester_name: p.requester_name ?? "",
      project: p.project ?? "", activity: p.activity ?? "", justification: p.justification ?? "",
      request_type: p.request_type, asset_category: p.asset_category, characteristics: p.characteristics ?? "",
      conformity_note: p.conformity_note ?? "", article_code: p.article_code ?? "",
      quantity: String(p.quantity ?? 1), budget_estimate: String(p.budget_estimate ?? 0), duration: p.duration ?? "",
    });
    setEditCriteria(p.conformity_criteria ?? []);
    setEditing(true);
  }
  const setEditField = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }));
  const toggleEditCriterion = (k: string) =>
    setEditCriteria(cs => cs.includes(k) ? cs.filter(c => c !== k) : [...cs, k]);

  async function saveEdit() {
    if (!editForm.justification.trim()) { toast.error("La justification du besoin est requise."); return; }
    setBusy(true);
    try {
      await api.patch(`/api/accounting/purchase-requests/${prId}`, {
        ...editForm,
        quantity: parseFloat(editForm.quantity) || 1,
        budget_estimate: parseFloat(editForm.budget_estimate) || 0,
        conformity_criteria: editCriteria,
      });
      toast.success("Demande mise à jour.");
      setEditing(false);
      await load(); onChanged();
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'enregistrement."); }
    finally { setBusy(false); }
  }

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
  function revertRequest() {
    if (!window.confirm("Revenir à l'étape précédente ? La décision actuelle sera annulée.")) return;
    act(() => api.post(`/api/accounting/purchase-requests/${prId}/revert`, {}), "Retour à l'étape précédente.");
  }
  function deleteQuote(q: Quote) {
    if (!window.confirm(`Supprimer le devis ${q.quote_number} ?`)) return;
    act(() => api.delete(`/api/accounting/quotations/${q.id}`), "Devis supprimé.");
  }
  async function openQuoteAttachment(q: Quote) {
    try {
      const res = await api.get(`/api/accounting/quotations/${q.id}/attachment`);
      if (res?.signed_url) window.open(res.signed_url, "_blank", "noopener");
    } catch (err: any) { toast.error(err?.message ?? "Pièce jointe indisponible."); }
  }
  async function openCdcAttachment() {
    try {
      const res = await api.get(`/api/accounting/purchase-requests/${prId}/cdc`);
      if (res?.signed_url) window.open(res.signed_url, "_blank", "noopener");
    } catch (err: any) { toast.error(err?.message ?? "Cahier des charges indisponible."); }
  }
  async function uploadCdc(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.uploadFile(`/api/accounting/purchase-requests/${prId}/cdc`, fd);
      toast.success("Cahier des charges joint.");
      await load(); onChanged();
    } catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'envoi."); }
    finally { setBusy(false); }
  }
  function validateOrder() {
    if (!pr?.order) return;
    act(() => api.post(`/api/accounting/purchases/${pr.order!.id}/validate-order`, {}),
      "Commande validée. La nature de chaque règlement se décide à l'onglet Paiements.");
  }

  if (!pr) return <Backdrop width={720}><div style={{ padding: 20, color: PAL.muted }}>Chargement…</div></Backdrop>;

  const st = STATUS[pr.status];
  // Miroir de LOCKED_STATUSES (backend) : la DA n'accepte plus d'écriture —
  // ni pièce jointe CDC, ni modification des champs saisis (bouton Modifier).
  const locked = pr.status === "commande_emise" || pr.status === "annulee";
  const canDecide = can("accounting.purchase_requests", "validate_v2", pr.budget_estimate);
  const canDecideNeed = canDecide && (pr.status === "brouillon" || pr.status === "retournee");
  const inQuoteStage = pr.status === "besoin_valide" || pr.status === "en_consultation";
  // Saisie des devis : ouverte au demandeur (il ne voit que ses DA) ET à l'admin.
  const canAddQuote = inQuoteStage;
  // Décisions sur les devis (retenir / retourner / annuler) : admin uniquement.
  const canDecideQuote = canDecide && inQuoteStage;
  // Revenir à l'étape précédente — même autorité que la décision annulée.
  // Besoin validé → brouillon (uniquement sans devis saisi) ; devis retenu → consultation.
  const canRevertNeed = canDecide && inQuoteStage && pr.quotations.length === 0;
  const canRevertQuote = canDecide && pr.status === "devis_valide";
  // Mode/échéancier de paiement : défini APRÈS le choix du devis (devis retenu), avant/à la commande.
  const canPlanPayment = pr.status === "devis_valide" || !!pr.order;
  const retainedQuote = pr.quotations.find(q => q.retenu);
  // Livraison payante non incluse dans le devis → à ajouter au total réel
  // (quoteTrueTotal), pas seulement affichée en décomposé (quoteAmountLabel).
  const schedTotal = pr.order?.total_incl_vat ?? (retainedQuote ? quoteTrueTotal(retainedQuote) : null) ?? pr.budget_estimate ?? 0;
  const schedLabel = pr.order ? "Commande" : retainedQuote ? "Devis retenu" : "Budget estimé";
  const nextRank = ([1, 2, 3, 4, 5].find(r => !pr.quotations.some(q => q.rank === r))) ?? pr.quotations.length + 1;
  const info = (l: string, v: any) => v ? <div style={{ fontSize: 12.5 }}><span style={{ color: PAL.muted }}>{l} : </span><strong style={{ color: PAL.ink }}>{v}</strong></div> : null;

  return (
    <Backdrop width={760}>
      {quoteForm && <QuoteFormModal prId={prId} nextRank={nextRank} suppliers={suppliers} onClose={() => setQuoteForm(false)} onSaved={() => { load(); onChanged(); }} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <H2>{pr.request_number}</H2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!editing ? (
            <>
              <button onClick={() => api.download(`/api/accounting/purchase-requests/${prId}/pdf`, `Demande_achat_${pr.request_number ?? prId}.pdf`).catch((e: any) => toast.error(e?.message ?? "Erreur lors du téléchargement."))} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "3px 8px", fontSize: 11 }}>
                Télécharger PDF
              </button>
              {!locked && (
                <button onClick={() => startEdit(pr)} className="btn-c btn-c-sm btn-c-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>
                  <Pencil size={12} />Modifier
                </button>
              )}
              <span className={`chip-c ${st?.tone}`}>{st?.label ?? pr.status}</span>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(false)} disabled={busy} className="btn-c btn-c-sm btn-c-ghost">Annuler</button>
              <button onClick={saveEdit} disabled={busy} className="btn-c btn-c-sm btn-c-primary"><Check size={13} />{busy ? "Enregistrement…" : "Enregistrer"}</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <>
          {/* Formulaire d'édition — exactement les champs saisis à la création,
              modifiables tant que la DA n'est pas verrouillée. */}
          <SectionLabel>Expression de besoin</SectionLabel>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={labelStyle}>Société</label><input className="u-input" style={fieldStyle} value={editForm.company} onChange={e => setEditField("company", e.target.value)} /></div>
              <div>
                <label style={labelStyle}>Service</label>
                <select className="u-input" style={fieldStyle} value={editForm.service} onChange={e => setEditField("service", e.target.value)}>
                  <option value="">— Choisir un service —</option>
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Demandeur</label><input className="u-input" style={fieldStyle} value={editForm.requester_name} onChange={e => setEditField("requester_name", e.target.value)} /></div>
              <div><label style={labelStyle}>Projet</label><input className="u-input" style={fieldStyle} value={editForm.project} onChange={e => setEditField("project", e.target.value)} /></div>
            </div>
            <label style={labelStyle}>Activité</label>
            <input className="u-input" style={fieldStyle} value={editForm.activity} onChange={e => setEditField("activity", e.target.value)} />
            <label style={labelStyle}>Justification du besoin *</label>
            <textarea className="u-input" style={{ ...fieldStyle, minHeight: 70, resize: "vertical" }} value={editForm.justification} onChange={e => setEditField("justification", e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Type du besoin</label>
                <select className="u-input" style={fieldStyle} value={editForm.request_type} onChange={e => setEditField("request_type", e.target.value)}>
                  {Object.entries(REQ_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Catégorie</label>
                <select className="u-input" style={fieldStyle} value={editForm.asset_category} onChange={e => setEditField("asset_category", e.target.value)}>
                  {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <label style={labelStyle}>Caractéristiques / CDC</label>
            <textarea className="u-input" style={{ ...fieldStyle, minHeight: 56, resize: "vertical" }} value={editForm.characteristics} onChange={e => setEditField("characteristics", e.target.value)} />
          </div>

          <div style={{ marginTop: 8 }}><SectionLabel>Conformité</SectionLabel></div>
          <label style={{ ...labelStyle, display: "block", marginTop: 12 }}>Exigences (texte libre)</label>
          <textarea className="u-input" style={{ ...fieldStyle, minHeight: 52, resize: "vertical" }} placeholder="ex. bœuf congelé, produit frais du jour…" value={editForm.conformity_note} onChange={e => setEditField("conformity_note", e.target.value)} />
          <label style={{ ...labelStyle, display: "block" }}>Critères standard</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px", marginTop: 8 }}>
            {Object.entries(CONFORMITY).map(([k, v]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={editCriteria.includes(k)} onChange={() => toggleEditCriterion(k)} style={{ width: 16, height: 16, accentColor: "var(--pal-primary)" }} />
                {v}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 8 }}><SectionLabel>Classement</SectionLabel></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, marginBottom: 16 }}>
            <div><label style={labelStyle}>Code article</label><input className="u-input" style={fieldStyle} value={editForm.article_code} onChange={e => setEditField("article_code", e.target.value)} /></div>
            <div><label style={labelStyle}>Quantité</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={editForm.quantity} onChange={e => setEditField("quantity", e.target.value)} /></div>
            <div><label style={labelStyle}>Estimation budget (MAD)</label><input type="number" min="0" step="any" className="u-input" style={fieldStyle} value={editForm.budget_estimate} onChange={e => setEditField("budget_estimate", e.target.value)} /></div>
            <div><label style={labelStyle}>Durée</label><input className="u-input" style={fieldStyle} placeholder="ex. 12 mois" value={editForm.duration} onChange={e => setEditField("duration", e.target.value)} /></div>
          </div>
        </>
      ) : (
        <>
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
          {pr.characteristics && <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 8 }}>{pr.characteristics}</div>}
          {(pr.cdc_attachment_name || !locked) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {pr.cdc_attachment_name ? (
                <button onClick={openCdcAttachment} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "3px 8px", fontSize: 11 }} title={pr.cdc_attachment_name}>
                  <FileText size={12} />Cahier des charges
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: PAL.muted }}>Aucun cahier des charges joint.</span>
              )}
              {!locked && (
                <label className="btn-c btn-c-sm btn-c-ghost" style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
                  <Paperclip size={12} />{pr.cdc_attachment_name ? "Remplacer" : "Joindre le CDC"}
                  <input
                    type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadCdc(f); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>
          )}

          {(pr.conformity_note || (pr.conformity_criteria && pr.conformity_criteria.length > 0)) && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Conformité</SectionLabel>
              {pr.conformity_note && <div style={{ fontSize: 12.5, color: PAL.ink, margin: "8px 0" }}>{pr.conformity_note}</div>}
              {pr.conformity_criteria && pr.conformity_criteria.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {pr.conformity_criteria.map(c => <span key={c} className="chip-c chip-c-blue">{CONFORMITY[c] ?? c}</span>)}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {pr.need_decision_comment && <div style={{ fontSize: 12.5, color: "var(--pal-danger)", marginBottom: 10 }}>Commentaire décision : {pr.need_decision_comment}</div>}

      {!editing && canDecideNeed && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button disabled={busy} onClick={() => needDecision("validation")} className="btn-c btn-c-primary"><Check size={15} />Valider le besoin</button>
          <button disabled={busy} onClick={() => needDecision("retour")} className="btn-c btn-c-soft"><RotateCcw size={14} />Retourner</button>
          <button disabled={busy} onClick={() => needDecision("annulation")} className="btn-c btn-c-danger"><X size={15} />Annuler</button>
        </div>
      )}
      {!editing && canRevertNeed && (
        <div style={{ marginBottom: 20 }}>
          <button disabled={busy} onClick={revertRequest} className="btn-c btn-c-sm btn-c-ghost"><RotateCcw size={13} />Revenir à l'étape précédente (annuler la validation du besoin)</button>
        </div>
      )}

      {/* Consultation / devis */}
      {!editing && (canAddQuote || pr.quotations.length > 0) && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <SectionLabel>Consultation — devis ({pr.quotations.length}/5)</SectionLabel>
            {canAddQuote && pr.quotations.length < 5 && <button onClick={() => setQuoteForm(true)} className="btn-c btn-c-sm btn-c-soft"><Plus size={14} />Ajouter</button>}
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
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, fontFamily: mono, fontWeight: 700 }}><span style={{ color: PAL.muted, fontWeight: 400, fontSize: 10.5 }}>HT </span>{quoteAmountLabel(q)}</td>)}</tr>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, fontFamily: mono, fontWeight: 700 }}><span style={{ color: PAL.muted, fontWeight: 400, fontSize: 10.5 }}>TTC ({q.vat_percent}%) </span>{fmtNum(q.total_incl_vat)} {q.currency || "MAD"}</td>)}</tr>
                  <tr>{pr.quotations.map(q => <td key={q.id} style={{ ...cell, color: PAL.muted, fontSize: 11.5 }}>{q.expiration_date ? `échéance ${new Date(q.expiration_date).toLocaleDateString("fr-FR")}` : ""}</td>)}</tr>
                  <tr>{pr.quotations.map(q => (
                    <td key={q.id} style={{ ...cell, fontSize: 11.5 }}>
                      {q.delivery_required
                        ? (q.delivery_cost == null
                            ? <span className="chip-c chip-c-amber">Livraison à préciser{q.delivery_included ? " (incluse)" : ""}</span>
                            : q.delivery_cost > 0
                              ? <span className="chip-c chip-c-amber">Livraison {fmtNum(q.delivery_cost)} MAD {q.delivery_included ? "(incluse)" : "(en sus)"}</span>
                              : <span className="chip-c chip-c-green">Livraison gratuite</span>)
                        : <span style={{ color: PAL.muted }}>Sans livraison</span>}
                    </td>
                  ))}</tr>
                  <tr>{pr.quotations.map(q => (
                    <td key={q.id} style={{ ...cell, whiteSpace: "normal", color: PAL.muted, fontSize: 11.5, maxWidth: 200 }}>{q.comment || "—"}</td>
                  ))}</tr>
                  <tr>{pr.quotations.map(q => (
                    <td key={q.id} style={cell}>
                      {q.attachment_name ? (
                        <button onClick={() => openQuoteAttachment(q)} className="btn-c btn-c-sm btn-c-soft" style={{ padding: "3px 8px", fontSize: 11 }} title={q.attachment_name}><FileText size={12} />Devis PDF</button>
                      ) : <span style={{ color: PAL.muted, fontSize: 11.5 }}>Sans pièce</span>}
                    </td>
                  ))}</tr>
                  <tr>{pr.quotations.map(q => (
                    <td key={q.id} style={cell}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canDecideQuote && !q.retenu && <button disabled={busy} onClick={() => retainQuote(q)} className="btn-c btn-c-sm btn-c-primary"><Star size={12} />Retenir</button>}
                        {q.retenu && <span className="chip-c chip-c-green">Retenu</span>}
                        {canAddQuote && !q.retenu && <button disabled={busy} onClick={() => deleteQuote(q)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  ))}</tr>
                </tbody>
              </table>
            </div>
          )}
          {canDecideQuote && pr.quotations.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button disabled={busy} onClick={() => quoteDecision("retour")} className="btn-c btn-c-sm btn-c-soft"><RotateCcw size={13} />Retourner</button>
              <button disabled={busy} onClick={() => quoteDecision("annulation")} className="btn-c btn-c-sm btn-c-danger"><X size={14} />Annuler la DA</button>
            </div>
          )}
          {canRevertQuote && (
            <div style={{ marginBottom: 18 }}>
              <button disabled={busy} onClick={revertRequest} className="btn-c btn-c-sm btn-c-ghost"><RotateCcw size={13} />Revenir à l'étape précédente (annuler le devis retenu)</button>
            </div>
          )}
        </>
      )}

      {/* Mode & échéancier de paiement — après le choix du devis retenu */}
      {!editing && canPlanPayment && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel>Mode &amp; échéancier de paiement</SectionLabel>
          <div className="dash-card" style={{ padding: 16, margin: "8px 0 4px" }}>
            <div style={{ fontSize: 12, color: PAL.muted }}>
              Conditions de règlement convenues avec le fournisseur retenu (avance, jalons, échelonnement).
            </div>
            <PaymentSchedule prId={prId} total={schedTotal} totalLabel={schedLabel} canEdit={canDecide} />
          </div>
        </div>
      )}

      {/* Commande */}
      {!editing && ((canDecide && pr.status === "devis_valide") || pr.order) && (
        <>
          <SectionLabel>Commande</SectionLabel>
          {!pr.order ? (
            canDecide ? (
              <div style={{ margin: "8px 0" }}>
                <button disabled={busy} onClick={createOrder} className="btn-c btn-c-primary"><ShoppingCart size={15} />Créer la commande</button>
              </div>
            ) : null
          ) : (
            <div className="dash-card" style={{ padding: 16, margin: "8px 0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <FileText size={16} style={{ color: "var(--pal-primary)" }} />
                <strong style={{ fontSize: 14, color: PAL.ink }}>{pr.order.purchase_number}</strong>
                <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.ink }}>{fmtMAD(pr.order.total_incl_vat)}</span>
              </div>
              {pr.order.valide_comptable_at || pr.status === "commande_emise" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="chip-c chip-c-green"><Check size={12} />Commande validée</span>
                  <span className="chip-c chip-c-green">Commande émise ✓</span>
                  {canDecide && (
                    <button
                      onClick={() => api.download(`/api/accounting/purchases/${pr.order!.id}/pdf`, `Bon_de_commande_${pr.order!.purchase_number ?? pr.order!.id}.pdf`).catch((e: any) => toast.error(e?.message ?? "Erreur lors du téléchargement."))}
                      className="btn-c btn-c-sm btn-c-soft"
                    >
                      <Download size={13} />Télécharger le bon de commande
                    </button>
                  )}
                </div>
              ) : canDecide ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: PAL.muted }}>
                    La nature de chaque règlement (caisse sociale / comptable) se décide au fil des paiements réels, onglet Paiements.
                  </span>
                  <button disabled={busy} onClick={validateOrder} className="btn-c btn-c-sm btn-c-primary"><Check size={13} />Valider la commande</button>
                </div>
              ) : (
                <span className="chip-c chip-c-amber">En attente de validation</span>
              )}
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

// ── Échéancier de paiement (prévisionnel) ────────────────────────────────────
// Bloc autonome du bon de commande : plan de versements échelonnés (jalon +
// montant + mode + date). Total LIBRE — la somme peut différer du total TTC
// (ex. avance « en noir » hors facture). N'alimente pas le journal de caisse
// (phase 1 : planification uniquement).
type IRow = { label: string; amount: string; payment_mode: string; due_date: string };
// Tous les modes de règlement (dont Caisse comptable) sont rattachés au
// journal comptable — plus de distinction « caisse sociale/comptable ».
const IMODES: Record<string, string> = PAY_MODE;
const JALON_SUGGESTIONS = ["Avance", "À la commande", "À la livraison", "Après contrôle qualité", "Après montage", "Mensualité 1", "Mensualité 2", "Mensualité 3", "Solde"];
const mapRows = (data: any): IRow[] => (data ?? []).map((d: any) => ({
  label: d.label ?? "", amount: String(d.amount ?? 0),
  payment_mode: d.payment_mode ?? "cheque", due_date: d.due_date ?? "",
}));

function ScheduleTotals({ total, rows, label = "Commande" }: { total: number; rows: IRow[]; label?: string }) {
  const planned = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const ecart = planned - total;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "flex-end", marginTop: 10, fontSize: 12, fontFamily: mono }}>
      <span style={{ color: PAL.muted }}>{label}&nbsp;: <b style={{ color: PAL.ink }}>{fmtMAD(total)}</b></span>
      <span style={{ color: PAL.muted }}>Planifié&nbsp;: <b style={{ color: PAL.ink }}>{fmtMAD(planned)}</b></span>
      {Math.abs(ecart) > 0.005 && (
        <span style={{ color: PAL.muted }} title="Écart entre le total planifié et le devis retenu. Chaque ligne est comptabilisée selon sa propre nature, il n'y a pas de « dépassement » global.">
          Écart&nbsp;: <b style={{ color: PAL.ink }}>{ecart > 0 ? "+" : "−"}{fmtMAD(Math.abs(ecart))}</b>
        </span>
      )}
    </div>
  );
}

function PaymentSchedule({ prId, total, canEdit, totalLabel = "Commande" }: { prId: string; total: number; canEdit: boolean; totalLabel?: string }) {
  const [saved, setSaved] = useState<IRow[]>([]);
  const [rows, setRows] = useState<IRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/api/accounting/purchase-requests/${prId}/installments`)
      .then(d => { if (alive) { setSaved(mapRows(d)); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [prId]);

  function startEdit() {
    setRows(saved.length ? saved.map(r => ({ ...r })) : [{ label: "", amount: "", payment_mode: "cheque", due_date: "" }]);
    setEditing(true);
  }
  const upd = (i: number, k: keyof IRow, v: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows(rs => [...rs, { label: "", amount: "", payment_mode: "cheque", due_date: "" }]);
  const delRow = (i: number) => setRows(rs => rs.filter((_, j) => j !== i));

  async function save() {
    setBusy(true);
    try {
      const payload = {
        installments: rows
          .filter(r => (parseFloat(r.amount) || 0) > 0 || r.label.trim())
          .map(r => ({ label: r.label.trim() || null, amount: parseFloat(r.amount) || 0, payment_mode: r.payment_mode, due_date: r.due_date || null })),
      };
      const data = await api.put(`/api/accounting/purchase-requests/${prId}/installments`, payload);
      setSaved(mapRows(data));
      setEditing(false);
      toast.success("Échéancier enregistré.");
    } catch (err: any) { toast.error(err?.message ?? "Échec de l'enregistrement."); }
    finally { setBusy(false); }
  }

  if (!loaded) return null;

  const th: React.CSSProperties = { fontSize: 11, color: PAL.muted, fontWeight: 600, textAlign: "left", padding: "0 8px 6px 0", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "5px 8px 5px 0", fontSize: 12.5, color: PAL.ink };
  const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ marginTop: 14, borderTop: `1px dashed ${PAL.line}`, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: PAL.ink }}>
          <CalendarClock size={14} style={{ color: "var(--pal-primary)" }} />Échéancier de paiement
        </span>
        {canEdit && !editing && (
          <button onClick={startEdit} className="btn-c btn-c-sm btn-c-ghost"><Pencil size={12} />{saved.length ? "Modifier" : "Planifier"}</button>
        )}
      </div>

      {!editing ? (
        saved.length === 0 ? (
          <div style={{ fontSize: 12, color: PAL.muted, fontStyle: "italic" }}>Aucune échéance planifiée.</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Jalon</th><th style={th}>Règlement</th><th style={th}>Date prévue</th><th style={{ ...th, textAlign: "right", paddingRight: 0 }}>Montant</th>
                </tr></thead>
                <tbody>
                  {saved.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>{r.label || "—"}</td>
                      <td style={{ ...td, color: PAL.muted }}>{IMODES[r.payment_mode] ?? r.payment_mode}</td>
                      <td style={{ ...td, color: PAL.muted, fontFamily: mono }}>{r.due_date ? r.due_date.slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                      <td style={{ ...td, padding: "5px 0 5px 8px", textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmtMAD(parseFloat(r.amount) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ScheduleTotals total={total} rows={saved} label={totalLabel} />
          </>
        )
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.95fr auto", gap: 8, alignItems: "center" }}>
                <input list="jalon-suggestions" style={inp} placeholder="Jalon (avance…)" value={r.label} onChange={e => upd(i, "label", e.target.value)} />
                <input type="number" min="0" step="any" style={inp} placeholder="Montant" value={r.amount} onChange={e => upd(i, "amount", e.target.value)} />
                <select className="u-input" style={inp} value={r.payment_mode} onChange={e => upd(i, "payment_mode", e.target.value)}>
                  {Object.entries(IMODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" style={inp} value={r.due_date} onChange={e => upd(i, "due_date", e.target.value)} />
                <button onClick={() => delRow(i)} title="Supprimer" className="btn-c btn-c-sm btn-c-ghost" style={{ padding: "6px 8px" }}><Trash2 size={13} /></button>
              </div>
            ))}
            <datalist id="jalon-suggestions">{JALON_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <button onClick={addRow} className="btn-c btn-c-sm btn-c-soft" style={{ marginTop: 8 }}><Plus size={13} />Ajouter une échéance</button>
          <ScheduleTotals total={total} rows={rows} label={totalLabel} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button onClick={() => setEditing(false)} disabled={busy} className="btn-c btn-c-sm btn-c-ghost">Annuler</button>
            <button onClick={save} disabled={busy} className="btn-c btn-c-sm btn-c-primary"><Check size={13} />{busy ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Écran principal ──────────────────────────────────────────────────────────
// La décision (valider besoin/devis, émettre commande) suit le barème par
// montant de "accounting.purchase_requests" (voir DetailModal) — plus un
// simple booléen admin/non-admin passé en prop.
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

  // Deep-link depuis une notification (?focus=<id>) — ouvre directement la
  // fiche visée, indépendamment de la page/du filtre courant (le détail se
  // recharge lui-même par id, pas besoin que l'item soit dans `items`).
  const { focusId, clearFocus } = useDeepLinkFocus();
  useEffect(() => {
    if (!focusId) return;
    setDetailId(focusId);
    clearFocus();
  }, [focusId, clearFocus]);

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
