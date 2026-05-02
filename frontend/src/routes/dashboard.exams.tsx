import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  GraduationCap,
  Plus,
  Loader2,
  Timer,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/exams")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ExamsPage,
});

type Exam = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  start_time: string | null;
  end_time: string | null;
  is_published: boolean;
  created_at: string;
  course_title?: string;
  question_count?: number;
  my_response?: ExamResponse | null;
};

type Question = {
  id: string;
  exam_id: string;
  question: string;
  options: string[];
  correct_index: number;
  order_num: number;
};

type ExamResponse = {
  id: string;
  answers: Record<string, number>;
  score: number | null;
  total: number | null;
  submitted_at: string;
};

type Course = { id: string; title: string };

type DraftQuestion = {
  question: string;
  options: string[];
  correct_index: number;
};

function ExamsPage() {
  const { t, lang } = useI18n();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [exams, setExams] = useState<Exam[]>([]);
  const [myCourses, setMyCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    duration_minutes: "60",
    course_id: "",
  });
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    { question: "", options: ["", "", "", ""], correct_index: 0 },
  ]);

  const [takingExam, setTakingExam] = useState<{
    exam: Exam;
    questions: Question[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tabWarnings, setTabWarnings] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [resultsExam, setResultsExam] = useState<{
    exam: Exam;
    questions: Question[];
    response: ExamResponse;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [examData, courseData] = await Promise.all([
        api.get("/api/exams"),
        canCreate ? api.get("/api/courses/list") : Promise.resolve([]),
      ]);
      setExams(examData);
      if (canCreate) setMyCourses(courseData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!takingExam) return;

    function handleVisibility() {
      if (document.hidden) {
        setTabWarnings((w) => {
          toast.warning(t("exams.warning_tab"), { duration: 4000 });
          return w + 1;
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [takingExam]);

  useEffect(() => {
    if (!takingExam) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          autoSubmitExam();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [takingExam]);

  async function openExam(exam: Exam) {
    try {
      const questions: Question[] = await api.get(`/api/exams/${exam.id}/questions`);
      if (!questions || questions.length === 0) {
        toast.error(lang === "fr" ? "Cet examen n'a pas encore de questions." : "This exam has no questions yet.");
        return;
      }
      setAnswers({});
      setTabWarnings(0);
      setTimeLeft(exam.duration_minutes * 60);
      setTakingExam({ exam, questions });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function autoSubmitExam() {
    if (!takingExam) return;
    await doSubmit(takingExam, answers);
  }

  async function doSubmit(
    state: { exam: Exam; questions: Question[] },
    currentAnswers: Record<string, number>,
  ) {
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      const result = await api.post(`/api/exams/${state.exam.id}/submit`, { answers: currentAnswers });
      setTakingExam(null);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(
        lang === "fr"
          ? `Examen soumis ! Score : ${result.score}/${result.total}`
          : `Exam submitted! Score: ${result.score}/${result.total}`,
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openResults(exam: Exam) {
    try {
      const [questions, response] = await Promise.all([
        api.get(`/api/exams/${exam.id}/result`),
        Promise.resolve(exam.my_response),
      ]);
      if (!response) return;
      setResultsExam({ exam, questions, response: response as ExamResponse });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function togglePublish(exam: Exam) {
    if (!exam.is_published && (exam.question_count ?? 0) === 0) {
      toast.error(t("exams.add_questions_first"));
      return;
    }
    try {
      await api.put(`/api/exams/${exam.id}/publish`);
      toast.success(exam.is_published ? t("exams.unpublished") : t("exams.published"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function createExam() {
    if (!createForm.title.trim()) {
      toast.error(t("exams.title_required"));
      return;
    }
    if (!createForm.course_id) {
      toast.error(t("exams.course_required"));
      return;
    }
    const validQuestions = draftQuestions.filter(
      (q) => q.question.trim() && q.options.some((o) => o.trim()),
    );
    setCreating(true);
    try {
      const examRow = await api.post("/api/exams", {
        title: createForm.title,
        description: createForm.description || null,
        duration_minutes: parseInt(createForm.duration_minutes) || 60,
        course_id: createForm.course_id,
        questions: validQuestions.map((q, i) => ({
          question: q.question,
          options: q.options,
          correct_index: q.correct_index,
          order_num: i,
        })),
      });

      toast.success(t("exams.created"));
      setShowCreate(false);
      setCreateForm({ title: "", description: "", duration_minutes: "60", course_id: "" });
      setDraftQuestions([{ question: "", options: ["", "", "", ""], correct_index: 0 }]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  const fmtTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (takingExam) {
    const { exam, questions } = takingExam;
    const answered = Object.keys(answers).length;
    const pct = (answered / questions.length) * 100;
    const urgent = timeLeft < 120;

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
          <div>
            <h2 className="font-display font-bold">{exam.title}</h2>
            <p className="text-xs text-muted-foreground">
              {answered}/{questions.length} {lang === "fr" ? "répondues" : "answered"}
            </p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold ${
              urgent ? "bg-red-50 text-red-600" : "bg-gradient-brand text-white"
            }`}
          >
            <Timer className="h-4 w-4" />
            {fmtTime(timeLeft)}
          </div>
        </div>

        {tabWarnings > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("exams.warning_tab")} ({tabWarnings}x)
          </div>
        )}

        <Progress value={pct} className="h-1.5" />

        <div className="space-y-4">
          {questions.map((q, qi) => (
            <Card key={q.id} className="border-0 p-5 shadow-card">
              <p className="font-medium">
                <span className="mr-2 text-muted-foreground">{qi + 1}.</span>
                {q.question}
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                      answers[q.id] === oi
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border hover:border-primary/40 hover:bg-muted/60"
                    }`}
                  >
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {String.fromCharCode(65 + oi)}.
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            className="border-0 bg-gradient-brand text-white"
            onClick={() => setConfirmSubmit(true)}
            disabled={submitting}
          >
            <ChevronRight className="h-4 w-4" />
            {t("exams.submit")}
          </Button>
        </div>

        <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{t("exams.confirm_submit")}</DialogTitle>
              <DialogDescription>{t("exams.confirm_submit_desc")}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {answered}/{questions.length}{" "}
              {lang === "fr" ? "questions répondues." : "questions answered."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
                {lang === "fr" ? "Annuler" : "Cancel"}
              </Button>
              <Button
                className="border-0 bg-gradient-brand text-white"
                disabled={submitting}
                onClick={() => doSubmit(takingExam, answers)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("exams.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{t("dash.exams")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("exams.subtitle")}</p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            className="shrink-0 border-0 bg-gradient-brand text-white"
          >
            <Plus className="h-4 w-4" />
            {t("exams.create")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border py-20 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">{t("exams.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="border-0 p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{exam.course_title}</p>
                  <h3 className="mt-0.5 font-display font-semibold leading-tight">{exam.title}</h3>
                </div>
                {canCreate && (
                  <Badge
                    className={`shrink-0 border-0 text-xs ${
                      exam.is_published
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {exam.is_published ? t("exams.status.published") : t("exams.status.draft")}
                  </Badge>
                )}
                {!canCreate && exam.my_response && (
                  <Badge className="shrink-0 border-0 bg-green-100 text-xs text-green-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {exam.my_response.score}/{exam.my_response.total}
                  </Badge>
                )}
              </div>

              {exam.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {exam.duration_minutes} {t("exams.mins")}
                </span>
                <span>
                  {exam.question_count} {t("exams.questions_count")}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                {!canCreate && !exam.my_response && (
                  <Button
                    size="sm"
                    className="h-8 flex-1 border-0 bg-gradient-brand text-xs text-white"
                    onClick={() => openExam(exam)}
                  >
                    {t("exams.take")}
                  </Button>
                )}
                {!canCreate && exam.my_response && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    onClick={() => openResults(exam)}
                  >
                    {t("exams.view_results")}
                  </Button>
                )}
                {canCreate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => togglePublish(exam)}
                  >
                    {exam.is_published ? (
                      <>
                        <EyeOff className="h-3 w-3" />
                        {t("exams.unpublish")}
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        {t("exams.publish")}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{t("exams.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("exams.form.course")} *</label>
              <Select
                value={createForm.course_id}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, course_id: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={lang === "fr" ? "Choisir un cours" : "Choose a course"} />
                </SelectTrigger>
                <SelectContent>
                  {myCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("exams.form.title")} *</label>
                <Input
                  className="mt-1.5"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("exams.form.duration")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min="5"
                  value={createForm.duration_minutes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("exams.form.description")}</label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="font-display font-semibold">
                {lang === "fr" ? "Questions QCM" : "MCQ Questions"}
              </h4>
              <div className="mt-3 space-y-4">
                {draftQuestions.map((q, qi) => (
                  <div key={qi} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {lang === "fr" ? "Question" : "Question"} {qi + 1}
                      </span>
                      {draftQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDraftQuestions((qs) => qs.filter((_, i) => i !== qi))}
                          className="text-destructive hover:opacity-70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Input
                      className="mt-2"
                      placeholder={lang === "fr" ? "Énoncé de la question..." : "Question text..."}
                      value={q.question}
                      onChange={(e) =>
                        setDraftQuestions((qs) =>
                          qs.map((dq, i) => (i === qi ? { ...dq, question: e.target.value } : dq)),
                        )
                      }
                    />
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftQuestions((qs) =>
                                qs.map((dq, i) => (i === qi ? { ...dq, correct_index: oi } : dq)),
                              )
                            }
                            className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${
                              q.correct_index === oi
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30"
                            }`}
                          />
                          <Input
                            className="h-8 text-sm"
                            placeholder={`${lang === "fr" ? "Option" : "Option"} ${String.fromCharCode(65 + oi)}`}
                            value={opt}
                            onChange={(e) =>
                              setDraftQuestions((qs) =>
                                qs.map((dq, i) =>
                                  i === qi
                                    ? {
                                        ...dq,
                                        options: dq.options.map((o, j) =>
                                          j === oi ? e.target.value : o,
                                        ),
                                      }
                                    : dq,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() =>
                    setDraftQuestions((qs) => [
                      ...qs,
                      { question: "", options: ["", "", "", ""], correct_index: 0 },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("exams.form.add_question")}
                </Button>
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
              onClick={createExam}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("exams.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultsExam} onOpenChange={(o) => !o && setResultsExam(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t("exams.results")} — {resultsExam?.exam.title}
            </DialogTitle>
          </DialogHeader>
          {resultsExam && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl bg-gradient-brand p-5 text-white">
                <div className="text-center">
                  <div className="font-display text-4xl font-bold">
                    {resultsExam.response.score}
                    <span className="text-xl font-normal opacity-80">
                      /{resultsExam.response.total}
                    </span>
                  </div>
                  <div className="mt-1 text-sm opacity-80">{t("exams.score")}</div>
                </div>
                <div className="flex-1">
                  <Progress
                    value={
                      ((resultsExam.response.score ?? 0) / (resultsExam.response.total ?? 1)) * 100
                    }
                    className="h-3 bg-white/20"
                  />
                  <p className="mt-2 text-sm opacity-80">
                    {Math.round(
                      ((resultsExam.response.score ?? 0) / (resultsExam.response.total ?? 1)) * 100,
                    )}
                    % {t("exams.correct")}
                  </p>
                </div>
              </div>

              {resultsExam.questions.map((q, qi) => {
                const chosen = (resultsExam.response.answers as Record<string, number>)[q.id];
                const correct = q.correct_index;
                const isRight = chosen === correct;
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 ${
                      isRight ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    <p className="text-sm font-medium">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div
                          key={oi}
                          className={`rounded-lg px-3 py-1.5 text-xs ${
                            oi === correct
                              ? "bg-green-200 font-medium text-green-800"
                              : oi === chosen && !isRight
                                ? "bg-red-200 text-red-800 line-through"
                                : "text-muted-foreground"
                          }`}
                        >
                          {String.fromCharCode(65 + oi)}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
