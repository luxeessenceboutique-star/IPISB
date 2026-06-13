import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

export const Route = createFileRoute("/temoignages")({
  component: TemoignagesPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const TESTI_NAMES    = ["Yassine B.","Dr. L. Bensalah","Inès M.","Prof. K. Alami","Salma R.","Dr. Karim Tazi"];
const TESTI_INITIALS = ["YB","LB","IM","KA","SR","KT"];

function TemoignagesPage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const [formData, setFormData] = useState({ name: "", role: "", program: "", rating: "5", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";

  const testimonials = [0,1,2,3,4,5].map((i) => ({
    q: t(`tem.t${i}.q`), r: t(`tem.t${i}.r`),
    n: TESTI_NAMES[i], initials: TESTI_INITIALS[i], stars: 5,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t("tem.form.err.name");
    if (!formData.message.trim()) newErrors.message = t("tem.form.err.msg");
    else if (formData.message.trim().length < 10) newErrors.message = t("tem.form.err.short");
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({}); setSubmitted(true);
  };

  const inputStyle = (err?: string) => ({
    padding: "12px 16px", borderRadius: 10, border: `1px solid ${err ? "red" : PAL.line}`,
    fontFamily: sans, fontSize: 13, outline: "none", background: PAL.paper, color: PAL.ink,
    width: "100%", boxSizing: "border-box" as const,
  });

  return (
    <PageLayout>
      <div style={{ background: PAL.paper, minHeight: "100vh" }}>

        <section style={{ padding: isMobile ? "64px 20px 40px" : isTablet ? "80px 32px 48px" : "100px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("tem.eyebrow")}</div>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(40px, 6vw, 80px)", lineHeight: .98, color: PAL.ink, margin: "14px 0 0", letterSpacing: "-.02em" }}>
            {t("tem.h1a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("tem.h1b")}</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, color: PAL.text, lineHeight: 1.6, maxWidth: 680, marginTop: 18 }}>{t("tem.body")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 36, background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: isMobile ? "20px 16px" : "24px 32px" }}>
            {[["96 %", t("tem.stat1")],["98 %", t("tem.stat2")],["40 +", t("tem.stat3")]].map(([n,l],i) => (
              <div key={i} style={{ textAlign: "center" as const }}>
                <div style={{ fontFamily: serif, fontSize: isMobile ? 26 : 36, fontWeight: 600, color: PAL.primary }}>{n}</div>
                <div style={{ fontFamily: sans, fontSize: isMobile ? 11 : 12, color: PAL.muted, marginTop: 4, fontWeight: 500 }}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: isMobile ? "0 20px 48px" : isTablet ? "0 32px 64px" : "0 40px 80px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 18 }}>
            {testimonials.map((x, i) => (
              <article key={i} style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 18, padding: isMobile ? 20 : 28, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: serif, fontSize: 52, lineHeight: .1, color: PAL.primary, height: 18 }}>"</span>
                    <span style={{ color: PAL.primary, fontSize: 13 }}>{"★".repeat(x.stars)}</span>
                  </div>
                  <p style={{ fontFamily: serif, fontSize: isMobile ? 17 : 20, lineHeight: 1.4, color: PAL.ink, margin: "16px 0 20px", fontStyle: "italic", fontWeight: 500 }}>{x.q}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${PAL.line}`, paddingTop: 14 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: PAL.line, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 11, fontWeight: 700, color: PAL.primary }}>{x.initials}</div>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.ink }}>{x.n}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: PAL.muted, marginTop: 2 }}>{x.r}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={{ padding: isMobile ? "0 20px 64px" : "0 40px 100px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? "28px 20px" : 48, maxWidth: 680, margin: "0 auto" }}>
            {!submitted ? (
              <form onSubmit={handleSubmit}>
                <div style={{ textAlign: "center" as const, marginBottom: 28 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".12em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("tem.form.eyebrow")}</div>
                  <h3 style={{ fontFamily: serif, fontSize: isMobile ? 24 : 32, color: PAL.ink, margin: "8px 0 0", fontWeight: 500 }}>{t("tem.form.h3")}</h3>
                  <p style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, marginTop: 6 }}>{t("tem.form.body")}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("tem.form.name")}</label>
                    <input type="text" placeholder={t("tem.form.name.ph")} value={formData.name} onChange={(e) => setFormData({...formData,name:e.target.value})} style={inputStyle(errors.name)} />
                    {errors.name && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.name}</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("tem.form.role")}</label>
                      <select value={formData.role||t("tem.form.r.student")} onChange={(e) => setFormData({...formData,role:e.target.value})} style={{...inputStyle(), appearance:"auto" as const}}>
                        <option>{t("tem.form.r.student")}</option>
                        <option>{t("tem.form.r.graduate")}</option>
                        <option>{t("tem.form.r.teacher")}</option>
                        <option>{t("tem.form.r.partner")}</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("tem.form.rating")}</label>
                      <select value={formData.rating} onChange={(e) => setFormData({...formData,rating:e.target.value})} style={{...inputStyle(), appearance:"auto" as const}}>
                        <option value="5">{t("tem.form.rt5")}</option>
                        <option value="4">{t("tem.form.rt4")}</option>
                        <option value="3">{t("tem.form.rt3")}</option>
                        <option value="2">{t("tem.form.rt2")}</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("tem.form.program")}</label>
                    <input type="text" placeholder={t("tem.form.program.ph")} value={formData.program} onChange={(e) => setFormData({...formData,program:e.target.value})} style={inputStyle()} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("tem.form.message")}</label>
                    <textarea placeholder={t("tem.form.message.ph")} rows={5} value={formData.message} onChange={(e) => setFormData({...formData,message:e.target.value})} style={{...inputStyle(errors.message),resize:"vertical"}} />
                    {errors.message && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.message}</span>}
                  </div>
                  <button type="submit" style={{ background: PAL.ink, color: PAL.paper, fontFamily: sans, fontSize: 14, fontWeight: 600, border: 0, padding: "14px", borderRadius: 10, cursor: "pointer", marginTop: 6 }} onMouseEnter={(e) => (e.currentTarget.style.opacity="0.9")} onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}>
                    {t("tem.form.submit")}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: "center" as const, padding: "16px 0" }}>
                <span style={{ fontSize: 44, display: "inline-block", marginBottom: 18 }}>🎉</span>
                <h3 style={{ fontFamily: serif, fontSize: isMobile ? 24 : 28, color: PAL.ink, fontWeight: 500 }}>{t("tem.form.success.title")}</h3>
                <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, maxWidth: 460, margin: "10px auto 24px", lineHeight: 1.55 }}>{t("tem.form.success.body")}</p>
                <button onClick={() => { setFormData({name:"",role:"",program:"",rating:"5",message:""}); setSubmitted(false); }} style={{ background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "10px 24px", borderRadius: 99, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background=PAL.paper)} onMouseLeave={(e) => (e.currentTarget.style.background="transparent")}>
                  {t("tem.form.reset")}
                </button>
              </div>
            )}
          </div>
        </section>

      </div>
    </PageLayout>
  );
}
