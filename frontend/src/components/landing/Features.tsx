import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";
import {
  GraduationCap,
  ClipboardList,
  BarChart2,
  CalendarDays,
  MessageSquare,
  BookOpen,
  Microscope,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";

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

const ITEM_META: { n: string; Icon: LucideIcon; accent: string; bg: string }[] = [
  { n: "01", Icon: GraduationCap,  accent: L.primary, bg: "oklch(94% 0.025 165)" },
  { n: "02", Icon: ClipboardList,  accent: L.amber,   bg: "oklch(97% 0.012 90)"  },
  { n: "03", Icon: BarChart2,      accent: L.green,   bg: "oklch(96% 0.02 155)"  },
  { n: "04", Icon: CalendarDays,   accent: L.teal,    bg: "oklch(95% 0.025 165)" },
  { n: "05", Icon: MessageSquare,  accent: L.primary, bg: "oklch(94% 0.025 165)" },
  { n: "06", Icon: BookOpen,       accent: L.amber,   bg: "oklch(97% 0.012 90)"  },
  { n: "07", Icon: Microscope,     accent: L.green,   bg: "oklch(96% 0.02 155)"  },
  { n: "08", Icon: HeartPulse,     accent: L.teal,    bg: "oklch(95% 0.025 165)" },
];

function FeatureCard({
  meta, title, desc, explore, visible, delay,
}: {
  meta: typeof ITEM_META[0]; title: string; desc: string; explore: string; visible: boolean; delay: number;
}) {
  const [hovered, setHovered] = useState(false);
  const { Icon } = meta;
  return (
    <Link to="/plateforme"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: "none",
        background: hovered ? meta.bg : L.paper,
        border: `1px solid ${hovered ? meta.accent + "44" : L.line}`,
        borderRadius: 20, padding: "24px 20px",
        display: "flex", flexDirection: "column",
        transition: "background .25s, border-color .25s, transform .25s, box-shadow .25s",
        transform: hovered ? "translateY(-3px)" : visible ? "translateY(0)" : "translateY(24px)",
        opacity: visible ? 1 : 0,
        boxShadow: hovered ? `0 12px 40px oklch(0% 0 0 / .07)` : "none",
        transitionDelay: `${delay}s`, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: meta.accent, letterSpacing: ".12em" }}>{meta.n}</span>
        <Icon size={22} strokeWidth={1.5} color={meta.accent} />
      </div>
      <h3 style={{ fontFamily: serif, fontWeight: 500, fontSize: 20, color: L.ink, margin: "0 0 8px", lineHeight: 1.1 }}>{title}</h3>
      <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.6, color: L.muted, margin: 0, flex: 1 }}>{desc}</p>
      <div style={{ marginTop: 20, fontFamily: sans, fontSize: 12, fontWeight: 700, color: meta.accent, opacity: hovered ? 1 : 0.5, transition: "opacity .2s" }}>
        {explore}
      </div>
    </Link>
  );
}

export function Features() {
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
  const cols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(4, 1fr)";

  return (
    <section style={{ background: L.paper, padding: pad, borderTop: `1px solid ${L.line}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr",
          gap: isMobile ? 20 : 72, marginBottom: isMobile ? 40 : 72, alignItems: "end",
        }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 12 }}>{t("feat.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: L.ink, margin: 0, letterSpacing: "-.02em" }}>
              {t("feat.h2a")}<br /><em style={{ fontStyle: "italic", color: L.primary }}>{t("feat.h2b")}</em>
            </h2>
          </div>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 17, lineHeight: 1.65, color: L.text, maxWidth: 520, margin: 0, alignSelf: "end" }}>
            {t("feat.body")}
          </p>
        </div>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: cols, gap: 16 }}>
          {ITEM_META.map((meta, i) => (
            <FeatureCard key={meta.n} meta={meta} title={t(`feat.${meta.n}`)} desc={t(`feat.${meta.n}.d`)} explore={t("feat.explore")} visible={visible} delay={i * 0.06} />
          ))}
        </div>
      </div>
    </section>
  );
}
