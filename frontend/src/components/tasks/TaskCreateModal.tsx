import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import type { AssignableUser, TaskChannel, TaskDomain } from "./types";
import { CHANNEL_LABEL, CHANNEL_DESC } from "./types";
import { AssigneePicker } from "./AssigneePicker";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

export function TaskCreateModal({ users, fixedDomain, onClose, onSaved }: {
  users: AssignableUser[]; fixedDomain?: TaskDomain; onClose: () => void; onSaved: () => void;
}) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    domain: fixedDomain ?? "", due_date: "",
  });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [channel, setChannel] = useState<TaskChannel | "">("");
  const [channelUsers, setChannelUsers] = useState<AssignableUser[]>([]);
  const [loadingChannelUsers, setLoadingChannelUsers] = useState(false);
  const [busy, setBusy] = useState(false);

  const isComptabilite = form.domain === "comptabilite";

  useEffect(() => {
    if (!isComptabilite || !channel) { setChannelUsers([]); return; }
    let active = true;
    setLoadingChannelUsers(true);
    api.get(`/api/tasks/assignable-users?channel=${channel}`)
      .then((u: AssignableUser[]) => { if (active) setChannelUsers(u); })
      .catch(() => { if (active) setChannelUsers([]); })
      .finally(() => { if (active) setLoadingChannelUsers(false); });
    return () => { active = false; };
  }, [isComptabilite, channel]);

  async function submit() {
    if (!form.title.trim()) { toast.error("Le titre est requis."); return; }
    if (isComptabilite && !channel) { toast.error("Choisissez un canal (V0, V1 ou V2) pour une tâche Comptabilité."); return; }
    setBusy(true);
    try {
      await api.post("/api/tasks", {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        domain: form.domain || null,
        channel: isComptabilite ? channel : null,
        assignee_ids: assigneeIds,
        due_date: form.due_date || null,
      });
      toast.success("Tâche créée !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setBusy(false);
    }
  }

  const assigneeOptions = isComptabilite ? channelUsers : users;

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouvelle tâche
        </h2>

        <label style={labelStyle}>Titre *</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="u-input" style={fieldStyle} placeholder="Ex. Préparer le rapport mensuel" />

        <label style={labelStyle}>Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Priorité</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="u-input" style={fieldStyle}>
              <option value="low">Faible</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Échéance</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        {!fixedDomain && (
          <>
            <label style={labelStyle}>Domaine</label>
            <select
              value={form.domain}
              onChange={e => { setForm(f => ({ ...f, domain: e.target.value })); setAssigneeIds([]); setChannel(""); }}
              className="u-input" style={fieldStyle}
            >
              <option value="">— Aucun —</option>
              <option value="rh">RH</option>
              {isAdmin && <option value="comptabilite">Comptabilité</option>}
              <option value="scolarite">Scolarité</option>
              <option value="general">Général</option>
            </select>
          </>
        )}

        {isComptabilite && (
          <>
            <label style={labelStyle}>Canal *</label>
            <select
              value={channel}
              onChange={e => { setChannel(e.target.value as TaskChannel | ""); setAssigneeIds([]); }}
              className="u-input" style={{ ...fieldStyle, marginBottom: 6 }}
            >
              <option value="">— Choisir —</option>
              {(["v2", "v1", "v0"] as TaskChannel[]).map(c => (
                <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
              ))}
            </select>
            {channel && <p style={{ margin: "0 0 12px", fontSize: 11.5, color: PAL.muted, lineHeight: 1.5 }}>{CHANNEL_DESC[channel]}</p>}
          </>
        )}

        <label style={labelStyle}>Assigné(s) — certains canaux demandent plusieurs personnes</label>
        <AssigneePicker
          selectedIds={assigneeIds}
          options={assigneeOptions}
          disabled={isComptabilite && (!channel || loadingChannelUsers)}
          placeholder="— Non assignée (backlog) —"
          onChange={setAssigneeIds}
        />
        {isComptabilite && !channel && (
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: PAL.muted }}>Choisissez d'abord un canal pour voir les profils correspondants.</p>
        )}
        <div style={{ marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Création…" : "Créer la tâche"}
          </button>
        </div>
      </div>
    </div>
  );
}
