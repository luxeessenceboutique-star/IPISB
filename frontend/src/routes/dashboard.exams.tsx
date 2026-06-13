import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, Plus, Loader2, Timer, AlertTriangle, ChevronRight, Trash2, Eye, EyeOff } from "lucide-react";
import { ListSkeleton } from "@/components/Skeletons";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/exams")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ExamsPage,
});

type Exam = { id: string; course_id: string; title: string; description: string | null; duration_minutes: number; start_time: string | null; end_time: string | null; is_published: boolean; created_at: string; course_title?: string; question_count?: number; my_response?: ExamResponse | null };
type Question = { id: string; exam_id: string; question: string; options: string[]; correct_index: number; order_num: number };
type ExamResponse = { id: string; answers: Record<string, number>; score: number | null; total: number | null; submitted_at: string };
type Course = { id: string; title: string };
type DraftQuestion = { question: string; options: string[]; correct_index: number };

function ExamsPage() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin   = roles.includes("admin");
  const isProf    = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [exams,      setExams]      = useState<Exam[]>([]);
  const [myCourses,  setMyCourses]  = useState<Course[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", duration_minutes: "60", course_id: "" });
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([{ question: "", options: ["", "", "", ""], correct_index: 0 }]);

  const [takingExam, setTakingExam] = useState<{ exam: Exam; questions: Question[] } | null>(null);
  const [answers,    setAnswers]    = useState<Record<string, number>>({});
  const [timeLeft,   setTimeLeft]   = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tabWarnings, setTabWarnings] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [resultsExam, setResultsExam] = useState<{ exam: Exam; questions: Question[]; response: ExamResponse } | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      if (canCreate) {
        const courseQ = isAdmin ? supabase.from("courses").select("id, title") : supabase.from("courses").select("id, title").eq("professor_id", user!.id);
        const { data: courses } = await courseQ;
        const courseMap: Record<string, string> = Object.fromEntries((courses ?? []).map((c: any) => [c.id, c.title]));
        setMyCourses((courses ?? []) as Course[]);
        const courseIds = Object.keys(courseMap);
        if (!courseIds.length) { setExams([]); return; }
        const { data: raw } = await supabase.from("exams").select("*").in("course_id", courseIds).order("created_at", { ascending: false });
        const examList = raw ?? [];
        if (!examList.length) { setExams([]); return; }
        const examIds = examList.map((e: any) => e.id);
        const { data: qRows } = await supabase.from("exam_questions").select("exam_id").in("exam_id", examIds);
        const qCount: Record<string, number> = {};
        for (const q of qRows ?? []) qCount[(q as any).exam_id] = (qCount[(q as any).exam_id] ?? 0) + 1;
        setExams(examList.map((e: any) => ({ ...e, course_title: courseMap[e.course_id] ?? "—", question_count: qCount[e.id] ?? 0 })));
      } else {
        const { data: enrollments } = await supabase.from("course_enrollments").select("course_id").eq("student_id", user!.id);
        const enrolledIds = (enrollments ?? []).map((e: any) => e.course_id);
        if (!enrolledIds.length) { setExams([]); return; }
        const { data: courses } = await supabase.from("courses").select("id, title").in("id", enrolledIds);
        const courseMap: Record<string, string> = Object.fromEntries((courses ?? []).map((c: any) => [c.id, c.title]));
        const { data: raw } = await supabase.from("exams").select("*").in("course_id", enrolledIds).eq("is_published", true).order("created_at", { ascending: false });
        const examList = raw ?? [];
        if (!examList.length) { setExams([]); return; }
        const examIds = examList.map((e: any) => e.id);
        const [qRows, respRows] = await Promise.all([
          supabase.from("exam_questions").select("exam_id").in("exam_id", examIds),
          supabase.from("exam_responses").select("*").eq("student_id", user!.id).in("exam_id", examIds),
        ]);
        const qCount: Record<string, number> = {};
        for (const q of qRows.data ?? []) qCount[(q as any).exam_id] = (qCount[(q as any).exam_id] ?? 0) + 1;
        const respMap: Record<string, any> = Object.fromEntries((respRows.data ?? []).map((r: any) => [r.exam_id, r]));
        setExams(examList.map((e: any) => ({ ...e, course_title: courseMap[e.course_id] ?? "—", question_count: qCount[e.id] ?? 0, my_response: respMap[e.id] ?? null })));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    if (!takingExam) return;
    function handleVisibility() {
      if (document.hidden) setTabWarnings(w => { toast.warning(t("exams.warning_tab"), { duration: 4000 }); return w + 1; });
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [takingExam]);

  useEffect(() => {
    if (!takingExam) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); autoSubmitExam(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [takingExam]);

  if (!user) return null;

  async function openExam(exam: Exam) {
    try {
      const { data: questions } = await supabase.from("exam_questions").select("id, exam_id, question, options, order_num").eq("exam_id", exam.id).order("order_num");
      if (!questions?.length) { toast.error(lang === "fr" ? "Cet examen n'a pas encore de questions." : "This exam has no questions yet."); return; }
      setAnswers({}); setTabWarnings(0); setTimeLeft(exam.duration_minutes * 60);
      setTakingExam({ exam, questions: questions as any });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  async function autoSubmitExam() { if (!takingExam) return; await doSubmit(takingExam, answers); }

  async function doSubmit(state: { exam: Exam; questions: Question[] }, currentAnswers: Record<string, number>) {
    setSubmitting(true); setConfirmSubmit(false);
    try {
      const { data: correctData } = await supabase.from("exam_questions").select("id, correct_index").eq("exam_id", state.exam.id);
      const questions = correctData ?? [];
      const score = questions.filter((q: any) => String(q.id) in currentAnswers && currentAnswers[String(q.id)] === q.correct_index).length;
      const total = questions.length;
      const { data: existing } = await supabase.from("exam_responses").select("id").eq("exam_id", state.exam.id).eq("student_id", user!.id).single();
      if (existing) {
        await supabase.from("exam_responses").update({ answers: currentAnswers, score, total }).eq("id", existing.id);
      } else {
        await supabase.from("exam_responses").insert({ exam_id: state.exam.id, student_id: user!.id, answers: currentAnswers, score, total });
      }
      setTakingExam(null);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(lang === "fr" ? `Examen soumis ! Score : ${score}/${total}` : `Exam submitted! Score: ${score}/${total}`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setSubmitting(false); }
  }

  async function openResults(exam: Exam) {
    try {
      const [{ data: questions }, { data: respData }] = await Promise.all([
        supabase.from("exam_questions").select("*").eq("exam_id", exam.id).order("order_num"),
        supabase.from("exam_responses").select("*").eq("exam_id", exam.id).eq("student_id", user!.id).single(),
      ]);
      if (!respData) return;
      setResultsExam({ exam, questions: (questions ?? []) as Question[], response: respData as ExamResponse });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  async function togglePublish(exam: Exam) {
    if (!exam.is_published && (exam.question_count ?? 0) === 0) { toast.error(t("exams.add_questions_first")); return; }
    try {
      await supabase.from("exams").update({ is_published: !exam.is_published }).eq("id", exam.id);
      toast.success(exam.is_published ? t("exams.unpublished") : t("exams.published"));
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  async function createExam() {
    if (!createForm.title.trim()) { toast.error(t("exams.title_required")); return; }
    if (!createForm.course_id) { toast.error(t("exams.course_required")); return; }
    const validQuestions = draftQuestions.filter(q => q.question.trim() && q.options.some(o => o.trim()));
    setCreating(true);
    try {
      const { data: examRow, error } = await supabase.from("exams").insert({ title: createForm.title, description: createForm.description || null, duration_minutes: parseInt(createForm.duration_minutes) || 60, course_id: createForm.course_id, is_published: false }).select().single();
      if (error || !examRow) throw error ?? new Error("Failed to create exam");
      if (validQuestions.length) {
        await supabase.from("exam_questions").insert(validQuestions.map((q, i) => ({ exam_id: (examRow as any).id, question: q.question, options: q.options, correct_index: q.correct_index, order_num: i })));
      }
      toast.success(t("exams.created"));
      setShowCreate(false);
      setCreateForm({ title: "", description: "", duration_minutes: "60", course_id: "" });
      setDraftQuestions([{ question: "", options: ["", "", "", ""], correct_index: 0 }]);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setCreating(false); }
  }

  const fmtTime = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

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
            <p className="text-xs text-muted-foreground">{answered}/{questions.length} {lang === "fr" ? "répondues" : "answered"}</p>
          </div>
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold ${urgent ? "bg-red-50 text-red-600" : "bg-gradient-brand text-white"}`}>
            <Timer className="h-4 w-4" />{fmtTime(timeLeft)}
          </div>
        </div>
        {tabWarnings > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />{t("exams.warning_tab")} ({tabWarnings}x)
          </div>
        )}
        <Progress value={pct} className="h-1.5" />
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <Card key={q.id} className="border-0 p-5 shadow-card">
              <p className="font-medium"><span className="mr-2 text-muted-foreground">{qi + 1}.</span>{q.question}</p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => (
                  <button key={oi} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: oi }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${answers[q.id] === oi ? "border-primary bg-primary/10 font-medium text-primary" : "border-border hover:border-primary/40 hover:bg-muted/60"}`}>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + oi)}.</span>{opt}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <Button className="border-0 bg-gradient-brand text-white" onClick={() => setConfirmSubmit(true)} disabled={submitting}>
            <ChevronRight className="h-4 w-4" />{t("exams.submit")}
          </Button>
        </div>
        <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{t("exams.confirm_submit")}</DialogTitle>
              <DialogDescription>{t("exams.confirm_submit_desc")}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{answered}/{questions.length} {lang === "fr" ? "questions répondues." : "questions answered."}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmSubmit(false)}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
              <Button className="border-0 bg-gradient-brand text-white" disabled={submitting} onClick={() => doSubmit(takingExam, answers)}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("exams.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const upcoming = canCreate ? exams : exams.filter(e => !e.my_response);
  const done     = canCreate ? []    : exams.filter(e => !!e.my_response);

  const examCard = (exam: Exam) => (
    <article key={exam.id} className="dash-card lift-c card-pop flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="chip-c chip-c-green">{exam.course_title}</span>
        {canCreate
          ? <span className={`chip-c ${exam.is_published ? "chip-c-green" : ""}`}>{exam.is_published ? t("exams.status.published") : t("exams.status.draft")}</span>
          : <span className="chip-c chip-c-amber">{lang === "fr" ? "À venir" : lang === "ar" ? "قادم" : "Upcoming"}</span>}
      </div>
      <h3 className="h-serif" style={{ fontSize: 20, lineHeight: 1.2 }}>{exam.title}</h3>
      {exam.description && <p className="line-clamp-2" style={{ fontSize: 12.5, color: "var(--pal-muted)" }}>{exam.description}</p>}
      <div className="flex flex-wrap items-center gap-4" style={{ fontSize: 12.5, color: "var(--pal-muted)" }}>
        <span className="flex items-center gap-1.5"><Timer size={14} strokeWidth={1.7} />{exam.duration_minutes} {t("exams.mins")}</span>
        <span>{exam.question_count} {t("exams.questions_count")}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {!canCreate && <button type="button" className="btn-c btn-c-green btn-c-sm" onClick={() => openExam(exam)}>{t("exams.take")}</button>}
        {canCreate && (
          <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={() => togglePublish(exam)}>
            {exam.is_published ? <><EyeOff size={13} strokeWidth={1.7} />{t("exams.unpublish")}</> : <><Eye size={13} strokeWidth={1.7} />{t("exams.publish")}</>}
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div>
      <PageHead
        eyebrow={lang === "fr" ? "Évaluations QCM" : lang === "ar" ? "اختبارات QCM" : "MCQ assessments"}
        title={t("dash.exams")}
        sub={t("exams.subtitle")}
        actions={canCreate ? (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
            <Plus size={15} strokeWidth={1.7} />{t("exams.create")}
          </button>
        ) : undefined}
      />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : exams.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<GraduationCap size={28} strokeWidth={1.7} />} text={t("exams.empty")} />
        </div>
      ) : (
        <div className="space-y-7">
          {upcoming.length > 0 && (
            <div>
              <SectionLabel>{lang === "fr" ? "À venir" : lang === "ar" ? "قادمة" : "Upcoming"}</SectionLabel>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))" }}>
                {upcoming.map(examCard)}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div>
              <SectionLabel>{lang === "fr" ? "Résultats" : lang === "ar" ? "النتائج" : "Results"}</SectionLabel>
              <div className="dash-card overflow-hidden">
                {done.map(exam => (
                  <div key={exam.id} className="row-c">
                    <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                      <GraduationCap size={20} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pal-ink)" }}>{exam.title}</div>
                      <div className="mt-0.5" style={{ fontSize: 12, color: "var(--pal-muted)" }}>
                        {exam.course_title} · {exam.question_count} {t("exams.questions_count")} · {exam.duration_minutes} {t("exams.mins")}
                      </div>
                    </div>
                    <span
                      className="whitespace-nowrap"
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, fontWeight: 500, color: "var(--pal-primary-deep)" }}
                    >
                      {exam.my_response?.score}/{exam.my_response?.total}
                    </span>
                    <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={() => openResults(exam)}>
                      {t("exams.view_results")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{t("exams.create")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("exams.form.course")} *</label>
              <Select value={createForm.course_id} onValueChange={v => setCreateForm(f => ({ ...f, course_id: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder={lang === "fr" ? "Choisir un cours" : "Choose a course"} /></SelectTrigger>
                <SelectContent>{myCourses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">{t("exams.form.title")} *</label><Input className="mt-1.5" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">{t("exams.form.duration")}</label><Input className="mt-1.5" type="number" min="5" value={createForm.duration_minutes} onChange={e => setCreateForm(f => ({ ...f, duration_minutes: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">{t("exams.form.description")}</label><Textarea className="mt-1.5" rows={2} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="border-t border-border pt-4">
              <h4 className="font-display font-semibold">{lang === "fr" ? "Questions QCM" : "MCQ Questions"}</h4>
              <div className="mt-3 space-y-4">
                {draftQuestions.map((q, qi) => (
                  <div key={qi} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Question {qi + 1}</span>
                      {draftQuestions.length > 1 && <button type="button" onClick={() => setDraftQuestions(qs => qs.filter((_, i) => i !== qi))} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                    <Input className="mt-2" placeholder={lang === "fr" ? "Énoncé de la question..." : "Question text..."} value={q.question} onChange={e => setDraftQuestions(qs => qs.map((dq, i) => i === qi ? { ...dq, question: e.target.value } : dq))} />
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button type="button" onClick={() => setDraftQuestions(qs => qs.map((dq, i) => i === qi ? { ...dq, correct_index: oi } : dq))}
                            className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${q.correct_index === oi ? "border-primary bg-primary" : "border-muted-foreground/30"}`} />
                          <Input className="h-8 text-sm" placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={opt} onChange={e => setDraftQuestions(qs => qs.map((dq, i) => i === qi ? { ...dq, options: dq.options.map((o, j) => j === oi ? e.target.value : o) } : dq))} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => setDraftQuestions(qs => [...qs, { question: "", options: ["", "", "", ""], correct_index: 0 }])}>
                  <Plus className="h-3.5 w-3.5" />{t("exams.form.add_question")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
            <Button className="border-0 bg-gradient-brand text-white" disabled={creating} onClick={createExam}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("exams.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results */}
      <Dialog open={!!resultsExam} onOpenChange={o => !o && setResultsExam(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{t("exams.results")} — {resultsExam?.exam.title}</DialogTitle></DialogHeader>
          {resultsExam && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl bg-gradient-brand p-5 text-white">
                <div className="text-center">
                  <div className="font-display text-4xl font-bold">{resultsExam.response.score}<span className="text-xl font-normal opacity-80">/{resultsExam.response.total}</span></div>
                  <div className="mt-1 text-sm opacity-80">{t("exams.score")}</div>
                </div>
                <div className="flex-1">
                  <Progress value={((resultsExam.response.score ?? 0) / (resultsExam.response.total ?? 1)) * 100} className="h-3 bg-white/20" />
                  <p className="mt-2 text-sm opacity-80">{Math.round(((resultsExam.response.score ?? 0) / (resultsExam.response.total ?? 1)) * 100)}% {t("exams.correct")}</p>
                </div>
              </div>
              {resultsExam.questions.map((q, qi) => {
                const chosen  = (resultsExam.response.answers as Record<string, number>)[q.id];
                const correct = q.correct_index;
                const isRight = chosen === correct;
                return (
                  <div key={q.id} className={`rounded-xl border p-4 ${isRight ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <p className="text-sm font-medium">{qi + 1}. {q.question}</p>
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`rounded-lg px-3 py-1.5 text-xs ${oi === correct ? "bg-green-200 font-medium text-green-800" : oi === chosen && !isRight ? "bg-red-200 text-red-800 line-through" : "text-muted-foreground"}`}>
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
