import { useEffect, useRef, useState } from "react";

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

const TESTIMONIALS = [
  {
    q: "L'IPISB m'a donné les outils, mais surtout l'humanité du métier.",
    n: "Yassine B.",
    r: "Diplômé · Soins Infirmiers",
    initials: "YB",
  },
  {
    q: "Une plateforme qui simplifie vraiment notre quotidien d'enseignant.",
    n: "Dr. L. Bensalah",
    r: "Professeure · Pharmacologie",
    initials: "LB",
  },
  {
    q: "J'apprécie la connexion étroite entre théorie et pratique hospitalière.",
    n: "Inès M.",
    r: "Étudiante · L3 Kinésithérapie",
    initials: "IM",
  },
];

export function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section style={{ background: PAL.paper, padding: "120px 40px", borderTop: `1px solid ${PAL.line}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600 }}>§ Témoignages</div>
          <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(44px, 4.5vw, 60px)", lineHeight: .98, color: PAL.ink, marginTop: 16, letterSpacing: "-.02em" }}>
            Voix de<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>la communauté.</em>
          </h2>
        </div>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 56 }}>
          {TESTIMONIALS.map((x, i) => (
            <article key={i} style={{
              background: PAL.cream, border: `1px solid ${PAL.line}`, borderRadius: 18, padding: 28,
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)",
              transition: `opacity .6s ${i * 0.1}s, transform .6s ${i * 0.1}s`,
            }}>
              <div style={{ fontFamily: serif, fontSize: 64, lineHeight: .5, color: PAL.primary, height: 30 }}>"</div>
              <p style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.3, color: PAL.ink, margin: "20px 0 24px", fontStyle: "italic", fontWeight: 500 }}>{x.q}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                  background: PAL.line, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: mono, fontSize: 11, fontWeight: 700, color: PAL.primary,
                }}>
                  {x.initials}
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.ink }}>{x.n}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: PAL.muted, marginTop: 2 }}>{x.r}</div>
                </div>
              </div>
            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
