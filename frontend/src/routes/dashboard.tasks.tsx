import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LayoutGrid, List, Plus } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { usePermissions } from "@/lib/permissions";
import { TaskBoard, TaskStats } from "@/components/tasks/TaskBoard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { useDeepLinkModal } from "@/lib/deep-link";
import type { Task, AssignableUser } from "@/components/tasks/types";

export const Route = createFileRoute("/dashboard/tasks")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "professor", "rh", "assistant_rh", "comptabilite", "cashier", "accountant"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: TasksPage,
});

const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

function TasksPage() {
  const { can } = usePermissions();
  const canCreate = can("tasks.tasks", "create");
  const [view, setView] = useState<"board" | "list">("board");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([
        api.get("/api/tasks?page_size=200"),
        api.get("/api/tasks/assignable-users"),
      ]);
      setTasks(t.items ?? t);
      setUsers(u);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des tâches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep-link depuis une notification (?focus=<taskId>) → ouvre la tâche.
  useDeepLinkModal(tasks.map(t => t.id), setOpenTaskId);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Organisation"
        title="Gestion des tâches"
        sub="Créez, assignez et suivez les tâches de l'équipe — vue Kanban ou liste."
        actions={
          <>
            <div className="seg-rail" role="tablist" aria-label="Affichage" style={{ marginBottom: 0 }}>
              <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "seg-tab on" : "seg-tab"} onClick={() => setView("board")}>
                <LayoutGrid size={14} strokeWidth={1.8} /> Kanban
              </button>
              <button type="button" role="tab" aria-selected={view === "list"} className={view === "list" ? "seg-tab on" : "seg-tab"} onClick={() => setView("list")}>
                <List size={14} strokeWidth={1.8} /> Liste
              </button>
            </div>
            {canCreate && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
                <Plus size={15} strokeWidth={2} /> Nouvelle tâche
              </button>
            )}
          </>
        }
      />

      {!loading && <TaskStats tasks={tasks} />}

      {loading ? (
        <div className="shimmer" style={{ height: 320, borderRadius: 16 }} />
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} users={users} onOpen={setOpenTaskId} onChanged={load} />
      ) : (
        <TaskList tasks={tasks} users={users} onOpen={setOpenTaskId} />
      )}

      {showCreate && (
        <TaskCreateModal users={users} onClose={() => setShowCreate(false)} onSaved={load} />
      )}
      {openTaskId && (
        <TaskDetailModal taskId={openTaskId} users={users} onClose={() => setOpenTaskId(null)} onChanged={load} />
      )}
    </div>
  );
}
