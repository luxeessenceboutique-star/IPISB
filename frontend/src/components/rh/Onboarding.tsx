import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Check, FileSignature, Plus, Trash2 } from "lucide-react";
import { SectionLabel, EmptyHint, ProgressBar } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

type PlanItem = { id: string; label: string; done: boolean };
type Onboarding = {
  employee_id: string;
  phase: string;
  buddy_name: string | null;
  buddy_email: string | null;
  contract_signed: boolean;
  contract_signed_at: string | null;
  plan_30: PlanItem[];
  plan_60: PlanItem[];
  plan_90: PlanItem[];
};
type Pulse = { id: string; week_number: number | null; satisfaction_score: number | null; integration_score: number | null; clarity_score: number | null; comment: string | null; created_at: string };

const fieldStyle = { marginTop: 8, marginBottom: 12, width: "100%", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function newId() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Checklist({ title, items, onToggle, onAdd, onRemove }: {
  title: string; items: PlanItem[]; onToggle: (id: string) => void;
  onAdd: (label: string) => void; onRemove: (id: string) => void;
}) {
  const done = items.filter(i => i.done).length;
  const [draft, setDraft] = useState("");

  function submitDraft() {
    const label = draft.trim();
    if (!label) return;
    onAdd(label);
    setDraft("");
  }

  return (
    <div className="dash-card" style={{ padding: 18, flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: PAL.ink }}>{title}</span>
        <span style={{ fontSize: 12, color: PAL.muted }}>{done}/{items.length}</span>
      </div>
      <div style={{ marginBottom: 12 }}><ProgressBar value={items.length ? (done / items.length) * 100 : 0} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, color: item.done ? PAL.muted : PAL.ink, textDecoration: item.done ? "line-through" : "none", flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id)} />
              {item.label}
            </label>
            <button
              type="button" onClick={() => onRemove(item.id)} title="Retirer cet objectif"
              style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, display: "flex", flexShrink: 0, padding: 2 }}
            >
              <Trash2 size={12} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
          placeholder="Ajouter un objectif…"
          style={{ flex: 1, minWidth: 0, padding: "7px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12, color: PAL.ink, background: PAL.paper, outline: "none" }}
        />
        <button type="button" onClick={submitDraft} disabled={!draft.trim()} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: draft.trim() ? 1 : 0.5, flexShrink: 0 }}>
          <Plus size={13} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

function PulseForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ week_number: "1", satisfaction_score: "3", integration_score: "3", clarity_score: "3", comment: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/api/rh/onboarding/${employeeId}/pulse`, {
        week_number: parseInt(form.week_number, 10) || null,
        satisfaction_score: parseInt(form.satisfaction_score, 10),
        integration_score: parseInt(form.integration_score, 10),
        clarity_score: parseInt(form.clarity_score, 10),
        comment: form.comment || null,
      });
      toast.success("Pulse survey enregistré.");
      setForm(f => ({ ...f, comment: "" }));
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-card" style={{ padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: PAL.ink, marginBottom: 10 }}>Nouveau pulse survey</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <div>
          <label style={labelStyle}>Semaine</label>
          <input type="number" min="1" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Satisfaction (1-5)</label>
          <input type="number" min="1" max="5" value={form.satisfaction_score} onChange={e => setForm(f => ({ ...f, satisfaction_score: e.target.value }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Intégration (1-5)</label>
          <input type="number" min="1" max="5" value={form.integration_score} onChange={e => setForm(f => ({ ...f, integration_score: e.target.value }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Clarté (1-5)</label>
          <input type="number" min="1" max="5" value={form.clarity_score} onChange={e => setForm(f => ({ ...f, clarity_score: e.target.value }))} style={fieldStyle} />
        </div>
      </div>
      <label style={labelStyle}>Commentaire</label>
      <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const }} />
      <button type="button" onClick={submit} disabled={busy} className="btn-c btn-c-sm btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}>
        <Plus size={13} strokeWidth={1.7} />{busy ? "…" : "Ajouter"}
      </button>
    </div>
  );
}

export function RhOnboarding() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [loading, setLoading] = useState(false);
  const [buddy, setBuddy] = useState({ buddy_name: "", buddy_email: "" });

  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

  async function loadOnboarding(id: string) {
    setLoading(true);
    try {
      const data = await api.get(`/api/rh/onboarding/${id}`);
      setOnboarding(data);
      setBuddy({ buddy_name: data.buddy_name ?? "", buddy_email: data.buddy_email ?? "" });
      const p = await api.get(`/api/rh/onboarding/${id}/pulse`);
      setPulses(p ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (employeeId) loadOnboarding(employeeId); else { setOnboarding(null); setPulses([]); } }, [employeeId]);

  async function saveItems(planKey: "plan_30" | "plan_60" | "plan_90", updated: PlanItem[]) {
    if (!onboarding) return;
    setOnboarding({ ...onboarding, [planKey]: updated });
    try {
      await api.patch(`/api/rh/onboarding/${employeeId}`, { [planKey]: updated });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la mise à jour.");
      loadOnboarding(employeeId);
    }
  }

  function toggleItem(planKey: "plan_30" | "plan_60" | "plan_90", itemId: string) {
    if (!onboarding) return;
    saveItems(planKey, onboarding[planKey].map(i => i.id === itemId ? { ...i, done: !i.done } : i));
  }

  function addItem(planKey: "plan_30" | "plan_60" | "plan_90", label: string) {
    if (!onboarding) return;
    saveItems(planKey, [...onboarding[planKey], { id: newId(), label, done: false }]);
  }

  function removeItem(planKey: "plan_30" | "plan_60" | "plan_90", itemId: string) {
    if (!onboarding) return;
    saveItems(planKey, onboarding[planKey].filter(i => i.id !== itemId));
  }

  async function saveBuddy() {
    try {
      await api.patch(`/api/rh/onboarding/${employeeId}`, buddy);
      toast.success("Buddy enregistré.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    }
  }

  async function savePhase(phase: string) {
    if (!onboarding) return;
    setOnboarding({ ...onboarding, phase });
    try { await api.patch(`/api/rh/onboarding/${employeeId}`, { phase }); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function signContract() {
    try {
      await api.post(`/api/rh/onboarding/${employeeId}/sign-contract`, undefined);
      toast.success("Contrat signé.");
      loadOnboarding(employeeId);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  async function removePulse(id: string) {
    try { await api.delete(`/api/rh/onboarding/${employeeId}/pulse/${id}`); loadOnboarding(employeeId); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <SectionLabel>Intégration collaborateur</SectionLabel>
      </div>

      <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="u-input" style={{ padding: "10px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, background: PAL.paper, marginBottom: 20, minWidth: 260 }}>
        <option value="">— Choisir un employé —</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
      </select>

      {!employeeId ? (
        <div className="dash-card"><EmptyHint icon={<UserPlus size={28} strokeWidth={1.7} />} text="Sélectionnez un employé pour voir son plan d'intégration." /></div>
      ) : loading || !onboarding ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="dash-card" style={{ padding: 18, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Phase actuelle</label>
              <select value={onboarding.phase} onChange={e => savePhase(e.target.value)} className="u-input" style={{ ...fieldStyle, marginBottom: 0, width: 160 }}>
                <option value="day30">30 jours</option>
                <option value="day60">60 jours</option>
                <option value="day90">90 jours</option>
                <option value="completed">Terminé</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Buddy</label>
              <input type="text" placeholder="Nom" value={buddy.buddy_name} onChange={e => setBuddy(b => ({ ...b, buddy_name: e.target.value }))} className="u-input" style={{ ...fieldStyle, marginBottom: 0, width: 160, display: "inline-block", marginRight: 8 }} />
              <input type="email" placeholder="Email" value={buddy.buddy_email} onChange={e => setBuddy(b => ({ ...b, buddy_email: e.target.value }))} onBlur={saveBuddy} className="u-input" style={{ ...fieldStyle, marginBottom: 0, width: 180, display: "inline-block" }} />
            </div>
            <button type="button" onClick={saveBuddy} className="btn-c btn-c-sm btn-c-ghost">Enregistrer le buddy</button>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={signContract} disabled={onboarding.contract_signed} className="btn-c btn-c-sm btn-c-primary" style={{ opacity: onboarding.contract_signed ? 0.6 : 1 }}>
              {onboarding.contract_signed ? <Check size={13} strokeWidth={1.7} /> : <FileSignature size={13} strokeWidth={1.7} />}
              {onboarding.contract_signed ? "Contrat signé" : "Signer le contrat"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Checklist title="Plan 30 jours" items={onboarding.plan_30} onToggle={id => toggleItem("plan_30", id)} onAdd={label => addItem("plan_30", label)} onRemove={id => removeItem("plan_30", id)} />
            <Checklist title="Plan 60 jours" items={onboarding.plan_60} onToggle={id => toggleItem("plan_60", id)} onAdd={label => addItem("plan_60", label)} onRemove={id => removeItem("plan_60", id)} />
            <Checklist title="Plan 90 jours" items={onboarding.plan_90} onToggle={id => toggleItem("plan_90", id)} onAdd={label => addItem("plan_90", label)} onRemove={id => removeItem("plan_90", id)} />
          </div>

          <SectionLabel>Pulse surveys</SectionLabel>
          <PulseForm employeeId={employeeId} onSaved={() => loadOnboarding(employeeId)} />

          {pulses.length > 0 && (
            <div className="dash-card overflow-hidden">
              {pulses.map(p => (
                <div key={p.id} className="row-c flex-wrap">
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: PAL.ink }}>Semaine {p.week_number ?? "—"}</div>
                    <div style={{ fontSize: 12, color: PAL.muted }}>
                      Satisfaction {p.satisfaction_score ?? "—"} · Intégration {p.integration_score ?? "—"} · Clarté {p.clarity_score ?? "—"}
                      {p.comment ? ` · ${p.comment}` : ""}
                    </div>
                  </div>
                  <button onClick={() => removePulse(p.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
