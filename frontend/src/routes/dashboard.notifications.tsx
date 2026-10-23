import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Bell, Loader2, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Trash2 } from "lucide-react";
import { ListSkeleton } from "@/components/Skeletons";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/notifications")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: NotificationsPage,
});

type Notification = { id: string; title: string; message: string | null; type: string; read: boolean; link: string | null; created_at: string };

const TYPE_ICON: Record<string, typeof Info> = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

function NotificationsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase.channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, payload => {
        const n = payload.new as Notification;
        setNotifications(prev => [n, ...prev]);
        toast.info(n.title, n.link ? {
          action: {
            label: lang === "fr" ? "Ouvrir" : lang === "ar" ? "فتح" : "Open",
            onClick: () => { if (!n.read) markRead(n.id); navigate({ href: n.link! }); },
          },
        } : undefined);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function markRead(id: string) {
    if (!user) return;
    setMarking(id);
    await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
    setMarking(null);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success(t("notifications.mark_all_read"));
  }

  async function deleteNotification(id: string) {
    if (!user) return;
    await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const visible = filter === "unread" ? notifications.filter(n => !n.read) : notifications;
  const fmtAgo = (d: string) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
    const days = Math.floor(mins / 1440);
    if (lang === "ar" || lang === "en") {
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins} min ago`;
      if (mins < 1440) return `${Math.floor(mins / 60)} h ago`;
      if (days === 1) return "Yesterday";
      if (days < 7) return `${days} d ago`;
      return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    if (mins < 1440) return `Il y a ${Math.floor(mins / 60)} h`;
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} j`;
    return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const pill = (active: boolean): React.CSSProperties => ({
    padding: "9px 20px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
    border: "1px solid " + (active ? "var(--pal-ink)" : "var(--pal-line, oklch(88% 0.02 165))"),
    background: active ? "var(--pal-ink)" : "#fff", color: active ? "#fff" : "var(--pal-ink)",
  });

  return (
    <div>
      <PageHead
        eyebrow={lang === "fr" ? "Activité récente" : lang === "ar" ? "النشاط الأخير" : "Recent activity"}
        title={t("dash.notifications")}
        sub={t("notifications.subtitle")}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" style={pill(filter === "all")} onClick={() => setFilter("all")}>
            {lang === "fr" ? "Toutes" : lang === "ar" ? "الكل" : "All"}
          </button>
          <button type="button" style={pill(filter === "unread")} onClick={() => setFilter("unread")}>
            {lang === "fr" ? "Non lues" : lang === "ar" ? "غير المقروءة" : "Unread"}
          </button>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={markAllRead} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--pal-primary-deep)" }}>
            {t("notifications.mark_all_read")}
          </button>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Bell size={28} strokeWidth={1.7} />} text={t("notifications.empty")} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(n => {
            const Icon = TYPE_ICON[n.type] ?? Info;
            return (
              <div
                key={n.id}
                className="group flex items-center gap-4 transition-shadow hover:shadow-md"
                style={{
                  padding: "16px 20px", borderRadius: 18, background: "oklch(99% 0.006 165)",
                  border: "1px solid oklch(80% 0.05 165)", opacity: n.read ? 0.78 : 1,
                  cursor: n.link ? "pointer" : undefined,
                }}
                onClick={() => {
                  if (!n.link) return;
                  if (!n.read) markRead(n.id);
                  // `href` (et non `to`) : TanStack Router découpe la chaîne en
                  // pathname + search + hash. Indispensable pour les liens du type
                  // "/dashboard/accounting?tab=validations".
                  navigate({ href: n.link });
                }}
              >
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 12, background: "oklch(22% 0.025 175)", color: "#fff" }}
                >
                  <Icon size={19} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--pal-ink)" }}>{n.title}</p>
                  {n.message && <p className="mt-0.5" style={{ fontSize: 13, color: "var(--pal-muted)" }}>{n.message}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="whitespace-nowrap" style={{ fontSize: 12, color: "var(--pal-muted)" }}>{fmtAgo(n.created_at)}</span>
                  <div className="flex items-center gap-1">
                    {!n.read && (
                      <button type="button" disabled={marking === n.id} onClick={e => { e.stopPropagation(); markRead(n.id); }} className="rounded-lg p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100" title={t("notifications.mark_read")}>
                        {marking === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); deleteNotification(n.id); }} className="rounded-lg p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {!n.read && <span className="rounded-full" style={{ width: 8, height: 8, background: "oklch(62% 0.2 25)" }} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
