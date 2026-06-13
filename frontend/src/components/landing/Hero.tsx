import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CountUp } from "@/components/CountUp";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';

const STAT_VALUES = ["1 200+", "5", "94 %", "12"];

export function Hero() {
  const { t, lang } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();

  const stats = [
    { v: STAT_VALUES[0], k: t("hero.stat1") },
    { v: STAT_VALUES[1], k: t("hero.stat2") },
    { v: STAT_VALUES[2], k: t("hero.stat3") },
    { v: STAT_VALUES[3], k: t("hero.stat4") },
  ];

  const pad = isMobile ? "64px 20px 48px" : isTablet ? "80px 32px 60px" : "100px 40px 80px";

  return (
    <section style={{
      position: "relative",
      background: `linear-gradient(180deg, ${PAL.cream}, ${PAL.paper})`,
      overflow: "hidden",
    }}>
      {!isMobile && (
        <div style={{ position: "absolute", right: -120, top: 40, opacity: .05, pointerEvents: "none" }}>
          <Logo size={540} />
        </div>
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: pad, position: "relative" }}>

        {/* Eyebrow */}
        <div className="anim-rise" style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "6px 14px", borderRadius: 999,
          background: PAL.paper, border: `1px solid ${PAL.line}`,
          fontFamily: sans, fontSize: 11, fontWeight: 600,
          letterSpacing: ".12em", textTransform: "uppercase" as const, color: PAL.primary,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: PAL.primary, display: "inline-block" }} />
          {t("hero.eyebrow")}
        </div>

        {/* Headline */}
        <h1 className="anim-rise-1" style={{
          fontFamily: serif, fontWeight: 500, color: PAL.ink,
          fontSize: isMobile ? "clamp(48px,12vw,64px)" : "clamp(64px, 7vw, 96px)",
          lineHeight: .97, letterSpacing: "-.025em", margin: "24px 0 0", maxWidth: 960,
        }}>
          {t("hero.h1a")}<br />
          <em style={{ fontStyle: "italic", fontWeight: 400, color: PAL.primary }}>{t("hero.h1b")}</em>
        </h1>

        {/* Body + CTAs */}
        <div className="anim-rise-2" style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr",
          gap: isMobile ? 28 : 80,
          marginTop: isMobile ? 28 : 48,
          alignItems: "end",
        }}>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: PAL.text, margin: 0 }}>
            {t("hero.body")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link to="/auth" search={{ mode: "signup" }} className="u-hover-lift" style={{
              background: PAL.ink, color: PAL.paper,
              fontFamily: sans, fontSize: 14, fontWeight: 600,
              padding: "16px 24px", borderRadius: 999,
              letterSpacing: ".01em", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              {t("hero.cta1")}
            </Link>
            <Link to="/formations" className="u-hover-lift" style={{
              background: "transparent", color: PAL.ink,
              border: `1px solid ${PAL.line}`,
              fontFamily: sans, fontSize: 14, fontWeight: 500,
              padding: "15px 24px", borderRadius: 999,
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              {t("hero.cta2")}
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="anim-rise-3" style={{
          marginTop: isMobile ? 48 : 88,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          borderTop: `1px solid ${PAL.line}`, paddingTop: 32, gap: isMobile ? 24 : 0,
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              paddingLeft: !isMobile && i ? 32 : 0,
              borderLeft: !isMobile && i ? `1px solid ${PAL.line}` : "none",
            }}>
              <div style={{ fontFamily: serif, fontSize: isMobile ? 40 : 52, fontWeight: 500, color: PAL.ink, lineHeight: 1, letterSpacing: "-.025em" }}>
                <CountUp value={s.v} duration={1400} />
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" as const, color: PAL.muted, marginTop: 8 }}>
                {s.k}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
