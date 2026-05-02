import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Search = { mode?: "signup" | "login" };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "signup" ? "signup" : "login",
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user, signIn, signUp } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(search.mode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(search.mode ?? "login");
  }, [search.mode]);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
        toast.success(t("auth.signup_success"));
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-brand" />
        <div
          className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(circle at 30% 20%, white, transparent 60%)" }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/" className="inline-flex items-center gap-3 font-display font-semibold">
            <Logo size={40} />
            <span className="text-xl">IPISBE Connect</span>
          </Link>
          <div>
            <p className="font-display text-3xl font-semibold leading-tight">
              {t("hero.title1")}
              <br />
              {t("hero.title2")}
            </p>
            <p className="mt-4 max-w-sm text-sm text-white/80">{t("hero.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2 font-display font-semibold">
              <Logo size={32} />
              IPISBE
            </Link>
            <LangSwitcher />
          </div>
          <div className="mb-8 hidden justify-end lg:flex">
            <LangSwitcher />
          </div>

          <h1 className="font-display text-3xl font-bold">
            {mode === "login" ? t("auth.login.title") : t("auth.signup.title")}
          </h1>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">{t("auth.fullname")}</Label>
                <Input
                  id="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
              />
            </div>

            {mode === "login" && (
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                  {t("auth.forgot")}
                </Link>
              </div>
            )}

            <Button type="submit" className="w-full border-0 bg-gradient-brand text-white" size="lg" disabled={busy}>
              {busy ? "..." : mode === "login" ? t("auth.submit_login") : t("auth.submit_signup")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? t("auth.no_account") : t("auth.has_account")}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "login" ? t("nav.signup") : t("nav.login")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
