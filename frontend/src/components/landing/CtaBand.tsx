import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';

export function CtaBand() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "120px 40px";
  const innerPad = isMobile ? "48px 24px" : "72px 56px";

  return (
    <section style={{ background: PAL.paper, padding: pad }}>
      <div ref={ref} style={{
        maxWidth: 1040, margin: "0 auto",
        background: PAL.cream, border: `1px solid ${PAL.line}`,
        borderRadius: 28, padding: innerPad,
        position: "relative", overflow: "hidden", textAlign: "center" as const,
      }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 0%, oklch(82% .045 165 /.4), transparent 60%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", justifyContent: "center" }}><Logo size={56} /></div>
          <h2 style={{
            fontFamily: serif, fontWeight: 500,
            fontSize: isMobile ? "clamp(36px,9vw,48px)" : "clamp(44px, 5vw, 64px)",
            lineHeight: 1.05, color: PAL.ink, margin: "24px 0 14px", letterSpacing: "-.02em",
            opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity .7s .1s, transform .7s .1s",
          }}>
            {t("cta.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("cta.h2b")}</em>
          </h2>
          <p style={{
            fontFamily: sans, fontSize: isMobile ? 14 : 16, color: PAL.muted,
            maxWidth: 460, margin: "0 auto", lineHeight: 1.55,
            opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity .7s .2s, transform .7s .2s",
          }}>{t("cta.body")}</p>
          <div style={{
            display: "flex", gap: 12, justifyContent: "center", marginTop: 32,
            flexWrap: "wrap" as const,
            opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity .7s .3s, transform .7s .3s",
          }}>
            <Link to="/auth" search={{ mode: "signup" }} className="u-hover-lift" style={{
              background: PAL.ink, color: PAL.paper,
              fontFamily: sans, fontSize: 14, fontWeight: 600,
              padding: "16px 28px", borderRadius: 999, textDecoration: "none",
            }}>{t("cta.signup")}</Link>
            <Link to="/contact" className="u-hover-lift" style={{
              background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`,
              fontFamily: sans, fontSize: 14, fontWeight: 500,
              padding: "15px 28px", borderRadius: 999, textDecoration: "none",
            }}>{t("cta.advisor")}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
