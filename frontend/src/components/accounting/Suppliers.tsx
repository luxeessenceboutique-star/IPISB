import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Building2, Trash2, X } from "lucide-react";
import { SectionLabel, EmptyHint, DashAvatar } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

type Supplier = {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  notes: string | null;
  total_purchases: number;
  total_spent: number;
  last_purchase: string | null;
};

const emptyForm = { company_name: "", contact_person: "", email: "", phone: "", address: "", tax_number: "", notes: "" };

function FormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.company_name.trim()) { toast.error("Le nom de l'entreprise est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/accounting/suppliers", {
        ...form,
        contact_person: form.contact_person || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        tax_number: form.tax_number || null,
        notes: form.notes || null,
      });
      toast.success("Fournisseur créé !");
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
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouveau fournisseur
        </h2>

        <label style={labelStyle}>Nom de l'entreprise *</label>
        <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Personne à contacter</label>
        <input type="text" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className="u-input" style={fieldStyle} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>E-mail</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Téléphone</label>
            <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Adresse</label>
        <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Numéro fiscal (IF/ICE)</label>
        <input type="text" value={form.tax_number} onChange={e => setForm(f => ({ ...f, tax_number: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Création…" : "Créer le fournisseur"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountingSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);

  async function load() {
    setLoading(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const data: Supplier[] = await api.get(`/api/accounting/suppliers${qs}`);
      setSuppliers(data);
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
  }, [q]);

  async function remove(s: Supplier) {
    if (!window.confirm(`Supprimer le fournisseur « ${s.company_name} » ?`)) return;
    try {
      await api.delete(`/api/accounting/suppliers/${s.id}`);
      toast.success("Fournisseur supprimé.");
      if (selected?.id === s.id) setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Fournisseur utilisé par des achats existants.");
    }
  }

  return (
    <div>
      {showCreate && <FormModal onClose={() => setShowCreate(false)} onSaved={load} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={15} strokeWidth={1.7} style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: PAL.muted }} />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un fournisseur…"
            className="u-input"
            style={{ width: "100%", padding: "11px 14px 11px 40px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouveau fournisseur
        </button>
      </div>

      <SectionLabel>{suppliers.length} fournisseur{suppliers.length !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Building2 size={28} strokeWidth={1.7} />} text="Aucun fournisseur pour l'instant." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="dash-card overflow-hidden" style={{ flex: "1 1 360px", minWidth: 0 }}>
            {suppliers.map(s => (
              <div
                key={s.id}
                className="row-c flex-wrap"
                onClick={() => setSelected(s)}
                style={{ cursor: "pointer", background: selected?.id === s.id ? "var(--pal-pale)" : undefined }}
              >
                <DashAvatar name={s.company_name} size={34} tone="mid" />
                <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{s.company_name}</div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>{s.contact_person || s.email || "—"}</div>
                </div>
                <span className="chip-c">{s.total_purchases} achat{s.total_purchases !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>

          {selected && (
            <div className="dash-card" style={{ flex: "1 1 300px", minWidth: 0, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink }}>{selected.company_name}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => remove(selected)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
                    <Trash2 size={15} strokeWidth={1.7} />
                  </button>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}>
                    <X size={18} strokeWidth={1.7} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <Row label="Contact" value={selected.contact_person} />
                <Row label="E-mail" value={selected.email} />
                <Row label="Téléphone" value={selected.phone} />
                <Row label="Adresse" value={selected.address} />
                <Row label="N° fiscal" value={selected.tax_number} />
              </div>

              <div style={{ height: 1, background: PAL.line, margin: "16px 0" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <Row label="Total achats" value={String(selected.total_purchases)} />
                <Row label="Total dépensé" value={fmtMAD(selected.total_spent)} />
                <Row label="Dernier achat" value={selected.last_purchase ? new Date(selected.last_purchase).toLocaleDateString("fr-FR") : "—"} />
              </div>

              {selected.notes && (
                <>
                  <div style={{ height: 1, background: PAL.line, margin: "16px 0" }} />
                  <p style={{ fontSize: 12.5, color: PAL.muted, lineHeight: 1.5 }}>{selected.notes}</p>
                </>
              )}
            </div>
          )}
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
