import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Video, Plus, Loader2, CalendarClock, Trash2, Users, Radio, Clock, X } from "lucide-react";

export const Route = createFileRoute("/dashboard/meetings")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: MeetingsPage,
});

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  created_by: string | null;
  scheduled_at: string;
  duration_minutes: number;
  room_id: string;
  is_active: boolean;
  created_at: string;
  course_title?: string;
  host_name?: string;
};

type Course = { id: string; title: string };

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

function meetingStatus(m: Meeting): "live" | "upcoming" | "past" {
  const start = new Date(m.scheduled_at);
  const end = new Date(start.getTime() + m.duration_minutes * 60 * 1000);
  const now = new Date();
  if (m.is_active || (now >= start && now <= end)) return "live";
  if (now < start) return "upcoming";
  return "past";
}

function MeetingsPage() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    course_id: "",
    scheduled_at: "",
    duration_minutes: "60",
  });

  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [jitsiReady, setJitsiReady] = useState(false);
  const jitsiContainer = useRef<HTMLDivElement>(null);
  const jitsiApi = useRef<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([api.get("/api/meetings"), api.get("/api/courses/list")]);
      setMeetings(m);
      setCourses(c);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!activeMeeting) {
      if (jitsiApi.current) { jitsiApi.current.dispose(); jitsiApi.current = null; }
      setJitsiReady(false);
      return;
    }
    setJitsiReady(false);

    function initJitsi() {
      if (!jitsiContainer.current) return;
      jitsiApi.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: activeMeeting!.room_id,
        width: "100%",
        height: "100%",
        parentNode: jitsiContainer.current,
        userInfo: {
          displayName: user?.user_metadata?.full_name ?? user?.email ?? "Participant",
          email: user?.email ?? "",
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          defaultLanguage: lang === "fr" ? "fr" : "en",
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          TOOLBAR_BUTTONS: ["microphone", "camera", "desktop", "fullscreen", "hangup", "chat", "raisehand", "tileview", "participants-pane"],
        },
      });
      jitsiApi.current.addEventListener("readyToClose", () => leaveMeeting());
      setJitsiReady(true);
    }

    if (window.JitsiMeetExternalAPI) {
      initJitsi();
    } else {
      const script = document.createElement("script");
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.onload = initJitsi;
      document.body.appendChild(script);
    }

    return () => {
      if (jitsiApi.current) { jitsiApi.current.dispose(); jitsiApi.current = null; }
    };
  }, [activeMeeting]);

  async function joinMeeting(meeting: Meeting) {
    if (canCreate && !meeting.is_active) {
      await api.put(`/api/meetings/${meeting.id}/activate`);
    }
    setActiveMeeting(meeting);
  }

  async function leaveMeeting() {
    if (jitsiApi.current) { jitsiApi.current.dispose(); jitsiApi.current = null; }
    if (activeMeeting && canCreate && activeMeeting.created_by === user!.id) {
      await api.put(`/api/meetings/${activeMeeting.id}/deactivate`);
    }
    setActiveMeeting(null);
    load();
  }

  async function deleteMeeting(id: string) {
    try {
      await api.delete(`/api/meetings/${id}`);
      toast.success(t("meetings.deleted"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function createMeeting() {
    if (!form.title.trim()) { toast.error(t("meetings.title_required")); return; }
    if (!form.scheduled_at) { toast.error(t("meetings.date_required")); return; }
    setCreating(true);
    try {
      await api.post("/api/meetings", {
        title: form.title,
        description: form.description || null,
        course_id: form.course_id || null,
        scheduled_at: form.scheduled_at,
        duration_minutes: parseInt(form.duration_minutes) || 60,
      });
      toast.success(t("meetings.created"));
      setShowCreate(false);
      setForm({ title: "", description: "", course_id: "", scheduled_at: "", duration_minutes: "60" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusBadge = (m: Meeting) => {
    const s = meetingStatus(m);
    if (s === "live")
      return (
        <Badge className="animate-pulse border-0 bg-red-100 text-red-700">
          <Radio className="mr-1 h-3 w-3" />
          {t("meetings.live")}
        </Badge>
      );
    if (s === "upcoming")
      return (
        <Badge className="border-0 bg-blue-100 text-blue-700">
          <Clock className="mr-1 h-3 w-3" />
          {t("meetings.upcoming")}
        </Badge>
      );
    return <Badge className="border-0 bg-muted text-muted-foreground">{t("meetings.past")}</Badge>;
  };

  // Full-screen Jitsi view
  if (activeMeeting) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        <div className="flex h-14 shrink-0 items-center justify-between bg-gray-900 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Video className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{activeMeeting.title}</p>
              {activeMeeting.course_title && (
                <p className="text-xs text-gray-400">{activeMeeting.course_title}</p>
              )}
            </div>
            <Badge className="ml-2 animate-pulse border-0 bg-red-600 text-white">
              <Radio className="mr-1 h-3 w-3" />
              {t("meetings.live")}
            </Badge>
          </div>
          <Button variant="destructive" size="sm" className="gap-2" onClick={leaveMeeting}>
            <X className="h-4 w-4" />
            {t("meetings.leave")}
          </Button>
        </div>
        <div className="relative flex-1">
          {!jitsiReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-gray-400">{t("meetings.connecting")}</p>
            </div>
          )}
          <div ref={jitsiContainer} className="h-full w-full" />
        </div>
      </div>
    );
  }

  const live = meetings.filter((m) => meetingStatus(m) === "live");
  const upcoming = meetings.filter((m) => meetingStatus(m) === "upcoming");
  const past = meetings.filter((m) => meetingStatus(m) === "past");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{t("dash.meetings")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("meetings.subtitle")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="shrink-0 border-0 bg-gradient-brand text-white">
            <Plus className="h-4 w-4" />
            {t("meetings.create")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-24 text-center">
          <Video className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">{t("meetings.empty")}</p>
          {canCreate && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("meetings.create")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {live.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 font-display font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                {t("meetings.live")}
              </h2>
              <MeetingGrid meetings={live} canCreate={canCreate} userId={user!.id} lang={lang} t={t} fmt={fmt} statusBadge={statusBadge} onJoin={joinMeeting} onDelete={deleteMeeting} />
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold">{t("meetings.upcoming")}</h2>
              <MeetingGrid meetings={upcoming} canCreate={canCreate} userId={user!.id} lang={lang} t={t} fmt={fmt} statusBadge={statusBadge} onJoin={joinMeeting} onDelete={deleteMeeting} />
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-muted-foreground">{t("meetings.past")}</h2>
              <MeetingGrid meetings={past} canCreate={canCreate} userId={user!.id} lang={lang} t={t} fmt={fmt} statusBadge={statusBadge} onJoin={joinMeeting} onDelete={deleteMeeting} />
            </section>
          )}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t("meetings.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("meetings.form.title")} *</label>
              <Input className="mt-1.5" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={lang === "fr" ? "ex : Cours d'anatomie" : "e.g. Anatomy class"} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("meetings.form.description")}</label>
              <Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("meetings.form.date")} *</label>
                <Input className="mt-1.5" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("meetings.form.duration")}</label>
                <Input className="mt-1.5" type="number" min="15" max="480" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("meetings.form.course")}</label>
              <Select value={form.course_id} onValueChange={(v) => setForm((f) => ({ ...f, course_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={lang === "fr" ? "Aucun cours lié" : "No linked course"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "fr" ? "Aucun" : "None"}</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
            <Button className="border-0 bg-gradient-brand text-white" disabled={creating} onClick={createMeeting}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("meetings.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingGrid({
  meetings, canCreate, userId, lang, t, fmt, statusBadge, onJoin, onDelete,
}: {
  meetings: Meeting[];
  canCreate: boolean;
  userId: string;
  lang: string;
  t: (k: string) => string;
  fmt: (d: string) => string;
  statusBadge: (m: Meeting) => JSX.Element;
  onJoin: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {meetings.map((m) => {
        const status = meetingStatus(m);
        const isHost = m.created_by === userId;
        const isPast = status === "past";
        return (
          <Card key={m.id} className={`border-0 p-5 shadow-card transition-all ${status === "live" ? "ring-2 ring-red-400/60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
                <Video className="h-5 w-5" />
              </div>
              {statusBadge(m)}
            </div>
            <div className="mt-3">
              <h3 className="font-display font-semibold leading-tight">{m.title}</h3>
              {m.course_title && <p className="mt-0.5 text-xs text-muted-foreground">{m.course_title}</p>}
              {m.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                {fmt(m.scheduled_at)}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {m.duration_minutes} {t("meetings.duration")}
                <span className="ml-auto flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {m.host_name}
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-2 border-t border-border pt-4">
              {!isPast && (
                <Button size="sm" className="h-8 flex-1 border-0 bg-gradient-brand text-xs text-white" onClick={() => onJoin(m)}>
                  <Video className="h-3.5 w-3.5" />
                  {status === "live" ? t("meetings.join") : t("meetings.start")}
                </Button>
              )}
              {canCreate && isHost && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
