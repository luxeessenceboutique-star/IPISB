import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import {
  type Task, type TaskStatus, type AssignableUser,
  STATUS_COLUMNS, PRIORITY_META, userLabel,
} from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

function TaskCard({ task, users, onOpen }: { task: Task; users: AssignableUser[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const assignee = users.find(u => u.id === task.assignee_id);
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className="dash-card anim-rise"
      style={{
        ...style,
        padding: "12px 14px", marginBottom: 10, cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : 1, touchAction: "none",
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: PAL.ink, marginBottom: 6 }}>{task.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={PRIORITY_META[task.priority].chip}>{PRIORITY_META[task.priority].label}</span>
        {task.due_date && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: PAL.muted }}>
            <CalendarClock size={11} strokeWidth={1.8} />{new Date(task.due_date + "T00:00:00").toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>
      {assignee && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: PAL.muted }}>{userLabel(assignee)}</div>
      )}
    </div>
  );
}

function Column({ status, label, tasks, users, onOpen }: {
  status: TaskStatus; label: string; tasks: Task[]; users: AssignableUser[]; onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: "1 1 220px", minWidth: 220, background: isOver ? "var(--pal-pale)" : "transparent",
        borderRadius: 12, padding: 10, transition: "background .12s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
        <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const }}>{label}</span>
        <span style={{ fontSize: 11, color: PAL.muted, background: "var(--pal-pale)", borderRadius: 99, padding: "1px 8px" }}>{tasks.length}</span>
      </div>
      {tasks.map(t => <TaskCard key={t.id} task={t} users={users} onOpen={() => onOpen(t.id)} />)}
      {tasks.length === 0 && (
        <div style={{ fontSize: 12, color: PAL.muted, padding: "8px 4px", border: `1px dashed ${PAL.line}`, borderRadius: 10, textAlign: "center" }}>
          Déposer ici
        </div>
      )}
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
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {STATUS_COLUMNS.map(c => (
          <Column key={c.key} status={c.key} label={c.label} tasks={byStatus[c.key]} users={users} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {STATUS_COLUMNS.map(c => (
          <Column key={c.key} status={c.key} label={c.label} tasks={byStatus[c.key]} users={users} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="dash-card" style={{ padding: "12px 14px", width: 220, boxShadow: "0 12px 30px rgba(0,0,0,.15)" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: PAL.ink }}>{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
