import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Boxes, Trash2, Pencil } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const STATUS_LABEL: Record<string, string> = { available: "Disponible", assigned: "Assigné", maintenance: "Maintenance", retired: "Retiré" };

type Asset = {
  id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  employee_id: string | null;
  employee_name: string | null;
  status: string;
  notes: string | null;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function statusColor(status: string) {
  if (status === "assigned") return "var(--pal-primary)";
  if (status === "maintenance") return "var(--pal-warn)";
  if (status === "retired") return "var(--pal-muted)";
  return "var(--pal-good)";
}

function FormModal({ employees, editing, onClose, onSaved }: { employees: Employee[]; editing: Asset | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name ?? "", category: editing?.category ?? "", serial_number: editing?.serial_number ?? "",
    employee_id: editing?.employee_id ?? "", status: editing?.status ?? "available", notes: editing?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    const payload = {
      name: form.name,
      category: form.category || null,
      serial_number: form.serial_number || null,
      employee_id: form.employee_id || null,
      status: form.employee_id ? undefined : form.status,
      notes: form.notes || null,
    };
    try {
      if (editing) await api.patch(`/api/rh/assets/${editing.id}`, payload);
      else await api.post("/api/rh/assets", payload);
      toast.success(editing ? "Matériel modifié !" : "Matériel ajouté !");
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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 460, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          {editing ? "Modifier le matériel" : "Nouveau matériel"}
        </h2>

        <label style={labelStyle}>Nom *</label>
        <input type="text" placeholder="Laptop Dell XPS 15…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <input type="text" placeholder="Informatique, Mobilier…" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>N° de série</label>
            <input type="text" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Assigné à</label>
        <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Non assigné —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>

        {!form.employee_id && (
          <>
            <label style={labelStyle}>Statut</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="u-input" style={fieldStyle}>
              {Object.entries(STATUS_LABEL).filter(([v]) => v !== "assigned").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        )}

        <label style={labelStyle}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RhAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Asset | null }>({ open: false, editing: null });
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try { setAssets(await api.get("/api/rh/assets")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

  async function remove(a: Asset) {
    if (!window.confirm(`Supprimer « ${a.name} » ?`)) return;
    try { await api.delete(`/api/rh/assets/${a.id}`); toast.success("Matériel supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors de la suppression."); }
  }

  const filtered = q ? assets.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || (a.serial_number ?? "").toLowerCase().includes(q.toLowerCase())) : assets;

  return (
    <div>
      {modal.open && (
        <FormModal employees={employees} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un matériel…" className="u-input" style={{ width: "100%", padding: "10px 14px 10px 38px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouveau matériel
        </button>
      </div>

      <SectionLabel>{filtered.length} article{filtered.length !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Boxes size={28} strokeWidth={1.7} />} text="Aucun matériel trouvé." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {filtered.map(a => (
            <div key={a.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><Boxes size={18} strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{a.name}</div>
                <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                  {a.category || "—"}{a.serial_number ? ` · ${a.serial_number}` : ""}{a.employee_name ? ` · ${a.employee_name}` : ""}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: statusColor(a.status), background: "var(--pal-pale)" }}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
              <button onClick={() => setModal({ open: true, editing: a })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={14} strokeWidth={1.7} /></button>
              <button onClick={() => remove(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
