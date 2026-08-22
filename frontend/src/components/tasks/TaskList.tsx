import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  type Task, type AssignableUser, type TaskStatus, type TaskPriority,
  STATUS_COLUMNS, PRIORITY_META, DOMAIN_LABEL, userLabel,
} from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)",
};
const sans = '"Manrope", system-ui, sans-serif';
const selectStyle = {
  fontFamily: sans, fontSize: 12.5, color: PAL.ink, border: `1px solid ${PAL.line}`,
  borderRadius: 8, padding: "6px 10px", background: "transparent", outline: "none",
};

type SortKey = "due_date" | "priority" | "status" | "title";
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TaskList({ tasks, users, onOpen }: {
  tasks: Task[]; users: AssignableUser[]; onOpen: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");

  const rows = useMemo(() => {
    let r = tasks;
    if (statusFilter) r = r.filter(t => t.status === statusFilter);
    if (assigneeFilter) r = r.filter(t => t.assignee_id === assigneeFilter);
    r = [...r].sort((a, b) => {
      if (sortKey === "due_date") return (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1;
      if (sortKey === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return a.title.localeCompare(b.title);
    });
    return r;
  }, [tasks, statusFilter, assigneeFilter, sortKey]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | "")} style={selectStyle}>
          <option value="">Tous les statuts</option>
          {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={selectStyle}>
          <option value="">Tous les assignés</option>
          {users.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={selectStyle}>
          <option value="due_date">Trier : échéance</option>
          <option value="priority">Trier : priorité</option>
          <option value="status">Trier : statut</option>
          <option value="title">Trier : titre</option>
        </select>
      </div>

      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                {["Titre", "Statut", "Priorité", "Assigné à", "Domaine", "Échéance"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: PAL.muted, letterSpacing: ".06em", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  style={{ borderBottom: `1px solid ${PAL.line}`, cursor: "pointer" }}
                  className="u-row-hover"
                >
                  <td style={{ padding: "10px 14px", fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>{t.title}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: PAL.muted }}>{STATUS_COLUMNS.find(s => s.key === t.status)?.label}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span className={PRIORITY_META[t.priority].chip}>{PRIORITY_META[t.priority].label}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: PAL.muted }}>{userLabel(users.find(u => u.id === t.assignee_id))}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: PAL.muted }}>{t.domain ? DOMAIN_LABEL[t.domain] : "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: PAL.muted }}>
                    {t.due_date ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <CalendarClock size={12} strokeWidth={1.8} />{new Date(t.due_date + "T00:00:00").toLocaleDateString("fr-FR")}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", fontSize: 13, color: PAL.muted }}>Aucune tâche.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
