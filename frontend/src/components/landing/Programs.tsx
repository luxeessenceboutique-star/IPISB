import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { useEffect, useRef, useState } from "react";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  mid:    "oklch(62% 0.085 170)",
  soft:   "oklch(82% 0.045 165)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  accent: "oklch(72% 0.11 60)",
  line:   "oklch(88% 0.015 170)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

// Real IPISB formations from the official brochure
const PROGRAMS = [
  {
    t: "Infirmier Polyvalent",
    d: "Formation complète pour exercer dans tous les services et structures de soins.",
    tags: ["Clinique", "Urgences", "Pédiatrie"],
  },
  {
    t: "Aide-Soignant",
    d: "Accompagnement et soins quotidiens des patients dans différents milieux de santé.",
    tags: ["Soins", "Accompagnement", "Terrain"],
  },
  {
    t: "Infirmier Auxiliaire",
    d: "Assister l'infirmier dans la réalisation des soins et le suivi des patients.",
    tags: ["Soins", "Suivi", "Collaboration"],
  },
  {
    t: "Technicien de Radiologie",
    d: "Réalisation des examens d'imagerie médicale et gestion des équipements radiologiques.",
    tags: ["Imagerie", "Diagnostic", "Technique"],
  },
  {
    t: "Et plus encore…",
    d: "Découvrez l'ensemble de nos filières lors d'une journée portes ouvertes ou contactez-nous.",
    tags: ["Inscriptions ouvertes"],
  },
];
const DOT_COLORS = [PAL.primary, PAL.mid, PAL.accent, PAL.soft, PAL.primary];

export function Programs() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section style={{ background: PAL.cream, padding: "120px 40px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 64 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: PAL.primary, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 16 }}>§ Formations</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(44px, 4.5vw, 60px)", lineHeight: .98, color: PAL.ink, margin: 0, letterSpacing: "-.02em" }}>
              Nos filières<br /><em style={{ fontStyle: "italic", color: PAL.primary }}>d'excellence.</em>
            </h2>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: PAL.muted, maxWidth: 360, margin: "0 0 16px" }}>
              Des formations accréditées, tournées vers la pratique et l'insertion professionnelle.
            </p>
            <Link to="/formations" style={{
              fontFamily: sans, fontSize: 13, fontWeight: 700, color: PAL.ink,
              textDecoration: "none", borderBottom: `2px solid ${PAL.primary}`, paddingBottom: 2,
            }}>
              Voir toutes les formations →
            </Link>
          </div>
        </div>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {PROGRAMS.map((p, i) => (
            <Link key={p.t} to="/formations" style={{
              background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 20,
              padding: "32px 28px", minHeight: 220,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              gridColumn: i === 0 ? "span 2" : "span 1",
              position: "relative", overflow: "hidden",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(24px)",
              transition: `opacity .6s ${i * 0.1}s, transform .6s ${i * 0.1}s`,
              textDecoration: "none", cursor: "pointer",
            }}>
              {i === 0 && (
                <div style={{ position: "absolute", right: -40, top: -40, opacity: .07, pointerEvents: "none" }}>
                  <Logo size={280} />
                </div>
              )}
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: PAL.muted, fontWeight: 600 }}>
                    {String(i + 1).padStart(2, "0")} / 0{PROGRAMS.length}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: DOT_COLORS[i], display: "inline-block" }} />
                  {p.tags.map(tag => (
                    <span key={tag} style={{
                      fontFamily: sans, fontSize: 10, fontWeight: 700,
                      color: DOT_COLORS[i], background: DOT_COLORS[i] + "18",
                      borderRadius: 999, padding: "2px 8px", letterSpacing: ".04em",
                    }}>{tag}</span>
                  ))}
                </div>
                <h3 style={{ fontFamily: serif, fontWeight: 500, fontSize: i === 0 ? 36 : 28, color: PAL.ink, margin: "16px 0 10px", letterSpacing: "-.015em" }}>{p.t}</h3>
                <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: PAL.muted, margin: 0, maxWidth: 420 }}>{p.d}</p>
              </div>
              <div style={{
                marginTop: 24, display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: sans, fontSize: 12, fontWeight: 700, color: PAL.ink,
              }}>
                {i === PROGRAMS.length - 1 ? "Nous contacter →" : "Découvrir le cursus →"}
              </div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}
