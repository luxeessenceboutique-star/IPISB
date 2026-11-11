/**
 * IPISB Connect — shared dashboard primitives (design handoff, June 2026).
 * PageHead, SectionLabel, ProgressBar, DashAvatar, EmptyHint.
 * Visual spec: design_handoff_ipisb_dashboard README — serif page titles,
 * eyebrow labels, pale-track progress bars, initials avatars.
 */
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ArrowLeftRight, Check, GripVertical, RotateCcw } from "lucide-react";

/** En-tête de page — langage « Pouls » : carte sur papier ECG, sur-titre mono,
 * titre fort, sous-titre et actions, avec un tracé de pouls animé en pied.
 * `size="lg"` agrandit le titre (pages déjà migrées). */
export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
  size = "md",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <section className="dash-card paper-ecg pouls-head" style={{ marginBottom: lg ? 26 : 22 }}>
      <div className="pouls-head-row">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: "1 1 360px" }}>
          {eyebrow ? <span className="mono-eyebrow">{eyebrow}</span> : null}
          <h1 className="h-serif page-title" style={{ fontSize: lg ? "clamp(32px, 3.6vw, 44px)" : "clamp(28px, 3vw, 36px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-.03em" }}>
            {title}
          </h1>
          {sub ? (
            <p className="page-sub" style={{ color: "var(--pal-muted)", fontSize: lg ? 15 : 14, maxWidth: 640 }}>{sub}</p>
          ) : null}
        </div>
        {actions ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>
        ) : null}
      </div>
      <svg className="pouls-head-trace" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden>
        <path className="pulse-base" d="M0 24 H520 L534 24 L540 18 L546 24 L566 24 L572 30 L580 4 L588 36 L596 24 L616 24 L624 20 L632 24 H1200" />
        <path className="pulse-glow" pathLength={1000} d="M0 24 H520 L534 24 L540 18 L546 24 L566 24 L572 30 L580 4 L588 36 L596 24 L616 24 L624 20 L632 24 H1200" />
      </svg>
    </section>
  );
}

/** Ordre des onglets mémorisé dans ce navigateur (préférence personnelle).
 * Les onglets ajoutés plus tard (ou devenus visibles) se placent à la fin,
 * ceux qui n'existent plus sont ignorés. */
function readOrder(storageKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(`ipisb:tab-order:${storageKey}`);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch { return null; }
}
function writeOrder(storageKey: string, order: string[] | null) {
  try {
    if (order) localStorage.setItem(`ipisb:tab-order:${storageKey}`, JSON.stringify(order));
    else localStorage.removeItem(`ipisb:tab-order:${storageKey}`);
  } catch { /* stockage indisponible : l'ordre ne sera simplement pas mémorisé */ }
}
function applyOrder<T extends { key: string }>(items: T[], order: string[] | null): T[] {
  if (!order) return items;
  const byKey = new Map(items.map(i => [i.key, i]));
  const out: T[] = [];
  for (const k of order) { const it = byKey.get(k); if (it) { out.push(it); byKey.delete(k); } }
  return [...out, ...items.filter(i => byKey.has(i.key))];
}

/** Onglets segmentés « Pouls » — pastilles sur un rail clair, défilement
 * horizontal sur petit écran. Même rendu que les onglets de l'Aperçu.
 * Avec `storageKey`, un bouton « Réorganiser » permet de déplacer les onglets
 * par glisser-déposer (souris ou doigt) ou au clavier (← →), et l'ordre est
 * mémorisé pour cette page. */
