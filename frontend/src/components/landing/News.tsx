import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

const L = {
  paper:   "oklch(99% 0.005 160)",
  cream:   "oklch(97% 0.012 90)",
  pale:    "oklch(94% 0.025 165)",
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

const NEWS = [
  {
    tag: "Recherche", tagColor: L.primary, date: "28 avr. 2026",
    t: "Nouveau partenariat avec le CHU d'El Jadida pour la recherche en gériatrie et médecine préventive",
    excerpt: "L'IPISB et le Centre Hospitalier Universitaire d'El Jadida unissent leurs forces pour développer un programme de recherche inédit axé sur la gériatrie.",
    featured: true,
    bg: "oklch(94% 0.025 165)",
    accent: L.primary,
  },
  {
    tag: "Vie de l'école", tagColor: L.amber, date: "22 avr. 2026",
    t: "Cérémonie de remise des diplômes de la promotion 2025",
    excerpt: "Plus de 180 étudiants ont reçu leur diplôme lors d'une cérémonie à l'amphithéâtre principal.",
    featured: false,
    bg: "oklch(97% 0.012 90)",
    accent: L.amber,
  },
  {
    tag: "Plateforme", tagColor: L.green, date: "10 avr. 2026",
    t: "Le module Recherche & Publications est désormais disponible pour tous",
    excerpt: "Un nouvel espace dédié à la publication, la lecture et la collaboration scientifique entre étudiants et enseignants.",
    featured: false,
    bg: "oklch(96% 0.02 155)",
    accent: L.green,
  },
];

function NewsCard({ n, visible, delay }: { n: typeof NEWS[0]; visible: boolean; delay: number }) {
  const [hovered, setHovered] = useState(false);
  if (n.featured) {
    return (
      <Link
        to="/actualites"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          textDecoration: "none",
          gridRow: "span 2",
          background: L.paper,
          border: `1px solid ${hovered ? n.accent + "55" : L.line}`,
          borderRadius: 22, overflow: "hidden",
          display: "flex", flexDirection: "column",
          transition: "border-color .25s, transform .3s, box-shadow .3s",
          transform: hovered ? "translateY(-3px)" : visible ? "translateY(0)" : "translateY(24px)",
          opacity: visible ? 1 : 0,
          boxShadow: hovered ? `0 16px 50px oklch(0% 0 0 / .07)` : "none",
          transitionDelay: `${delay}s`,
          cursor: "pointer",
        }}
      >
        <div style={{ height: 260, background: n.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 50%, ${n.accent}22 0%, transparent 60%)`, pointerEvents: "none" }} />
          <span style={{ fontSize: 64, position: "relative" }}>🏥</span>
        </div>
        <div style={{ padding: 28, flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: n.accent, letterSpacing: ".12em", textTransform: "uppercase" as const, background: n.accent + "15", padding: "3px 10px", borderRadius: 999 }}>{n.tag}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: L.muted, fontWeight: 600 }}>{n.date}</span>
          </div>
          <h3 style={{ fontFamily: serif, fontSize: 28, color: L.ink, margin: "0 0 12px", letterSpacing: "-.015em", fontWeight: 500, lineHeight: 1.15 }}>{n.t}</h3>
          <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.65, color: L.muted, margin: 0, flex: 1 }}>{n.excerpt}</p>
          <div style={{ marginTop: 24, fontFamily: sans, fontSize: 12, fontWeight: 700, color: n.accent, opacity: hovered ? 1 : 0.6, transition: "opacity .2s" }}>Lire l'article →</div>
        </div>
      </Link>
    );
  }
  return (
    <Link
      to="/actualites"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textDecoration: "none",
        background: L.paper,
        border: `1px solid ${hovered ? n.accent + "55" : L.line}`,
        borderRadius: 22, overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "border-color .25s, transform .3s, box-shadow .3s",
        transform: hovered ? "translateY(-3px)" : visible ? "translateY(0)" : "translateY(24px)",
        opacity: visible ? 1 : 0,
        boxShadow: hovered ? `0 12px 40px oklch(0% 0 0 / .06)` : "none",
        transitionDelay: `${delay}s`,
        cursor: "pointer",
      }}
    >
      <div style={{ height: 110, background: n.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${n.accent}18 0%, transparent 70%)`, pointerEvents: "none" }} />
        <span style={{ fontSize: 36, position: "relative" }}>{n.tag === "Vie de l'école" ? "🎓" : "💻"}</span>
      </div>
      <div style={{ padding: 22, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: n.accent, letterSpacing: ".12em", textTransform: "uppercase" as const, background: n.accent + "15", padding: "3px 10px", borderRadius: 999 }}>{n.tag}</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: L.muted, fontWeight: 600 }}>{n.date}</span>
        </div>
        <h3 style={{ fontFamily: serif, fontSize: 20, color: L.ink, margin: "0 0 8px", letterSpacing: "-.01em", fontWeight: 500, lineHeight: 1.2 }}>{n.t}</h3>
        <div style={{ marginTop: "auto", paddingTop: 16, fontFamily: sans, fontSize: 12, fontWeight: 700, color: n.accent, opacity: hovered ? 1 : 0.6, transition: "opacity .2s" }}>Lire l'article →</div>
      </div>
    </Link>
  );
}

export function News() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section style={{ background: L.cream, padding: "120px 40px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: L.primary, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 16 }}>§ Actualités</div>
            <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(44px, 4.5vw, 60px)", lineHeight: .98, color: L.ink, margin: 0, letterSpacing: "-.02em" }}>
              Dernières<br /><em style={{ fontStyle: "italic", color: L.primary }}>nouvelles.</em>
            </h2>
          </div>
          <Link to="/actualites" style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: L.ink, textDecoration: "none", borderBottom: `2px solid ${L.primary}`, paddingBottom: 2 }}>
            Toutes les actualités →
          </Link>
        </div>

        {/* Magazine grid: featured (left, tall) + 2 smaller (right column) */}
        <div ref={ref} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
          {NEWS.map((n, i) => (
            <NewsCard key={i} n={n} visible={visible} delay={i * 0.1} />
          ))}
        </div>

      </div>
    </section>
  );
}
