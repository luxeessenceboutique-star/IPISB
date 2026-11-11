import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LayoutGrid, List, Plus } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { TaskBoard, TaskStats } from "@/components/tasks/TaskBoard";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { useDeepLinkModal } from "@/lib/deep-link";
import type { Task, AssignableUser } from "@/components/tasks/types";

// Page isolée dédiée aux tâches Comptabilité — même moteur que la page
// générique /dashboard/tasks (table `tasks`, domain="comptabilite"), mais
// filtrée et avec la création verrouillée à ce domaine + un canal V0/V1/V2
// obligatoire (voir TaskCreateModal.tsx / routers/tasks.py). Réservée aux
// rôles dont dérive un canal Comptabilité (admin/comptabilite/accountant =
// V1-V2, professor/assistant_rh = V0) — le caissier n'en fait pas partie
// (jamais mentionné dans le questionnaire des canaux).
export const Route = createFileRoute("/dashboard/accounting-tasks")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "comptabilite", "accountant", "professor", "assistant_rh"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: AccountingTasksPage,
});

const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

function AccountingTasksPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [view, setView] = useState<"board" | "list">("board");
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([
        api.get("/api/tasks?domain=comptabilite&page_size=200"),
        api.get("/api/tasks/assignable-users"),
      ]);
      setAllTasks(t.items ?? t);
      setUsers(u);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des tâches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sécurité d'affichage : même si l'API est déjà filtrée par domain, on ne
  // montre jamais une tâche non-Comptabilité ici (ex. réponse en cache).
  const tasks = useMemo(() => allTasks.filter(t => t.domain === "comptabilite"), [allTasks]);

  useDeepLinkModal(tasks.map(t => t.id), setOpenTaskId);

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Comptabilité"
        title="Tâches et instances"
        sub="Suivi des tâches de l'équipe par canal V0/V1/V2 — vue Kanban ou liste."
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
            {isAdmin && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
                <Plus size={15} strokeWidth={2} /> Nouvelle tâche
              </button>
            )}
          </>
        }
      />

      {!isAdmin && (
        <div className="dash-card" style={{ padding: "10px 16px", marginBottom: 18, fontSize: 12.5, color: "var(--pal-muted)" }}>
          Seul un administrateur (V2) crée une tâche et choisit son canal. Vous pouvez consulter les tâches et faire évoluer le statut de celles qui vous sont assignées.
        </div>
      )}

      {!loading && <TaskStats tasks={tasks} />}

      {loading ? (
        <div className="shimmer" style={{ height: 320, borderRadius: 16 }} />
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} users={users} onOpen={setOpenTaskId} onChanged={load} />
      ) : (
        <TaskList tasks={tasks} users={users} onOpen={setOpenTaskId} />
      )}

      {showCreate && (
        <TaskCreateModal users={users} fixedDomain="comptabilite" onClose={() => setShowCreate(false)} onSaved={load} />
      )}
      {openTaskId && (
        <TaskDetailModal taskId={openTaskId} users={users} onClose={() => setOpenTaskId(null)} onChanged={load} />
      )}
    </div>
  );
}
