import { useCallback, useEffect, useRef, useState } from "react";
import { X, MonitorUp, MonitorOff, RotateCcw, ExternalLink, MapPin, MousePointer2 } from "lucide-react";
import { sourceHref, type CopilotSource } from "@/lib/sources";

/**
 * Vue « Source » du Copilote de réunion : la vraie page de la plateforme,
 * ouverte dans la salle, avec une navigation guidée animée (menu → onglet →
 * données) pour montrer aux participants d'où vient l'information.
 * Une fois l'onglet du navigateur partagé dans la réunion, chaque nouvelle
 * source s'affiche ici et tout le monde la voit.
 */
type Step = { label: string; find: (doc: Document) => HTMLElement | null; click?: boolean };

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

async function waitFor(doc: () => Document | null, find: (d: Document) => HTMLElement | null, ms = 5000): Promise<HTMLElement | null> {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const d = doc();
    const el = d ? find(d) : null;
    if (visible(el)) return el;
    await wait(150);
  }
  return null;
}

const HL_CSS = `.ipisb-tour-hl{outline:3px solid #1f8a70!important;outline-offset:3px!important;border-radius:12px!important;transition:outline-color .3s;animation:ipisb-tour 1.2s ease-in-out infinite}
@keyframes ipisb-tour{0%,100%{outline-color:#1f8a70}50%{outline-color:#7fd1b5}}`;

export function SourceViewer({ source, sharing, onShare, onClose }: {
  source: CopilotSource; sharing: boolean; onShare: () => void; onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);   // zone du cadre : repère du curseur
  const [cursor, setCursor] = useState<{ x: number; y: number; label: string; click: number } | null>(null);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const runId = useRef(0);
  const href = sourceHref(source, { embed: "1" });

  const steps: Step[] = [
    {
      label: source.crumbs.slice(0, -1).length ? source.crumbs[source.crumbs.length - (source.tab ? 2 : 1)] : source.label,
      find: d => d.querySelector<HTMLElement>(`aside a[href="${source.path}"], aside a[href^="${source.path}?"]`),
    },
    ...(source.tab ? [{
      label: source.crumbs[source.crumbs.length - 1],
      find: (d: Document) => d.querySelector<HTMLElement>(`[data-tab="${source.tab}"]`),
      click: true,
    }] : []),
    {
      label: "Les données sont ici",
      find: d => d.querySelector<HTMLElement>(".pouls-pane, .compta-pane, .rh-pane, main .dash-card:not(.pouls-head)") ?? d.querySelector<HTMLElement>("main"),
    },
  ];

  const tour = useCallback(async () => {
    const id = ++runId.current;
    const frame = frameRef.current, box = boxRef.current;
    if (!frame || !box) return;
    const doc = () => { try { return frame.contentDocument; } catch { return null; } };
    const d0 = doc();
    if (d0 && !d0.getElementById("ipisb-tour-css")) {
      const st = d0.createElement("style"); st.id = "ipisb-tour-css"; st.textContent = HL_CSS; d0.head.appendChild(st);
    }
    setCursor({ x: box.clientWidth / 2, y: box.clientHeight / 2, label: "Le Copilote vous montre…", click: 0 });
    await wait(500);
    for (let i = 0; i < steps.length; i++) {
      if (id !== runId.current) return;
      setStep(i + 1);
      const el = await waitFor(doc, steps[i].find);
      if (id !== runId.current) return;
      if (!el) continue; // élément absent (ex. barre latérale repliée sur petit écran)
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      await wait(450);
      // Coordonnées dans l'iframe = coordonnées dans la zone du cadre.
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 90);
      const y = r.top + Math.min(r.height / 2, 60);
      setCursor(c => ({ x, y, label: steps[i].label, click: c?.click ?? 0 }));
      await wait(800);
      if (id !== runId.current) return;
      setCursor(c => c ? { ...c, click: c.click + 1 } : c);
      el.classList.add("ipisb-tour-hl");
      if (steps[i].click) el.click();
      await wait(1300);
      el.classList.remove("ipisb-tour-hl");
    }
    if (id === runId.current) setStep(steps.length + 1);
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoaded(false); setStep(0); setCursor(null); runId.current++; }, [href]);
  useEffect(() => () => { runId.current++; }, []);

  return (
    <div className="sv-root">
      <div className="sv-bar">
        <MapPin size={15} strokeWidth={2.2} className="sv-pin" />
        <div className="sv-crumbs">
          {source.crumbs.map((c, i) => (
            <span key={i} className={i < (step === 0 ? 0 : step === 1 && source.tab ? source.crumbs.length - 1 : source.crumbs.length) ? "is-done" : ""}>{c}</span>
          ))}
        </div>
        <button type="button" className="sv-btn" onClick={() => { void tour(); }} title="Rejouer la navigation"><RotateCcw size={14} /><span>Rejouer</span></button>
        <button type="button" className="sv-btn" onClick={() => window.open(sourceHref(source), "_blank", "noopener")} title="Ouvrir dans un nouvel onglet"><ExternalLink size={14} /></button>
        <button type="button" className={sharing ? "sv-btn is-live" : "sv-btn is-share"} onClick={onShare}>
          {sharing ? <><MonitorOff size={14} /><span>Arrêter le partage</span></> : <><MonitorUp size={14} /><span>Partager à l'écran</span></>}
        </button>
        <button type="button" className="sv-btn" onClick={onClose} aria-label="Fermer la source"><X size={15} /></button>
      </div>
      {!sharing && <div className="sv-hint">Pour que tous les participants voient la navigation : « Partager à l'écran » puis choisissez <b>« Cet onglet »</b>. Les sources suivantes s'afficheront ici automatiquement.</div>}
      <div className="sv-frame-wrap" ref={boxRef}>
        <iframe ref={frameRef} key={href} src={href} title={`Source : ${source.label}`}
          onLoad={() => { setLoaded(true); void tour(); }} />
        {!loaded && <div className="sv-loading">Ouverture de « {source.label} »…</div>}
        {cursor && (
          <div className="sv-cursor" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
            <MousePointer2 size={26} strokeWidth={1.6} className="sv-cursor-icon" />
            <span key={cursor.click} className={cursor.click ? "sv-ripple" : ""} />
            <span className="sv-bubble">{cursor.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
