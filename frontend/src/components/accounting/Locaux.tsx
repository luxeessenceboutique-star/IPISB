import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, DoorClosed, Users, EyeOff, Eye } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

/** Référentiel des locaux — types + helpers partagés avec Inventory.tsx. */
export type Local = {
  id: string;
  name: string;
  floor: string;
  code: string | null;
  capacity: number | null;
  note: string | null;
  sort_order: number;
  active: boolean;
  created_at?: string;
};

export const FLOOR_OPTIONS: { key: string; label: string }[] = [
  { key: "rdc", label: "RDC" },
  { key: "1er", label: "1er étage" },
  { key: "2e", label: "2e étage" },
  { key: "3e", label: "3e étage" },
  { key: "4e", label: "4e étage" },
  { key: "terrasse", label: "Terrasse" },
];

export const FLOOR_LABEL = (k: string) => FLOOR_OPTIONS.find(f => f.key === k)?.label ?? k;

const FLOOR_RANK = (k: string) => {
  const i = FLOOR_OPTIONS.findIndex(f => f.key === k);
  return i < 0 ? FLOOR_OPTIONS.length : i;
};

export function groupByFloor(locaux: Local[]): { floor: string; rooms: Local[] }[] {
  const m = new Map<string, Local[]>();
  for (const l of locaux) {
    if (!m.has(l.floor)) m.set(l.floor, []);
    m.get(l.floor)!.push(l);
  }
  return [...m.entries()]
    .sort((a, b) => FLOOR_RANK(a[0]) - FLOOR_RANK(b[0]))
    .map(([floor, rooms]) => ({
      floor,
      rooms: rooms.sort((x, y) => (x.sort_order - y.sort_order) || x.name.localeCompare(y.name)),
    }));
}

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const titleFont = '"Cormorant Garamond", Georgia, serif';

const inputStyle: React.CSSProperties = { padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 4, display: "block" };

function EditModal({ local, onClose, onSaved }: { local: Local; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: local.name,
    floor: local.floor,
    code: local.code ?? "",
    capacity: local.capacity != null ? String(local.capacity) : "",
    note: local.note ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await api.patch(`/api/accounting/locaux/${local.id}`, {
        name: form.name.trim(),
        floor: form.floor,
        code: form.code.trim() || null,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        note: form.note.trim() || null,
      });
      toast.success("Local modifié.");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 50px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ fontFamily: titleFont, fontSize: 23, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>Modifier le local</h2>
          <button onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer", color: PAL.muted }}><X size={18} /></button>
        </div>

        <label style={labelStyle}>Nom *</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="u-input" style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Étage</label>
            <select value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} className="u-input" style={{ ...inputStyle, width: "100%" }}>
              {FLOOR_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Capacité (places)</label>
            <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} className="u-input" style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        <label style={labelStyle}>Code (optionnel)</label>
        <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Ex: 3-S01" className="u-input" style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />

        <label style={labelStyle}>Note</label>
        <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="u-input" style={{ ...inputStyle, width: "100%", resize: "vertical" }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
          <button onClick={save} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export function AccountingLocaux() {
  const [locaux, setLocaux] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ name: "", floor: "3e", capacity: "" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Local | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data: Local[] = await api.get(`/api/accounting/locaux?include_inactive=true`);
      setLocaux(data ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.name.trim()) { toast.error("Le nom du local est requis."); return; }
    setCreating(true);
    try {
      await api.post("/api/accounting/locaux", {
        name: form.name.trim(),
        floor: form.floor,
        capacity: form.capacity ? parseInt(form.capacity) : null,
      });
      toast.success("Local ajouté.");
      setForm(f => ({ ...f, name: "", capacity: "" }));
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(l: Local) {
    try {
      await api.patch(`/api/accounting/locaux/${l.id}`, { active: !l.active });
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  async function remove(l: Local) {
    if (!window.confirm(`Supprimer le local « ${l.name} » ?`)) return;
    try {
      await api.delete(`/api/accounting/locaux/${l.id}`);
      toast.success("Local supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  const visible = useMemo(() => locaux.filter(l => showInactive || l.active), [locaux, showInactive]);
  const groups = useMemo(() => groupByFloor(visible), [visible]);
  const inactiveCount = locaux.filter(l => !l.active).length;

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={labelStyle}>Nouveau local</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && add()} placeholder="Ex: Salle 05" className="u-input" style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          <label style={labelStyle}>Étage</label>
          <select value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} className="u-input" style={inputStyle}>
            {FLOOR_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div style={{ width: 110 }}>
          <label style={labelStyle}>Capacité</label>
          <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="—" className="u-input" style={{ ...inputStyle, width: "100%" }} />
        </div>
        <button type="button" disabled={creating} onClick={add} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Ajouter
        </button>
      </div>

      {inactiveCount > 0 && (
        <button type="button" onClick={() => setShowInactive(s => !s)} className="btn-c btn-c-ghost btn-c-sm" style={{ marginBottom: 16 }}>
          {showInactive ? <Eye size={13} /> : <EyeOff size={13} />} {showInactive ? "Masquer" : "Afficher"} les {inactiveCount} local(aux) désactivé(s)
        </button>
      )}

      {editing && <EditModal local={editing} onClose={() => setEditing(null)} onSaved={load} />}

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : visible.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<DoorClosed size={28} strokeWidth={1.7} />} text="Aucun local enregistré." /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map(g => (
            <div key={g.floor}>
              <SectionLabel action={<span style={{ fontFamily: sans, fontSize: 12, color: PAL.muted }}>{g.rooms.length} local(aux)</span>}>
                {FLOOR_LABEL(g.floor)}
              </SectionLabel>
              <div className="dash-card overflow-hidden">
                {g.rooms.map(l => (
                  <div key={l.id} className="row-c flex-wrap" style={{ opacity: l.active ? 1 : 0.5 }}>
                    <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><DoorClosed size={18} strokeWidth={1.7} /></span>
                    <div className="min-w-0 flex-1">
                      <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>
                        {l.name} {!l.active && <span className="chip-c" style={{ fontSize: 10 }}>désactivé</span>}
                      </div>
                      {(l.code || l.note) && <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 2 }}>{[l.code, l.note].filter(Boolean).join(" · ")}</div>}
                    </div>
                    {l.capacity != null && (
                      <span className="chip-c chip-c-blue" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Users size={11} /> {l.capacity}</span>
                    )}
                    <button type="button" onClick={() => toggleActive(l)} title={l.active ? "Désactiver" : "Réactiver"} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
                      {l.active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button type="button" onClick={() => setEditing(l)} title="Modifier" style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(l)} title="Supprimer" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
