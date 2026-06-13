import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const L = {
  paper:   "oklch(99% 0.005 160)",
  cream:   "oklch(97% 0.012 90)",
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(52% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

export function NewsTeaser() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";
  const accent = L.primary;
  const bg = "oklch(94% 0.025 165)";

  return (
    <section style={{ background: L.cream, padding: pad }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40, flexWrap: "wrap" as const, gap: 12 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 12 }}>{t("news.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: L.ink, margin: 0, letterSpacing: "-.02em" }}>
              {t("news.h2a")}<br /><em style={{ fontStyle: "italic", color: L.primary }}>{t("news.h2b")}</em>
            </h2>
          </div>
          <Link to="/actualites" style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: L.ink, textDecoration: "none", borderBottom: `2px solid ${L.primary}`, paddingBottom: 2 }}>
            {t("news.cta_all")}
          </Link>
        </div>

        <div ref={ref} style={{ maxWidth: 900, margin: "0 auto" }}>
          <Link to="/actualites"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              textDecoration: "none", background: L.paper,
              border: `1px solid ${hovered ? accent + "55" : L.line}`,
              borderRadius: 24, overflow: "hidden",
              display: "flex", flexDirection: isMobile ? "column" : "row",
              transition: "border-color .25s, transform .3s, box-shadow .3s",
              transform: hovered ? "translateY(-4px)" : visible ? "translateY(0)" : "translateY(24px)",
              opacity: visible ? 1 : 0,
              boxShadow: hovered ? `0 20px 50px oklch(0% 0 0 / .07)` : "none",
            }}
          >
            <div style={{
              width: isMobile ? "100%" : "40%",
              height: isMobile ? 160 : "auto",
              background: bg, display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", flexShrink: 0,
            }}>
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 50%, ${accent}22 0%, transparent 60%)` }} />
              <span style={{ fontSize: 64, position: "relative" }}>🏥</span>
            </div>
            <div style={{ padding: isMobile ? 24 : 40, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: accent, letterSpacing: ".12em", textTransform: "uppercase" as const, background: accent + "15", padding: "4px 12px", borderRadius: 999 }}>{t("news.tag")}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: L.muted, fontWeight: 600 }}>{t("news.date")}</span>
              </div>
              <h3 style={{ fontFamily: serif, fontSize: isMobile ? 20 : 28, color: L.ink, margin: "0 0 12px", fontWeight: 500, lineHeight: 1.2 }}>{t("news.title")}</h3>
              <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.65, color: L.muted, margin: 0 }}>{t("news.excerpt")}</p>
              <div style={{ marginTop: 24, fontFamily: sans, fontSize: 12, fontWeight: 700, color: accent, opacity: hovered ? 1 : 0.6, transition: "opacity .2s" }}>{t("news.read")}</div>
            </div>
          </Link>
        </div>

      </div>
    </section>
  );
}
