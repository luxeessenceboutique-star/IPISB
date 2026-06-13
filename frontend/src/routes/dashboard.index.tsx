import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, FileText, GraduationCap, CalendarDays, Bell, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CountUp } from "@/components/CountUp";
import { StatCardsSkeleton, ListSkeleton } from "@/components/Skeletons";
import { PageHead, SectionLabel } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

type Stats = {
  courses: number;
  assignments: number;
  exams: number;
  events: number;
  unread: number;
  pending_grade: number;
};

type AssignmentAnalytic = {
  id: string;
  title: string;
  enrolled: number;
  submitted: number;
  avg_grade: number | null;
};

type ExamAnalytic = {
  id: string;
  title: string;
  enrolled: number;
  submitted: number;
  avg_score: number | null;
};

type CourseAnalytic = {
  course_id: string;
  course_title: string;
  enrolled_count: number;
  assignments: AssignmentAnalytic[];
  exams: ExamAnalytic[];
};

async function fetchStats(userId: string, roles: string[]): Promise<Stats> {
  const now = new Date().toISOString();
  const isAdmin = roles.includes("admin");
  const isProf  = roles.includes("professor");

  const { count: unread = 0 } = await supabase
    .from("notifications").select("*", { count: "exact", head: true })
    .eq("user_id", userId).eq("read", false);

  if (isAdmin) {
    const [c, a, e, ev] = await Promise.all([
      supabase.from("courses").select("*", { count: "exact", head: true }),
      supabase.from("assignments").select("*", { count: "exact", head: true }),
      supabase.from("exams").select("*", { count: "exact", head: true }),
      supabase.from("calendar_events").select("*", { count: "exact", head: true }),
    ]);
    return { courses: c.count ?? 0, assignments: a.count ?? 0, exams: e.count ?? 0, events: ev.count ?? 0, unread: unread ?? 0, pending_grade: 0 };
  }

  if (isProf) {
    const { data: profCourses } = await supabase.from("courses").select("id").eq("professor_id", userId);
    const courseIds = profCourses?.map((c: any) => c.id) ?? [];
    if (!courseIds.length) return { courses: 0, assignments: 0, exams: 0, events: 0, unread: unread ?? 0, pending_grade: 0 };

    const [a, e, assignRows] = await Promise.all([
      supabase.from("assignments").select("*", { count: "exact", head: true }).in("course_id", courseIds),
      supabase.from("exams").select("*", { count: "exact", head: true }).in("course_id", courseIds),
      supabase.from("assignments").select("id").in("course_id", courseIds),
    ]);
    const assignIds = assignRows.data?.map((x: any) => x.id) ?? [];
    let pending_grade = 0;
    if (assignIds.length) {
      const { count } = await supabase.from("submissions").select("*", { count: "exact", head: true })
        .in("assignment_id", assignIds).is("grade", null);
      pending_grade = count ?? 0;
    }
    return { courses: courseIds.length, assignments: a.count ?? 0, exams: e.count ?? 0, events: 0, unread: unread ?? 0, pending_grade };
  }

  // Student
  const { data: enrollments } = await supabase.from("course_enrollments").select("course_id").eq("student_id", userId);
  const enrolledIds = enrollments?.map((e: any) => e.course_id) ?? [];
  if (!enrolledIds.length) return { courses: 0, assignments: 0, exams: 0, events: 0, unread: unread ?? 0, pending_grade: 0 };

  const [a, e, ev] = await Promise.all([
    supabase.from("assignments").select("*", { count: "exact", head: true }).in("course_id", enrolledIds).gt("due_date", now),
    supabase.from("exams").select("*", { count: "exact", head: true }).in("course_id", enrolledIds).eq("is_published", true),
    supabase.from("calendar_events").select("*", { count: "exact", head: true }).gt("start_time", now),
  ]);
  return { courses: enrolledIds.length, assignments: a.count ?? 0, exams: e.count ?? 0, events: ev.count ?? 0, unread: unread ?? 0, pending_grade: 0 };
}

