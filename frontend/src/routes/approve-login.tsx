import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { CheckCircle2, ShieldX, Loader2 } from "lucide-react";

export const Route = createFileRoute("/approve-login")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  component: ApproveLoginPage,
});


function ApproveLoginPage() {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    fetch(`${base}/api/auth/login-approvals/${encodeURIComponent(token)}/approve`, { method: "POST" })
      .then(res => setStatus(res.ok ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, [token, base]);

  return (
    <div className="apv-page">
      <div className={`apv-card is-${status}`}>
        <div className="apv-emblem"><Logo size={46} /></div>
        <div className="mono-eyebrow" style={{ marginTop: 14 }}>IPISB Connect · Approbation de connexion</div>
        <div className="apv-medal" aria-hidden>
          <span className="apv-ring" />
          {status === "loading" && <Loader2 size={34} strokeWidth={1.8} className="apv-spin" />}
          {status === "ok" && <CheckCircle2 size={38} strokeWidth={1.7} />}
          {status === "error" && <ShieldX size={38} strokeWidth={1.7} />}
        </div>
        {status === "loading" && <h1 className="apv-title">Validation en cours…</h1>}
        {status === "ok" && (
          <>
            <h1 className="apv-title">Connexion autorisée</h1>
            <p className="apv-text">Cette personne peut maintenant se connecter à la plateforme IPISB Connect.</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="apv-title">Lien invalide ou expiré</h1>
            <p className="apv-text">
              Ce lien d'autorisation a déjà été utilisé, ou n'est plus valide. Demandez à la personne concernée de retenter une connexion pour recevoir un nouveau lien.
            </p>
          </>
        )}
        <svg className="apv-ecg" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
          <path d="M0 22 H150 l8 -12 l8 22 l8 -26 l8 16 H400" />
        </svg>
      </div>
    </div>
  );
}
