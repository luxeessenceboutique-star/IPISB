import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { AssignableUser } from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

export function TaskCreateModal({ users, onClose, onSaved }: { users: AssignableUser[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium", domain: "", assignee_id: "", due_date: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.title.trim()) { toast.error("Le titre est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/tasks", {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        domain: form.domain || null,
        assignee_id: form.assignee_id || null,
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

        <label style={labelStyle}>Domaine</label>
        <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Aucun —</option>
          <option value="rh">RH</option>
          <option value="comptabilite">Comptabilité</option>
          <option value="scolarite">Scolarité</option>
          <option value="general">Général</option>
        </select>

        <label style={labelStyle}>Assigné à</label>
        <select value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))} className="u-input" style={{ ...fieldStyle, marginBottom: 24 }}>
          <option value="">— Non assignée (backlog) —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>

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
