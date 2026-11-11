import { Link } from "@tanstack/react-router";

/**
 * « Le pouls de la semaine » : un tracé ECG du lundi au dimanche. Chaque jour
 * bat plus ou moins fort selon le nombre d'événements de l'agenda de gestion ;
 * les jours passés sont tracés en couleur pleine, un signal lumineux parcourt
 * la ligne en continu et un repère « Aujourd'hui » marque la position actuelle.
 */
export type PulseDay = { label: string; count: number; title?: string; past: boolean; today: boolean };

const W = 1200;
const BASE = 74;

function beat(x: number, amp: number) {
  return ` L${x - 46} ${BASE} Q${x - 38} ${BASE - 8} ${x - 30} ${BASE} L${x - 12} ${BASE} L${x - 7} ${BASE + 6}`
    + ` L${x} ${BASE - amp} L${x + 7} ${Math.round(BASE + amp * 0.38)} L${x + 12} ${BASE}`
    + ` L${x + 34} ${BASE} Q${x + 46} ${BASE - (amp > 40 ? 12 : 7)} ${x + 58} ${BASE}`;
}

export function PulseWeek({ days }: { days: PulseDay[] }) {
  const step = W / days.length;
  const xs = days.map((_, i) => Math.round(step * i + step / 2));
  const amp = (n: number) => (n <= 0 ? 16 : Math.min(62, 26 + n * 9));
  let full = `M0 ${BASE}`;
  let past = `M0 ${BASE}`;
  const todayIdx = days.findIndex(d => d.today);
  days.forEach((d, i) => {
    const b = beat(xs[i], amp(d.count));
    full += b;
    if (d.past || d.today) past += b;
  });
  full += ` L${W} ${BASE}`;
  const nowX = todayIdx >= 0 ? xs[todayIdx] + 66 : 0;
  past += ` L${nowX} ${BASE}`;

  return (
    <div className="pulse-wrap" aria-label="Activité de la semaine">
      <svg viewBox={`0 0 ${W} 120`} preserveAspectRatio="none" aria-hidden>
        <path className="pulse-base" d={full} />
        <path className="pulse-past" pathLength={1} d={past} />
        <path className="pulse-glow" pathLength={1000} d={full} />
      </svg>
      {todayIdx >= 0 && (
        <div className="pulse-now" style={{ left: `${(nowX / W) * 100}%` }}><span>Aujourd'hui</span></div>
      )}
      {days.map((d, i) => d.count > 0 && (
        <Link key={i} to="/dashboard/agenda-gestion" className={"pulse-pin" + (d.past ? " past" : "")}
          style={{ left: `${(xs[i] / W) * 100}%`, ["--i" as string]: i }}
          aria-label={`${d.label} : ${d.count} événement(s)`}>
          <span className="lbl"><small>{d.label}</small>{d.title ?? `${d.count} événement${d.count > 1 ? "s" : ""}`}</span>
          <span className="stem" />
          <span className="dt" />
        </Link>
      ))}
      <div className="pulse-axis">{days.map((d, i) => <span key={i}>{d.label.split(" ")[0]}</span>)}</div>
    </div>
  );
}