export function SegTabs<K extends string>({
  items,
  value,
  onChange,
  label = "Onglets",
  storageKey,
}: {
  items: { key: K; label: ReactNode; icon?: ComponentType<{ size?: number; strokeWidth?: number }> }[];
  value: K;
  onChange: (key: K) => void;
  label?: string;
  storageKey?: string;
}) {
  const [order, setOrder] = useState<string[] | null>(() => (storageKey ? readOrder(storageKey) : null));
  const [editing, setEditing] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const ordered = applyOrder(items, order);

  useEffect(() => { if (storageKey) setOrder(readOrder(storageKey)); }, [storageKey]);

  function commit(next: string[] | null) {
    setOrder(next);
    if (storageKey) writeOrder(storageKey, next);
  }
  function move(key: string, to: number) {
    const keys = ordered.map(i => i.key as string).filter(k => k !== key);
    keys.splice(Math.max(0, Math.min(to, keys.length)), 0, key);
    setOrder(keys);
    return keys;
  }

  function onPointerDown(e: RPointerEvent<HTMLButtonElement>, key: string) {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragKey(key);
  }
  function onPointerMove(e: RPointerEvent<HTMLButtonElement>) {
    if (!dragKey || !railRef.current) return;
    const tabs = [...railRef.current.querySelectorAll<HTMLElement>("[data-tab]")].filter(el => el.dataset.tab !== dragKey);
    let to = tabs.length;
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) { to = i; break; }
    }
    if (ordered.findIndex(i => i.key === dragKey) !== to) move(dragKey, to);
    // Défilement automatique du rail près des bords (petits écrans).
    const rr = railRef.current.getBoundingClientRect();
    if (e.clientX < rr.left + 30) railRef.current.scrollLeft -= 12;
    else if (e.clientX > rr.right - 30) railRef.current.scrollLeft += 12;
  }
  function onPointerUp() {
    if (!dragKey) return;
    setDragKey(null);
    commit(ordered.map(i => i.key as string));
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: string, index: number) {
    if (!editing || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    commit(move(key, index + (e.key === "ArrowLeft" ? -1 : 1)));
    requestAnimationFrame(() => railRef.current?.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus());
  }

  return (
    <div ref={railRef} className={editing ? "seg-rail is-editing" : "seg-rail"} role="tablist" aria-label={label}>
      {ordered.map((t, i) => {
        const active = value === t.key;
        const Icon = t.icon;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={active} data-tab={t.key}
            className={["seg-tab", active && "on", dragKey === t.key && "is-dragging"].filter(Boolean).join(" ")}
            style={{ ["--i" as string]: i } as CSSProperties}
            title={editing ? "Glisser pour déplacer · ← → au clavier" : undefined}
            onClick={() => { if (!editing) onChange(t.key); }}
            onPointerDown={e => onPointerDown(e, t.key)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={e => onKeyDown(e, t.key, i)}>
            {editing ? <GripVertical size={14} strokeWidth={1.8} className="seg-grip" /> : Icon ? <Icon size={15} strokeWidth={1.8} /> : null}
            {t.label}
          </button>
        );
      })}
      {storageKey && items.length > 2 && (
        <span className="seg-tools">
          {editing && order && (
            <button type="button" className="seg-tool" title="Revenir à l'ordre par défaut" aria-label="Revenir à l'ordre par défaut"
              onClick={() => commit(null)}>
              <RotateCcw size={14} strokeWidth={1.9} />
            </button>
          )}
          <button type="button" className={editing ? "seg-tool is-on" : "seg-tool"} aria-pressed={editing}
            title={editing ? "Terminer" : "Réorganiser les onglets"} aria-label={editing ? "Terminer" : "Réorganiser les onglets"}
            onClick={() => setEditing(v => !v)}>
            {editing ? <><Check size={14} strokeWidth={2} /><span>Terminé</span></> : <ArrowLeftRight size={14} strokeWidth={1.9} />}
          </button>
        </span>
      )}
    </div>
  );
}

/** Deep-green eyebrow section label with optional trailing action. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}
    >
      <span className="mono-eyebrow section-label" style={{ color: "var(--pal-primary-deep)" }}>
        {children}
      </span>
      {action ?? null}
    </div>
  );
}

/** 5px progress bar — pale track, animated brand-green fill. */
export function ProgressBar({
  value,
  tone = "primary",
  height = 5,
}: {
  value: number;
  tone?: "primary" | "accent" | "good" | "warn";
  height?: number;
}) {
  const tones: Record<string, string> = {
    primary: "var(--pal-primary)",
    accent: "var(--pal-accent)",
    good: "var(--pal-good)",
    warn: "var(--pal-warn)",
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ height, borderRadius: 99, background: "var(--pal-pale)", overflow: "hidden", width: "100%" }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, value))}%`,
          borderRadius: 99,
          background: tones[tone],
          transition: "width .5s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </div>
  );
}

/** Initials avatar circle. */
export function DashAvatar({
  name,
  size = 34,
  tone = "mid",
  style,
}: {
  name: string;
  size?: number;
  tone?: "mid" | "primary" | "soft" | "accent" | "ink";
  style?: CSSProperties;
}) {
  const initials =
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const bgs: Record<string, string> = {
    mid: "var(--pal-mid)",
    primary: "var(--pal-primary)",
    soft: "var(--pal-soft)",
    accent: "var(--pal-accent)",
    ink: "var(--pal-ink2)",
  };
  const fg = tone === "soft" ? "var(--pal-primary-deep)" : "var(--pal-paper)";
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: bgs[tone] ?? bgs.mid,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.36,
        flexShrink: 0,
        letterSpacing: ".02em",
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

/** Full-page "coming soon" placeholder — PageHead + a centered EmptyHint,
    for sidebar entries that exist in the nav ahead of the feature itself. */
export function ComingSoonPage({
  eyebrow,
  title,
  sub,
  icon,
  note = "Cette section arrive bientôt.",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div>
      <PageHead eyebrow={eyebrow} title={title} sub={sub} />
      <div className="dash-card" style={{ padding: 0 }}>
        <EmptyHint icon={icon} text={note} />
      </div>
    </div>
  );
}

/** Centered muted empty-state hint (icon + message). */
export function EmptyHint({ icon, text }: { icon?: ReactNode; text: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "40px 20px",
        color: "var(--pal-muted)",
      }}
    >
      {icon ? <span style={{ opacity: 0.5, display: "flex" }}>{icon}</span> : null}
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  );
}
