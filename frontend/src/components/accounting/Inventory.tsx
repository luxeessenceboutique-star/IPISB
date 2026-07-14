import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Tag, Trash2, X, AlertTriangle, MapPin, ChevronRight, Package, ArrowUpRight, ArrowDownRight, RefreshCw, Upload, Download, FileText } from "lucide-react";
import { SectionLabel, EmptyHint, ProgressBar } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";
import { supabase } from "@/integrations/supabase/client";

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

type Category = "consommable" | "equipement" | "locaux" | "service";
type ItemStatus = "actif" | "hors_service" | "vendu" | "perdu";

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
  amortized_amount: number;
  vnc: number;
  amortization_percentage: number;
  yearly_amortization: number;
};

type Movement = {
  id: string;
  inventory_item_id: string;
  movement_type: "entree" | "sortie" | "ajustement";
  quantity: number;
  movement_date: string;
  description: string | null;
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

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", asset_category: "consommable", initial_value: "0",
    purchase_date: new Date().toISOString().slice(0, 10),
    status: "actif", amortissement_duree_annees: "", niveau_alerte: "",
    quantity: "1", location: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/inventory", {
        name: form.name,
        asset_category: form.asset_category,
        initial_value: parseFloat(form.initial_value) || 0,
        purchase_date: form.purchase_date || null,
        status: form.status,
        amortissement_duree_annees: form.amortissement_duree_annees ? parseInt(form.amortissement_duree_annees) : null,
        niveau_alerte: form.niveau_alerte ? parseFloat(form.niveau_alerte) : null,
        quantity: parseFloat(form.quantity) || 0,
        location: form.location || null,
      });
      toast.success("Actif créé !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 480, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <h2 style={{ fontFamily: titleFont, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>Nouvel actif inventaire</h2>
        
        <label style={labelStyle}>Nom *</label>
        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="u-input" style={fieldStyle} />

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Quantité</label>
            <input type="number" step="any" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Valeur d'acquisition (HT)</label>
            <input type="number" step="any" value={form.initial_value} onChange={e => setForm(f => ({ ...f, initial_value: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Date d'achat</label>
            <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Durée Amortissement (années)</label>
            <input type="number" placeholder="Laisser vide si aucun" value={form.amortissement_duree_annees} onChange={e => setForm(f => ({ ...f, amortissement_duree_annees: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Seuil Alerte Stock</label>
            <input type="number" placeholder="Laisser vide si aucun" value={form.niveau_alerte} onChange={e => setForm(f => ({ ...f, niveau_alerte: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Localisation / Emplacement</label>
            <input type="text" placeholder="Ex: Salle 204" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

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

function DetailsPanel({ item, onClose, onChanged }: { item: InventoryItem; onClose: () => void; onChanged: () => void }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [mForm, setMForm] = useState({ movement_type: "entree", quantity: "1", description: "" });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadMovements() {
    try {
      const data = await api.get(`/api/accounting/inventory/${item.id}/movements`);
      setMovements(data ?? []);
    } catch {}
  }

  async function loadAttachments() {
    try {
      const data = await api.get(`/api/accounting/inventory/${item.id}`);
      setAttachments(data.attachments ?? []);
    } catch {}
  }

  useEffect(() => {
    loadMovements();
    loadAttachments();
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
      });
      toast.success("Mouvement enregistré !");
      setMForm({ movement_type: "entree", quantity: "1", description: "" });
      loadMovements();
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
      const res = await fetch(`${BASE}/api/accounting/purchases/${item.purchase_id}/attachments`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Justificatif ajouté.");
      loadAttachments();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteItem() {
    if (!window.confirm(`Supprimer définitivement l'actif « ${item.name} » et tout son historique ?`)) return;
    try {
      await api.delete(`/api/accounting/inventory/${item.id}`);
      toast.success("Actif supprimé.");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const labelStyle = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase" as const };

  return (
    <div className="dash-card" style={{ flex: "1 1 360px", minWidth: 0, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.muted }}>{item.code_unique}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: PAL.ink }}>{item.name}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={deleteItem} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
            <Trash2 size={15} />
          </button>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: PAL.muted }}>Statut</span>
          <span className="chip-c chip-c-green">{STATUS_LABELS[item.status]}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: PAL.muted }}>Localisation</span>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {item.location || "Non localisé"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: PAL.muted }}>Quantité en stock</span>
          <span style={{ fontWeight: 700, color: PAL.ink }}>
            {item.quantity}
            {item.niveau_alerte !== null && item.quantity <= item.niveau_alerte && (
              <span style={{ color: "var(--pal-danger)", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 2 }} title="Stock alerte">
                <AlertTriangle size={13} /> Alerte
              </span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: PAL.muted }}>Valeur d'acquisition</span>
          <span style={{ fontFamily: mono, fontWeight: 600 }}>{fmtMAD(item.initial_value)}</span>
        </div>
        {item.purchase_date && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: PAL.muted }}>Date d'acquisition</span>
            <span>{new Date(item.purchase_date).toLocaleDateString("fr-FR")}</span>
          </div>
        )}
      </div>

      {item.amortissement_duree_annees && (
        <div style={{ background: "var(--pal-pale)", padding: 14, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: PAL.ink, marginBottom: 6 }}>
            <span>Amortissement ({item.amortissement_duree_annees} ans)</span>
            <span>{item.amortization_percentage}%</span>
          </div>
          <ProgressBar value={item.amortization_percentage} tone="primary" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5, marginTop: 8, color: PAL.muted }}>
            <div>Cumul : <strong style={{ color: PAL.ink }}>{fmtMAD(item.amortized_amount)}</strong></div>
            <div style={{ textAlign: "right" }}>VNC : <strong style={{ color: PAL.ink }}>{fmtMAD(item.vnc)}</strong></div>
            <div>Dotation an. : <strong style={{ color: PAL.ink }}>{fmtMAD(item.yearly_amortization)}</strong></div>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: PAL.line, margin: "12px 0" }} />

      <SectionLabel>Mouvements de stock</SectionLabel>
      <div style={{ display: "flex", gap: 6, margin: "8px 0 12px" }}>
        <select value={mForm.movement_type} onChange={e => setMForm(f => ({ ...f, movement_type: e.target.value }))} className="u-input" style={{ flex: 1, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }}>
          <option value="entree">Entrée</option>
          <option value="sortie">Sortie</option>
          <option value="ajustement">Ajustement</option>
        </select>
        <input type="number" step="any" value={mForm.quantity} onChange={e => setMForm(f => ({ ...f, quantity: e.target.value }))} className="u-input" style={{ width: 60, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
        <input type="text" placeholder="Note" value={mForm.description} onChange={e => setMForm(f => ({ ...f, description: e.target.value }))} className="u-input" style={{ flex: 2, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }} />
        <button disabled={busy} onClick={handleAddMovement} className="btn-c btn-c-sm btn-c-primary" style={{ padding: "6px 10px" }}>Ajouter</button>
      </div>

      <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {movements.length === 0 ? (
          <div style={{ color: PAL.muted, fontSize: 12, textAlign: "center", padding: "10px 0" }}>Aucun historique.</div>
        ) : (
          movements.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {m.movement_type === "entree" ? <ArrowUpRight size={13} style={{ color: "green" }} /> : m.movement_type === "sortie" ? <ArrowDownRight size={13} style={{ color: "red" }} /> : <RefreshCw size={12} style={{ color: PAL.muted }} />}
                <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{m.movement_type} : {m.quantity}</span>
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
  );
}

export function AccountingInventory() {
  const [tab, setTab] = useState<Category>("consommable");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [alerts, setAlerts] = useState<InventoryItem[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/api/accounting/inventory?asset_category=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setItems(res.items ?? []);
      
      // Load alerts
      const alertData = await api.get("/api/accounting/inventory/alerts");
      setAlerts(alertData ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab, q]);

  return (
    <div style={{ fontFamily: sans }}>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSaved={load} />}

      {alerts.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "oklch(95% 0.02 30)", border: "1px solid oklch(85% 0.05 35)", borderRadius: 10, marginBottom: 16, color: "oklch(35% 0.05 35)", fontSize: 13 }}>
          <AlertTriangle size={18} />
          <div>
            <strong>Alerte stock critique :</strong> {alerts.length} article{alerts.length > 1 ? "s" : ""} sous le seuil d'alerte ({alerts.map(a => a.name).join(", ")}).
          </div>
        </div>
      )}

      {/* Internal Tabs for categories */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${PAL.line}` }}>
        {CATEGORIES.map(c => {
          const active = tab === c.key;
          return (
            <button
              key={c.key}
              onClick={() => { setTab(c.key); setSelected(null); }}
              style={{
                background: "none", border: 0,
                borderBottom: active ? `2px solid ${PAL.primary}` : "2px solid transparent",
                padding: "8px 12px", cursor: "pointer",
                fontFamily: sans, fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? PAL.ink : PAL.muted,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input
            type="text"
            placeholder="Rechercher par nom..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="u-input"
            style={{ width: "100%", padding: "8px 10px 8px 34px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 13, background: PAL.paper }}
          />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
          <Plus size={15} /> Ajouter un actif
        </button>
      </div>

      {loading ? (
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
                  <div
                    key={item.id}
                    className="row-c"
                    onClick={() => setSelected(item)}
                    style={{ cursor: "pointer", background: selected?.id === item.id ? "var(--pal-pale)" : undefined }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ color: isUnderAlert ? "var(--pal-danger)" : PAL.primary }}><Package size={18} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>
                          {item.code_unique} · Qte: <strong style={{ color: isUnderAlert ? "var(--pal-danger)" : PAL.ink }}>{item.quantity}</strong> {item.location ? `· ${item.location}` : ""}
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
            <DetailsPanel item={selected} onClose={() => setSelected(null)} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
