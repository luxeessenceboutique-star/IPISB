import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { Phone, Smartphone, Mail, MapPin, Clock, Map, MailCheck, ChevronDown, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
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

function ContactPage() {
  const { t } = useI18n();
  const { isMobile, isTablet } = useBreakpoint();
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", program: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);

  const pad = isMobile ? "64px 20px" : isTablet ? "80px 32px" : "100px 40px";
  const faqs = [0,1,2,3].map((i) => ({ q: t(`con.faq.q${i}`), a: t(`con.faq.a${i}`) }));
  const contactInfo: { label: string; val: string; sub: string; Icon: LucideIcon }[] = [
    { label: t("con.info.p1.label"),     val: "+212 632-822898",        sub: t("con.info.p1.sub"),     Icon: Phone },
    { label: t("con.info.p2.label"),     val: "+212 6 0713-1585",       sub: t("con.info.p2.sub"),     Icon: Smartphone },
    { label: t("con.info.email.label"),  val: "contact@ipisb.ma",       sub: t("con.info.email.sub"),  Icon: Mail },
    { label: t("con.info.campus.label"), val: t("con.info.campus.val"), sub: t("con.info.campus.sub"), Icon: MapPin },
    { label: t("con.info.hours.label"),  val: t("con.info.hours.val"),  sub: t("con.info.hours.sub"),  Icon: Clock },
  ];

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t("con.form.err.name");
    if (!formData.email.trim()) { newErrors.email = t("con.form.err.email"); }
    else { const r = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; if (!r.test(formData.email)) newErrors.email = t("con.form.err.email.invalid"); }
    if (!formData.phone.trim()) { newErrors.phone = t("con.form.err.phone"); }
    else { const c = formData.phone.replace(/[\s-+()]/g,""); if (c.length < 8 || isNaN(Number(c))) newErrors.phone = t("con.form.err.phone.invalid"); }
    if (!formData.program) newErrors.program = t("con.form.err.program");
    if (!formData.message.trim()) { newErrors.message = t("con.form.err.message"); }
    else if (formData.message.trim().length < 10) { newErrors.message = t("con.form.err.msg.short"); }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({}); setSubmitted(true);
  };

  const inputStyle = (err?: string) => ({
    padding: "12px 16px", borderRadius: 10, border: `1px solid ${err ? "red" : PAL.line}`,
    fontFamily: sans, fontSize: 13, outline: "none", background: PAL.paper, color: PAL.ink, width: "100%",
    boxSizing: "border-box" as const,
  });

  return (
    <PageLayout>
      <div style={{ background: PAL.paper, minHeight: "100vh" }}>

        <section style={{ padding: isMobile ? "64px 20px 40px" : isTablet ? "80px 32px 48px" : "100px 40px 60px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("con.eyebrow")}</div>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(42px, 6vw, 80px)", lineHeight: .98, color: PAL.ink, margin: "14px 0 0", letterSpacing: "-.02em" }}>
            {t("con.h1a")}<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>{t("con.h1b")}</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: isMobile ? 15 : 18, color: PAL.text, lineHeight: 1.6, maxWidth: 680, marginTop: 20 }}>{t("con.body")}</p>
        </section>

        <section style={{ padding: isMobile ? "0 20px 64px" : isTablet ? "0 32px 80px" : "0 40px 100px", maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "1fr 1.2fr", gap: isMobile ? 32 : 80, alignItems: "start" }}>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? 24 : 36 }}>
                <h3 style={{ fontFamily: serif, fontSize: isMobile ? 22 : 28, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>{t("con.info.title")}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {contactInfo.map((info, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <info.Icon size={20} strokeWidth={1.5} color={PAL.primary} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: PAL.muted, textTransform: "uppercase" as const }}>{info.label}</div>
                        <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: PAL.ink, marginTop: 2 }}>{info.val}</div>
                        <div style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, marginTop: 2 }}>{info.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? 20 : 32, display: "flex", alignItems: "center", gap: 16 }}>
                <Map size={32} strokeWidth={1.25} color={PAL.primary} style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontFamily: serif, fontSize: 20, color: PAL.ink, margin: 0, fontWeight: 500 }}>{t("con.map.title")}</h4>
                  <p style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, margin: "4px 0 0" }}>{t("con.map.body")}</p>
                  <a href="https://maps.google.com" target="_blank" rel="noreferrer" style={{ display: "inline-block", fontFamily: sans, fontSize: 12, fontWeight: 700, color: PAL.primary, textDecoration: "none", borderBottom: `1.5px solid ${PAL.primary}`, marginTop: 8 }}>{t("con.map.cta")}</a>
                </div>
              </div>
            </div>

            <div style={{ background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: isMobile ? 24 : 44 }}>
              {!submitted ? (
                <form onSubmit={handleFormSubmit}>
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".12em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("con.form.eyebrow")}</div>
                    <h3 style={{ fontFamily: serif, fontSize: isMobile ? 24 : 32, color: PAL.ink, margin: "8px 0 0", fontWeight: 500 }}>{t("con.form.h3")}</h3>
                    <p style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, marginTop: 6 }}>{t("con.form.body")}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("con.form.name")}</label>
                      <input type="text" placeholder={t("con.form.name.ph")} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} style={inputStyle(errors.name)} />
                      {errors.name && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.name}</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("con.form.email")}</label>
                        <input type="text" placeholder="exemple@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} style={inputStyle(errors.email)} />
                        {errors.email && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.email}</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("con.form.phone")}</label>
                        <input type="text" placeholder={t("con.form.phone.ph")} value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} style={inputStyle(errors.phone)} />
                        {errors.phone && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.phone}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("con.form.program")}</label>
                      <select value={formData.program} onChange={(e) => setFormData({...formData, program: e.target.value})} style={{ ...inputStyle(errors.program), appearance: "auto" as const }}>
                        <option value="">{t("con.form.program.ph")}</option>
                        {[1,2,3,4,5,6,7].map(i => <option key={i}>{t(`con.form.opt${i}`)}</option>)}
                      </select>
                      {errors.program && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.program}</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: PAL.ink }}>{t("con.form.message")}</label>
                      <textarea placeholder={t("con.form.message.ph")} rows={4} value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} style={{ ...inputStyle(errors.message), resize: "vertical" }} />
                      {errors.message && <span style={{ fontFamily: sans, fontSize: 11, color: "red" }}>{errors.message}</span>}
                    </div>
                    <button type="submit" style={{ background: PAL.ink, color: PAL.paper, fontFamily: sans, fontSize: 14, fontWeight: 600, border: 0, padding: "14px", borderRadius: 10, cursor: "pointer", marginTop: 6 }} onMouseEnter={(e) => (e.currentTarget.style.opacity="0.9")} onMouseLeave={(e) => (e.currentTarget.style.opacity="1")}>
                      {t("con.form.submit")}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ textAlign: "center" as const, padding: "24px 0" }}>
                  <MailCheck size={48} strokeWidth={1.25} color={PAL.primary} style={{ display: "inline-block", marginBottom: 20 }} />
                  <h3 style={{ fontFamily: serif, fontSize: isMobile ? 24 : 32, color: PAL.ink, fontWeight: 500 }}>{t("con.form.success.title")}</h3>
                  <p style={{ fontFamily: sans, fontSize: 14, color: PAL.muted, maxWidth: 440, margin: "14px auto 28px", lineHeight: 1.6 }}>{t("con.form.success.body")}</p>
                  <button onClick={() => { setFormData({name:"",email:"",phone:"",program:"",message:""}); setSubmitted(false); }} style={{ background: "transparent", color: PAL.ink, border: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "12px 28px", borderRadius: 99, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background=PAL.paper)} onMouseLeave={(e) => (e.currentTarget.style.background="transparent")}>
                    {t("con.form.reset")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={{ padding: pad, background: PAL.cream, borderTop: `1px solid ${PAL.line}` }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center" as const, marginBottom: isMobile ? 36 : 52 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>{t("con.faq.eyebrow")}</div>
              <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(30px, 4vw, 54px)", color: PAL.ink, margin: "12px 0 0", letterSpacing: "-.02em" }}>
                {t("con.faq.h2a")} <em style={{ fontStyle: "italic", color: PAL.primary }}>{t("con.faq.h2b")}</em>
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {faqs.map((faq, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div key={idx} style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 16, overflow: "hidden" }}>
                    <button onClick={() => setOpenFaqIdx(isOpen ? null : idx)} style={{ width: "100%", padding: isMobile ? "18px 20px" : "22px 28px", background: "none", border: 0, textAlign: "left" as const, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", outline: "none", gap: 12 }}>
                      <span style={{ fontFamily: serif, fontSize: isMobile ? 16 : 20, fontWeight: 600, color: PAL.ink }}>{faq.q}</span>
                      <ChevronDown size={16} color={PAL.primary} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s", flexShrink: 0 }} />
                    </button>
                    {isOpen && <div style={{ padding: isMobile ? "0 20px 18px" : "0 28px 22px", fontFamily: sans, fontSize: 14, lineHeight: 1.6, color: PAL.text, borderTop: `1px solid ${PAL.line}`, paddingTop: 14 }}>{faq.a}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
