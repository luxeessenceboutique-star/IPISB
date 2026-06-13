import { Link } from "@tanstack/react-router";
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
const mono  = '"JetBrains Mono", ui-monospace, monospace';

export function TestimonialsTeaser() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";

  return (
    <section style={{ background: PAL.paper, padding: pad, borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", textAlign: "center" as const }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("testi.eyebrow")}</div>
          <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: PAL.ink, marginTop: 12, letterSpacing: "-.02em" }}>
            {t("testi.h2a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("testi.h2b")}</em>
          </h2>
        </div>

        <div ref={ref} style={{
          background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24,
          padding: isMobile ? "32px 24px" : "48px 40px",
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity .6s, transform .6s",
          margin: "0 auto", maxWidth: 800,
        }}>
          <div style={{ fontFamily: serif, fontSize: 80, lineHeight: .1, color: PAL.primary, height: 24, textAlign: "left" as const }}>"</div>
          <p style={{ fontFamily: serif, fontSize: isMobile ? 18 : 24, lineHeight: 1.45, color: PAL.ink, margin: "16px 0 24px", fontStyle: "italic", fontWeight: 500 }}>
            {t("testi.quote")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" as const }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0, background: PAL.line, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 13, fontWeight: 700, color: PAL.primary }}>YB</div>
            <div style={{ textAlign: "left" as const }}>
              <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: PAL.ink }}>Yassine B.</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, marginTop: 2 }}>{t("testi.role")}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <Link to="/temoignages" className="u-hover-lift" style={{
            display: "inline-block", background: "transparent", color: PAL.ink,
            border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 14, fontWeight: 600,
            padding: "14px 28px", borderRadius: 999, textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = PAL.cream)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >{t("testi.cta")}</Link>
        </div>
      </div>
    </section>
  );
}
