import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

export const Route = createFileRoute("/formations")({
  component: FormationsPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  mid:    "oklch(62% 0.085 170)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  teal:   "oklch(62% 0.085 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const PROG_COLORS = [PAL.primary, PAL.mid, PAL.teal];
const PROG_IDS    = ["polyvalent", "auxiliaire", "aide-soignant"];
const PROG_CATS   = ["licence-soins", "licence-soins", "soins"];

function FormationsPage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";

  const categories = [
    { id: "all",     label: t("fp.cat.all") },
    { id: "licence", label: t("fp.cat.licence") },
    { id: "soins",   label: t("fp.cat.soins") },
  ];

  const programs = [0, 1, 2].map((i) => ({
    id: PROG_IDS[i], cat: PROG_CATS[i],
    t: t(`fp.p${i}.t`), d: t(`fp.p${i}.d`), dur: t(`fp.p${i}.dur`),
    req: t(`fp.p${i}.req`), hours: t(`fp.p${i}.hours`), obj: t(`fp.p${i}.obj`),
    careers: [t(`fp.p${i}.c1`), t(`fp.p${i}.c2`), t(`fp.p${i}.c3`), t(`fp.p${i}.c4`)],
    color: PROG_COLORS[i],
  }));

  const filteredPrograms = programs.filter((p) => {
    let matchFilter = true;
    if (activeFilter === "licence") matchFilter = p.cat.includes("licence");
    else if (activeFilter === "soins") matchFilter = p.cat.includes("soins");
    const matchSearch = p.t.toLowerCase().includes(searchQuery.toLowerCase()) || p.d.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <PageLayout>
      <div style={{ background: PAL.paper, minHeight: "100vh" }}>

        <section style={{ padding: isMobile ? "64px 20px 40px" : isTablet ? "80px 32px 48px" : "100px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("fp.eyebrow")}</div>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(42px, 6vw, 80px)", lineHeight: .98, color: PAL.ink, margin: "14px 0 0", letterSpacing: "-.02em" }}>
            {t("fp.h1a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("fp.h1b")}</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, color: PAL.text, lineHeight: 1.6, maxWidth: 680, marginTop: 20 }}>{t("fp.body")}</p>
        </section>

        <section style={{ padding: isMobile ? "0 20px" : isTablet ? "0 32px" : "0 40px", maxWidth: 1280, margin: "0 auto", marginBottom: 32 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14, background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: isMobile ? "16px 16px" : "20px 24px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => setActiveFilter(cat.id)} style={{
                  background: activeFilter === cat.id ? PAL.ink : "transparent",
                  color: activeFilter === cat.id ? PAL.paper : PAL.ink,
                  border: activeFilter === cat.id ? "1px solid transparent" : `1px solid ${PAL.line}`,
                  borderRadius: 99, padding: isMobile ? "6px 14px" : "8px 18px",
                  fontFamily: sans, fontSize: isMobile ? 12 : 13, fontWeight: activeFilter === cat.id ? 600 : 500,
                  cursor: "pointer", transition: "all .2s",
                }}>{cat.label}</button>
              ))}
            </div>
            <input type="text" placeholder={t("fp.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{
              width: "100%", maxWidth: isMobile ? "100%" : 280,
              padding: "10px 16px", borderRadius: 99, border: `1px solid ${PAL.line}`,
              fontFamily: sans, fontSize: 13, outline: "none", color: PAL.ink, background: PAL.paper,
            }} />
          </div>
        </section>

        <section style={{ padding: isMobile ? "0 20px 64px" : isTablet ? "0 32px 80px" : "0 40px 100px", maxWidth: 1280, margin: "0 auto" }}>
          {filteredPrograms.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
              {filteredPrograms.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <div key={p.id} style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? "24px 20px" : "36px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: p.color, background: p.color+"18", borderRadius: 999, padding: "3px 10px" }}>{p.dur}</span>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: p.color }} />
                        <span style={{ fontFamily: sans, fontSize: 12, color: PAL.muted }}>{t("fp.stages")} {p.hours}</span>
                      </div>
                      <h3 style={{ fontFamily: serif, fontWeight: 500, fontSize: isMobile ? 24 : 32, color: PAL.ink, margin: "16px 0 10px" }}>{p.t}</h3>
                      <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.6, color: PAL.text, margin: 0 }}>{p.d}</p>
                      {isExpanded && (
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${PAL.line}` }}>
                          <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, color: PAL.ink, margin: "0 0 6px" }}>{t("fp.objectives")}</h4>
                          <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.55, color: PAL.muted, margin: "0 0 16px" }}>{p.obj}</p>
                          <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, color: PAL.ink, margin: "0 0 6px" }}>{t("fp.admission")}</h4>
                          <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.55, color: PAL.muted, margin: "0 0 16px" }}>{p.req}</p>
                          <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, color: PAL.ink, margin: "0 0 6px" }}>{t("fp.careers")}</h4>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 5 }}>
                            {p.careers.map((c, i) => (
                              <li key={i} style={{ display: "flex", gap: 8, fontFamily: sans, fontSize: 13, color: PAL.text }}>
                                <span style={{ color: p.color, fontWeight: 700 }}>→</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 10 }}>
                      <button onClick={() => setExpandedId(isExpanded ? null : p.id)} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.ink, borderBottom: `2.5px solid ${p.color}`, paddingBottom: 2 }}>
                        {isExpanded ? t("fp.collapse") : t("fp.details")}
                      </button>
                      <a href="/contact" style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.paper, background: PAL.ink, borderRadius: 99, padding: "8px 16px", textDecoration: "none" }}>{t("fp.apply")}</a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center" as const, padding: "60px 0" }}>
              <span style={{ fontSize: 40 }}>🔍</span>
              <h3 style={{ fontFamily: serif, fontSize: 22, color: PAL.ink, marginTop: 14 }}>{t("fp.empty.title")}</h3>
              <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, marginTop: 8 }}>{t("fp.empty.body")}</p>
            </div>
          )}
        </section>

        <section style={{ padding: pad, background: PAL.cream, borderTop: `1px solid ${PAL.line}` }}>
          <div style={{ maxWidth: 1040, margin: "0 auto", background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 28, padding: isMobile ? "40px 24px" : "72px 56px", position: "relative", overflow: "hidden", textAlign: "center" as const }}>
            <div style={{ position: "absolute", right: -60, bottom: -60, opacity: .04, pointerEvents: "none" }}><Logo size={280} /></div>
            <div style={{ position: "relative" }}>
              <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(30px, 4.5vw, 54px)", color: PAL.ink, margin: "0 0 14px", letterSpacing: "-.02em" }}>
                {t("fp.cta.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("fp.cta.h2b")}</em>
              </h2>
              <p style={{ fontFamily: sans, fontSize: isMobile ? 14 : 15, color: PAL.muted, maxWidth: 540, margin: "0 auto", lineHeight: 1.55 }}>{t("fp.cta.body")}</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" as const }}>
                <a href="/contact" style={{ background: PAL.ink, color: PAL.paper, fontFamily: sans, fontSize: 14, fontWeight: 600, padding: "14px 24px", borderRadius: 999, textDecoration: "none" }}>{t("fp.cta.contact")}</a>
                <a href="tel:+212632822898" style={{ background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 14, fontWeight: 500, padding: "13px 24px", borderRadius: 999, textDecoration: "none" }}>{t("fp.cta.call")}</a>
              </div>
            </div>
          </div>
        </section>

      </div>
    </PageLayout>
  );
}
