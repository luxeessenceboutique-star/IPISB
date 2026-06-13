import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { MapPin, Phone, Mail, Globe } from "lucide-react";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  mid:    "oklch(62% 0.085 170)",
  soft:   "oklch(82% 0.045 165)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const CAMPUS_DATA = [
  { city: "El Jadida",   badgeKey: "camp.badge1", address: "24, 3ème Étage, Lotissement Ennajad, El Jadida", phone: "06 32 82 28 98", accent: PAL.primary, icon: "🏫" },
  { city: "Dar Bouazza", badgeKey: "camp.badge2", address: "Lotissement Le Littoral 02, 1er et 2ème étage, n° 20, Dar Bouazza, Errahma", phone: "06 60 90 08 80", accent: PAL.mid, icon: "🌊" },
  { city: "Errahma",     badgeKey: "camp.badge2", address: "Lotissement Le Littoral 02, Dar Bouazza, Errahma — Casablanca", phone: "06 60 90 08 80", accent: "oklch(72% 0.11 60)", icon: "🏙️" },
];

function CampusCard({ c, i, visible, t }: {
  c: typeof CAMPUS_DATA[0]; i: number; visible: boolean; t: (k: string) => string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "oklch(30% 0.035 175)" : "oklch(28% 0.03 175)",
        border: `1px solid ${hovered ? c.accent + "55" : "oklch(35% 0.04 175)"}`,
        borderRadius: 20, padding: "32px 28px",
        opacity: visible ? 1 : 0,
        transform: hovered ? "translateY(-4px)" : visible ? "translateY(0)" : "translateY(32px)",
        boxShadow: hovered ? "0 18px 48px oklch(0% 0 0 / .35)" : "none",
        transition: visible
          ? "background .25s, border-color .25s, transform .25s, box-shadow .25s, opacity .25s"
          : `opacity .7s ${i * 0.15}s, transform .7s ${i * 0.15}s`,
      }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.accent + "20", border: `1px solid ${c.accent}40`, borderRadius: 999, padding: "4px 12px", marginBottom: 20 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: c.accent }} />
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: c.accent }}>{t(c.badgeKey)}</span>
      </div>
      <h3 style={{ fontFamily: serif, fontWeight: 500, fontSize: 36, color: PAL.paper, margin: "0 0 8px", lineHeight: 1 }}>{c.city}</h3>
      <div style={{ height: 1, background: "oklch(40% 0.03 175)", margin: "16px 0" }} />
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <MapPin size={16} strokeWidth={1.5} color={c.accent} style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontFamily: sans, fontSize: 13, color: "oklch(70% 0.03 180)", margin: 0, lineHeight: 1.6 }}>{c.address}</p>
      </div>
      <a href={`tel:+212${c.phone.replace(/\s/g, "").slice(1)}`} style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: mono, fontSize: 14, fontWeight: 700, color: PAL.paper, textDecoration: "none", marginBottom: 24 }}>
        <Phone size={15} strokeWidth={1.5} color={c.accent} />{c.phone}
      </a>
      <Link to="/contact" style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: c.accent, textDecoration: "none", opacity: hovered ? 1 : .85, transition: "opacity .2s" }}>{t("camp.enroll")}</Link>
    </div>
  );
}

export function Campuses() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "120px 40px";

  return (
    <section style={{ background: PAL.ink, padding: pad }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{ display: isMobile ? "block" : "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: isMobile ? 32 : 64 }}>
          <div style={{ marginBottom: isMobile ? 20 : 0 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.soft, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 12 }}>{t("camp.eyebrow")}</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(38px, 4.5vw, 60px)", lineHeight: .98, color: PAL.paper, margin: 0, letterSpacing: "-.02em" }}>
              {t("camp.h2a")}<br /><em style={{ fontStyle: "italic", color: PAL.soft }}>{t("camp.h2b")}</em>
            </h2>
          </div>
          {!isMobile && (
            <div style={{ textAlign: "right" as const }}>
              <p style={{ fontFamily: sans, fontSize: 15, color: "oklch(70% 0.03 180)", maxWidth: 340, margin: "0 0 16px", lineHeight: 1.55 }}>{t("camp.subtitle")}</p>
              <Link to="/contact" style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.soft, textDecoration: "none", borderBottom: `2px solid oklch(82% 0.045 165 / .4)`, paddingBottom: 2 }}>{t("camp.find")}</Link>
            </div>
          )}
        </div>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 20 }}>
          {CAMPUS_DATA.map((c, i) => (
            <CampusCard key={c.city} c={c} i={i} visible={visible} t={t} />
          ))}
        </div>

        <div style={{
          marginTop: 32, padding: isMobile ? "20px 20px" : "28px 36px",
          background: "oklch(30% 0.035 175)", border: `1px solid oklch(36% 0.04 175)`, borderRadius: 16,
          display: "flex", alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between", flexDirection: isMobile ? "column" : "row" as const,
          flexWrap: "wrap" as const, gap: 16,
        }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: PAL.paper, display: "flex", alignItems: "center", gap: 8 }}><Mail size={15} strokeWidth={1.5} color={PAL.soft} />preinscription@ipisb.ma</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "oklch(65% 0.03 180)", marginTop: 4 }}>{t("camp.open")}</div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const }}>
            <a href="https://www.ipisb.ma" target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 12, color: PAL.soft, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><Globe size={13} strokeWidth={1.5} />www.ipisb.ma</a>
            <Link to="/contact" className="u-hover-lift" style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.ink, background: PAL.paper, borderRadius: 999, padding: "10px 20px", textDecoration: "none" }}>{t("camp.contact")}</Link>
          </div>
        </div>

      </div>
    </section>
  );
}
