import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";

export const Route = createFileRoute("/verify/$code")({
  component: VerifyPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  danger: "oklch(64% 0.18 25)",
  success:"oklch(55% 0.14 150)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const TYPE_LABEL: Record<string, string> = {
  attestation_scolarite: "Attestation de Scolarité",
  certificat: "Certificat",
  convocation: "Convocation",
};

type VerifyResult = {
  valid: boolean;
  type?: string;
  label?: string;
  student_name?: string;
  issued_at?: string;
  institution?: string;
};

function VerifyPage() {
  const { code } = Route.useParams();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
    fetch(`${base}/api/documents/verify/${code}`)
      .then(res => res.json())
      .then(setResult)
      .catch(() => setResult({ valid: false }))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <PageLayout>
      <div style={{ background: PAL.cream, minHeight: "calc(100vh - 200px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px" }}>
        <div style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>
            Vérification de document
          </div>

          {loading ? (
            <div style={{ padding: "48px 0" }}>
              <Loader2 style={{ width: 32, height: 32, color: PAL.muted, animation: "spin 1s linear infinite", margin: "0 auto" }} />
            </div>
          ) : result?.valid ? (
            <>
              <div style={{ margin: "24px auto 16px", width: 72, height: 72, borderRadius: 999, background: "oklch(94% 0.06 150)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck style={{ width: 36, height: 36, color: PAL.success }} strokeWidth={1.7} />
              </div>
              <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 28, color: PAL.ink, margin: "0 0 6px" }}>
                Document authentique
              </h1>
              <p style={{ fontFamily: sans, fontSize: 14, color: PAL.text, margin: "0 0 28px" }}>
                Ce document a été délivré par {result.institution ?? "IPISB"}.
              </p>
              <div style={{ textAlign: "left", background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <Row label="Type de document" value={result.label ?? TYPE_LABEL[result.type ?? ""] ?? result.type ?? "—"} />
                <Row label="Délivré à" value={result.student_name ?? "—"} />
                <Row label="Date d'émission" value={result.issued_at ? new Date(result.issued_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
              </div>
            </>
          ) : (
            <>
              <div style={{ margin: "24px auto 16px", width: 72, height: 72, borderRadius: 999, background: "oklch(94% 0.05 25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldX style={{ width: 36, height: 36, color: PAL.danger }} strokeWidth={1.7} />
              </div>
              <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 28, color: PAL.ink, margin: "0 0 6px" }}>
                Document introuvable
              </h1>
              <p style={{ fontFamily: sans, fontSize: 14, color: PAL.text, margin: 0 }}>
                Ce code de vérification n'est pas valide ou le document a été révoqué.
              </p>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: sans, fontSize: 13 }}>
      <span style={{ color: PAL.muted }}>{label}</span>
      <span style={{ color: PAL.ink, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
