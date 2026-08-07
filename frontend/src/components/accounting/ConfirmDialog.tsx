import { useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";

/**
 * Boîte de confirmation maison — remplace `window.confirm()`, qui affiche
 * « localhost:5178 indique… », ignore la charte et ne sait pas mettre un
 * montant en avant. Contrôlée : le parent garde ce qu'il s'apprête à faire
 * dans un état, et ne l'exécute que sur `onConfirm`.
 */

const sans = '"Manrope", system-ui, sans-serif';
const serif = '"Cormorant Garamond", Georgia, serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

type Tone = "danger" | "primary";

const TONES: Record<Tone, { ring: string; tint: string; Icon: typeof AlertTriangle; btn: string }> = {
  danger:  { ring: "oklch(58% 0.19 25)",  tint: "oklch(96% 0.04 25)",  Icon: Trash2,     btn: "btn-c btn-c-danger"  },
  primary: { ring: "var(--pal-primary)",  tint: "oklch(96% 0.03 180)", Icon: HelpCircle, btn: "btn-c btn-c-primary" },
};

export function ConfirmDialog({
  open, title, message, detail, highlight, tone = "danger",
  confirmLabel = "Confirmer", cancelLabel = "Annuler", busy = false,
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  /** Une phrase, la question posée. */
  message?: string;
  /** La conséquence — ce que `window.confirm` noyait dans un second paragraphe. */
  detail?: string;
  /** Montant ou référence à mettre en avant (police chiffres). */
  highlight?: string;
  tone?: Tone;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Échap annule, Entrée confirme : les réflexes de la boîte native sont gardés.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Enter" && !busy) { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onConfirm, onCancel]);

  if (!open) return null;
  const t = TONES[tone];
  const Icon = t.Icon;

  return (
    <div
      className="anim-fade"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)",
        backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, fontFamily: sans,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="anim-pop"
        style={{
          width: 420, maxWidth: "96vw", background: "var(--pal-paper, #fff)",
          borderRadius: 16, padding: "26px 26px 20px",
          boxShadow: "0 28px 70px rgba(0,0,0,.22)", border: "1px solid var(--pal-line)",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            aria-hidden
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: t.tint,
              display: "inline-flex", alignItems: "center", justifyContent: "center", color: t.ring,
            }}
          >
            <Icon size={19} strokeWidth={1.8} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: serif, fontSize: 23, fontWeight: 500, color: "var(--pal-ink)", margin: 0, lineHeight: 1.2 }}>
              {title}
            </h2>
            {message && (
              <p style={{ fontSize: 13.5, color: "var(--pal-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                {message}
              </p>
            )}
          </div>
        </div>

        {highlight && (
          <div
            style={{
              margin: "16px 0 0", padding: "10px 14px", borderRadius: 10,
              border: "1px solid var(--pal-line)", background: "var(--pal-bg, oklch(98% 0.005 170))",
              fontFamily: mono, fontSize: 15, fontWeight: 700, color: "var(--pal-ink)", textAlign: "center",
            }}
          >
            {highlight}
          </div>
        )}

        {detail && (
          <p
            style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              margin: "14px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--pal-muted)",
            }}
          >
            <AlertTriangle size={14} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2, color: t.ring }} />
            <span>{detail}</span>
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" className="btn-c btn-c-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className={t.btn} onClick={onConfirm} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
