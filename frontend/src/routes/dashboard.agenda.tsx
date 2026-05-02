import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
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
import { CalendarDays, Plus, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/agenda")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AgendaPage,
});

type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  event_type: string;
  course_id: string | null;
  created_by: string | null;
  course_title?: string;
};

type Course = { id: string; title: string };

const TYPE_COLORS: Record<string, string> = {
  course: "bg-blue-100 text-blue-700",
  exam: "bg-red-100 text-red-700",
  assignment: "bg-yellow-100 text-yellow-700",
  event: "bg-purple-100 text-purple-700",
};

const TYPE_DOT: Record<string, string> = {
  course: "bg-blue-500",
  exam: "bg-red-500",
  assignment: "bg-yellow-500",
  event: "bg-purple-500",
};

function AgendaPage() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date>(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_time: "",
    end_time: "",
    event_type: "event",
    course_id: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [eventData, courseData] = await Promise.all([
        api.get("/api/agenda/events"),
        api.get("/api/courses/list"),
      ]);
      setEvents(eventData);
      setCourses(courseData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function eventsForDate(date: Date): CalEvent[] {
    return events.filter((e) => {
      const d = new Date(e.start_time);
      return (
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
      );
    });
  }

  function datesWithEvents(): Date[] {
    return events.map((e) => new Date(e.start_time));
  }

  async function createEvent() {
    if (!form.title.trim()) {
      toast.error(t("agenda.title_required"));
      return;
    }
    if (!form.start_time) {
      toast.error(t("agenda.start_required"));
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/agenda/events", {
        title: form.title,
        description: form.description || null,
        start_time: form.start_time,
        end_time: form.end_time || null,
        event_type: form.event_type,
        course_id: form.course_id || null,
      });
      toast.success(t("agenda.created"));
      setShowCreate(false);
      setForm({ title: "", description: "", start_time: "", end_time: "", event_type: "event", course_id: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function deleteEvent(id: string) {
    try {
      await api.delete(`/api/agenda/events/${id}`);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  const selectedEvents = eventsForDate(selected);
  const eventDates = datesWithEvents();

  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const fmtDate = (date: Date) =>
    date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const typeLabel = (type: string) => {
    const map: Record<string, { fr: string; en: string }> = {
      course: { fr: "Cours", en: "Class" },
      exam: { fr: "Examen", en: "Exam" },
      assignment: { fr: "Devoir", en: "Assignment" },
      event: { fr: "Événement", en: "Event" },
    };
    return map[type]?.[lang as "fr" | "en"] ?? type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{t("dash.agenda")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("agenda.subtitle")}</p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="shrink-0 border-0 bg-gradient-brand text-white"
          >
            <Plus className="h-4 w-4" />
            {t("agenda.create")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
          <Card className="border-0 p-4 shadow-card">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => d && setSelected(d)}
              modifiers={{ hasEvent: eventDates }}
              modifiersClassNames={{ hasEvent: "font-bold underline decoration-primary/60" }}
              className="rounded-xl"
            />
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
              {Object.entries(TYPE_DOT).map(([type, dot]) => (
                <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  {typeLabel(type)}
                </span>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-semibold capitalize">{fmtDate(selected)}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedEvents.length}{" "}
                {lang === "fr"
                  ? selectedEvents.length === 1 ? "événement" : "événements"
                  : selectedEvents.length === 1 ? "event" : "events"}
              </p>
            </div>

            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-16 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">{t("agenda.empty_day")}</p>
                {canCreate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      const dateStr = selected.toISOString().slice(0, 16);
                      setForm((f) => ({ ...f, start_time: dateStr }));
                      setShowCreate(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("agenda.create")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <Card key={ev.id} className="flex items-start gap-4 border-0 p-4 shadow-card">
                    <div
                      className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${TYPE_DOT[ev.event_type] ?? "bg-muted"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{ev.title}</h3>
                          {ev.course_title && (
                            <p className="text-xs text-muted-foreground">{ev.course_title}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            className={`border-0 text-xs ${TYPE_COLORS[ev.event_type] ?? "bg-muted text-foreground"}`}
                          >
                            {typeLabel(ev.event_type)}
                          </Badge>
                          {canCreate && ev.created_by === user!.id && (
                            <button
                              type="button"
                              onClick={() => deleteEvent(ev.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtTime(ev.start_time)}
                        {ev.end_time && ` → ${fmtTime(ev.end_time)}`}
                      </p>
                      {ev.description && (
                        <p className="mt-1.5 text-sm text-muted-foreground">{ev.description}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="border-t border-border pt-6">
          <h3 className="font-display font-semibold">{t("agenda.upcoming")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events
              .filter((e) => new Date(e.start_time) >= new Date())
              .slice(0, 6)
              .map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelected(new Date(ev.start_time))}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_DOT[ev.event_type] ?? "bg-muted"}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.start_time).toLocaleDateString(
                        lang === "fr" ? "fr-FR" : "en-US",
                        { month: "short", day: "numeric" },
                      )}{" "}
                      · {fmtTime(ev.start_time)}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t("agenda.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("agenda.form.title")} *</label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("agenda.form.type")}</label>
              <Select
                value={form.event_type}
                onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["course", "exam", "assignment", "event"].map((type) => (
                    <SelectItem key={type} value={type}>
                      {typeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("agenda.form.start")} *</label>
                <Input
                  className="mt-1.5"
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("agenda.form.end")}</label>
                <Input
                  className="mt-1.5"
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("agenda.form.course")}</label>
              <Select
                value={form.course_id}
                onValueChange={(v) => setForm((f) => ({ ...f, course_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={lang === "fr" ? "Aucun cours lié" : "No linked course"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "fr" ? "Aucun" : "None"}</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("agenda.form.description")}</label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button
              className="border-0 bg-gradient-brand text-white"
              disabled={creating}
              onClick={createEvent}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("agenda.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
