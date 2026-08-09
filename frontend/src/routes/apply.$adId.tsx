import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { Logo } from "@/components/Logo";
import { parseAdContent, renderInline } from "@/lib/adContent";
import { CheckCircle2, ShieldX, Loader2, UploadCloud, Briefcase, GraduationCap, Clock, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/apply/$adId")({
  component: ApplyPage,
});

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  ink2:   "oklch(28% 0.04 175)",
  text:   "oklch(34% 0.03 180)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  mid:    "oklch(62% 0.085 170)",
  soft:   "oklch(82% 0.045 165)",
  pale:   "oklch(94% 0.025 165)",
  cream:  "oklch(97% 0.012 90)",
  paper:  "oklch(99% 0.005 160)",
  line:   "oklch(88% 0.015 170)",
  danger: "oklch(64% 0.18 25)",
  success:"oklch(55% 0.14 150)",
};
const serif = '"Cormorant Garamond", Georgia, serif';
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

const MAX_CV_SIZE = 8 * 1024 * 1024;
const ACCEPTED = ".pdf,.docx,.jpg,.jpeg,.png";

type PublicAd = {
  id: string; poste: string; description: string | null;
  competences: string | null; experience: string | null; contenu: string;
};

const fieldStyle = {
  marginTop: 6, width: "100%", padding: "12px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10,
  fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const,
};
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const };