function DashboardHome() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf  = roles.includes("professor");
  const role    = isAdmin ? "admin" : isProf ? "professor" : "student";

  const canCreate = isAdmin || isProf;

  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [analytics,        setAnalytics]        = useState<CourseAnalytic[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expanded,         setExpanded]         = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    fetchStats(user.id, roles)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [user, roles]);

  useEffect(() => {
    if (!user || !canCreate) return;
    setAnalyticsLoading(true);
    api.get("/api/dashboard/analytics")
      .then((data: CourseAnalytic[]) => setAnalytics(data))
      .catch(() => setAnalytics([]))
      .finally(() => setAnalyticsLoading(false));
  }, [user, canCreate]);

  const cards = stats ? [
    { label: t("dash.courses"),     value: stats.courses,     to: "/dashboard/courses"     },
    { label: t("dash.assignments"), value: isProf && stats.pending_grade > 0 ? stats.pending_grade : stats.assignments, suffix: isProf && stats.pending_grade > 0 ? (lang === "fr" ? " à corriger" : " to grade") : "", to: "/dashboard/assignments" },
    { label: t("dash.exams"),       value: stats.exams,       to: "/dashboard/exams"       },
    { label: t("dash.agenda"),      value: stats.events,      to: "/dashboard/agenda"      },
  ] : [];

  const firstName = user?.user_metadata?.full_name?.split(" ")[0];
  const today = new Date().toLocaleDateString(
    lang === "ar" ? "ar-MA" : lang === "fr" ? "fr-FR" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={today}
        title={
          <span>
            {lang === "fr" ? "Bonjour" : lang === "ar" ? "مرحباً" : "Hello"}
            {firstName ? (
              <>
                , <em style={{ fontStyle: "italic", color: "var(--pal-primary)" }}>{firstName}</em>
              </>
            ) : null}
            .
          </span>
        }
        sub={lang === "fr"
          ? `Voici un aperçu de votre espace ${t(`dash.role.${role}`).toLowerCase()}.`
          : lang === "ar"
          ? `هذه نظرة عامة على فضائك.`
          : `Here's an overview of your ${t(`dash.role.${role}`).toLowerCase()} space.`}
        actions={
          <Link to="/dashboard/agenda" className="btn-c btn-c-primary">
            {lang === "fr" ? "Voir l'agenda" : lang === "ar" ? "عرض الجدول" : "View calendar"}
            <ArrowRight size={15} strokeWidth={1.7} />
          </Link>
        }
      />

      {loading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="dash-card card-pop grid grid-cols-2 lg:grid-cols-4 py-5">
          {cards.map((s, i) => (
            <Link
              key={s.label}
              to={s.to as "/dashboard"}
              className={`flex flex-col gap-2 px-6 py-1 text-start no-underline transition-opacity hover:opacity-75 ${i % 2 === 1 ? "border-s" : i > 0 ? "lg:border-s" : ""}`}
              style={{ borderColor: "var(--pal-line-soft)" }}
            >
              <span className="stat-num">
                <CountUp value={typeof s.value === "number" ? s.value : 0} duration={900} />
                {"suffix" in s && s.suffix ? <span style={{ fontSize: 16 }}>{s.suffix}</span> : null}
              </span>
              <span className="eyebrow" style={{ letterSpacing: ".14em" }}>{s.label}</span>
            </Link>
          ))}
        </div>
      )}

      {stats && stats.unread > 0 && (
        <Link to="/dashboard/notifications" className="block no-underline">
          <div className="dash-card lift-c flex items-center gap-3 px-5 py-4">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}
            >
              <Bell className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--pal-ink)" }}>
                {stats.unread}{" "}
                {lang === "fr" ? stats.unread === 1 ? "nouvelle notification" : "nouvelles notifications" : stats.unread === 1 ? "new notification" : "new notifications"}
              </p>
              <p className="text-xs" style={{ color: "var(--pal-muted)" }}>
                {lang === "fr" ? "Cliquez pour les consulter" : "Click to view them"}
              </p>
            </div>
            <span
              className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
              style={{ background: "var(--pal-danger)", color: "var(--pal-paper)" }}
            >
              {stats.unread}
            </span>
          </div>
        </Link>
      )}

      <div>
        <SectionLabel>{lang === "fr" ? "Accès rapide" : lang === "ar" ? "وصول سريع" : "Quick access"}</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { to: "/dashboard/courses",      title: lang === "fr" ? "Accéder aux cours" : "Go to Courses",      desc: lang === "fr" ? isProf ? "Gérez vos cours et les inscriptions." : "Inscrivez-vous à vos cours." : isProf ? "Manage your courses and enrollments." : "Enroll in your courses.",        icon: BookOpen },
            { to: "/dashboard/exams",        title: lang === "fr" ? "Examens QCM" : "MCQ Exams",               desc: lang === "fr" ? isProf ? "Créez et publiez des examens QCM." : "Passez vos examens disponibles." : isProf ? "Create and publish MCQ exams." : "Take your available exams.",         icon: GraduationCap },
            { to: "/dashboard/agenda",       title: lang === "fr" ? "Agenda" : "Calendar",                      desc: lang === "fr" ? "Visualisez tous les événements du calendrier." : "View all calendar events.",                                                                                      icon: CalendarDays },
          ].map((item, i) => (
            <Link key={item.to} to={item.to as "/dashboard"} className="no-underline">
              <div className="dash-card lift-c card-pop flex items-start gap-4 p-5" style={{ animationDelay: `${i * 50}ms` }}>
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--pal-pale)", color: "var(--pal-primary-deep)" }}
                >
                  <item.icon className="h-5 w-5" strokeWidth={1.7} />
                </div>
                <div>
                  <h3 className="h-serif" style={{ fontSize: 19, lineHeight: 1.2 }}>{item.title}</h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--pal-muted)" }}>{item.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Professor / Admin Analytics ─────────────────────────────────── */}
      {canCreate && (
        <div className="space-y-4">
          <SectionLabel>
            {lang === "fr" ? "Analytiques des cours" : "Course Analytics"}
          </SectionLabel>

          {analyticsLoading ? (
            <ListSkeleton rows={3} />
          ) : analytics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "fr" ? "Aucun cours trouvé." : "No courses found."}
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.map((course) => {
                const isOpen = !!expanded[course.course_id];
                return (
                  <div
                    key={course.course_id}
                    className="dash-card overflow-hidden"
                  >
                    {/* Course header — click to expand */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [course.course_id]: !prev[course.course_id] }))
                      }
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        }
                        <span className="font-display font-semibold">{course.course_title}</span>
                        <span className="text-sm text-muted-foreground">
                          {course.enrolled_count}{" "}
                          {lang === "fr" ? "étudiant(s) inscrit(s)" : "enrolled student(s)"}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
                        {/* Assignments table */}
                        {course.assignments.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              {lang === "fr" ? "Devoirs" : "Assignments"}
                            </p>
                            <div className="overflow-x-auto rounded-xl border border-border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border bg-muted/50">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                      {lang === "fr" ? "Titre" : "Title"}
                                    </th>
                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                                      {lang === "fr" ? "Soumissions" : "Submissions"}
                                    </th>
                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                                      {lang === "fr" ? "Note moyenne" : "Avg Grade"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {course.assignments.map((a, idx) => (
                                    <tr
                                      key={a.id}
                                      className={idx % 2 === 0 ? "bg-card" : "bg-muted/20"}
                                    >
                                      <td className="px-4 py-2 font-medium">{a.title}</td>
                                      <td className="px-4 py-2 text-center text-muted-foreground">
                                        {a.submitted}/{a.enrolled}
                                      </td>
                                      <td className="px-4 py-2 text-center font-mono text-sm">
                                        {a.avg_grade !== null ? `${a.avg_grade}/20` : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Exams table */}
                        {course.exams.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              {lang === "fr" ? "Examens" : "Exams"}
                            </p>
                            <div className="overflow-x-auto rounded-xl border border-border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border bg-muted/50">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                      {lang === "fr" ? "Titre" : "Title"}
                                    </th>
                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                                      {lang === "fr" ? "Soumissions" : "Submissions"}
                                    </th>
                                    <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                                      {lang === "fr" ? "Score moyen" : "Avg Score"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {course.exams.map((e, idx) => (
                                    <tr
                                      key={e.id}
                                      className={idx % 2 === 0 ? "bg-card" : "bg-muted/20"}
                                    >
                                      <td className="px-4 py-2 font-medium">{e.title}</td>
                                      <td className="px-4 py-2 text-center text-muted-foreground">
                                        {e.submitted}/{e.enrolled}
                                      </td>
                                      <td className="px-4 py-2 text-center font-mono text-sm">
                                        {e.avg_score !== null ? `${e.avg_score}%` : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {course.assignments.length === 0 && course.exams.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            {lang === "fr"
                              ? "Aucun devoir ni examen pour ce cours."
                              : "No assignments or exams for this course."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
