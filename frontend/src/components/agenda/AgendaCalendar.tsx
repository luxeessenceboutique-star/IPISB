import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X, Inbox, UserCog, Wallet, ListChecks, Users } from "lucide-react";

const sans = '"Plus Jakarta Sans", system-ui, sans-serif';
const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };

export type CalEvent = {
  id: string; kind: "task" | "leave" | "contract" | "probation" | "approval"; title: string;
  start: string; end: string; status?: string; priority?: string; domain?: string | null;
  people?: string[]; link: string;
};

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const STATUS_LABEL: Record<string, string> = {
  todo: "À faire", in_progress: "En cours", in_review: "En revue", done: "Terminée", blocked: "Bloquée", cancelled: "Annulée",
  pending: "En attente", approved: "Approuvé",
};
const PRIORITY_LABEL: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Haute", urgent: "Urgente" };

// ── dates (toujours en local, jamais via toISOString : évite le décalage UTC) ──
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

type Group = "rh" | "comptabilite" | "tasks";
const GROUP_OF: Record<CalEvent["kind"], Group> = { task: "tasks", leave: "rh", contract: "rh", probation: "rh", approval: "comptabilite" };
const KIND_LABEL: Record<CalEvent["kind"], string> = { task: "Tâche", leave: "Congé", contract: "Contrat", probation: "Période d'essai", approval: "Approbation" };
const GROUPS: { key: Group; label: string; icon: typeof UserCog; chip: string }[] = [
  { key: "rh", label: "RH", icon: UserCog, chip: "chip-c-blue" },
  { key: "comptabilite", label: "Comptabilité", icon: Wallet, chip: "chip-c-green" },
  { key: "tasks", label: "Tâches", icon: ListChecks, chip: "chip-c-amber" },
];

function colorOf(ev: CalEvent): { bg: string; fg: string; dot: string } {
  if (ev.kind === "approval") return { bg: "oklch(94% 0.04 195)", fg: "oklch(38% 0.08 195)", dot: "oklch(58% 0.12 195)" };
  if (ev.kind === "leave") return { bg: "oklch(94% 0.04 250)", fg: "oklch(38% 0.1 250)", dot: "oklch(60% 0.15 250)" };
  if (ev.kind === "contract") return { bg: "oklch(94% 0.04 310)", fg: "oklch(38% 0.1 310)", dot: "oklch(58% 0.15 310)" };
  if (ev.kind === "probation") return { bg: "oklch(94% 0.05 50)", fg: "oklch(42% 0.1 50)", dot: "oklch(65% 0.16 50)" };
  if (ev.status === "done" || ev.status === "cancelled") return { bg: "oklch(95% 0.005 170)", fg: "oklch(55% 0.01 180)", dot: "oklch(75% 0.01 180)" };
  if (ev.priority === "urgent") return { bg: "oklch(94% 0.05 25)", fg: "oklch(42% 0.14 25)", dot: "oklch(60% 0.2 25)" };
  if (ev.priority === "high") return { bg: "oklch(95% 0.05 80)", fg: "oklch(45% 0.1 70)", dot: "oklch(72% 0.15 80)" };
  if (ev.priority === "low") return { bg: "oklch(95% 0.01 200)", fg: "oklch(42% 0.03 200)", dot: "oklch(70% 0.04 200)" };
  return { bg: "var(--pal-pale)", fg: "var(--pal-primary-deep)", dot: "var(--pal-primary)" };
}

function Pill({ ev, onOpen, compact }: { ev: CalEvent; onOpen: (e: CalEvent) => void; compact?: boolean }) {
  const c = colorOf(ev);
  const finished = ev.status === "done" || ev.status === "cancelled";
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen(ev); }}
      title={ev.title}
      className={["ag-pill", compact && "is-compact", finished && "is-done"].filter(Boolean).join(" ")}
      style={{ ["--bg" as string]: c.bg, ["--fg" as string]: c.fg, ["--dot" as string]: c.dot } as CSSProperties}
    >
      <i />
      <span>{ev.title}</span>
    </button>
  );
}

