import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LayoutGrid, List, Plus } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { usePermissions } from "@/lib/permissions";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
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

const sans = '"Manrope", system-ui, sans-serif';

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

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Organisation"
        title="Gestion des tâches"
        sub="Créez, assignez et suivez les tâches de l'équipe — vue Kanban ou liste."
        actions={
          <>
            <div style={{ display: "flex", border: "1px solid var(--pal-line)", borderRadius: 8, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setView("board")}
                title="Vue Kanban"
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: 0, cursor: "pointer",
                  background: view === "board" ? "var(--pal-primary)" : "transparent",
                  color: view === "board" ? "#fff" : "var(--pal-muted)", fontFamily: sans, fontSize: 12.5, fontWeight: 600,
                }}
              >
                <LayoutGrid size={14} strokeWidth={1.8} /> Kanban
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                title="Vue liste"
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: 0, cursor: "pointer",
                  background: view === "list" ? "var(--pal-primary)" : "transparent",
                  color: view === "list" ? "#fff" : "var(--pal-muted)", fontFamily: sans, fontSize: 12.5, fontWeight: 600,
                }}
              >
                <List size={14} strokeWidth={1.8} /> Liste
              </button>
            </div>
            {canCreate && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn-c-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={15} strokeWidth={2} /> Nouvelle tâche
              </button>
            )}
          </>
        }
      />

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
