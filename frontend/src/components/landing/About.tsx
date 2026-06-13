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

const TILE_VALUES  = ["2018", "1 200+", "94 %", "12"];
const TILE_COLORS  = [L.primary, L.teal, L.green, L.amber];
const TILE_BGS     = ["oklch(94% 0.025 165)", "oklch(95% 0.025 165)", "oklch(96% 0.02 155)", "oklch(97% 0.012 90)"];
const TIMELINE_YEARS = ["2018", "2019", "2021", "2023", "2025"];

export function About() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "120px 40px";
  const tiles = TILE_VALUES.map((val, i) => ({ val, label: t(`abt.stat${i + 1}`), color: TILE_COLORS[i], bg: TILE_BGS[i] }));
  const timeline = TIMELINE_YEARS.map((year, i) => ({ year, label: t(`abt.tl${i + 1}`) }));
  const listItems = [t("abt.li1"), t("abt.li2"), t("abt.li3"), t("abt.li4")];

  return (
    <section style={{ background: L.paper, padding: pad, borderTop: `1px solid ${L.line}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.5fr", gap: isMobile ? 40 : 80, alignItems: "start", marginBottom: isMobile ? 48 : 80 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 12 }}>{t("abt.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: L.ink, margin: 0, letterSpacing: "-.02em" }}>
              {t("abt.h2a")}<br /><em style={{ fontStyle: "italic", color: L.primary }}>{t("abt.h2b")}</em>
            </h2>
            <div ref={ref} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 32 }}>
              {tiles.map((tile) => (
                <div key={tile.label} style={{ background: tile.bg, borderRadius: 16, padding: "20px 18px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: "opacity .6s, transform .6s" }}>
                  <div style={{ fontFamily: serif, fontSize: isMobile ? 32 : 38, fontWeight: 500, color: tile.color, lineHeight: 1 }}>{tile.val}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: L.muted, marginTop: 6, letterSpacing: ".1em", textTransform: "uppercase" as const }}>{tile.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, lineHeight: 1.65, color: L.text, margin: "0 0 28px" }}>{t("abt.body")}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 0 }}>
              {listItems.map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: `1px solid ${L.line}`, fontFamily: sans, fontSize: 14, color: L.ink, fontWeight: 500, opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-16px)", transition: `opacity .5s ${0.1 + i * 0.08}s, transform .5s ${0.1 + i * 0.08}s` }}>
                  <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: L.teal, flexShrink: 0 }}>→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ borderTop: `1px solid ${L.line}`, paddingTop: 48 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 32 }}>{t("abt.timeline")}</div>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${timeline.length}, 1fr)`,
            gap: isMobile ? 20 : 0,
          }}>
            {timeline.map((ev, i) => (
              <div key={ev.year} style={{
                paddingLeft: !isMobile && i ? 24 : 0, paddingRight: !isMobile ? 16 : 0,
                borderLeft: !isMobile && i ? `1px solid ${L.line}` : "none",
                opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: `opacity .5s ${0.2 + i * 0.1}s, transform .5s ${0.2 + i * 0.1}s`,
              }}>
                <div style={{ fontFamily: serif, fontSize: isMobile ? 28 : 36, fontWeight: 500, color: L.primary, lineHeight: 1 }}>{ev.year}</div>
                <div style={{ fontFamily: sans, fontSize: 12, lineHeight: 1.5, color: L.text, marginTop: 8 }}>{ev.label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
