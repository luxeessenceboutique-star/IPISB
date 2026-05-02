import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/users")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: sess.session.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  roles: AppRole[];
};

const ALL_ROLES: AppRole[] = ["admin", "professor", "student"];

function UsersPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/api/users");
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addRole(userId: string, role: AppRole) {
    setBusyId(userId);
    try {
      await api.post(`/api/users/${userId}/roles`, { role, action: "add" });
      toast.success(t("users.role_added"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function removeRole(userId: string, role: AppRole) {
    if (userId === user?.id && role === "admin") {
      toast.error(t("users.cannot_remove_self_admin"));
      return;
    }
    setBusyId(userId);
    try {
      await api.post(`/api/users/${userId}/roles`, { role, action: "remove" });
      toast.success(t("users.role_removed"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";

  const roleColor = (r: AppRole) =>
    r === "admin"
      ? "bg-gradient-brand text-white"
      : r === "professor"
        ? "bg-primary/15 text-primary"
        : "bg-muted text-foreground/70";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{t("users.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("users.subtitle")}</p>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("users.empty")}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("users.col.user")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("users.col.email")}</TableHead>
                <TableHead>{t("users.col.roles")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("users.col.created")}</TableHead>
                <TableHead className="text-right">{t("users.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const available = ALL_ROLES.filter((role) => !r.roles.includes(role));
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{r.email}</div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {r.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {r.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {r.roles.map((role) => (
                          <Badge
                            key={role}
                            className={`${roleColor(role)} gap-1 border-0 hover:opacity-90`}
                          >
                            {t(`dash.role.${role}`)}
                            <button
                              type="button"
                              onClick={() => removeRole(r.id, role)}
                              disabled={busyId === r.id}
                              className="ml-0.5 rounded-full hover:bg-black/10"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {fmt(r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {available.length > 0 && (
                        <Select
                          onValueChange={(v) => addRole(r.id, v as AppRole)}
                          disabled={busyId === r.id}
                        >
                          <SelectTrigger className="ml-auto h-8 w-auto gap-1 border-dashed text-xs">
                            <Plus className="h-3 w-3" />
                            <SelectValue placeholder={t("users.add_role")} />
                          </SelectTrigger>
                          <SelectContent>
                            {available.map((role) => (
                              <SelectItem key={role} value={role}>
                                {t(`dash.role.${role}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
