import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Search, Trash2, X, AlertTriangle, MapPin, ChevronRight, Package,
  ArrowUpRight, ArrowDownRight, RefreshCw, Download, Pencil, LayoutList,
  Table as TableIcon, ArrowUpDown,
} from "lucide-react";
import { SectionLabel, EmptyHint, ProgressBar } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";
import { supabase } from "@/integrations/supabase/client";
import { type Local, FLOOR_OPTIONS, FLOOR_LABEL, groupByFloor } from "./Locaux";

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
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

const UNITS = ["pièce", "boîte", "carton", "paquet", "lot", "kg", "g", "L", "mL", "m", "m²", "rame", "flacon"];

type Category = "consommable" | "equipement" | "locaux" | "service";
type ItemStatus = "actif" | "hors_service" | "vendu" | "perdu";
type StockState = "ok" | "alerte" | "rupture";

type Allocation = { location: string; quantity: number };

type InventoryItem = {
  id: string;
  name: string;
  asset_category: Category;
  purchase_id: string | null;
  purchase_number: string | null;
  reception_id: string | null;
  code_unique: string;
  initial_value: number;
  purchase_date: string | null;
  status: ItemStatus;
  amortissement_duree_annees: number | null;
  niveau_alerte: number | null;
  quantity: number;
  location: string | null;
  caracteristiques?: string | null;
  unite?: string | null;
  prix_unitaire_ttc?: number | null;
  tva_percent?: number | null;
  allocations?: Allocation[];
  amortized_amount: number;
  vnc: number;
  amortization_percentage: number;
  yearly_amortization: number;
  comment?: string | null;
};

type TableRow = {
  id: string;
  code_unique: string;
  name: string;
  caracteristiques: string;
  unite: string;
  asset_category: Category;
  status: ItemStatus;
  quantity: number;
  niveau_alerte: number | null;
  stock_state: StockState;
  prix_unitaire_ttc: number | null;
  tva_percent: number | null;
  prix_total_stock: number | null;
  total_entree: number;
  total_sortie: number;
  beneficiaries: string[];
  allocations: Allocation[];
  location: string;
};

type Movement = {
  id: string;
  inventory_item_id: string;
  movement_type: "entree" | "sortie" | "ajustement";
  quantity: number;
  movement_date: string;
  description: string | null;
  beneficiary?: string | null;
  created_at: string;
};

type Attachment = { id: string; kind: string; file_name: string; file_type: string; file_size: number; created_at: string };

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "consommable", label: "Consommables" },
  { key: "equipement",  label: "Équipements"  },
  { key: "locaux",      label: "Locaux"       },
  { key: "service",     label: "Services"     },
];

const STATUS_LABELS: Record<ItemStatus, string> = {
  actif: "Actif",
  hors_service: "Hors Service",
  vendu: "Vendu",
  perdu: "Perdu",
};

const STOCK_STATE: Record<StockState, { label: string; chip: string }> = {
  ok:      { label: "En stock",   chip: "chip-c-green" },
  alerte:  { label: "Sous seuil", chip: "chip-c-amber" },
  rupture: { label: "Rupture",    chip: "chip-c-red" },
};

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf.format(v));

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

