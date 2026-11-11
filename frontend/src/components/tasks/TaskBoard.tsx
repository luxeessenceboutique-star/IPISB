import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { Odometer } from "@/components/pouls/Odometer";
import {
  type Task, type TaskStatus, type AssignableUser,
  STATUS_COLUMNS, PRIORITY_META, CHANNEL_LABEL, CHANNEL_DESC, CHANNEL_STYLE, assigneesLabel,
} from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};

// Couleur de pastille par colonne (langage « Pouls »).
export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "oklch(48% 0.02 180)", in_progress: "oklch(55% 0.1 250)", in_review: "oklch(72% 0.11 60)",
  done: "oklch(48% 0.085 175)", blocked: "oklch(64% 0.18 25)", cancelled: "oklch(70% 0.01 180)",
};
export const STATUS_CHIP: Record<TaskStatus, string> = {
  todo: "chip-c", in_progress: "chip-c chip-c-blue", in_review: "chip-c chip-c-amber",
  done: "chip-c chip-c-green", blocked: "chip-c chip-c-red", cancelled: "chip-c",
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function isLate(t: Task) {
  return !!t.due_date && t.due_date < todayIso() && t.status !== "done" && t.status !== "cancelled";
}
function initials(users: AssignableUser[], id: string) {
  const u = users.find(x => x.id === id);
  const name = (u?.full_name || u?.email || "?").trim();
  return name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function TaskCard({ task, users, onOpen, index }: { task: Task; users: AssignableUser[]; onOpen: () => void; index: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const assigneesText = assigneesLabel(users, task.assignee_ids);
  const late = isLate(task);
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={"task-card" + (late ? " late" : "")}
      style={{ ...style, ["--i" as string]: index, cursor: isDragging ? "grabbing" : "grab", opacity: isDragging ? 0.35 : 1, touchAction: "none" } as React.CSSProperties}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {task.channels.map(c => (
          <span key={c} className={CHANNEL_STYLE[c]} style={{ fontSize: 10 }} title={CHANNEL_DESC[c]}>{CHANNEL_LABEL[c]}</span>
        ))}
        <span className={PRIORITY_META[task.priority].chip} style={{ marginInlineStart: "auto" }}>{PRIORITY_META[task.priority].label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: PAL.ink, lineHeight: 1.35 }}>{task.title}</div>
      {late && <span className="task-late">En retard</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {task.assignee_ids.length > 0 && (
          <span className="task-avs" title={assigneesText}>
            {task.assignee_ids.slice(0, 3).map(id => <span key={id}>{initials(users, id)}</span>)}
            {task.assignee_ids.length > 3 && <span>+{task.assignee_ids.length - 3}</span>}
          </span>
        )}
        {task.due_date && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: late ? "oklch(50% 0.15 25)" : PAL.muted, marginInlineStart: "auto" }}>
            <CalendarClock size={12} strokeWidth={1.8} />{new Date(task.due_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ status, label, tasks, users, onOpen, index }: {
  status: TaskStatus; label: string; tasks: Task[]; users: AssignableUser[]; onOpen: (id: string) => void; index: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={label} className={"task-col" + (isOver ? " over" : "")} style={{ ["--i" as string]: index } as React.CSSProperties}>
      <div className="task-col-h">
        <i style={{ background: STATUS_DOT[status] }} />
        <span>{label}</span>
        <b>{tasks.length}</b>
      </div>
      {tasks.map((t, i) => <TaskCard key={t.id} task={t} users={users} index={i} onOpen={() => onOpen(t.id)} />)}
      <div className="task-drop">Déposer une tâche ici</div>
    </section>
  );
}

/** Bandeau « constantes » des tâches : ouvertes, en retard, terminées. */
export function TaskStats({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length;
  const late = tasks.filter(isLate).length;
  const done = tasks.filter(t => t.status === "done").length;
  const items = [
    { label: "Tâches ouvertes", value: open, tone: "var(--pal-primary-deep)", bg: "var(--pal-pale)" },
    { label: "En retard", value: late, tone: "oklch(50% 0.15 25)", bg: "oklch(95% 0.03 25)" },
    { label: "Terminées", value: done, tone: "oklch(40% 0.09 250)", bg: "oklch(94% 0.03 250)" },
  ];
  return (
    <div className="task-stats">
      {items.map((it, i) => (
        <div key={it.label} className="dash-card vital" style={{ padding: "14px 18px", gap: 8 }}>
          <span className="mono-eyebrow">{it.label}</span>
          <div className="v" style={{ fontSize: 30, color: it.tone }}><Odometer value={it.value} delayIndex={i * 2} /></div>
          <span style={{ height: 4, borderRadius: 4, background: it.bg }} />
        </div>
      ))}
    </div>
  );
}

export function TaskBoard({ tasks, users, onOpen, onChanged }: {
  tasks: Task[]; users: AssignableUser[]; onOpen: (id: string) => void; onChanged: () => void;
}) {
  const { can } = usePermissions();
  const canEdit = can("tasks.tasks", "edit");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], done: [], blocked: [], cancelled: [] };
    for (const t of tasks) map[t.status]?.push(t);
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find(t => t.id === activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const targetStatus = e.over?.id as TaskStatus | undefined;
    if (!targetStatus) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;
    try {
      await api.patch(`/api/tasks/${taskId}/status`, { status: targetStatus });
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de déplacer la tâche.");
    }
  }

  if (!canEdit) {
    // Lecture seule (théorique : Canal 1 rend "edit" large — gardé par
    // cohérence si le canal bascule un jour en V1_THEN_V2).
    return (
      <div className="task-board">
        {STATUS_COLUMNS.map((c, i) => (
          <Column key={c.key} status={c.key} label={c.label} tasks={byStatus[c.key]} users={users} onOpen={onOpen} index={i} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="task-board">
        {STATUS_COLUMNS.map((c, i) => (
          <Column key={c.key} status={c.key} label={c.label} tasks={byStatus[c.key]} users={users} onOpen={onOpen} index={i} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="task-card dragging" style={{ width: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: PAL.ink }}>{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
