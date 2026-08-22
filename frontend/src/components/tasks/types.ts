// Types partagés du module Gestion des tâches — miroir de
// backend/models.py (TASK_STATUSES, TASK_PRIORITIES, TASK_DOMAINS).

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskDomain = "rh" | "comptabilite" | "scolarite" | "general";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  domain: TaskDomain | null;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  text: string;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type AssignableUser = { id: string; full_name: string | null; email: string | null };

export const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "À faire" },
  { key: "in_progress", label: "En cours" },
  { key: "in_review", label: "En relecture" },
  { key: "done", label: "Terminé" },
  { key: "blocked", label: "Bloqué" },
  { key: "cancelled", label: "Annulé" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = Object.fromEntries(
  STATUS_COLUMNS.map((c) => [c.key, c.label])
) as Record<TaskStatus, string>;

export const PRIORITY_META: Record<TaskPriority, { label: string; chip: string }> = {
  low: { label: "Faible", chip: "chip-c" },
  medium: { label: "Moyenne", chip: "chip-c chip-c-blue" },
  high: { label: "Haute", chip: "chip-c chip-c-amber" },
  urgent: { label: "Urgente", chip: "chip-c chip-c-red" },
};

export const DOMAIN_LABEL: Record<TaskDomain, string> = {
  rh: "RH",
  comptabilite: "Comptabilité",
  scolarite: "Scolarité",
  general: "Général",
};

export function userLabel(u: AssignableUser | undefined | null): string {
  if (!u) return "—";
  return u.full_name || u.email || "—";
}
