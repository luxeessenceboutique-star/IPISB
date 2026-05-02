import { BookOpen, FileText, GraduationCap, CalendarDays, Bell, Video } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const features = [
  { icon: BookOpen, color: "from-blue-400 to-indigo-600", key: "courses" as const },
  { icon: FileText, color: "from-yellow-400 to-orange-500", key: "assignments" as const },
  { icon: GraduationCap, color: "from-red-400 to-pink-600", key: "exams" as const },
  { icon: CalendarDays, color: "from-green-400 to-teal-500", key: "agenda" as const },
  { icon: Bell, color: "from-purple-400 to-violet-600", key: "notifications" as const },
  { icon: Video, color: "from-sky-400 to-cyan-600", key: "meetings" as const },
];

export function Features() {
  const { t } = useI18n();
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">
          {t("nav.dashboard")}
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
          Tout ce dont vous avez besoin en un seul endroit.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.key}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white`}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display font-semibold">
                {t(`dash.${f.key}`)}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