function EventDetail({ ev, onOpen }: { ev: CalEvent; onOpen: (e: CalEvent) => void }) {
  const c = colorOf(ev);
  return (
    <div onClick={() => onOpen(ev)} className="ag-detail" style={{ borderLeft: `4px solid ${c.dot}`, background: c.bg }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.fg, textDecoration: ev.status === "done" ? "line-through" : "none" }}>{ev.title}</div>
      <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 3 }}>
        {KIND_LABEL[ev.kind]}
        {ev.status && ` · ${STATUS_LABEL[ev.status] ?? ev.status}`}
        {ev.priority && ev.kind === "task" && ` · Priorité ${PRIORITY_LABEL[ev.priority] ?? ev.priority}`}
        {ev.start !== ev.end && ` · ${parse(ev.start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${parse(ev.end).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
      </div>
      {ev.people && ev.people.length > 0 && <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><Users size={11} strokeWidth={1.9} />{ev.people.join(", ")}</div>}
    </div>
  );
}

export function AgendaCalendar({ onOpen }: { onOpen: (ev: CalEvent) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [undated, setUndated] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<Group>>(new Set());
  const [selected, setSelected] = useState<string | null>(iso(new Date()));
  const todayIso = iso(new Date());

  const range = useMemo(() => {
    if (view === "week") { const s = mondayOf(cursor); return { start: s, end: addDays(s, 6) }; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = mondayOf(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { start: s, end: addDays(mondayOf(last), 6) };
  }, [cursor, view]);

  const startIso = iso(range.start), endIso = iso(range.end);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/api/agenda-gestion/calendar?start=${startIso}&end=${endIso}`)
      .then((r: { events: CalEvent[]; undated_tasks: CalEvent[] }) => { if (active) { setEvents(r?.events ?? []); setUndated(r?.undated_tasks ?? []); } })
      .catch((e: any) => { if (active) toast.error(e?.message ?? "Erreur lors du chargement du calendrier."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [startIso, endIso]);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range]);

  const counts = useMemo(() => {
    const c: Record<Group, number> = { rh: 0, comptabilite: 0, tasks: 0 };
    for (const ev of events) c[GROUP_OF[ev.kind]]++;
    return c;
  }, [events]);

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      if (hidden.has(GROUP_OF[ev.kind])) continue;
      // un événement multi-jours (congé) apparaît sur chacun de ses jours
      for (let d = parse(ev.start); d <= parse(ev.end); d = addDays(d, 1)) (m[iso(d)] ??= []).push(ev);
    }
    return m;
  }, [events, hidden]);

  function toggleGroup(g: Group) {
    setHidden(h => { const n = new Set(h); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  }

  function shift(dir: number) {
    setCursor(c => view === "week" ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1));
  }
  const title = view === "week"
    ? `${range.start.getDate()} ${MONTHS[range.start.getMonth()]} – ${range.end.getDate()} ${MONTHS[range.end.getMonth()]} ${range.end.getFullYear()}`
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const selEvents = selected ? byDay[selected] ?? [] : [];
  const btn = { fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.ink, background: PAL.paper, border: `1px solid ${PAL.line}`, borderRadius: 8, cursor: "pointer" } as const;

  return (
    <div style={{ fontFamily: sans }}>
      {/* Barre d'outils */}
      <div className="ag-toolbar">
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="mono-eyebrow">{view === "week" ? "Vue semaine" : "Vue mois"} · RH, Compta, Tâches</div>
          <div className="lv-month">{title}</div>
        </div>
        <div className="lv-nav">
          <button type="button" aria-label="Précédent" className="btn-c btn-c-sm btn-c-ghost" onClick={() => shift(-1)}><ChevronLeft size={14} strokeWidth={1.8} /></button>
          <button type="button" className="btn-c btn-c-sm btn-c-soft" onClick={() => { setCursor(new Date()); setSelected(todayIso); }}>Aujourd'hui</button>
          <button type="button" aria-label="Suivant" className="btn-c btn-c-sm btn-c-ghost" onClick={() => shift(1)}><ChevronRight size={14} strokeWidth={1.8} /></button>
        </div>
        <div className="seg-rail seg-rail-sm" role="tablist" aria-label="Vue">
          {(["month", "week"] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "seg-tab on" : "seg-tab"} onClick={() => setView(v)}>
              {v === "month" ? "Mois" : "Semaine"}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres : clic = masquer / afficher la catégorie (compteur = échéances de la période affichée) */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {GROUPS.map(g => {
          const off = hidden.has(g.key);
          const Icon = g.icon;
          return (
            <button
              key={g.key} type="button" onClick={() => toggleGroup(g.key)} aria-pressed={!off}
              className={`chip-c ag-filter ${off ? "is-off" : g.chip}`}
            >
              <Icon size={12} strokeWidth={1.8} />{g.label} · {counts[g.key]} échéance{counts[g.key] !== 1 ? "s" : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="dash-card ag-cal" style={{ opacity: loading ? .6 : 1 }}>
          <div className="lv-grid" key={`${startIso}-${view}`}>
            {DAYS_SHORT.map(d => <div key={d} className="lv-wd">{d}</div>)}
            {days.map((d, i) => {
              const k = iso(d);
              const evs = byDay[k] ?? [];
              const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const max = view === "week" ? 12 : 3;
              const cls = ["lv-day", "ag-day", k === todayIso && "is-today", k === selected && "is-sel", !inMonth && "is-dim", isWeekend && "is-weekend", view === "week" && "is-tall"].filter(Boolean).join(" ");
              return (
                <div key={k} className={cls} style={{ ["--i" as string]: i } as CSSProperties}
                  role="button" tabIndex={0} aria-pressed={k === selected}
                  onClick={() => setSelected(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(k); } }}>
                  <div className="lv-num">
                    <span>{d.getDate()}</span>
                    {evs.length > 0 && <i className="ag-count">{evs.length}</i>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    {evs.slice(0, max).map(ev => <Pill key={ev.id} ev={ev} onOpen={onOpen} compact={view === "month"} />)}
                    {evs.length > max && <span className="lv-more">+{evs.length - max} autre{evs.length - max > 1 ? "s" : ""}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panneau latéral : jour sélectionné + tâches sans échéance */}
        <div style={{ flex: "1 1 260px", maxWidth: 360, minWidth: 240, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="dash-card ag-side" style={{ padding: 16 }} key={selected ?? "none"}>
            <div className="mono-eyebrow" style={{ marginBottom: 4 }}>Jour sélectionné · {selEvents.length} échéance{selEvents.length !== 1 ? "s" : ""}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", color: PAL.ink, textTransform: "capitalize" }}>
                {selected ? parse(selected).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "Aucun jour"}
              </div>
              {selected && <button type="button" onClick={() => setSelected(null)} aria-label="Fermer" style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, display: "flex" }}><X size={15} /></button>}
            </div>
            {selEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: PAL.muted }}>Rien de prévu ce jour-là.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selEvents.map(ev => <EventDetail key={ev.id} ev={ev} onOpen={onOpen} />)}
              </div>
            )}
          </div>

          <div className="dash-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: PAL.ink, marginBottom: 10 }}>
              <Inbox size={14} strokeWidth={1.8} /> Sans échéance ({undated.length})
            </div>
            {undated.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: PAL.muted }}>Toutes les tâches ouvertes ont une échéance.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto", paddingRight: 2 }}>
                {undated.map(ev => <Pill key={ev.id} ev={ev} onOpen={onOpen} />)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: PAL.muted }}>
            {[["Tâche", "var(--pal-primary)"], ["Urgente", "oklch(60% 0.2 25)"], ["Congé", "oklch(60% 0.15 250)"], ["Contrat", "oklch(58% 0.15 310)"], ["Essai", "oklch(65% 0.16 50)"], ["Compta", "oklch(58% 0.12 195)"]].map(([l, c]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
