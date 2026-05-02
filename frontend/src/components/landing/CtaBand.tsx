import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-600 p-12 text-center text-white shadow-2xl">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                "radial-gradient(circle at 80% 20%, white, transparent 60%)",
            }}
          />
          <h2 className="relative font-display text-3xl font-bold md:text-4xl">
            Prêt à rejoindre IPISBE ?
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/80">
            Créez votre compte et accédez à votre espace académique dès aujourd'hui.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-xl bg-white px-8 py-3 font-semibold text-indigo-600 shadow-lg transition-all hover:scale-105 hover:bg-white/90"
            >
              {t("nav.signup")}
            </Link>
            <Link
              to="/auth"
              search={{ mode: "login" }}
              className="rounded-xl border border-white/40 px-8 py-3 font-semibold text-white backdrop-blur transition-all hover:bg-white/10"
            >
              {t("nav.login")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
