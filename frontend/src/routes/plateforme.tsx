import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

export const Route = createFileRoute("/plateforme")({
  component: PlatformePage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  pale:   "oklch(94% 0.025 165)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const MOD_IDS = ["01","02","03","04","05","06","07","08"];

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((f, i) => (
        <li key={i} style={{ display: "flex", gap: 10, fontFamily: sans, fontSize: 14, color: PAL.text, alignItems: "flex-start", paddingTop: 10, borderTop: `1px solid ${PAL.line}` }}>
          <span style={{ color: PAL.primary, fontFamily: mono, fontSize: 11, fontWeight: 700, marginTop: 2, flexShrink: 0 }}>→</span>{f}
        </li>
      ))}
    </ul>
  );
}

function PlatformePage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";
  const studentFeatures = [t("pp.stu.f1"),t("pp.stu.f2"),t("pp.stu.f3"),t("pp.stu.f4"),t("pp.stu.f5")];
  const teacherFeatures = [t("pp.tea.f1"),t("pp.tea.f2"),t("pp.tea.f3"),t("pp.tea.f4"),t("pp.tea.f5")];

  return (
    <div style={{ background: PAL.paper }}>
      <SiteNav />

      <section style={{ padding: isMobile ? "64px 20px 48px" : isTablet ? "80px 32px 60px" : "100px 40px 80px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("pp.eyebrow")}</div>
        <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: isMobile ? "clamp(48px,12vw,72px)" : "clamp(64px, 7vw, 96px)", lineHeight: .95, color: PAL.ink, margin: "14px 0 0", letterSpacing: "-.02em", maxWidth: 980 }}>
          {t("pp.h1a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("pp.h1b")}</em>
        </h1>
        <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, color: PAL.text, lineHeight: 1.6, maxWidth: 680, marginTop: 24 }}>{t("pp.body")}</p>
      </section>

      <section style={{ padding: isMobile ? "0 20px 48px" : isTablet ? "0 32px 60px" : "0 40px 80px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? 24 : 48, position: "relative", overflow: "hidden" }}>
          {!isMobile && <div style={{ position: "absolute", right: -80, top: -80, opacity: .07, pointerEvents: "none" }}><Logo size={420} /></div>}
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 36 : 60 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("pp.stu.eyebrow")}</div>
              <h3 style={{ fontFamily: serif, fontSize: isMobile ? 28 : 40, fontWeight: 500, color: PAL.ink, margin: "12px 0 18px" }}>{t("pp.stu.h3")}</h3>
              <FeatureList items={studentFeatures} />
            </div>
            <div>
              <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("pp.tea.eyebrow")}</div>
              <h3 style={{ fontFamily: serif, fontSize: isMobile ? 28 : 40, fontWeight: 500, color: PAL.ink, margin: "12px 0 18px" }}>{t("pp.tea.h3")}</h3>
              <FeatureList items={teacherFeatures} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: pad, maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 14 }}>{t("pp.mod.eyebrow")}</div>
        <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(36px, 4.5vw, 60px)", lineHeight: .98, color: PAL.ink, margin: 0, letterSpacing: "-.02em" }}>
          {t("pp.mod.h2a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("pp.mod.h2b")}</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginTop: isMobile ? 32 : 48 }}>
          {MOD_IDS.map((n) => (
            <div key={n} style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 16, padding: isMobile ? 18 : 24 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: PAL.muted, fontWeight: 600 }}>{n}</div>
              <h4 style={{ fontFamily: serif, fontSize: isMobile ? 20 : 26, fontWeight: 500, color: PAL.ink, margin: "10px 0 5px" }}>{t(`pp.mod.${n}`)}</h4>
              <p style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, margin: 0 }}>{t(`pp.mod.${n}.d`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: PAL.paper, padding: isMobile ? "48px 20px 64px" : "60px 40px 120px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 28, padding: isMobile ? "40px 24px" : "72px 56px", position: "relative", overflow: "hidden", textAlign: "center" as const }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 0%, oklch(82% .045 165 /.4), transparent 60%)`, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-flex", justifyContent: "center" }}><Logo size={56} /></div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: isMobile ? "clamp(32px,8vw,48px)" : "clamp(44px, 5vw, 64px)", lineHeight: 1.05, color: PAL.ink, margin: "24px 0 14px", letterSpacing: "-.02em" }}>
              {t("cta.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("cta.h2b")}</em>
            </h2>
            <p style={{ fontFamily: sans, fontSize: isMobile ? 14 : 16, color: PAL.muted, maxWidth: 460, margin: "0 auto", lineHeight: 1.55 }}>{t("cta.body")}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" as const }}>
              <a href="/auth?mode=signup" style={{ background: PAL.ink, color: PAL.paper, fontFamily: sans, fontSize: 14, fontWeight: 600, padding: "14px 24px", borderRadius: 999, textDecoration: "none" }}>{t("cta.signup")}</a>
              <a href="/contact" style={{ background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 14, fontWeight: 500, padding: "13px 24px", borderRadius: 999, textDecoration: "none" }}>{t("cta.advisor")}</a>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
