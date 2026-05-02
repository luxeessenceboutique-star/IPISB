import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell,
  Loader2,
  CheckCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/notifications")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: NotificationsPage,
});

type Notification = {
  id: string;
  title: string;
  message: string | null;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TYPE_COLOR: Record<string, string> = {
  info: "bg-blue-50 border-blue-100 text-blue-600",
  success: "bg-green-50 border-green-100 text-green-600",
  warning: "bg-yellow-50 border-yellow-100 text-yellow-600",
  error: "bg-red-50 border-red-100 text-red-600",
};

const TYPE_BADGE: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

function NotificationsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/api/notifications");
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // Keep Supabase Realtime for live push notifications
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user!.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          toast.info((payload.new as Notification).title);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function markRead(id: string) {
    setMarking(id);
    await api.put(`/api/notifications/${id}/read`);
    setMarking(null);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await api.put("/api/notifications/read-all");
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success(t("notifications.mark_all_read"));
  }

  async function deleteNotification(id: string) {
    await api.delete(`/api/notifications/${id}`);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const typeLabel = (type: string) => {
    const map: Record<string, { fr: string; en: string }> = {
      info: { fr: "Info", en: "Info" },
      success: { fr: "Succès", en: "Success" },
      warning: { fr: "Alerte", en: "Warning" },
      error: { fr: "Erreur", en: "Error" },
    };
    return map[type]?.[lang as "fr" | "en"] ?? type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              {t("dash.notifications")}
            </h1>
            {unreadCount > 0 && (
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("notifications.subtitle")}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            {t("notifications.mark_all_read")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-20 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">{t("notifications.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Info;
            return (
              <Card
                key={n.id}
                className={`flex items-start gap-4 border p-4 transition-all ${
                  n.read ? "border-border bg-card opacity-70" : "border-primary/20 bg-card shadow-card"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${TYPE_COLOR[n.type] ?? "bg-muted"}`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-medium ${n.read ? "text-foreground/70" : "text-foreground"}`}>
                        {n.title}
                      </p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                      <Badge className={`border-0 text-xs ${TYPE_BADGE[n.type] ?? "bg-muted text-foreground"}`}>
                        {typeLabel(n.type)}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!n.read && (
                        <button
                          type="button"
                          disabled={marking === n.id}
                          onClick={() => markRead(n.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={t("notifications.mark_read")}
                        >
                          {marking === n.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteNotification(n.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {n.message && (
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{fmtDate(n.created_at)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
