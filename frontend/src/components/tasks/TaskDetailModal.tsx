import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Trash2, Send, History } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import {
  type Task, type TaskComment, type AuditEntry, type AssignableUser,
  STATUS_COLUMNS, PRIORITY_META, DOMAIN_LABEL, userLabel,
} from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

// Traduction courte des actions d'audit_log en libellé lisible pour l'historique.
const ACTION_LABEL: Record<string, string> = {
  "task.create": "Tâche créée",
  "task.update": "Tâche modifiée",
  "task.assign": "Assignation modifiée",
  "task.delete": "Tâche supprimée",
  "task.comment.create": "Commentaire ajouté",
  "task.comment.delete": "Commentaire supprimé",
};
function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith("task.status.")) return `Statut → ${action.replace("task.status.", "")}`;
  return action;
}

export function TaskDetailModal({ taskId, users, onClose, onChanged }: {
  taskId: string; users: AssignableUser[]; onClose: () => void; onChanged: () => void;
}) {
  const { user, roles } = useAuth();
  const { can } = usePermissions();
  const isAdmin = roles.includes("admin");
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [t, c] = await Promise.all([
        api.get(`/api/tasks/${taskId}`),
        api.get(`/api/tasks/${taskId}/comments`),
      ]);
      setTask(t);
      setComments(c);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
      onClose();
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId]);

  async function loadHistory() {
    if (history.length || !task) return;
    try { setHistory(await api.get(`/api/tasks/${taskId}/history`)); } catch { /* silencieux */ }
  }

  const canEdit = can("tasks.tasks", "edit");
  // Suppression : réservée au créateur, à l'assigné, ou à l'admin — reflète
  // côté UI la même règle que _require_owner_or_admin() côté backend (voir
  // routers/tasks.py). Le backend reste la source de vérité en cas d'écart.
  const showDelete = !!user && !!task && (task.created_by === user.id || task.assignee_id === user.id || isAdmin);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const updated = await api.patch(`/api/tasks/${taskId}`, body);
      setTask(updated);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la mise à jour.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    try {
      const updated = await api.patch(`/api/tasks/${taskId}/status`, { status });
      setTask(updated);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du changement de statut.");
    } finally {
      setBusy(false);
    }
  }

  async function setAssignee(assignee_id: string) {
    setBusy(true);
    try {
      const updated = await api.patch(`/api/tasks/${taskId}/assign`, { assignee_id: assignee_id || null });
      setTask(updated);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'assignation.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Supprimer cette tâche définitivement ?")) return;
    try {
      await api.delete(`/api/tasks/${taskId}`);
      toast.success("Tâche supprimée.");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression refusée.");
    }
  }

  async function addComment() {
    const text = commentText.trim();
    if (!text) return;
    try {
      const c = await api.post(`/api/tasks/${taskId}/comments`, { text });
      setComments(cs => [...cs, c]);
      setCommentText("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout du commentaire.");
    }
  }

  async function removeComment(id: string) {
    try {
      await api.delete(`/api/tasks/comments/${id}`);
      setComments(cs => cs.filter(c => c.id !== id));
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression refusée.");
    }
  }

  if (!task) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="shimmer" style={{ width: 560, maxWidth: "95vw", height: 320, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 560, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <input
            defaultValue={task.title}
            disabled={!canEdit || busy}
            onBlur={e => e.target.value.trim() && e.target.value !== task.title && patch({ title: e.target.value.trim() })}
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, border: 0, background: "transparent", outline: "none", flex: 1, padding: 0 }}
          />
          {showDelete && (
            <button onClick={remove} title="Supprimer" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={16} strokeWidth={1.8} /></button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Statut</label>
            <select value={task.status} disabled={!canEdit || busy} onChange={e => setStatus(e.target.value)} className="u-input" style={fieldStyle}>
              {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priorité</label>
            <select value={task.priority} disabled={!canEdit || busy} onChange={e => patch({ priority: e.target.value })} className="u-input" style={fieldStyle}>
              {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Assigné à</label>
            <select value={task.assignee_id ?? ""} disabled={!canEdit || busy} onChange={e => setAssignee(e.target.value)} className="u-input" style={fieldStyle}>
              <option value="">— Non assignée —</option>
              {users.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Échéance</label>
            <input type="date" defaultValue={task.due_date ?? ""} disabled={!canEdit || busy}
              onBlur={e => patch({ due_date: e.target.value || null })} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Domaine</label>
        <select value={task.domain ?? ""} disabled={!canEdit || busy} onChange={e => patch({ domain: e.target.value || null })} className="u-input" style={fieldStyle}>
          <option value="">— Aucun —</option>
          {Object.entries(DOMAIN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>

        <label style={labelStyle}>Description</label>
        <textarea defaultValue={task.description ?? ""} disabled={!canEdit || busy} rows={3}
          onBlur={e => patch({ description: e.target.value || null })} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <div style={{ height: 1, background: PAL.line, margin: "8px 0 16px" }} />

        <SectionTitle>Commentaires</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 180, overflowY: "auto" }}>
          {comments.length === 0 && <div style={{ fontSize: 13, color: PAL.muted }}>Aucun commentaire.</div>}
          {comments.map(c => (
            <div key={c.id} className="dash-card" style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, color: PAL.ink }}>{c.text}</div>
              {(c.author_id === user?.id || isAdmin) && (
                <button onClick={() => removeComment(c.id)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, flexShrink: 0 }}>
                  <Trash2 size={13} strokeWidth={1.7} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={commentText} onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addComment()}
            placeholder="Ajouter un commentaire…" className="u-input" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
          <button onClick={addComment} className="btn-c btn-c-sm btn-c-ghost" style={{ flexShrink: 0 }}><Send size={14} strokeWidth={1.8} /></button>
        </div>

        <button type="button" onClick={() => { setShowHistory(s => !s); loadHistory(); }} className="btn-c btn-c-sm btn-c-ghost">
          <History size={13} strokeWidth={1.8} />{showHistory ? "Masquer l'historique" : "Voir l'historique"}
        </button>
        {showHistory && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {history.length === 0 && <div style={{ fontSize: 12.5, color: PAL.muted }}>Aucun événement.</div>}
            {history.map(h => (
              <div key={h.id} style={{ fontSize: 12.5, color: PAL.muted, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{actionLabel(h.action)}</span>
                <span>{new Date(h.created_at).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...labelStyle, marginBottom: 8 }}>{children}</div>;
}
