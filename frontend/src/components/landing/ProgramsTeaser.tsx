import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  mid:    "oklch(62% 0.085 170)",
  teal:   "oklch(62% 0.085 170)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const PROG_COLORS = [PAL.primary, PAL.mid, PAL.teal];

function ProgramCard({ p, i, visible, discover }: {
  p: { t: string; d: string; tags: string[]; color: string };
  i: number; visible: boolean; discover: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link to="/formations"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: PAL.paper, border: `1px solid ${hovered ? p.color + "55" : PAL.line}`, borderRadius: 20,
        padding: "28px 24px", minHeight: 200,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: hovered ? "translateY(-4px)" : visible ? "translateY(0)" : "translateY(24px)",
        boxShadow: hovered ? "0 16px 44px oklch(0% 0 0 / .08)" : "none",
        transition: visible
          ? "border-color .25s, transform .25s, box-shadow .25s, opacity .25s"
          : `opacity .6s ${i * 0.15}s, transform .6s ${i * 0.15}s`,
        textDecoration: "none",
      }}>
      {i === 0 && <div style={{ position: "absolute", right: -40, top: -40, opacity: .05, pointerEvents: "none" }}><Logo size={200} /></div>}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 14 }}>
          {p.tags.map((tag) => (
            <span key={tag} style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, color: p.color, background: p.color + "18", borderRadius: 999, padding: "2px 8px" }}>{tag}</span>
          ))}
        </div>
        <h3 style={{ fontFamily: serif, fontWeight: 500, fontSize: 24, color: PAL.ink, margin: "0 0 8px" }}>{p.t}</h3>
        <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.55, color: PAL.muted, margin: 0 }}>{p.d}</p>
      </div>
      <div style={{ marginTop: 20, fontFamily: sans, fontSize: 12, fontWeight: 700, color: p.color, borderBottom: `1.5px solid ${p.color}`, paddingBottom: 2, width: "fit-content", opacity: hovered ? 1 : .75, transition: "opacity .2s" }}>
        {discover}
      </div>
    </Link>
  );
}

export function ProgramsTeaser() {
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
  const programs = [0, 1, 2].map((i) => ({
    t: t(`prog.${i}.t`), d: t(`prog.${i}.d`),
    tags: t(`prog.${i}.tags`).split(","), color: PROG_COLORS[i],
  }));

  return (
    <section style={{ background: PAL.cream, padding: pad }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{
          display: isMobile ? "block" : "flex",
          justifyContent: "space-between", alignItems: "flex-end", marginBottom: isMobile ? 32 : 56,
        }}>
          <div style={{ marginBottom: isMobile ? 20 : 0 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 12 }}>{t("prog.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: PAL.ink, margin: 0, letterSpacing: "-.02em" }}>
              {t("prog.h2a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("prog.h2b")}</em>
            </h2>
          </div>
          {!isMobile && (
            <div style={{ textAlign: "right" as const }}>
              <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: PAL.muted, maxWidth: 360, margin: "0 0 16px" }}>{t("prog.subtitle")}</p>
              <Link to="/formations" style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.ink, textDecoration: "none", borderBottom: `2px solid ${PAL.primary}`, paddingBottom: 2 }}>{t("prog.cta_detail")}</Link>
            </div>
          )}
        </div>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 20 }}>
          {programs.map((p, i) => (
            <ProgramCard key={i} p={p} i={i} visible={visible} discover={t("prog.discover")} />
          ))}
        </div>

        <div style={{ textAlign: "center" as const, marginTop: 40 }}>
          <Link to="/formations" className="u-hover-lift" style={{
            display: "inline-block", background: PAL.ink, color: PAL.paper,
            fontFamily: sans, fontSize: 14, fontWeight: 600,
            padding: "14px 28px", borderRadius: 999, textDecoration: "none",
          }}>{t("prog.cta_apply")}</Link>
        </div>
      </div>
    </section>
  );
}