function ApplyPage() {
  const { adId } = Route.useParams();
  const [ad, setAd] = useState<PublicAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", message: "" });
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const base = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

  useEffect(() => {
    fetch(`${base}/api/rh/recruitment/ads/${adId}/public`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(setAd)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [adId]);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Nom, email et téléphone sont requis.");
      return;
    }
    if (!file) {
      setError("Merci de joindre votre CV.");
      return;
    }
    if (file.size > MAX_CV_SIZE) {
      setError("Le CV dépasse la limite de 8 Mo.");
      return;
    }

    setBusy(true);
    const fd = new FormData();
    fd.append("full_name", form.full_name);
    fd.append("email", form.email);
    fd.append("phone", form.phone);
    if (form.message) fd.append("message", form.message);
    fd.append("cv", file);

    try {
      const res = await fetch(`${base}/api/rh/recruitment/ads/${adId}/apply`, { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let detail = text;
        try { detail = JSON.parse(text)?.detail ?? text; } catch { /* not json */ }
        throw new Error(detail || "Erreur lors de l'envoi.");
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout>
      {loading ? (
        <div style={{ background: PAL.cream, minHeight: "calc(100vh - 200px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 style={{ width: 32, height: 32, color: PAL.muted, animation: "spin 1s linear infinite" }} />
        </div>
      ) : notFound ? (
        <CenteredCard>
          <IconBadge tone="danger"><ShieldX style={{ width: 36, height: 36, color: PAL.danger }} strokeWidth={1.7} /></IconBadge>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 28, color: PAL.ink, margin: "0 0 6px" }}>Offre introuvable</h1>
          <p style={{ fontFamily: sans, fontSize: 14, color: PAL.text, margin: 0 }}>Cette offre n'existe pas ou n'est plus disponible.</p>
        </CenteredCard>
      ) : submitted ? (
        <CenteredCard>
          <IconBadge tone="success"><CheckCircle2 style={{ width: 36, height: 36, color: PAL.success }} strokeWidth={1.7} /></IconBadge>
          <h1 style={{ fontFamily: serif, fontWeight: 500, fontSize: 28, color: PAL.ink, margin: "0 0 6px" }}>Candidature envoyée !</h1>
          <p style={{ fontFamily: sans, fontSize: 14, color: PAL.text, margin: 0, lineHeight: 1.6 }}>
            Merci pour votre candidature au poste de <strong>{ad?.poste}</strong>. Notre équipe RH l'examinera et vous recontactera si votre profil correspond.
          </p>
        </CenteredCard>
      ) : ad ? (
        <div style={{ background: PAL.cream }}>
          {/* ── Hero band ─────────────────────────────────────────── */}
          <section style={{ position: "relative", background: `linear-gradient(160deg, ${PAL.ink}, ${PAL.ink2})`, overflow: "hidden", padding: "72px 20px 96px" }}>
            <div style={{ position: "absolute", right: -100, top: -60, opacity: .1, pointerEvents: "none", animation: "hero-float 7s ease-in-out infinite" }}>
              <Logo size={420} mono onDark />
            </div>
            <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
              <div className="anim-rise" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 11, color: PAL.soft, letterSpacing: ".16em", textTransform: "uppercase" as const, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: PAL.mid, display: "inline-block", animation: "glow-pulse 2s ease-in-out infinite" }} />
                IPISB recrute
              </div>
              <h1 className="anim-rise-1" style={{ fontFamily: serif, fontWeight: 500, fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.08, letterSpacing: "-.02em", color: PAL.paper, margin: "18px 0 22px" }}>
                {ad.poste}
              </h1>
              <div className="anim-rise-2" style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                {ad.experience && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: PAL.paper, background: "oklch(35% 0.05 175)", padding: "7px 14px", borderRadius: 999, border: "1px solid oklch(45% 0.06 175)" }}>
                    <Clock size={13} strokeWidth={1.8} />{ad.experience}
                  </span>
                )}
                {ad.competences && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: PAL.paper, background: "oklch(35% 0.05 175)", padding: "7px 14px", borderRadius: 999, border: "1px solid oklch(45% 0.06 175)" }}>
                    <GraduationCap size={13} strokeWidth={1.8} />{ad.competences}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ── Content + form, overlapping the hero ─────────────── */}
          <div style={{ maxWidth: 720, margin: "-56px auto 0", padding: "0 20px 80px", position: "relative" }}>
            <div className="card-pop" style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: "34px 32px", marginBottom: 20, boxShadow: "0 20px 50px -20px oklch(22% 0.025 175 / .18)" }}>
              {ad.description && (
                <p style={{ fontFamily: sans, fontSize: 14.5, color: PAL.text, margin: "0 0 16px", lineHeight: 1.65 }}>{ad.description}</p>
              )}
              <div style={{ borderTop: `1px solid ${PAL.line}`, paddingTop: 18 }}>
                <AdContentBody contenu={ad.contenu} />
              </div>
            </div>

            <div className="card-pop" style={{ animationDelay: ".08s", background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 20, padding: "34px 32px 30px", boxShadow: "0 20px 50px -20px oklch(22% 0.025 175 / .12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: PAL.pale, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Briefcase size={17} strokeWidth={1.8} style={{ color: PAL.primary }} />
                </div>
                <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: 23, color: PAL.ink, margin: 0 }}>Postuler à cette offre</h2>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom complet *</label>
                  <input type="text" className="u-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" className="u-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={fieldStyle} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>Téléphone *</label>
                <input type="tel" className="u-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={fieldStyle} />
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>Message (facultatif)</label>
                <textarea className="u-input" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} style={{ ...fieldStyle, resize: "vertical" as const }} />
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>CV *</label>
                <label
                  className="u-hover-lift"
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                  style={{
                    marginTop: 6, display: "flex", alignItems: "center", gap: 12, padding: "16px 18px",
                    border: `1.5px dashed ${dragOver ? PAL.primary : file ? PAL.mid : PAL.line}`, borderRadius: 12, cursor: "pointer",
                    background: dragOver ? PAL.pale : file ? "oklch(96% 0.02 165)" : PAL.cream,
                    transition: "background .18s ease, border-color .18s ease",
                  }}
                >
                  {file ? (
                    <FileCheck2 size={22} strokeWidth={1.7} style={{ color: PAL.success, flexShrink: 0 }} />
                  ) : (
                    <UploadCloud size={22} strokeWidth={1.6} style={{ color: PAL.muted, flexShrink: 0 }} />
                  )}
                  <span style={{ fontFamily: sans, fontSize: 13, color: file ? PAL.ink : PAL.muted, fontWeight: file ? 600 : 400 }}>
                    {file ? file.name : "Glissez votre CV ici, ou cliquez pour parcourir — PDF, DOCX, JPG ou PNG, 8 Mo max"}
                  </span>
                  <input type="file" accept={ACCEPTED} onChange={e => pickFile(e.target.files?.[0])} style={{ display: "none" }} />
                </label>
              </div>

              {error && (
                <div className="anim-fade" style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "oklch(95% 0.05 25)", color: PAL.danger, fontFamily: sans, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={busy}
                className="u-hover-lift"
                style={{
                  marginTop: 22, width: "100%", padding: "14px 0", border: 0, borderRadius: 999,
                  fontFamily: sans, fontSize: 14, fontWeight: 700, color: PAL.paper, letterSpacing: ".01em",
                  background: PAL.ink, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1,
                }}
              >
                {busy ? "Envoi en cours…" : "Envoyer ma candidature"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}

function AdContentBody({ contenu }: { contenu: string }) {
  return (
    <>
      {parseAdContent(contenu).map((block, i) => {
        if (block.type === "header") {
          return (
            <h3 key={i} style={{
              fontFamily: sans, fontSize: 14.5, fontWeight: 700, color: PAL.primary,
              margin: i === 0 ? "0 0 10px" : "24px 0 10px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: PAL.primary, flexShrink: 0 }} />
              {block.text}
            </h3>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={i} style={{ margin: "0 0 14px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {block.items.map((item, j) => (
                <li key={j} style={{ display: "flex", gap: 10, fontFamily: sans, fontSize: 13.5, color: PAL.text, lineHeight: 1.6 }}>
                  <span style={{ color: PAL.mid, flexShrink: 0 }}>—</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 12px", fontFamily: sans, fontSize: 13.5, color: PAL.text, lineHeight: 1.75 }}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: PAL.cream, minHeight: "calc(100vh - 200px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px" }}>
      <div className="card-pop" style={{ background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 24, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

function IconBadge({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  const bg = tone === "danger" ? "oklch(94% 0.05 25)" : "oklch(94% 0.06 150)";
  return (
    <div className="anim-pop" style={{ margin: "0 auto 16px", width: 72, height: 72, borderRadius: 999, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}
