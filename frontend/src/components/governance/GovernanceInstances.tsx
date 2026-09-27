import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Landmark, ChevronDown, ChevronUp, CalendarClock } from "lucide-react";
import { EmptyHint } from "@/components/dashboard/ui";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)", pale: "oklch(96% 0.01 170)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

export type Meeting = {
  id: string; instance_nom: string | null; code_reunion: string | null; date: string;
  lieu: string | null; presence: string | null; decisions: string | null; taux_realisation: number | null;
};
export type Instance = {
  id: string; niveau: 1 | 2; date: string; projet: string; demandeur: string | null; site: string | null;
  axe: string | null; code: string | null; recommandation: string; commentaire: string | null;
  budget_kdh: number | null; delai: string | null; derniere_maj: string | null;
  historique_avancement: string | null; sponsor: string | null; pilotage: string | null;
  operationnel: string | null; prochain_controle: string | null; meetings: Meeting[];
};

const fieldStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, background: PAL.paper, outline: "none", boxSizing: "border-box", marginBottom: 10 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: PAL.muted, marginBottom: 3 };
const gridRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

function fmtKDH(v: number | null): string {
  if (v == null) return "—";
  return `${v.toLocaleString("fr-FR")} KDH`;
}
function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR");
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)} %`;
}

function Backdrop({ children, width = 620 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{children}</h2>;
}

/* ─── Instance form (création / édition) ─── */
function InstanceFormModal({ niveau, editing, onClose, onSaved }: {
  niveau: 1 | 2; editing: Instance | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    date: editing?.date ?? new Date().toISOString().slice(0, 10),
    projet: editing?.projet ?? "",
    demandeur: editing?.demandeur ?? "",
    site: editing?.site ?? "",
    axe: editing?.axe ?? "",
    code: editing?.code ?? "",
    recommandation: editing?.recommandation ?? "",
    commentaire: editing?.commentaire ?? "",
    budget_kdh: editing?.budget_kdh?.toString() ?? "",
    delai: editing?.delai ?? "",
    sponsor: editing?.sponsor ?? "",
    pilotage: editing?.pilotage ?? "",
    operationnel: editing?.operationnel ?? "",
    prochain_controle: editing?.prochain_controle ?? "",
    historique_avancement: editing?.historique_avancement ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.projet.trim() || !form.recommandation.trim()) {
      toast.error("Projet et Recommandation sont obligatoires.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        budget_kdh: form.budget_kdh ? parseFloat(form.budget_kdh) : null,
        delai: form.delai || null,
        prochain_controle: form.prochain_controle || null,
      };
      if (editing) {
        await api.patch(`/api/reunions-instances/${editing.id}`, payload);
        toast.success("Instance mise à jour.");
      } else {
        await api.post("/api/reunions-instances", { ...payload, niveau });
        toast.success("Instance créée.");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop width={680}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <H2>{editing ? "Modifier l'instance" : "Nouvelle instance"}</H2>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted }}><X size={20} /></button>
      </div>

      <div style={gridRow}>
        <div><label style={labelStyle}>Projet *</label><input className="u-input" style={fieldStyle} value={form.projet} onChange={e => set("projet", e.target.value)} /></div>
        <div><label style={labelStyle}>Date</label><input type="date" className="u-input" style={fieldStyle} value={form.date} onChange={e => set("date", e.target.value)} /></div>
      </div>
      <div style={gridRow}>
        <div><label style={labelStyle}>Demandeur</label><input className="u-input" style={fieldStyle} value={form.demandeur} onChange={e => set("demandeur", e.target.value)} placeholder="ex. Comex" /></div>
        <div><label style={labelStyle}>Site</label><input className="u-input" style={fieldStyle} value={form.site} onChange={e => set("site", e.target.value)} placeholder="ex. El Jadida" /></div>
      </div>
      <div style={gridRow}>
        <div><label style={labelStyle}>Axe</label><input className="u-input" style={fieldStyle} value={form.axe} onChange={e => set("axe", e.target.value)} placeholder="ex. Gouvernance" /></div>
        <div><label style={labelStyle}>Code</label><input className="u-input" style={{ ...fieldStyle, fontFamily: mono }} value={form.code} onChange={e => set("code", e.target.value)} placeholder="ex. Digi001" /></div>
      </div>

      <label style={labelStyle}>Recommandation / Instance *</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 56, resize: "vertical" as const }} value={form.recommandation} onChange={e => set("recommandation", e.target.value)} />

      <label style={labelStyle}>Commentaire</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 48, resize: "vertical" as const }} value={form.commentaire} onChange={e => set("commentaire", e.target.value)} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div><label style={labelStyle}>Budget (KDH)</label><input type="number" min="0" step="any" className="u-input" style={{ ...fieldStyle, fontFamily: mono }} value={form.budget_kdh} onChange={e => set("budget_kdh", e.target.value)} /></div>
        <div><label style={labelStyle}>Délai</label><input type="date" className="u-input" style={fieldStyle} value={form.delai} onChange={e => set("delai", e.target.value)} /></div>
        <div><label style={labelStyle}>Prochain contrôle</label><input type="date" className="u-input" style={fieldStyle} value={form.prochain_controle} onChange={e => set("prochain_controle", e.target.value)} /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div><label style={labelStyle}>Sponsor</label><input className="u-input" style={fieldStyle} value={form.sponsor} onChange={e => set("sponsor", e.target.value)} /></div>
        <div><label style={labelStyle}>Pilotage</label><input className="u-input" style={fieldStyle} value={form.pilotage} onChange={e => set("pilotage", e.target.value)} /></div>
        <div><label style={labelStyle}>Opérationnel</label><input className="u-input" style={fieldStyle} value={form.operationnel} onChange={e => set("operationnel", e.target.value)} /></div>
      </div>

      <label style={labelStyle}>Historique de l'avancement</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 70, resize: "vertical" as const, marginBottom: 20 }} value={form.historique_avancement} onChange={e => set("historique_avancement", e.target.value)} placeholder="ex. 2026/06/15 : réunion de cadrage…" />

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-c btn-c-primary">
          {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'instance"}
        </button>
      </div>
    </Backdrop>
  );
}

/* ─── Réunion (création / édition) ─── */
function MeetingFormModal({ instanceId, editing, onClose, onSaved }: {
  instanceId: string; editing: Meeting | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    instance_nom: editing?.instance_nom ?? "",
    code_reunion: editing?.code_reunion ?? "",
    date: editing?.date ?? new Date().toISOString().slice(0, 10),
    lieu: editing?.lieu ?? "",
    presence: editing?.presence ?? "",
    decisions: editing?.decisions ?? "",
    taux_realisation: editing ? Math.round((editing.taux_realisation ?? 0) * 100).toString() : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    try {
      const payload = {
        ...form,
        taux_realisation: form.taux_realisation ? parseFloat(form.taux_realisation) / 100 : null,
      };
      if (editing) {
        await api.patch(`/api/reunions-instances/meetings/${editing.id}`, payload);
        toast.success("Réunion mise à jour.");
      } else {
        await api.post(`/api/reunions-instances/${instanceId}/meetings`, payload);
        toast.success("Réunion ajoutée.");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop width={520}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <H2>{editing ? "Modifier la réunion" : "Nouvelle réunion"}</H2>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted }}><X size={20} /></button>
      </div>

      <label style={labelStyle}>Instance (organe réuni)</label>
      <input className="u-input" style={fieldStyle} value={form.instance_nom} onChange={e => set("instance_nom", e.target.value)} placeholder="ex. Réunion avec l'équipe du Projet Digital" />

      <div style={gridRow}>
        <div><label style={labelStyle}>Code réunion</label><input className="u-input" style={{ ...fieldStyle, fontFamily: mono }} value={form.code_reunion} onChange={e => set("code_reunion", e.target.value)} /></div>
        <div><label style={labelStyle}>Date</label><input type="date" className="u-input" style={fieldStyle} value={form.date} onChange={e => set("date", e.target.value)} /></div>
      </div>
      <div style={gridRow}>
        <div><label style={labelStyle}>Lieu</label><input className="u-input" style={fieldStyle} value={form.lieu} onChange={e => set("lieu", e.target.value)} /></div>
        <div><label style={labelStyle}>Taux de réalisation (%)</label><input type="number" min="0" max="100" step="1" className="u-input" style={{ ...fieldStyle, fontFamily: mono }} value={form.taux_realisation} onChange={e => set("taux_realisation", e.target.value)} /></div>
      </div>

      <label style={labelStyle}>Présence</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 48, resize: "vertical" as const }} value={form.presence} onChange={e => set("presence", e.target.value)} placeholder="un nom par ligne" />

      <label style={labelStyle}>Décisions / Avancement</label>
      <textarea className="u-input" style={{ ...fieldStyle, minHeight: 56, resize: "vertical" as const, marginBottom: 20 }} value={form.decisions} onChange={e => set("decisions", e.target.value)} />

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button type="button" onClick={submit} disabled={busy} className="btn-c btn-c-primary">
          {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter la réunion"}
        </button>
      </div>
    </Backdrop>
  );
}

/* ─── Une instance, avec ses réunions dépliables ─── */
function InstanceRow({ instance, onChanged }: { instance: Instance; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState(false);
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  async function removeInstance(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Supprimer l'instance « ${instance.recommandation.slice(0, 60)} » ? Ses réunions seront aussi retirées.`)) return;
    try {
      await api.delete(`/api/reunions-instances/${instance.id}`);
      toast.success("Instance supprimée.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function removeMeeting(m: Meeting, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Supprimer cette réunion ?")) return;
    try {
      await api.delete(`/api/reunions-instances/meetings/${m.id}`);
      toast.success("Réunion supprimée.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  const lastMeeting = instance.meetings[instance.meetings.length - 1];

  return (
    <div>
      <div className="row-c flex-wrap" style={{ cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><Landmark size={17} strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{instance.projet}</span>
            {instance.code && <span className="chip-c" style={{ fontFamily: mono, fontSize: 11 }}>{instance.code}</span>}
            {instance.axe && <span className="chip-c chip-c-blue" style={{ fontSize: 11 }}>{instance.axe}</span>}
          </div>
          <div style={{ fontSize: 12, color: PAL.muted, marginTop: 2 }}>{instance.recommandation}</div>
        </div>
        <span style={{ fontFamily: mono, fontSize: 12, color: PAL.muted }}>{fmtKDH(instance.budget_kdh)}</span>
        {lastMeeting?.taux_realisation != null && (
          <span className="chip-c chip-c-green" style={{ fontSize: 11 }}>{fmtPct(lastMeeting.taux_realisation)}</span>
        )}
        <button type="button" onClick={e => { e.stopPropagation(); setEditingInstance(true); }} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={14} strokeWidth={1.7} /></button>
        <button type="button" onClick={removeInstance} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
        {open ? <ChevronUp size={16} strokeWidth={1.8} style={{ color: PAL.muted }} /> : <ChevronDown size={16} strokeWidth={1.8} style={{ color: PAL.muted }} />}
      </div>

      {open && (
        <div style={{ padding: "10px 16px 16px 40px", background: PAL.pale, borderRadius: 10, marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 12, marginBottom: 12 }}>
            <div><span style={{ color: PAL.muted }}>Demandeur : </span>{instance.demandeur || "—"}</div>
            <div><span style={{ color: PAL.muted }}>Site : </span>{instance.site || "—"}</div>
            <div><span style={{ color: PAL.muted }}>Délai : </span>{fmtDate(instance.delai)}</div>
            <div><span style={{ color: PAL.muted }}>Sponsor : </span>{instance.sponsor || "—"}</div>
            <div><span style={{ color: PAL.muted }}>Pilotage : </span>{instance.pilotage || "—"}</div>
            <div><span style={{ color: PAL.muted }}>Opérationnel : </span>{instance.operationnel || "—"}</div>
            <div><span style={{ color: PAL.muted }}>Prochain contrôle : </span>{fmtDate(instance.prochain_controle)}</div>
            <div><span style={{ color: PAL.muted }}>Dernière MAJ : </span>{fmtDate(instance.derniere_maj)}</div>
          </div>
          {instance.commentaire && <div style={{ fontSize: 12.5, color: PAL.ink, marginBottom: 8 }}>{instance.commentaire}</div>}
          {instance.historique_avancement && (
            <div style={{ fontSize: 11.5, color: PAL.muted, whiteSpace: "pre-line", marginBottom: 12, borderInlineStart: `2px solid ${PAL.line}`, paddingInlineStart: 8 }}>
              {instance.historique_avancement}
            </div>
          )}

          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: PAL.muted, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <CalendarClock size={12} /> Réunions
          </div>
          {instance.meetings.length === 0 ? (
            <div style={{ fontSize: 12, color: PAL.muted, marginBottom: 8 }}>Aucune réunion enregistrée.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {instance.meetings.map(m => (
                <div key={m.id} className="row-c flex-wrap" style={{ background: PAL.paper, borderRadius: 8, padding: "6px 10px" }}>
                  <div className="min-w-0 flex-1" style={{ fontSize: 12.5, color: PAL.ink }}>
                    {m.instance_nom || "Réunion"}
                    <span style={{ color: PAL.muted }}> · {fmtDate(m.date)}{m.lieu ? ` · ${m.lieu}` : ""}</span>
                  </div>
                  {m.taux_realisation != null && <span className="chip-c chip-c-green" style={{ fontSize: 11 }}>{fmtPct(m.taux_realisation)}</span>}
                  <button type="button" onClick={() => setEditingMeeting(m)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Modifier"><Pencil size={13} strokeWidth={1.7} /></button>
                  <button type="button" onClick={e => removeMeeting(m, e)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={13} strokeWidth={1.7} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setAddingMeeting(true)} className="btn-c btn-c-sm btn-c-ghost">
            <Plus size={12} strokeWidth={1.8} />Ajouter une réunion
          </button>
        </div>
      )}

      {editingInstance && (
        <InstanceFormModal niveau={instance.niveau} editing={instance} onClose={() => setEditingInstance(false)} onSaved={onChanged} />
      )}
      {addingMeeting && (
        <MeetingFormModal instanceId={instance.id} editing={null} onClose={() => setAddingMeeting(false)} onSaved={onChanged} />
      )}
      {editingMeeting && (
        <MeetingFormModal instanceId={instance.id} editing={editingMeeting} onClose={() => setEditingMeeting(null)} onSaved={onChanged} />
      )}
    </div>
  );
}

/* ─── Point d'entrée : suivi des instances pour un niveau donné ─── */
export function GovernanceInstances({ niveau }: { niveau: 1 | 2 }) {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setInstances(await api.get(`/api/reunions-instances?niveau=${niveau}`));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des instances.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [niveau]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" onClick={() => setCreating(true)} className="btn-c btn-c-primary btn-c-sm">
          <Plus size={14} strokeWidth={1.8} />Nouvelle instance
        </button>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 220, borderRadius: 999 }} />
        </div>
      ) : !instances || instances.length === 0 ? (
        <div className="dash-card" style={{ padding: 0 }}>
          <EmptyHint
            icon={<Landmark size={28} strokeWidth={1.6} />}
            text={`Aucune instance suivie pour le niveau ${niveau === 1 ? "① — instances de direction" : "② — instances pédagogiques"}.`}
          />
        </div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: "6px 14px" }}>
          {instances.map(inst => <InstanceRow key={inst.id} instance={inst} onChanged={load} />)}
        </div>
      )}

      {creating && (
        <InstanceFormModal niveau={niveau} editing={null} onClose={() => setCreating(false)} onSaved={load} />
      )}
    </div>
  );
}
