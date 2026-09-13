import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { CheckCircle2, ShieldX, Loader2 } from "lucide-react";

export const Route = createFileRoute("/approve-login")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  component: ApproveLoginPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  muted:  "oklch(48% 0.02 180)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  danger: "oklch(64% 0.18 25)",
  success:"oklch(55% 0.14 150)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';

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
    <div style={{ minHeight: "100vh", background: PAL.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, width: "100%", background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 16, padding: "40px 36px", textAlign: "center" as const, boxShadow: "0 24px 60px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <Wordmark size={36} />
        </div>
        {status === "loading" && (
          <>
            <Loader2 size={36} strokeWidth={1.7} style={{ color: PAL.muted, animation: "spin 1s linear infinite" }} />
            <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 500, color: PAL.ink, margin: "16px 0 4px" }}>Validation en cours…</h1>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 size={40} strokeWidth={1.6} style={{ color: PAL.success }} />
            <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "16px 0 8px" }}>Connexion autorisée</h1>
            <p style={{ fontFamily: sans, fontSize: 13.5, color: PAL.muted, lineHeight: 1.6 }}>
              Cette personne peut maintenant se connecter à la plateforme IPISB Connect.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <ShieldX size={40} strokeWidth={1.6} style={{ color: PAL.danger }} />
            <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "16px 0 8px" }}>Lien invalide ou expiré</h1>
            <p style={{ fontFamily: sans, fontSize: 13.5, color: PAL.muted, lineHeight: 1.6 }}>
              Ce lien d'autorisation a déjà été utilisé, ou n'est plus valide. Demandez à la personne concernée de retenter une connexion pour recevoir un nouveau lien.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
