import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { About } from "@/components/landing/About";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { Award, Heart, Lightbulb, Rocket, Hospital, Dna, Laptop, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/a-propos")({
  component: AProposPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  teal:   "oklch(62% 0.085 170)",
  amber:  "oklch(78% 0.12 80)",
  green:  "oklch(70% 0.13 155)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const VAL_COLORS = [PAL.primary, PAL.teal, PAL.green, PAL.amber];
const VAL_ICONS: LucideIcon[]   = [Award, Heart, Lightbulb, Rocket];
const INFRA_ICONS: LucideIcon[] = [Hospital, Dna, Laptop];

function AProposPage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";
  const values = [0,1,2,3].map((i) => ({ t: t(`ap.val.${i}.t`), d: t(`ap.val.${i}.d`), Icon: VAL_ICONS[i], color: VAL_COLORS[i] }));
  const infras  = [0,1,2].map((i) => ({ t: t(`ap.infra.${i}.t`), d: t(`ap.infra.${i}.d`), Icon: INFRA_ICONS[i] }));

  return (
    <PageLayout>
      <About />

      {/* Values */}
      <section style={{ background: PAL.cream, padding: pad, borderTop: `1px solid ${PAL.line}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: isMobile ? 36 : 56 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("ap.val.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(32px, 4vw, 54px)", color: PAL.ink, margin: "12px 0 0", letterSpacing: "-.02em" }}>
              {t("ap.val.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("ap.val.h2b")}</em>
            </h2>
          </div>
          <div ref={ref} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "repeat(4, 1fr)", gap: 20 }}>
            {values.map((v, i) => (
              <div key={i} style={{
                background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 20,
                padding: isMobile ? "24px 18px" : "32px 24px",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: `opacity .6s ${i * 0.1}s, transform .6s ${i * 0.1}s`,
              }}>
                <div>
                  <v.Icon size={28} strokeWidth={1.5} color={v.color} style={{ display: "block", marginBottom: 16 }} />
                  <h3 style={{ fontFamily: serif, fontSize: isMobile ? 18 : 22, fontWeight: 500, color: PAL.ink, margin: "0 0 10px" }}>{v.t}</h3>
                  <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.6, color: PAL.muted, margin: 0 }}>{v.d}</p>
                </div>
                <div style={{ width: 16, height: 4, background: v.color, borderRadius: 2, marginTop: 20 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{ background: PAL.paper, padding: pad, borderTop: `1px solid ${PAL.line}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "1fr 1.3fr", gap: isMobile ? 32 : 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("ap.team.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(32px, 4vw, 54px)", color: PAL.ink, margin: "12px 0 0", letterSpacing: "-.02em", lineHeight: 1.05 }}>
              {t("ap.team.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("ap.team.h2b")}</em>
            </h2>
            <p style={{ fontFamily: sans, fontSize: isMobile ? 14 : 15, lineHeight: 1.65, color: PAL.text, marginTop: 20 }}>{t("ap.team.body")}</p>
          </div>
          <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? 24 : 40 }}>
            <h3 style={{ fontFamily: serif, fontSize: isMobile ? 22 : 28, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>{t("ap.team.stats")}</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 16 }}>
              {[["40+", t("ap.team.l1")], ["85%", t("ap.team.l2")], ["100%", t("ap.team.l3")]].map(([n, l], idx) => (
                <li key={idx} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 20, paddingBottom: 16, borderBottom: idx < 2 ? `1px solid ${PAL.line}` : "none" }}>
                  <span style={{ fontFamily: serif, fontSize: isMobile ? 26 : 32, fontWeight: 600, color: PAL.primary, width: isMobile ? 60 : 80, flexShrink: 0 }}>{n}</span>
                  <span style={{ fontFamily: sans, fontSize: 13, color: PAL.text }}>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Infrastructure */}
      <section style={{ background: PAL.cream, padding: pad, borderTop: `1px solid ${PAL.line}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center" as const, marginBottom: isMobile ? 36 : 56 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("ap.infra.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(32px, 4vw, 54px)", color: PAL.ink, margin: "12px 0 0", letterSpacing: "-.02em" }}>
              {t("ap.infra.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("ap.infra.h2b")}</em>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 20 }}>
            {infras.map((infra, idx) => (
              <div key={idx} style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: isMobile ? 24 : 32 }}>
                <infra.Icon size={28} strokeWidth={1.5} color={PAL.primary} style={{ display: "block", marginBottom: 14 }} />
                <h3 style={{ fontFamily: serif, fontSize: isMobile ? 18 : 22, fontWeight: 500, color: PAL.ink, margin: "0 0 10px" }}>{infra.t}</h3>
                <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.6, color: PAL.muted, margin: 0 }}>{infra.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
