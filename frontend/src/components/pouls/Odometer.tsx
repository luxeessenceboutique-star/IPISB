/**
 * Compteur à rouleaux : chaque chiffre défile de 0 jusqu'à sa valeur, puis
 * roule d'une valeur à l'autre quand le nombre change (transition CSS).
 * Le nombre réel est exposé aux lecteurs d'écran via aria-label.
 */
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Odometer({ value, label, delayIndex = 0 }: { value: number | string; label?: string; delayIndex?: number }) {
  const text = typeof value === "number" ? new Intl.NumberFormat("fr-FR").format(value) : value;
  return (
    <span className="odo" role="img" aria-label={label ?? text}>
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="odo-d" aria-hidden>
            <span className="odo-s" style={{ ["--d" as string]: Number(ch), ["--k" as string]: delayIndex + i }}>
              {DIGITS.map(n => <span key={n}>{n}</span>)}
            </span>
          </span>
        ) : (
          <span key={i} className="odo-c" aria-hidden>{ch === " " || ch === " " ? " " : ch}</span>
        ),
      )}
    </span>
  );
}
