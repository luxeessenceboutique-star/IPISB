import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/lib/i18n";

export function SiteNav() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5 font-semibold">
          <Logo size={30} />
          <span>IPISBE Connect</span>
        </Link>
        <div className="flex items-center gap-3">
          <LangSwitcher />
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t("nav.login")}
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow transition-opacity hover:opacity-90"
          >
            {t("nav.signup")}
          </Link>
        </div>
      </div>
    </header>
  );
}
