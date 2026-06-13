import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { Hospital, GraduationCap, Monitor, Building2, Microscope, Star, Newspaper, MailCheck, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/actualites")({
  component: ActualitesPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  teal:   "oklch(62% 0.085 170)",
  amber:  "oklch(78% 0.12 80)",
  green:  "oklch(70% 0.13 155)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const ART_BG     = ["oklch(94% 0.025 165)","oklch(97% 0.012 90)","oklch(96% 0.02 155)","oklch(95% 0.025 165)","oklch(94% 0.025 165)","oklch(97% 0.012 90)"];
const ART_ACCENT = [PAL.primary, PAL.amber, PAL.green, PAL.teal, PAL.primary, PAL.amber];
const ART_ICONS: LucideIcon[] = [Hospital, GraduationCap, Monitor, Building2, Microscope, Star];
const ART_CATS   = ["recherche","vie","plateforme","evenement","recherche","vie"];

function ActualitesPage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [email, setEmail] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState("");

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";

  const categories = [
    { id: "all",        label: t("act.cat.all") },
    { id: "recherche",  label: t("act.cat.recherche") },
    { id: "vie",        label: t("act.cat.vie") },
    { id: "plateforme", label: t("act.cat.plateforme") },
    { id: "evenement",  label: t("act.cat.evenement") },
  ];

  const articles = [0,1,2,3,4,5].map((i) => ({
    id: `a${i}`, cat: ART_CATS[i], tag: t(`act.a${i}.tag`), date: t(`act.a${i}.date`),
    time: t(`act.a${i}.time`), title: t(`act.a${i}.t`), excerpt: t(`act.a${i}.excerpt`),
    bg: ART_BG[i], accent: ART_ACCENT[i], Icon: ART_ICONS[i],
  }));

  const filteredArticles = articles.filter((art) => {
    let matchCat = activeCategory === "all" ? true : art.cat === activeCategory;
    const matchSearch = art.title.toLowerCase().includes(searchQuery.toLowerCase()) || art.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setEmailError(t("act.nl.error")); return; }
    const p = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!p.test(email)) { setEmailError(t("act.nl.error.invalid")); return; }
    setEmailError(""); setEmailSuccess(true);
  };

  return (
    <PageLayout>
      <div style={{ background: PAL.paper, minHeight: "100vh" }}>

        <section style={{ padding: isMobile ? "64px 20px 40px" : isTablet ? "80px 32px 48px" : "100px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("act.eyebrow")}</div>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(40px, 6vw, 80px)", lineHeight: .98, color: PAL.ink, margin: "14px 0 0", letterSpacing: "-.02em" }}>
            {t("act.h1a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("act.h1b")}</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, color: PAL.text, lineHeight: 1.6, maxWidth: 680, marginTop: 18 }}>{t("act.body")}</p>
        </section>

        <section style={{ padding: isMobile ? "0 20px" : isTablet ? "0 32px" : "0 40px", maxWidth: 1280, margin: "0 auto", marginBottom: 36 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: isMobile ? "16px" : "20px 24px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, flex: 1 }}>
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                  background: activeCategory === cat.id ? PAL.ink : "transparent",
                  color: activeCategory === cat.id ? PAL.paper : PAL.ink,
                  border: activeCategory === cat.id ? "1px solid transparent" : `1px solid ${PAL.line}`,
                  borderRadius: 99, padding: isMobile ? "6px 12px" : "8px 18px",
                  fontFamily: sans, fontSize: isMobile ? 11 : 13, fontWeight: activeCategory === cat.id ? 600 : 500,
                  cursor: "pointer", transition: "all .2s",
                }}>{cat.label}</button>
              ))}
            </div>
            <input type="text" placeholder={t("act.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", maxWidth: isMobile ? "100%" : 260, padding: "10px 16px", borderRadius: 99, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 13, outline: "none", color: PAL.ink, background: PAL.paper }} />
          </div>
        </section>

        <section style={{ padding: isMobile ? "0 20px 64px" : isTablet ? "0 32px 80px" : "0 40px 100px", maxWidth: 1280, margin: "0 auto" }}>
          {filteredArticles.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 20 }}>
              {filteredArticles.map((art) => (
                <article key={art.id} style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 140, background: art.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${art.accent}18 0%, transparent 70%)` }} />
                    <art.Icon size={44} strokeWidth={1.25} color={art.accent} style={{ position: "relative" }} />
                  </div>
                  <div style={{ padding: isMobile ? 18 : 24, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: art.accent, letterSpacing: ".12em", textTransform: "uppercase" as const, background: art.accent+"15", padding: "3px 10px", borderRadius: 999 }}>{art.tag}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: PAL.muted, fontWeight: 600 }}>{art.date}</span>
                      </div>
                      <h3 style={{ fontFamily: serif, fontSize: 19, color: PAL.ink, margin: "0 0 10px", fontWeight: 500, lineHeight: 1.25 }}>{art.title}</h3>
                      <p style={{ fontFamily: sans, fontSize: 13, lineHeight: 1.6, color: PAL.text, margin: 0 }}>{art.excerpt}</p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, borderTop: `1px solid ${PAL.line}`, paddingTop: 14 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, color: PAL.muted }}>{art.time}</span>
                      <button style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 12, fontWeight: 700, color: art.accent }}>{t("act.read")}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center" as const, padding: "60px 0" }}>
              <Newspaper size={40} strokeWidth={1.25} color={PAL.muted} style={{ display: "inline-block" }} />
              <h3 style={{ fontFamily: serif, fontSize: 22, color: PAL.ink, marginTop: 14 }}>{t("act.empty.title")}</h3>
              <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, marginTop: 8 }}>{t("act.empty.body")}</p>
            </div>
          )}
        </section>

        <section style={{ padding: isMobile ? "0 20px 64px" : "0 40px 120px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ maxWidth: 800, margin: "0 auto", background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? "32px 20px" : "48px 40px", textAlign: "center" as const }}>
            {!emailSuccess ? (
              <form onSubmit={handleSubscribe}>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontFamily: serif, fontSize: isMobile ? 24 : 32, color: PAL.ink, margin: 0, fontWeight: 500 }}>
                    {t("act.nl.h3a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("act.nl.h3b")}</em>
                  </h3>
                  <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, marginTop: 8 }}>{t("act.nl.body")}</p>
                </div>
                <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto", flexDirection: isMobile ? "column" : "row" as const }}>
                  <input type="text" placeholder={t("act.nl.placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, padding: "12px 18px", borderRadius: 10, border: `1px solid ${emailError ? "red" : PAL.line}`, fontFamily: sans, fontSize: 13, outline: "none", background: PAL.paper, color: PAL.ink }} />
                  <button type="submit" style={{ background: PAL.ink, color: PAL.paper, fontFamily: sans, fontSize: 13, fontWeight: 600, border: 0, padding: "12px 24px", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" as const }}>{t("act.nl.subscribe")}</button>
                </div>
                {emailError && <p style={{ fontFamily: sans, fontSize: 11, color: "red", marginTop: 8 }}>{emailError}</p>}
              </form>
            ) : (
              <div style={{ padding: "8px 0" }}>
                <MailCheck size={36} strokeWidth={1.25} color={PAL.primary} style={{ display: "inline-block", marginBottom: 14 }} />
                <h4 style={{ fontFamily: serif, fontSize: 22, color: PAL.ink, fontWeight: 500 }}>{t("act.nl.success.title")}</h4>
                <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, margin: "8px 0 18px" }}>{t("act.nl.success.body")} <strong>{email}</strong>.</p>
                <button onClick={() => { setEmail(""); setEmailSuccess(false); }} style={{ background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: 99, cursor: "pointer" }}>{t("act.nl.reset")}</button>
              </div>
            )}
          </div>
        </section>

      </div>
    </PageLayout>
  );
}
