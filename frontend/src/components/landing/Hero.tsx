import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden py-24 md:py-36">
      {/* Background gradient blob */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-transparent blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-4 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
          🎓 Plateforme officielle IPISBE
        </div>
        <h1 className="mt-4 font-display text-5xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 bg-clip-text text-transparent">
            {t("hero.title1")}
          </span>
          <br />
          {t("hero.title2")}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          {t("hero.subtitle")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-8 py-3.5 font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
          >
            {t("nav.signup")} →
          </Link>
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="rounded-xl border border-border px-8 py-3.5 font-semibold transition-colors hover:bg-muted"
          >
            {t("nav.login")}
          </Link>
        </div>
      </div>
    </section>
  );
}
