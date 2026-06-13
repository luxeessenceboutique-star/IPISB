import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/Wordmark";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  line:   "oklch(88% 0.015 170)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

const SOCIAL = [
  { label: "Facebook",  href: "https://www.facebook.com/people/Ipisb-El-Jadida/pfbid02scTeG3UzbPMMWdG84Qs1QDdjrtifSbynTFUhSv8cF56wayGur9nGrWGXn4ujRTDfl/", icon: "f" },
  { label: "Instagram", href: "https://www.instagram.com/ipisb_el_jadida/", icon: "ig" },
];

const PROG_LINKS = ["Infirmier Polyvalent", "Infirmier Auxiliaire", "Aide-Soignant"];

export function SiteFooter() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();

  const cols = [
    { h: t("footer.col1"), links: [
      { label: t("footer.col1.l1"), to: "/plateforme" },
      { label: t("footer.col1.l2"), to: "/plateforme" },
      { label: t("footer.col1.l3"), to: "/plateforme" },
      { label: t("footer.col1.l4"), to: "/plateforme" },
      { label: t("footer.col1.l5"), to: "/plateforme" },
    ]},
    { h: t("footer.col2"), links: PROG_LINKS.map(l => ({ label: l, to: "/formations" })) },
    { h: t("footer.col3"), links: [
      { label: "El Jadida — +212 632-822898", to: "/contact" },
      { label: "+212 6 0713-1585",            to: "/contact" },
      { label: "contact@ipisb.ma",            to: "/contact" },
      { label: "Lun–Sam : 08:00–18:30",       to: "/contact" },
    ]},
  ];

  const desc = t("footer.desc").split("\n");
  const gridCols = isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr 1fr" : "1.4fr 1fr 1fr 1fr";
  const pad = isMobile ? "48px 20px 24px" : isTablet ? "56px 32px 24px" : "72px 40px 32px";

  return (
    <footer style={{ background: PAL.cream, borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: pad }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: isMobile ? 32 : 48, marginBottom: 48 }}>

          {/* Brand column — full width on mobile */}
          <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <Wordmark size={40} dark={false} />
            <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.65, color: PAL.muted, marginTop: 16, maxWidth: 280 }}>
              {desc.map((line, i) => <span key={i}>{line}{i < desc.length - 1 && <br />}</span>)}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {SOCIAL.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" title={s.label} style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, borderRadius: 8, border: `1px solid ${PAL.line}`,
                  fontFamily: mono, fontSize: 10, fontWeight: 700, color: PAL.primary, textDecoration: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = PAL.line)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >{s.icon}</a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.h}>
              <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: PAL.primary, letterSpacing: ".12em", textTransform: "uppercase" as const, marginBottom: 16 }}>
                {col.h}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((x) => (
                  <li key={x.label}>
                    <Link to={x.to} style={{ fontFamily: sans, fontSize: 13, color: PAL.text, textDecoration: "none" }}>{x.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          paddingTop: 20, borderTop: `1px solid ${PAL.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap" as const, gap: 8,
          fontFamily: sans, fontSize: 12, color: PAL.muted,
        }}>
          <span>© {new Date().getFullYear()} IPISB — {t("footer.copy")}</span>
          <a href="https://ipisb.ma" target="_blank" rel="noreferrer" style={{ fontFamily: mono, letterSpacing: ".06em", color: PAL.muted, textDecoration: "none" }}>ipisb.ma</a>
        </div>
      </div>
    </footer>
  );
}
