// Types partagés du module Gestion des tâches — miroir de
// backend/models.py (TASK_STATUSES, TASK_PRIORITIES, TASK_DOMAINS).

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskDomain = "rh" | "comptabilite" | "scolarite" | "general";
// Canal de permission Comptabilité (questionnaire des canaux) — pertinent
// uniquement pour domain === "comptabilite" ; null pour les autres domaines.
export type TaskChannel = "v0" | "v1" | "v2";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  domain: TaskDomain | null;
  // Une tâche peut réunir plusieurs canaux à la fois (ex. un V0 saisit, un
  // V1 supervise, un V2 valide, tous sur la même tâche).
  channels: TaskChannel[];
  // Certains canaux (V0/V1/V2) demandent qu'une tâche soit portée par 2 ou
  // 3 personnes à la fois — jamais un seul assigné forcé.
  assignee_ids: string[];
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

// Mêmes libellés/descriptions que la page Utilisateurs (dashboard.users.tsx)
// — V2 (admin) > V1 (comptabilite) > V0 (professor/assistant_rh/accountant).
export const CHANNEL_LABEL: Record<TaskChannel, string> = { v0: "V0", v1: "V1", v2: "V2" };
export const CHANNEL_DESC: Record<TaskChannel, string> = {
  v0: "Saisie/consultation limitée aux pages autorisées — toute opération doit être validée par un V1. Formateurs, Assistantes, Comptable.",
  v1: "S'auto-valide entièrement sur ses tâches (Canal 1) ; garde un accès de supervision sur le Canal 2. Comptabilité.",
  v2: "Validation finale sur le Canal 2 (Annuler/Supprimer inclus) + accès admin complet. Administrateur.",
};
export const CHANNEL_STYLE: Record<TaskChannel, string> = {
  v2: "chip-c chip-c-blue",
  v1: "chip-c chip-c-green",
  v0: "chip-c",
};

export function userLabel(u: AssignableUser | undefined | null): string {
  if (!u) return "—";
  return u.full_name || u.email || "—";
}

/** Libellés des assignés d'une tâche, dans l'ordre de `ids` (peut être vide,
 * un seul, ou plusieurs — certains canaux demandent 2-3 personnes à la fois). */
export function assigneesLabel(users: AssignableUser[], ids: string[]): string {
  if (ids.length === 0) return "—";
  return ids.map(id => userLabel(users.find(u => u.id === id))).join(", ");
}
