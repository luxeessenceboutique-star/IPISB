import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { BookOpen, Plus, Users, Loader2, CheckCircle, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/courses")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: CoursesPage,
});

type Course = {
  id: string;
  title: string;
  description: string | null;
  code: string | null;
  professor_id: string | null;
  semester: string | null;
  credits: number;
  cover_color: string;
  is_published: boolean;
  created_at: string;
  professor_name?: string;
  enrollment_count?: number;
  is_enrolled?: boolean;
};

const COLOR_MAP: Record<string, string> = {
  green: "from-green-400 to-emerald-600",
  blue: "from-blue-400 to-indigo-600",
  purple: "from-purple-400 to-violet-600",
  orange: "from-orange-400 to-red-500",
  pink: "from-pink-400 to-rose-600",
  teal: "from-teal-400 to-cyan-600",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  code: "",
  semester: "",
  credits: "3",
  cover_color: "blue",
};

function CoursesPage() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/api/courses");
      setCourses(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function enroll(courseId: string) {
    setEnrolling(courseId);
    try {
      await api.post(`/api/courses/${courseId}/enroll`, {});
      toast.success(t("courses.enrolled"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setEnrolling(null);
    }
  }

  async function unenroll(courseId: string) {
    setEnrolling(courseId);
    try {
      await api.delete(`/api/courses/${courseId}/enroll`);
      toast.success(t("courses.unenrolled"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setEnrolling(null);
    }
  }

  async function deleteCourse(courseId: string) {
    try {
      await api.delete(`/api/courses/${courseId}`);
      toast.success(t("courses.deleted"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function createCourse() {
    if (!form.title.trim()) {
      toast.error(t("courses.title_required"));
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/courses", {
        title: form.title,
        description: form.description || null,
        code: form.code || null,
        semester: form.semester || null,
        credits: parseInt(form.credits) || 3,
        cover_color: form.cover_color,
      });
      toast.success(t("courses.created"));
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  const displayedCourses =
    isProf && !isAdmin ? courses.filter((c) => c.professor_id === user!.id) : courses;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{t("dash.courses")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("courses.subtitle")}</p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="shrink-0 border-0 bg-gradient-brand text-white"
          >
            <Plus className="h-4 w-4" />
            {t("courses.create")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : displayedCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-20 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">{t("courses.empty")}</p>
          {canCreate && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("courses.create")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {displayedCourses.map((course) => (
            <Card key={course.id} className="overflow-hidden border-0 shadow-card">
              <div
                className={`h-2 bg-gradient-to-r ${COLOR_MAP[course.cover_color] ?? COLOR_MAP.blue}`}
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold leading-tight">{course.title}</h3>
                    {course.code && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{course.code}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs tabular-nums">
                    {course.credits} {lang === "fr" ? "crédits" : "credits"}
                  </Badge>
                </div>

                {course.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {course.description}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {course.enrollment_count}
                  </span>
                  {course.semester && <span>{course.semester}</span>}
                  <span className="ml-auto truncate">{course.professor_name}</span>
                </div>

                {!isProf && !isAdmin && (
                  <div className="mt-4 border-t border-border pt-4">
                    {course.is_enrolled ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {t("courses.enrolled_label")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={enrolling === course.id}
                          onClick={() => unenroll(course.id)}
                        >
                          {enrolling === course.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("courses.unenroll")
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="h-8 w-full border-0 bg-gradient-brand text-xs text-white"
                        disabled={enrolling === course.id}
                        onClick={() => enroll(course.id)}
                      >
                        {enrolling === course.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          t("courses.enroll")
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {(isProf || isAdmin) && (isAdmin || course.professor_id === user!.id) && (
                  <div className="mt-4 border-t border-border pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => deleteCourse(course.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {lang === "fr" ? "Supprimer" : "Delete"}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{t("courses.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("courses.form.title")} *</label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={lang === "fr" ? "ex : Anatomie Générale" : "e.g. General Anatomy"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("courses.form.code")}</label>
                <Input
                  className="mt-1.5"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="ex : INF-201"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("courses.form.credits")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min="1"
                  max="10"
                  value={form.credits}
                  onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("courses.form.semester")}</label>
              <Input
                className="mt-1.5"
                value={form.semester}
                onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                placeholder={lang === "fr" ? "ex : S1 2025-2026" : "e.g. Fall 2025"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("courses.form.description")}</label>
              <Textarea
                className="mt-1.5"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={lang === "fr" ? "Description du cours..." : "Course description..."}
                rows={3}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{t("courses.form.color")}</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COLOR_MAP).map(([color, gradient]) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cover_color: color }))}
                    className={`h-7 w-14 rounded-lg bg-gradient-to-r ${gradient} transition-all ${
                      form.cover_color === color
                        ? "ring-2 ring-foreground ring-offset-2"
                        : "opacity-50 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button
              className="border-0 bg-gradient-brand text-white"
              disabled={creating}
              onClick={createCourse}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("courses.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
