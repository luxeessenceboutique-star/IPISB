import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useI18n } from "@/lib/i18n";
import { useBreakpoint } from "@/lib/useBreakpoint";

const PAL = {
  ink:    "oklch(22% 0.025 175)",
  muted:  "oklch(48% 0.02 180)",
  primary:"oklch(48% 0.085 175)",
  pale:   "oklch(94% 0.025 165)",
  paper:  "oklch(99% 0.005 160)",
  cream:  "oklch(97% 0.012 90)",
  line:   "oklch(88% 0.015 170)",
};
const sans = '"Manrope", system-ui, sans-serif';

const LINKS = [
  { key: "nav.home",       to: "/"           },
  { key: "nav.formations", to: "/formations" },
  { key: "nav.plateforme", to: "/plateforme" },
  { key: "nav.a-propos",   to: "/a-propos"   },
  { key: "nav.actualites", to: "/actualites" },
  { key: "nav.contact",    to: "/contact"    },
] as const;

const LANG_LABELS: Record<string, string> = { fr: "FR", en: "EN", ar: "ع" };

export function SiteNav() {
  const { lang, setLang, t } = useI18n();
  const { isTablet } = useBreakpoint();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [open, setOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);
  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  return (
    <>
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "oklch(99% 0.005 160 / .92)",
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${PAL.line}`,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto",
          padding: isTablet ? "12px 20px" : "14px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <Wordmark size={isTablet ? 28 : 32} dark={false} />
          </Link>

          {/* Desktop nav */}
          {!isTablet && (
            <nav style={{ display: "flex", gap: 24 }}>
              {LINKS.map((l) => {
                const isActive = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
                return (
                  <Link key={l.key} to={l.to} className="u-link-ink" style={{
                    fontFamily: sans, fontSize: 13, fontWeight: isActive ? 600 : 500,
                    color: isActive ? PAL.ink : PAL.muted,
                    textDecoration: "none",
                    borderBottom: isActive ? `1.5px solid ${PAL.primary}` : "1.5px solid transparent",
                    paddingBottom: 4, transition: "color .2s, border-color .2s",
                  }}>
                    {t(l.key)}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Desktop actions */}
          {!isTablet && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {(["fr", "en", "ar"] as const).map((l) => (
                  <button key={l} onClick={() => setLang(l)} style={{
                    color: lang === l ? PAL.ink : PAL.muted,
                    background: lang === l ? PAL.pale : "transparent",
                    border: 0, borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                    fontFamily: sans, fontSize: 11, fontWeight: 600, transition: "background .2s, color .2s",
                  }}>
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
              <Link to="/auth" search={{ mode: "login" }} className="u-link-ink" style={{
                fontFamily: sans, fontSize: 13, fontWeight: 500, color: PAL.muted,
                padding: "8px 14px", textDecoration: "none", transition: "color .2s",
              }}>{t("nav.login")}</Link>
              <Link to="/auth" search={{ mode: "signup" }} className="u-hover-lift" style={{
                background: PAL.ink, color: PAL.paper,
                fontFamily: sans, fontSize: 13, fontWeight: 600,
                padding: "10px 18px", borderRadius: 999, textDecoration: "none",
              }}>
                {t("nav.signup")} {lang === "ar" ? "←" : "→"}
              </Link>
            </div>
          )}

          {/* Hamburger (tablet/mobile) */}
          {isTablet && (
            <button
              onClick={() => setOpen(o => !o)}
              aria-label="Menu"
              style={{
                display: "flex", flexDirection: "column", justifyContent: "center",
                gap: 5, background: "none", border: 0, cursor: "pointer",
                padding: "8px 4px", borderRadius: 8,
              }}
            >
              {open ? (
                <span style={{ fontFamily: sans, fontSize: 22, color: PAL.ink, lineHeight: 1 }}>✕</span>
              ) : (
                [0, 1, 2].map(i => (
                  <span key={i} style={{ display: "block", width: 24, height: 2, background: PAL.ink, borderRadius: 2 }} />
                ))
              )}
            </button>
          )}
        </div>
      </header>

      {/* Mobile / tablet menu overlay */}
      {isTablet && open && (
        <div className="anim-fade" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: PAL.paper, zIndex: 39,
          display: "flex", flexDirection: "column",
          padding: "80px 28px 40px",
          overflowY: "auto",
        }}>
          {/* Nav links */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {LINKS.map((l, i) => {
              const isActive = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
              return (
                <Link key={l.key} to={l.to} className="anim-rise" style={{
                  animationDelay: `${0.04 + i * 0.05}s`,
                  fontFamily: sans, fontSize: 22, fontWeight: isActive ? 700 : 500,
                  color: isActive ? PAL.primary : PAL.ink,
                  textDecoration: "none", padding: "14px 0",
                  borderBottom: `1px solid ${PAL.line}`,
                }}>
                  {t(l.key)}
                </Link>
              );
            })}
          </nav>

          {/* Lang + auth */}
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["fr", "en", "ar"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} style={{
                  color: lang === l ? PAL.paper : PAL.ink,
                  background: lang === l ? PAL.ink : PAL.cream,
                  border: `1px solid ${PAL.line}`, borderRadius: 8,
                  padding: "8px 16px", cursor: "pointer",
                  fontFamily: sans, fontSize: 13, fontWeight: 700,
                }}>
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
            <Link to="/auth" search={{ mode: "login" }} style={{
              fontFamily: sans, fontSize: 15, fontWeight: 500, color: PAL.ink,
              padding: "14px 0", textDecoration: "none", borderBottom: `1px solid ${PAL.line}`,
            }}>
              {t("nav.login")}
            </Link>
            <Link to="/auth" search={{ mode: "signup" }} className="u-hover-lift" style={{
              background: PAL.ink, color: PAL.paper,
              fontFamily: sans, fontSize: 15, fontWeight: 600,
              padding: "16px", borderRadius: 999, textDecoration: "none",
              textAlign: "center" as const,
            }}>
              {t("nav.signup")} {lang === "ar" ? "←" : "→"}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
