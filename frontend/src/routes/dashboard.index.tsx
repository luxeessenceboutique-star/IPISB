import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BookOpen, FileText, GraduationCap, CalendarDays, Bell, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

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

function DashboardHome() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const role = isAdmin ? "admin" : isProf ? "professor" : "student";

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .get("/api/dashboard/stats")
      .then(setStats)
      .finally(() => setLoading(false));
  }, [user, roles]);

  const cards = stats
    ? [
        {
          icon: BookOpen,
          label: t("dash.courses"),
          value: stats.courses,
          to: "/dashboard/courses",
          color: "from-blue-400 to-indigo-600",
        },
        {
          icon: FileText,
          label: t("dash.assignments"),
          value: isProf
            ? stats.pending_grade > 0
              ? `${stats.pending_grade} ${lang === "fr" ? "à corriger" : "to grade"}`
              : stats.assignments
            : stats.assignments,
          to: "/dashboard/assignments",
          color: "from-yellow-400 to-orange-500",
        },
        {
          icon: GraduationCap,
          label: t("dash.exams"),
          value: stats.exams,
          to: "/dashboard/exams",
          color: "from-red-400 to-pink-600",
        },
        {
          icon: CalendarDays,
          label: t("dash.agenda"),
          value: stats.events,
          to: "/dashboard/agenda",
          color: "from-green-400 to-teal-500",
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">
          {t("dash.welcome")},{" "}
          {user?.user_metadata?.full_name?.split(" ")[0] || "👋"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {lang === "fr"
            ? `Voici un aperçu de votre espace ${t(`dash.role.${role}`).toLowerCase()}.`
            : `Here's an overview of your ${t(`dash.role.${role}`).toLowerCase()} space.`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((s) => (
            <Link key={s.label} to={s.to}>
              <div className="group rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:border-primary/30 hover:shadow-md">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.color} text-white`}
                >
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-display text-3xl font-bold">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {stats && stats.unread > 0 && (
        <Link to="/dashboard/notifications">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 transition-colors hover:bg-primary/10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">
                {stats.unread}{" "}
                {lang === "fr"
                  ? stats.unread === 1
                    ? "nouvelle notification"
                    : "nouvelles notifications"
                  : stats.unread === 1
                    ? "new notification"
                    : "new notifications"}
              </p>
              <p className="text-sm text-muted-foreground">
                {lang === "fr" ? "Cliquez pour les consulter" : "Click to view them"}
              </p>
            </div>
          </div>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            to: "/dashboard/courses",
            title: lang === "fr" ? "Accéder aux cours" : "Go to Courses",
            desc:
              lang === "fr"
                ? isProf
                  ? "Gérez vos cours et les inscriptions."
                  : "Inscrivez-vous à vos cours."
                : isProf
                  ? "Manage your courses and enrollments."
                  : "Enroll in your courses.",
            icon: BookOpen,
          },
          {
            to: "/dashboard/exams",
            title: lang === "fr" ? "Examens QCM" : "MCQ Exams",
            desc:
              lang === "fr"
                ? isProf
                  ? "Créez et publiez des examens QCM."
                  : "Passez vos examens disponibles."
                : isProf
                  ? "Create and publish MCQ exams."
                  : "Take your available exams.",
            icon: GraduationCap,
          },
          {
            to: "/dashboard/agenda",
            title: lang === "fr" ? "Agenda" : "Calendar",
            desc:
              lang === "fr"
                ? "Visualisez tous les événements du calendrier."
                : "View all calendar events.",
            icon: CalendarDays,
          },
        ].map((item) => (
          <Link key={item.to} to={item.to}>
            <div className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:border-primary/30 hover:shadow-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
