import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileDown, ChevronDown } from "lucide-react";

/** Choix de la période d'un export, puis du format.
 *
 *  Un journal se tient au jour le jour : l'export part donc sur « Aujourd'hui »,
 *  et le reste (hier, le mois, tout l'historique, une période libre) est à un
 *  clic. Le même sélecteur sert au journal de caisse, au journal des comptes et
 *  au registre des règlements — la période s'y demande de la même façon. */

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';

export type ExportPeriod = { from: string; to: string; label: string; suffix: string };

/** ISO local (yyyy-mm-dd) — `toISOString()` bascule d'un jour selon le fuseau. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}
function monthStart(): string {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}
function fr(s: string): string {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "…";
}

type PresetKey = "today" | "yesterday" | "month" | "all" | "custom";
const PRESETS: { key: PresetKey; label: string; range: () => [string, string] }[] = [
  { key: "today", label: "Aujourd'hui", range: () => [shift(0), shift(0)] },
  { key: "yesterday", label: "Hier", range: () => [shift(-1), shift(-1)] },
  { key: "month", label: "Ce mois-ci", range: () => [monthStart(), shift(0)] },
  { key: "all", label: "Tout l'historique", range: () => ["", ""] },
];

/** Libellé + suffixe de nom de fichier d'une période (mêmes règles qu'au backend). */
export function describePeriod(from: string, to: string): { label: string; suffix: string } {
  if (from && from === to) return { label: `Journée du ${fr(from)}`, suffix: from };
  if (from || to) return { label: `Du ${fr(from)} au ${fr(to)}`, suffix: `${from || "debut"}_${to || "fin"}` };
  return { label: "Tout l'historique", suffix: "complet" };
}

export function ExportMenu({ formats, onExport, label = "Exporter" }: {
  formats: { key: string; label: string }[];
  onExport: (format: string, period: ExportPeriod) => void | Promise<void>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("today");
  const [from, setFrom] = useState(shift(0));
  const [to, setTo] = useState(shift(0));
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  // Fermeture au clic à côté ou à Échap : le panneau ne doit pas rester ouvert
  // devant le tableau qu'on vient d'exporter.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const applyPreset = (p: typeof PRESETS[number]) => {
    const [f, t] = p.range();
    setPreset(p.key); setFrom(f); setTo(t);
  };

  const run = async (format: string) => {
    const { label: periodLabel, suffix } = describePeriod(from, to);
    setBusy(format);
    try {
      await onExport(format, { from, to, label: periodLabel, suffix });
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const current = describePeriod(from, to);

  return (
    <div ref={box} style={{ position: "relative", fontFamily: sans }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="btn-c btn-c-ghost btn-c-sm">
        <FileDown size={14} />{label}
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>

      {open && (
        <div className="dash-card anim-pop" style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 60,
          width: 320, padding: 16, boxShadow: "0 18px 44px rgba(0,0,0,.14)", background: PAL.paper,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: PAL.muted }}>
            <CalendarDays size={13} />Période
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 12px" }}>
            {PRESETS.map(p => (
              <button key={p.key} type="button" onClick={() => applyPreset(p)}
                className={`chip-c ${preset === p.key ? "chip-c-blue" : ""}`}
                style={{ cursor: "pointer", border: preset === p.key ? undefined : `1px solid ${PAL.line}`, background: preset === p.key ? undefined : "transparent" }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 11, color: PAL.muted }}>
              Du
              <input type="date" value={from} max={to || undefined}
                onChange={e => { setFrom(e.target.value); setPreset("custom"); }}
                className="u-input" style={dateField} />
            </label>
            <label style={{ fontSize: 11, color: PAL.muted }}>
              Au
              <input type="date" value={to} min={from || undefined}
                onChange={e => { setTo(e.target.value); setPreset("custom"); }}
                className="u-input" style={dateField} />
            </label>
          </div>

          <p style={{ fontSize: 12, color: PAL.ink, margin: "10px 0 12px" }}>{current.label}</p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {formats.map(f => (
              <button key={f.key} type="button" onClick={() => void run(f.key)} disabled={busy !== null}
                className="btn-c btn-c-primary btn-c-sm" style={{ flex: "1 1 0" }}>
                {busy === f.key ? "…" : f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const dateField: React.CSSProperties = {
  marginTop: 4, width: "100%", padding: "7px 9px", border: `1px solid ${PAL.line}`,
  borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper,
  outline: "none", boxSizing: "border-box",
};