/** Sélecteur de local : liste stricte (groupée par étage) + ajout rapide. */
function LocationPicker({ value, onChange, locaux, reloadLocaux, style }: {
  value: string;
  onChange: (v: string) => void;
  locaux: Local[];
  reloadLocaux: () => Promise<void> | void;
  style?: React.CSSProperties;
}) {
  const [adding, setAdding] = useState(false);
  const [nn, setNn] = useState("");
  const [nfloor, setNfloor] = useState("3e");
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => groupByFloor(locaux.filter(l => l.active)), [locaux]);
  const known = locaux.some(l => l.name === value);
  const base: React.CSSProperties = style ?? {};

  async function create() {
    const name = nn.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.post("/api/accounting/locaux", { name, floor: nfloor });
      await reloadLocaux();
      onChange(name);
      setAdding(false);
      setNn("");
    } catch (e: any) {
      toast.error(e?.message ?? "Création du local impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (adding) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", ...(base.marginTop ? { marginTop: base.marginTop } : {}), ...(base.marginBottom ? { marginBottom: base.marginBottom } : {}) }}>
        <input autoFocus placeholder="Nom du local" value={nn} onChange={e => setNn(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void create(); if (e.key === "Escape") setAdding(false); }}
          className="u-input" style={{ ...base, marginTop: 0, marginBottom: 0, flex: 2 }} />
        <select value={nfloor} onChange={e => setNfloor(e.target.value)} className="u-input" style={{ ...base, marginTop: 0, marginBottom: 0, flex: 1 }}>
          {FLOOR_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <button type="button" onClick={() => void create()} disabled={busy} className="btn-c btn-c-primary btn-c-sm">OK</button>
        <button type="button" onClick={() => setAdding(false)} style={{ border: 0, background: "none", cursor: "pointer", color: PAL.muted }}><X size={14} /></button>
      </div>
    );
  }

  return (
    <select className="u-input" style={base}
      value={known ? value : value ? "__free__" : ""}
      onChange={e => {
        const v = e.target.value;
        if (v === "__add__") { setNn(""); setAdding(true); return; }
        if (v === "__free__") return;
        onChange(v);
      }}>
      <option value="">— Aucun —</option>
      {!known && value && <option value="__free__">{value} (hors référentiel)</option>}
      {groups.map(g => (
        <optgroup key={g.floor} label={FLOOR_LABEL(g.floor)}>
          {g.rooms.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
        </optgroup>
      ))}
      <option value="__add__">+ Nouveau local…</option>
    </select>
  );
}

