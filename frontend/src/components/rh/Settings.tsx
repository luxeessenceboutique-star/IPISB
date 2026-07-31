import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Building2, FileBadge } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

type Department = { id: string; name: string; description: string | null };
type ContractType = { id: string; name: string; description: string | null; is_active: boolean };

function LookupModal({ title, editing, onClose, onSave }: {
  title: string; editing: { name: string; description: string | null } | null;
  onClose: () => void; onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await onSave(name, description);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{title}</h2>
        <label style={labelStyle}>Nom *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} className="u-input" style={fieldStyle} />
        <label style={labelStyle}>Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="u-input" style={{ ...fieldStyle, marginBottom: 22 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DepartmentsPanel() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Department | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try { setItems(await api.get("/api/rh/departments")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(name: string, description: string) {
    try {
      if (modal.editing) await api.patch(`/api/rh/departments/${modal.editing.id}`, { name, description: description || null });
      else await api.post("/api/rh/departments", { name, description: description || null });
      toast.success("Département enregistré.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    }
  }

  async function remove(d: Department) {
    if (!window.confirm(`Supprimer le département « ${d.name} » ?`)) return;
    try { await api.delete(`/api/rh/departments/${d.id}`); toast.success("Département supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors de la suppression."); }
  }

  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      {modal.open && (
        <LookupModal title={modal.editing ? "Modifier le département" : "Nouveau département"} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSave={save} />
      )}
      <SectionLabel action={
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-sm btn-c-primary">
          <Plus size={13} strokeWidth={1.7} />Ajouter
        </button>
      }>Départements</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 20 }}><div className="shimmer" style={{ height: 16, width: 140, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Building2 size={24} strokeWidth={1.7} />} text="Aucun département." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {items.map(d => (
            <div key={d.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{d.name}</div>
                {d.description && <div style={{ fontSize: 12, color: PAL.muted }}>{d.description}</div>}
              </div>
              <button onClick={() => setModal({ open: true, editing: d })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={13} strokeWidth={1.7} /></button>
              <button onClick={() => remove(d)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractTypesPanel() {
  const [items, setItems] = useState<ContractType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: ContractType | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try { setItems(await api.get("/api/rh/contract-types")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors du chargement."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(name: string, description: string) {
    try {
      if (modal.editing) await api.patch(`/api/rh/contract-types/${modal.editing.id}`, { name, description: description || null });
      else await api.post("/api/rh/contract-types", { name, description: description || null });
      toast.success("Type de contrat enregistré.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    }
  }

  async function remove(c: ContractType) {
    if (!window.confirm(`Supprimer le type de contrat « ${c.name} » ?`)) return;
    try { await api.delete(`/api/rh/contract-types/${c.id}`); toast.success("Type de contrat supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors de la suppression."); }
  }

  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      {modal.open && (
        <LookupModal title={modal.editing ? "Modifier le type de contrat" : "Nouveau type de contrat"} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSave={save} />
      )}
      <SectionLabel action={
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-sm btn-c-primary">
          <Plus size={13} strokeWidth={1.7} />Ajouter
        </button>
      }>Types de contrat</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 20 }}><div className="shimmer" style={{ height: 16, width: 140, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<FileBadge size={24} strokeWidth={1.7} />} text="Aucun type de contrat." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {items.map(c => (
            <div key={c.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{c.name}</div>
                {c.description && <div style={{ fontSize: 12, color: PAL.muted }}>{c.description}</div>}
              </div>
              <button onClick={() => setModal({ open: true, editing: c })} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><Pencil size={13} strokeWidth={1.7} /></button>
              <button onClick={() => remove(c)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RhSettings() {
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <DepartmentsPanel />
      <ContractTypesPanel />
    </div>
  );
}
