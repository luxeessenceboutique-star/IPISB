import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const L = {
  paper:   "oklch(99% 0.005 160)",
  ink:     "oklch(22% 0.025 175)",
  text:    "oklch(34% 0.03 180)",
  muted:   "oklch(52% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  teal:    "oklch(62% 0.085 170)",
  amber:   "oklch(78% 0.12 80)",
  green:   "oklch(70% 0.13 155)",
  line:    "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const TILE_VALUES = ["2018", "1 200+", "94 %", "12"];
const TILE_COLORS = [L.primary, L.teal, L.green, L.amber];
const TILE_BGS    = ["oklch(94% 0.025 165)", "oklch(95% 0.025 165)", "oklch(96% 0.02 155)", "oklch(97% 0.012 90)"];

export function AboutTeaser() {
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
  const tiles = TILE_VALUES.map((val, i) => ({
    val, label: t(`about.stat${i + 1}`), color: TILE_COLORS[i], bg: TILE_BGS[i],
  }));

  return (
    <section style={{ background: L.paper, padding: pad, borderTop: `1px solid ${L.line}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "1fr 1.2fr", gap: isMobile ? 40 : 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 12 }}>{t("about.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: L.ink, margin: 0, letterSpacing: "-.02em" }}>
              {t("about.h2a")}<br /><em style={{ fontStyle: "italic", color: L.primary }}>{t("about.h2b")}</em>
            </h2>
            <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 16, lineHeight: 1.65, color: L.text, marginTop: 20, marginBottom: 28 }}>{t("about.body")}</p>
            <Link to="/a-propos" className="u-hover-lift" style={{
              display: "inline-block", background: L.ink, color: L.paper,
              fontFamily: sans, fontSize: 14, fontWeight: 600,
              padding: "14px 28px", borderRadius: 999, textDecoration: "none",
            }}>{t("about.cta")}</Link>
          </div>

          <div ref={ref} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {tiles.map((tile) => (
              <div key={tile.label} style={{
                background: tile.bg, borderRadius: 16, padding: "22px 20px",
                opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)",
                transition: "opacity .6s, transform .6s",
              }}>
                <div style={{ fontFamily: serif, fontSize: isMobile ? 36 : 44, fontWeight: 500, color: tile.color, lineHeight: 1 }}>{tile.val}</div>
                <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: L.muted, marginTop: 8, letterSpacing: ".1em", textTransform: "uppercase" as const }}>{tile.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
