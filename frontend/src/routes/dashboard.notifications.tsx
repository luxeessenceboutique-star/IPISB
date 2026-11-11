import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Bell, Loader2, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Trash2, BellDot, Inbox, ChevronRight } from "lucide-react";
import { ListSkeleton } from "@/components/Skeletons";
import { PageHead, EmptyHint, SegTabs } from "@/components/dashboard/ui";

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
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
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

  /** Suppression en masse : `mine` = toutes les miennes, `read` = les lues, `all` = TOUS les utilisateurs (admin). */
  async function bulkDelete(scope: "mine" | "read" | "all") {
    if (scope === "mine" && !window.confirm(t("notifications.confirm_delete_all"))) return;
    if (scope === "all" && !window.confirm(t("notifications.confirm_purge_all"))) return;
    try {
      await api.delete(`/api/notifications?scope=${scope}`);
      toast.success(t("notifications.deleted"));
      if (scope === "read") setNotifications(prev => prev.filter(n => !n.read));
      else setNotifications([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const readCount = notifications.length - unreadCount;
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

  // Regroupement par période : Aujourd'hui / Hier / Cette semaine / Plus ancien.
  const L = (fr: string, ar: string, en: string) => lang === "fr" ? fr : lang === "ar" ? ar : en;
  const bucketOf = (d: string) => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = new Date(d).getTime();
    if (t0 >= start.getTime()) return 0;
    if (t0 >= start.getTime() - 86400000) return 1;
    if (t0 >= start.getTime() - 6 * 86400000) return 2;
    return 3;
  };
  const BUCKETS = [L("Aujourd'hui", "اليوم", "Today"), L("Hier", "أمس", "Yesterday"), L("Cette semaine", "هذا الأسبوع", "This week"), L("Plus ancien", "أقدم", "Older")];
  const groups = BUCKETS.map((label, i) => ({ label, items: visible.filter(n => bucketOf(n.created_at) === i) })).filter(g => g.items.length > 0);

  return (
    <div>
      <PageHead
        eyebrow={lang === "fr" ? "Activité récente" : lang === "ar" ? "النشاط الأخير" : "Recent activity"}
        title={t("dash.notifications")}
        sub={t("notifications.subtitle")}
      />

      <div className="nt-bar">
        <SegTabs
          label={L("Filtre", "تصفية", "Filter")}
          value={filter}
          onChange={k => setFilter(k)}
          items={[
            { key: "all", label: <>{L("Toutes", "الكل", "All")} <span className="nt-count">{notifications.length}</span></>, icon: Inbox },
            { key: "unread", label: <>{L("Non lues", "غير المقروءة", "Unread")} <span className="nt-count is-hot">{unreadCount}</span></>, icon: BellDot },
          ]}
        />
        <div className="nt-actions">
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className="btn-c btn-c-sm btn-c-soft">
              <CheckCheck size={14} strokeWidth={1.8} />
              {t("notifications.mark_all_read")}
            </button>
          )}
          {readCount > 0 && (
            <button type="button" onClick={() => bulkDelete("read")} className="btn-c btn-c-sm btn-c-ghost">
              {t("notifications.delete_read")}
            </button>
          )}
          {notifications.length > 0 && (
            <button type="button" onClick={() => bulkDelete("mine")} className="btn-c btn-c-sm btn-c-danger">
              <Trash2 className="h-3.5 w-3.5" /> {t("notifications.delete_all")}
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => bulkDelete("all")} className="btn-c btn-c-sm btn-c-danger">
              <Trash2 className="h-3.5 w-3.5" /> {t("notifications.purge_all")}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Bell size={28} strokeWidth={1.7} />} text={t("notifications.empty")} />
        </div>
      ) : (
        <div className="nt-groups" key={filter}>
          {groups.map(g => (
            <section key={g.label}>
              <div className="nt-group-label mono-eyebrow">{g.label} · {g.items.length}</div>
              <div className="dash-card nt-list">
                {g.items.map((n, i) => {
                  const Icon = TYPE_ICON[n.type] ?? Info;
                  return (
                    <div
                      key={n.id}
                      className={["nt-item", `nt-${TYPE_ICON[n.type] ? n.type : "info"}`, !n.read && "is-unread", n.link && "is-link"].filter(Boolean).join(" ")}
                      style={{ ["--i" as string]: i } as React.CSSProperties}
                      onClick={() => {
                        if (!n.link) return;
                        if (!n.read) markRead(n.id);
                        // `href` (et non `to`) : TanStack Router découpe la chaîne en
                        // pathname + search + hash (ex. "/dashboard/accounting?tab=validations").
                        navigate({ href: n.link });
                      }}
                    >
                      <span className="nt-ico"><Icon size={17} strokeWidth={1.8} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="nt-title">{n.title}</p>
                        {n.message && <p className="nt-msg">{n.message}</p>}
                      </div>
                      <div className="nt-side">
                        <span className="nt-time">{fmtAgo(n.created_at)}</span>
                        <div className="nt-btns">
                          {!n.read && (
                            <button type="button" disabled={marking === n.id} onClick={e => { e.stopPropagation(); markRead(n.id); }} className="doc-ibtn" title={t("notifications.mark_read")} aria-label={t("notifications.mark_read")}>
                              {marking === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button type="button" onClick={e => { e.stopPropagation(); deleteNotification(n.id); }} className="doc-ibtn is-danger" aria-label="Delete" title="Supprimer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {!n.read && <span className="nt-dot" aria-hidden />}
                      {n.link && <ChevronRight size={15} strokeWidth={1.8} className="nt-go" />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
