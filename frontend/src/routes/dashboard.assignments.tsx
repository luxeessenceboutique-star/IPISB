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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Loader2,
  CalendarClock,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/assignments")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AssignmentsPage,
});

type Assignment = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_grade: number;
  created_at: string;
  course_title?: string;
  submission?: Submission | null;
};

type Submission = {
  id: string;
  content: string | null;
  file_url: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
  student_id?: string;
  student_name?: string;
};

type Course = { id: string; title: string };

function statusInfo(a: Assignment, lang: string) {
  if (a.submission) {
    if (a.submission.grade !== null)
      return { label: lang === "fr" ? "Noté" : "Graded", color: "bg-green-100 text-green-700", icon: Star };
    return {
      label: lang === "fr" ? "Soumis" : "Submitted",
      color: "bg-blue-100 text-blue-700",
      icon: CheckCircle2,
    };
  }
  if (a.due_date && new Date(a.due_date) < new Date())
    return {
      label: lang === "fr" ? "En retard" : "Late",
      color: "bg-red-100 text-red-700",
      icon: AlertCircle,
    };
  return {
    label: lang === "fr" ? "En attente" : "Pending",
    color: "bg-yellow-100 text-yellow-700",
    icon: Clock,
  };
}

function AssignmentsPage() {
  const { t, lang } = useI18n();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myCourses, setMyCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    due_date: "",
    max_grade: "20",
    course_id: "",
  });

  const [submitDialog, setSubmitDialog] = useState<Assignment | null>(null);
  const [submitContent, setSubmitContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [gradeDialog, setGradeDialog] = useState<{
    assignment: Assignment;
    submissions: Submission[];
  } | null>(null);
  const [gradeValues, setGradeValues] = useState<
    Record<string, { grade: string; feedback: string }>
  >({});
  const [grading, setGrading] = useState<string | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [data, courses] = await Promise.all([
        api.get("/api/assignments"),
        canCreate ? api.get("/api/courses/list") : Promise.resolve([]),
      ]);
      setAssignments(data);
      setMyCourses(courses);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAssignment() {
    if (!createForm.title.trim()) { toast.error(t("assignments.title_required")); return; }
    if (!createForm.course_id) { toast.error(t("assignments.course_required")); return; }
    setCreating(true);
    try {
      await api.post("/api/assignments", {
        title: createForm.title,
        description: createForm.description || null,
        due_date: createForm.due_date || null,
        max_grade: parseFloat(createForm.max_grade) || 20,
        course_id: createForm.course_id,
      });
      toast.success(t("assignments.created"));
      setShowCreate(false);
      setCreateForm({ title: "", description: "", due_date: "", max_grade: "20", course_id: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function submitAssignment() {
    if (!submitDialog) return;
    setSubmitting(true);
    try {
      await api.post(`/api/assignments/${submitDialog.id}/submit`, { content: submitContent });
      toast.success(t("assignments.submitted"));
      setSubmitDialog(null);
      setSubmitContent("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openGradeDialog(assignment: Assignment) {
    setLoadingSubmissions(true);
    setGradeDialog({ assignment, submissions: [] });
    try {
      const subs: Submission[] = await api.get(`/api/assignments/${assignment.id}/submissions`);
      const initGrades: Record<string, { grade: string; feedback: string }> = {};
      subs.forEach((s) => {
        initGrades[s.id] = { grade: s.grade !== null ? String(s.grade) : "", feedback: s.feedback ?? "" };
      });
      setGradeValues(initGrades);
      setGradeDialog({ assignment, submissions: subs });
    } finally {
      setLoadingSubmissions(false);
    }
  }

  async function saveGrade(submissionId: string) {
    const vals = gradeValues[submissionId];
    if (!vals) return;
    setGrading(submissionId);
    try {
      await api.put(`/api/assignments/submissions/${submissionId}/grade`, {
        grade: vals.grade !== "" ? parseFloat(vals.grade) : null,
        feedback: vals.feedback || null,
      });
      toast.success(t("assignments.graded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setGrading(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{t("dash.assignments")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("assignments.subtitle")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="shrink-0 border-0 bg-gradient-brand text-white">
            <Plus className="h-4 w-4" />
            {t("assignments.create")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-20 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">{t("assignments.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const { label, color, icon: Icon } = statusInfo(a, lang);
            return (
              <Card key={a.id} className="border-0 p-5 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{a.course_title}</p>
                    <h3 className="mt-0.5 font-display font-semibold leading-tight">{a.title}</h3>
                  </div>
                  <Badge className={`shrink-0 border-0 text-xs ${color}`}>
                    <Icon className="mr-1 h-3 w-3" />
                    {label}
                  </Badge>
                </div>

                {a.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t("assignments.due")}: {fmt(a.due_date)}
                  <span className="ml-auto">/ {a.max_grade} {t("assignments.points")}</span>
                </div>

                {!canCreate && a.submission?.grade !== null && a.submission?.grade !== undefined && (
                  <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-green-700">
                      {a.submission.grade} / {a.max_grade}
                    </span>
                    {a.submission.feedback && (
                      <p className="mt-1 text-xs text-green-600">{a.submission.feedback}</p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  {!canCreate && (
                    <Button
                      size="sm"
                      className="h-8 flex-1 border-0 bg-gradient-brand text-xs text-white"
                      onClick={() => {
                        setSubmitContent(a.submission?.content ?? "");
                        setSubmitDialog(a);
                      }}
                    >
                      <Send className="h-3 w-3" />
                      {a.submission ? (lang === "fr" ? "Modifier" : "Edit") : t("assignments.submit.btn")}
                    </Button>
                  )}
                  {canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs"
                      onClick={() => openGradeDialog(a)}
                    >
                      {t("assignments.view_submissions")}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t("assignments.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("assignments.form.course")} *</label>
              <Select value={createForm.course_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, course_id: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={lang === "fr" ? "Choisir un cours" : "Choose a course"} />
                </SelectTrigger>
                <SelectContent>
                  {myCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("assignments.form.title")} *</label>
              <Input className="mt-1.5" value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("assignments.form.description")}</label>
              <Textarea className="mt-1.5" rows={3} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("assignments.form.due_date")}</label>
                <Input className="mt-1.5" type="datetime-local" value={createForm.due_date} onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("assignments.form.max_grade")}</label>
                <Input className="mt-1.5" type="number" min="1" value={createForm.max_grade} onChange={(e) => setCreateForm((f) => ({ ...f, max_grade: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
            <Button className="border-0 bg-gradient-brand text-white" disabled={creating} onClick={createAssignment}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("assignments.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit dialog */}
      <Dialog open={!!submitDialog} onOpenChange={(o) => !o && setSubmitDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{submitDialog?.title}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">{t("assignments.submit.label")}</label>
            <Textarea
              className="mt-1.5"
              rows={5}
              value={submitContent}
              onChange={(e) => setSubmitContent(e.target.value)}
              placeholder={lang === "fr" ? "Votre réponse ou lien de fichier..." : "Your answer or file link..."}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialog(null)}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
            <Button className="border-0 bg-gradient-brand text-white" disabled={submitting} onClick={submitAssignment}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("assignments.submit.btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grade submissions dialog */}
      <Dialog open={!!gradeDialog} onOpenChange={(o) => !o && setGradeDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t("assignments.submissions")} — {gradeDialog?.assignment.title}
            </DialogTitle>
          </DialogHeader>
          {loadingSubmissions ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : gradeDialog?.submissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("assignments.no_submission")}</p>
          ) : (
            <div className="space-y-4">
              {gradeDialog?.submissions.map((sub) => (
                <div key={sub.id} className="rounded-xl border border-border p-4">
                  <p className="font-medium">{sub.student_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmt(sub.submitted_at)}</p>
                  {sub.content && (
                    <p className="mt-2 rounded-lg bg-muted p-3 text-sm">{sub.content}</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">
                        {t("assignments.grade.label")} / {gradeDialog.assignment.max_grade}
                      </label>
                      <Input
                        className="mt-1 h-8 text-sm"
                        type="number"
                        min="0"
                        max={gradeDialog.assignment.max_grade}
                        value={gradeValues[sub.id]?.grade ?? ""}
                        onChange={(e) => setGradeValues((v) => ({ ...v, [sub.id]: { ...(v[sub.id] ?? { grade: "", feedback: "" }), grade: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">{t("assignments.grade.feedback")}</label>
                      <Input
                        className="mt-1 h-8 text-sm"
                        value={gradeValues[sub.id]?.feedback ?? ""}
                        onChange={(e) => setGradeValues((v) => ({ ...v, [sub.id]: { ...(v[sub.id] ?? { grade: "", feedback: "" }), feedback: e.target.value } }))}
                      />
                    </div>
                  </div>
                  <Button size="sm" className="mt-3 h-8 border-0 bg-gradient-brand text-xs text-white" disabled={grading === sub.id} onClick={() => saveGrade(sub.id)}>
                    {grading === sub.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t("assignments.grade.btn")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