function CreateEditModal({ editing, locaux, reloadLocaux, onClose, onSaved }: { editing: InventoryItem | null; locaux: Local[]; reloadLocaux: () => Promise<void> | void; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    asset_category: String(editing?.asset_category ?? "consommable"),
    initial_value: String(editing?.initial_value ?? "0"),
    purchase_date: editing?.purchase_date ?? new Date().toISOString().slice(0, 10),
    status: String(editing?.status ?? "actif"),
    amortissement_duree_annees: editing?.amortissement_duree_annees != null ? String(editing.amortissement_duree_annees) : "",
    niveau_alerte: editing?.niveau_alerte != null ? String(editing.niveau_alerte) : "",
    quantity: String(editing?.quantity ?? "1"),
    location: editing?.location ?? "",
    caracteristiques: editing?.caracteristiques ?? "",
    unite: editing?.unite ?? "",
    prix_unitaire_ttc: editing?.prix_unitaire_ttc != null ? String(editing.prix_unitaire_ttc) : "",
    tva_percent: editing?.tva_percent != null ? String(editing.tva_percent) : "20",
    comment: editing?.comment ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      asset_category: form.asset_category,
      initial_value: parseFloat(form.initial_value) || 0,
      purchase_date: form.purchase_date || null,
      status: form.status,
      amortissement_duree_annees: form.amortissement_duree_annees ? parseInt(form.amortissement_duree_annees) : null,
      niveau_alerte: form.niveau_alerte ? parseFloat(form.niveau_alerte) : null,
      location: form.location || null,
      caracteristiques: form.caracteristiques || null,
      unite: form.unite || null,
      prix_unitaire_ttc: form.prix_unitaire_ttc ? parseFloat(form.prix_unitaire_ttc) : null,
      tva_percent: form.tva_percent ? parseFloat(form.tva_percent) : null,
      comment: form.comment || null,
    };
    // À la création seulement : la quantité de départ. Ensuite elle ne bouge
    // que par les mouvements de stock.
    if (!editing) payload.quantity = parseFloat(form.quantity) || 0;
    try {
      if (editing) await api.patch(`/api/accounting/inventory/${editing.id}`, payload);
      else await api.post("/api/accounting/inventory", payload);
      toast.success(editing ? "Actif modifié !" : "Actif créé !");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>
          {editing ? "Modifier l'actif" : "Nouvel actif inventaire"}
        </h2>

        <label style={labelStyle}>Nom *</label>
        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Caractéristiques</label>
        <input type="text" placeholder="Modèle, réf. fabricant, specs…" value={form.caracteristiques} onChange={e => setForm(f => ({ ...f, caracteristiques: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={form.asset_category} onChange={e => setForm(f => ({ ...f, asset_category: e.target.value }))} className="u-input" style={fieldStyle}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Statut</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Quantité {editing && <span style={{ textTransform: "none", fontWeight: 400 }}>· via mouvements</span>}</label>
            <input type="number" step="any" value={form.quantity} disabled={!!editing}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="u-input"
              style={{ ...fieldStyle, ...(editing ? { background: "var(--pal-pale)", color: PAL.muted } : {}) }} />
          </div>
          <div>
            <label style={labelStyle}>Unité</label>
            <input list="inv-units" placeholder="pièce, kg…" value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))} className="u-input" style={fieldStyle} />
            <datalist id="inv-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>
          <div>
            <label style={labelStyle}>Seuil alerte stock</label>
            <input type="number" placeholder="Aucun" value={form.niveau_alerte} onChange={e => setForm(f => ({ ...f, niveau_alerte: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Prix unitaire TTC</label>
            <input type="number" step="any" placeholder="MAD" value={form.prix_unitaire_ttc} onChange={e => setForm(f => ({ ...f, prix_unitaire_ttc: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>TVA %</label>
            <input type="number" step="any" value={form.tva_percent} onChange={e => setForm(f => ({ ...f, tva_percent: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Valeur d'acquisition (HT)</label>
            <input type="number" step="any" value={form.initial_value} onChange={e => setForm(f => ({ ...f, initial_value: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Date d'achat</label>
            <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Amort. (années)</label>
            <input type="number" placeholder="Aucun" value={form.amortissement_duree_annees} onChange={e => setForm(f => ({ ...f, amortissement_duree_annees: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Emplacement principal</label>
            <LocationPicker value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} locaux={locaux} reloadLocaux={reloadLocaux} style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Commentaire</label>
        <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={submit} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AllocationsEditor({ item, locaux, reloadLocaux, onSaved }: { item: InventoryItem; locaux: Local[]; reloadLocaux: () => Promise<void> | void; onSaved: () => void }) {
  const [rows, setRows] = useState<Allocation[]>(item.allocations?.length ? item.allocations : (item.location ? [{ location: item.location, quantity: item.quantity }] : []));
  const [busy, setBusy] = useState(false);

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const gap = Math.round((item.quantity - total) * 100) / 100;

  async function save() {
    setBusy(true);
    try {
      await api.put(`/api/accounting/inventory/${item.id}/allocations`, {
        allocations: rows.filter(r => r.location.trim()).map(r => ({ location: r.location.trim(), quantity: Number(r.quantity) || 0 })),
      });
      toast.success("Ventilation enregistrée.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionLabel>Affectation par local</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 2, minWidth: 0 }}>
              <LocationPicker value={r.location} onChange={v => setRows(rs => rs.map((x, j) => j === i ? { ...x, location: v } : x))}
                locaux={locaux} reloadLocaux={reloadLocaux}
                style={{ width: "100%", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12, background: PAL.paper, boxSizing: "border-box" }} />
            </div>
            <input type="number" step="any" placeholder="Qté" value={r.quantity}
              onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))}
              className="u-input" style={{ width: 74, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
            <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Retirer"><X size={14} /></button>
          </div>
        ))}
        <button onClick={() => setRows(rs => [...rs, { location: "", quantity: 0 }])} className="btn-c btn-c-ghost btn-c-sm" style={{ alignSelf: "flex-start" }}>
          <Plus size={13} /> Ajouter un local
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: gap === 0 ? PAL.muted : "var(--pal-danger)" }}>
        <span>Ventilé : <strong>{num(total)}</strong> / {num(item.quantity)} {item.unite || ""}{gap !== 0 ? ` · écart ${gap > 0 ? "+" : ""}${num(gap)}` : ""}</span>
        <button onClick={save} disabled={busy} className="btn-c btn-c-primary btn-c-sm">{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

function DetailsPanel({ item, wide, locaux, reloadLocaux, onClose, onEdit, onChanged }: { item: InventoryItem; wide: boolean; locaux: Local[]; reloadLocaux: () => Promise<void> | void; onClose: () => void; onEdit: (it: InventoryItem) => void; onChanged: () => void }) {
  const [full, setFull] = useState<InventoryItem>(item);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [mForm, setMForm] = useState({ movement_type: "sortie", quantity: "1", description: "", beneficiary: "" });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadMovements() {
    try {
      const data = await api.get(`/api/accounting/inventory/${item.id}/movements`);
      setMovements(data ?? []);
    } catch {}
  }

  async function loadItem() {
    try {
      const data = await api.get(`/api/accounting/inventory/${item.id}`);
      setFull(data);
      setAttachments(data.attachments ?? []);
    } catch {}
  }

  useEffect(() => {
    setFull(item);
    loadMovements();
    loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function handleAddMovement() {
    const qty = parseFloat(mForm.quantity);
    if (!qty || qty <= 0) { toast.error("La quantité doit être supérieure à zéro."); return; }
    setBusy(true);
    try {
      await api.post(`/api/accounting/inventory/${item.id}/movements`, {
        movement_type: mForm.movement_type,
        quantity: qty,
        description: mForm.description || null,
        beneficiary: mForm.movement_type === "sortie" ? (mForm.beneficiary || null) : null,
      });
      toast.success("Mouvement enregistré !");
      setMForm({ movement_type: "sortie", quantity: "1", description: "", beneficiary: "" });
      loadMovements();
      loadItem();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du mouvement.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "document");
      const res = await fetch(`${BASE}/api/accounting/purchases/${full.purchase_id}/attachments`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Justificatif ajouté.");
      loadItem();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteItem() {
    if (!window.confirm(`Supprimer définitivement l'actif « ${full.name} » et tout son historique ?`)) return;
    try {
      await api.delete(`/api/accounting/inventory/${item.id}`);
      toast.success("Actif supprimé.");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const underAlert = full.niveau_alerte !== null && full.quantity <= (full.niveau_alerte ?? 0);
  const stockValue = full.prix_unitaire_ttc != null ? full.prix_unitaire_ttc * full.quantity : null;

  return (
    <div className="dash-card" style={{ flex: wide ? "1 1 100%" : "1 1 360px", minWidth: 0, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.muted }}>{full.code_unique}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: PAL.ink }}>{full.name}</div>
          {full.caracteristiques && <div style={{ fontSize: 12, color: PAL.muted, marginTop: 2 }}>{full.caracteristiques}</div>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onEdit(full)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={15} /></button>
          <button onClick={deleteItem} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={15} /></button>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><X size={18} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(3, 1fr)" : "1fr", gap: wide ? 16 : 8, fontSize: 13, marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Statut</span>
            <span className="chip-c chip-c-green">{STATUS_LABELS[full.status]}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Quantité en stock</span>
            <span style={{ fontWeight: 700, color: PAL.ink }}>
              {num(full.quantity)} {full.unite || ""}
              {underAlert && (
                <span style={{ color: "var(--pal-danger)", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 2 }} title="Stock alerte">
                  <AlertTriangle size={13} /> Alerte
                </span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Emplacement</span>
            <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {full.location || "Non localisé"}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Prix unitaire TTC</span>
            <span style={{ fontFamily: mono, fontWeight: 600 }}>{full.prix_unitaire_ttc != null ? fmtMAD(full.prix_unitaire_ttc) : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Valeur du stock</span>
            <span style={{ fontFamily: mono, fontWeight: 600 }}>{stockValue != null ? fmtMAD(stockValue) : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Valeur d'acquisition</span>
            <span style={{ fontFamily: mono, fontWeight: 600 }}>{fmtMAD(full.initial_value)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {full.purchase_date && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: PAL.muted }}>Date d'acquisition</span>
              <span>{new Date(full.purchase_date).toLocaleDateString("fr-FR")}</span>
            </div>
          )}
          {full.tva_percent != null && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: PAL.muted }}>TVA</span>
              <span>{num(full.tva_percent)} %</span>
            </div>
          )}
        </div>
      </div>

      {full.comment && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const, marginBottom: 6 }}>Commentaire</div>
          <p style={{ fontSize: 12.5, color: PAL.ink, lineHeight: 1.5, margin: 0 }}>{full.comment}</p>
        </div>
      )}

      {full.amortissement_duree_annees && (
        <div style={{ background: "var(--pal-pale)", padding: 14, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: PAL.ink, marginBottom: 6 }}>
            <span>Amortissement ({full.amortissement_duree_annees} ans)</span>
            <span>{full.amortization_percentage}%</span>
          </div>
          <ProgressBar value={full.amortization_percentage} tone="primary" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5, marginTop: 8, color: PAL.muted }}>
            <div>Cumul : <strong style={{ color: PAL.ink }}>{fmtMAD(full.amortized_amount)}</strong></div>
            <div style={{ textAlign: "right" }}>VNC : <strong style={{ color: PAL.ink }}>{fmtMAD(full.vnc)}</strong></div>
            <div>Dotation an. : <strong style={{ color: PAL.ink }}>{fmtMAD(full.yearly_amortization)}</strong></div>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: PAL.line, margin: "12px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "1fr", gap: 20 }}>
        <div>
          <SectionLabel>Mouvements de stock</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 12px" }}>
            <select value={mForm.movement_type} onChange={e => setMForm(f => ({ ...f, movement_type: e.target.value }))} className="u-input" style={{ flex: "1 1 90px", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }}>
              <option value="entree">Entrée</option>
              <option value="sortie">Sortie</option>
              <option value="ajustement">Ajustement</option>
            </select>
            <input type="number" step="any" value={mForm.quantity} onChange={e => setMForm(f => ({ ...f, quantity: e.target.value }))} className="u-input" style={{ width: 60, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
            {mForm.movement_type === "sortie" && (
              <input type="text" placeholder="Demandeur" value={mForm.beneficiary} onChange={e => setMForm(f => ({ ...f, beneficiary: e.target.value }))} className="u-input" style={{ flex: "1 1 120px", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
            )}
            <input type="text" placeholder="Note" value={mForm.description} onChange={e => setMForm(f => ({ ...f, description: e.target.value }))} className="u-input" style={{ flex: "2 1 120px", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
            <button disabled={busy} onClick={handleAddMovement} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 10px" }}>Ajouter</button>
          </div>

          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {movements.length === 0 ? (
              <div style={{ color: PAL.muted, fontSize: 12, textAlign: "center", padding: "10px 0" }}>Aucun historique.</div>
            ) : (
              movements.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {m.movement_type === "entree" ? <ArrowUpRight size={13} style={{ color: "green" }} /> : m.movement_type === "sortie" ? <ArrowDownRight size={13} style={{ color: "red" }} /> : <RefreshCw size={12} style={{ color: PAL.muted }} />}
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{m.movement_type} : {num(m.quantity)}</span>
                    {m.beneficiary && <span className="chip-c" style={{ fontSize: 10.5 }}>{m.beneficiary}</span>}
                  </div>
                  <div style={{ color: PAL.muted, fontSize: 11 }}>
                    {m.description && <span style={{ marginRight: 6 }}>{m.description}</span>}
                    {new Date(m.movement_date).toLocaleDateString("fr-FR")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <AllocationsEditor key={`al-${JSON.stringify(full.allocations ?? [])}`} item={full} locaux={locaux} reloadLocaux={reloadLocaux} onSaved={() => { loadItem(); onChanged(); }} />
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "9px 12px", borderBottom: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: PAL.muted, background: "oklch(97% 0.008 170)", whiteSpace: "nowrap", cursor: "default", userSelect: "none" };
const td: React.CSSProperties = { padding: "9px 12px", borderBottom: `1px solid ${PAL.line}`, fontSize: 12.5, color: PAL.ink, whiteSpace: "nowrap", verticalAlign: "middle" };
const filterInput: React.CSSProperties = { width: "100%", padding: "4px 6px", border: `1px solid ${PAL.line}`, borderRadius: 5, fontSize: 11.5, fontFamily: sans, background: PAL.paper, outline: "none", boxSizing: "border-box" };

type SortKey = "code_unique" | "name" | "unite" | "stock_state" | "quantity" | "prix_unitaire_ttc" | "prix_total_stock" | "total_entree" | "total_sortie";

function InventoryTable({ rows, loading, onOpen }: { rows: TableRow[]; loading: boolean; onOpen: (id: string) => void }) {
  const [f, setF] = useState({ code: "", name: "", carac: "", unite: "", state: "", benef: "", local: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "code_unique", dir: 1 });

  const units = useMemo(() => Array.from(new Set(rows.map(r => r.unite).filter(Boolean))).sort(), [rows]);

  const view = useMemo(() => {
    let out = rows.filter(r =>
      r.code_unique.toLowerCase().includes(f.code.toLowerCase()) &&
      r.name.toLowerCase().includes(f.name.toLowerCase()) &&
      r.caracteristiques.toLowerCase().includes(f.carac.toLowerCase()) &&
      (!f.unite || r.unite === f.unite) &&
      (!f.state || r.stock_state === f.state) &&
      (!f.benef || r.beneficiaries.join(" ").toLowerCase().includes(f.benef.toLowerCase())) &&
      (!f.local || r.allocations.map(a => a.location).join(" ").toLowerCase().includes(f.local.toLowerCase()) || r.location.toLowerCase().includes(f.local.toLowerCase()))
    );
    const { key, dir } = sort;
    out = [...out].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" || typeof bv === "number") {
        return dir * ((typeof av === "number" ? av : -Infinity) - (typeof bv === "number" ? bv : -Infinity));
      }
      return dir * String(av ?? "").localeCompare(String(bv ?? ""));
    });
    return out;
  }, [rows, f, sort]);

  const totalStock = view.reduce((s, r) => s + (r.prix_total_stock || 0), 0);

  function SortH({ k, label, right }: { k: SortKey; label: string; right?: boolean }) {
    return (
      <th style={{ ...th, textAlign: right ? "right" : "left", cursor: "pointer" }} onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label} <ArrowUpDown size={11} style={{ verticalAlign: "-1px", opacity: sort.key === k ? 1 : 0.3 }} />
      </th>
    );
  }

  if (loading) return <div className="shimmer" style={{ height: 200, borderRadius: 10 }} />;

  return (
    <div className="dash-card" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280 }}>
        <thead>
          <tr>
            <SortH k="code_unique" label="Code article" />
            <SortH k="name" label="Article" />
            <th style={th}>Caractéristiques</th>
            <SortH k="unite" label="Unité" />
            <SortH k="stock_state" label="État de stock" />
            <SortH k="quantity" label="Qté" right />
            <SortH k="prix_unitaire_ttc" label="Prix unité TTC" right />
            <SortH k="prix_total_stock" label="Prix total stock" right />
            <SortH k="total_entree" label="Total entré" right />
            <th style={th}>Demandeurs</th>
            <SortH k="total_sortie" label="Total sorti" right />
            <th style={th}>Affectation par local</th>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px", background: PAL.paper }}><input style={filterInput} placeholder="filtrer" value={f.code} onChange={e => setF(s => ({ ...s, code: e.target.value }))} /></td>
            <td style={{ padding: "4px 8px", background: PAL.paper }}><input style={filterInput} placeholder="filtrer" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} /></td>
            <td style={{ padding: "4px 8px", background: PAL.paper }}><input style={filterInput} placeholder="filtrer" value={f.carac} onChange={e => setF(s => ({ ...s, carac: e.target.value }))} /></td>
            <td style={{ padding: "4px 8px", background: PAL.paper }}>
              <select style={filterInput} value={f.unite} onChange={e => setF(s => ({ ...s, unite: e.target.value }))}>
                <option value="">toutes</option>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </td>
            <td style={{ padding: "4px 8px", background: PAL.paper }}>
              <select style={filterInput} value={f.state} onChange={e => setF(s => ({ ...s, state: e.target.value }))}>
                <option value="">tous</option>
                <option value="ok">En stock</option>
                <option value="alerte">Sous seuil</option>
                <option value="rupture">Rupture</option>
              </select>
            </td>
            <td style={{ background: PAL.paper }} colSpan={4} />
            <td style={{ padding: "4px 8px", background: PAL.paper }}><input style={filterInput} placeholder="filtrer" value={f.benef} onChange={e => setF(s => ({ ...s, benef: e.target.value }))} /></td>
            <td style={{ background: PAL.paper }} />
            <td style={{ padding: "4px 8px", background: PAL.paper }}><input style={filterInput} placeholder="filtrer" value={f.local} onChange={e => setF(s => ({ ...s, local: e.target.value }))} /></td>
          </tr>
        </thead>
        <tbody>
          {view.length === 0 ? (
            <tr><td colSpan={12} style={{ ...td, textAlign: "center", color: PAL.muted, padding: 28 }}>Aucun article.</td></tr>
          ) : view.map(r => {
            const st = STOCK_STATE[r.stock_state];
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="u-ghost" style={{ cursor: "pointer" }}>
                <td style={{ ...td, fontFamily: mono, fontSize: 11.5, color: PAL.muted }}>{r.code_unique}</td>
                <td style={{ ...td, fontWeight: 600, whiteSpace: "normal", maxWidth: 200 }}>{r.name}</td>
                <td style={{ ...td, whiteSpace: "normal", maxWidth: 220, color: PAL.muted }}>{r.caracteristiques || "—"}</td>
                <td style={td}>{r.unite || "—"}</td>
                <td style={td}><span className={`chip-c ${st.chip}`}>{st.label}</span></td>
                <td style={{ ...td, textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{num(r.quantity)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: mono }}>{r.prix_unitaire_ttc != null ? fmtMAD(r.prix_unitaire_ttc) : "—"}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: mono, fontWeight: 600 }}>{r.prix_total_stock != null ? fmtMAD(r.prix_total_stock) : "—"}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: mono, color: "oklch(45% 0.1 155)" }}>{num(r.total_entree)}</td>
                <td style={{ ...td, whiteSpace: "normal", maxWidth: 180, color: PAL.muted }}>{r.beneficiaries.length ? r.beneficiaries.join(", ") : "—"}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: mono, color: "oklch(52% 0.16 25)" }}>{num(r.total_sortie)}</td>
                <td style={{ ...td, whiteSpace: "normal", maxWidth: 240 }}>
                  {r.allocations.length
                    ? r.allocations.map((a, i) => <span key={i} className="chip-c" style={{ fontSize: 10.5, marginRight: 4, display: "inline-block" }}>{a.location}: {num(a.quantity)}</span>)
                    : (r.location || "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
        {view.length > 0 && (
          <tfoot>
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={7}>{view.length} article(s)</td>
              <td style={{ ...td, textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmtMAD(totalStock)}</td>
              <td style={td} colSpan={4} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function AccountingInventory() {
  const [tab, setTab] = useState<Category>("consommable");
  const [view, setView] = useState<"list" | "table">("list");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing: InventoryItem | null }>({ open: false, editing: null });
  const [alerts, setAlerts] = useState<InventoryItem[]>([]);
  const [locaux, setLocaux] = useState<Local[]>([]);

  async function loadAlerts() {
    try { setAlerts(await api.get("/api/accounting/inventory/alerts") ?? []); } catch {}
  }

  async function loadLocaux() {
    try { setLocaux(await api.get("/api/accounting/locaux") ?? []); } catch {}
  }

  useEffect(() => { loadLocaux(); }, []);

  async function loadList() {
    setLoading(true);
    try {
      const res = await api.get(`/api/accounting/inventory?asset_category=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setItems(res.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTable() {
    setLoading(true);
    try {
      const res = await api.get(`/api/accounting/inventory/table?asset_category=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setTableRows(res.rows ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  function reload() {
    loadAlerts();
    if (view === "table") loadTable();
    else loadList();
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, view]);

  async function openItem(id: string) {
    try {
      const full = await api.get(`/api/accounting/inventory/${id}`);
      setSelected(full);
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible d'ouvrir la fiche.");
    }
  }

  function exportTable(fmt: "xlsx" | "csv") {
    api.download(`/api/accounting/inventory/table/export?asset_category=${tab}&fmt=${fmt}`, `Inventaire_${tab}.${fmt}`)
      .catch((e: any) => toast.error(e?.message ?? "Export impossible."));
  }

  const segBtn = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12.5, fontFamily: sans,
    fontWeight: active ? 700 : 500, border: 0, cursor: "pointer",
    background: active ? PAL.paper : "transparent", color: active ? PAL.ink : PAL.muted,
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.08)" : undefined, borderRadius: 7,
  });

  return (
    <div style={{ fontFamily: sans }}>
      {modal.open && <CreateEditModal editing={modal.editing} locaux={locaux} reloadLocaux={loadLocaux} onClose={() => setModal({ open: false, editing: null })} onSaved={reload} />}

      {alerts.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "oklch(95% 0.02 30)", border: "1px solid oklch(85% 0.05 35)", borderRadius: 10, marginBottom: 16, color: "oklch(35% 0.05 35)", fontSize: 13 }}>
          <AlertTriangle size={18} />
          <div>
            <strong>Alerte stock critique :</strong> {alerts.length} article{alerts.length > 1 ? "s" : ""} sous le seuil d'alerte ({alerts.map(a => a.name).join(", ")}).
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${PAL.line}`, flexWrap: "wrap" }}>
        {CATEGORIES.map(c => {
          const active = tab === c.key;
          return (
            <button key={c.key} onClick={() => { setTab(c.key); setSelected(null); }} style={{
              background: "none", border: 0,
              borderBottom: active ? `2px solid ${PAL.primary}` : "2px solid transparent",
              padding: "8px 12px", cursor: "pointer",
              fontFamily: sans, fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? PAL.ink : PAL.muted,
            }}>
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input type="text" placeholder="Rechercher par nom..." value={q} onChange={e => setQ(e.target.value)} className="u-input"
            style={{ width: "100%", padding: "8px 10px 8px 34px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 13, background: PAL.paper, boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--pal-pale)", borderRadius: 9 }}>
          <button onClick={() => setView("list")} style={segBtn(view === "list")}><LayoutList size={14} /> Liste</button>
          <button onClick={() => setView("table")} style={segBtn(view === "table")}><TableIcon size={14} /> Tableau</button>
        </div>

        {view === "table" && (
          <>
            <button onClick={() => exportTable("xlsx")} className="btn-c btn-c-soft"><Download size={15} /> Excel</button>
            <button onClick={() => exportTable("csv")} className="btn-c btn-c-ghost"><Download size={15} /> CSV</button>
          </>
        )}

        <button onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} /> Ajouter un actif
        </button>
      </div>

      {view === "table" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <InventoryTable rows={tableRows} loading={loading} onOpen={openItem} />
          {selected && (
            <DetailsPanel item={selected} wide locaux={locaux} reloadLocaux={loadLocaux} onClose={() => setSelected(null)} onEdit={it => setModal({ open: true, editing: it })} onChanged={reload} />
          )}
        </div>
      ) : loading ? (
        <div className="shimmer" style={{ height: 100, borderRadius: 10 }} />
      ) : items.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Package size={28} />} text="Aucun article dans cette catégorie." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className="dash-card overflow-hidden">
              {items.map(item => {
                const isUnderAlert = item.niveau_alerte !== null && item.quantity <= item.niveau_alerte;
                return (
                  <div key={item.id} className="row-c" onClick={() => setSelected(item)}
                    style={{ cursor: "pointer", background: selected?.id === item.id ? "var(--pal-pale)" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ color: isUnderAlert ? "var(--pal-danger)" : PAL.primary }}><Package size={18} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                          {item.code_unique} · Qte: <strong style={{ color: isUnderAlert ? "var(--pal-danger)" : PAL.ink }}>{num(item.quantity)}</strong> {item.location ? `· ${item.location}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600 }}>{fmtMAD(item.initial_value)}</span>
                      <ChevronRight size={15} style={{ color: PAL.muted }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selected && (
            <DetailsPanel item={selected} wide={false} locaux={locaux} reloadLocaux={loadLocaux} onClose={() => setSelected(null)} onEdit={it => setModal({ open: true, editing: it })} onChanged={reload} />
          )}
        </div>
      )}
    </div>
  );
}
