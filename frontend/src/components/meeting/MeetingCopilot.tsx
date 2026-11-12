import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  X, Send, Mic, Square, MessageSquareText, Volume2, VolumeX, Sparkles, ListChecks, Gavel, FileText, Captions, Power,
} from "lucide-react";
import { streamCopilot, transcribeAudio, synthesizeSpeech, SPEECH_LANG, type CopilotLang } from "@/lib/copilotClient";
import { browserVoice } from "@/lib/realtimeVoice";
import { describeMediaError, mediaAvailable } from "@/lib/media";

/** Sous-ensemble de l'API Jitsi (External API) utilisé par le Copilote. */
export type MeetingApi = {
  executeCommand: (cmd: string, ...args: unknown[]) => void;
  addListener: (ev: string, fn: (...a: any[]) => void) => void;
  removeListener?: (ev: string, fn: (...a: any[]) => void) => void;
};

type Line = { id: string; name: string; text: string; at: number };
type Item = { id: number; q: string; asker: string; via: "panneau" | "chat" | "voix" | "action"; answer: string; status: "pending" | "streaming" | "done" | "error"; agent?: string };

const BOT_TAG = "🤖 Copilote IPISB";
const JOIN_MARK = "a rejoint la réunion";
// « Copilote, … » à l'oral ou « @copilote … » dans le chat.
const WAKE = /^\s*@?(?:copilote|copilot|co-pilote|كوبيلوت|كوبايلوت)\s*[,:!?،.\-—]*\s*(.{3,})$/i;
const LANGS: { code: CopilotLang; flag: string; label: string }[] = [
  { code: "darija", flag: "🇲🇦", label: "Darija" }, { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" }, { code: "ar", flag: "🇸🇦", label: "العربية" },
];
const QUICK: { key: string; label: string; icon: typeof FileText; prompt: string }[] = [
  { key: "resume", label: "Résumer", icon: FileText, prompt: "Fais un résumé clair de la réunion jusqu'ici." },
  { key: "decisions", label: "Décisions", icon: Gavel, prompt: "Liste les décisions prises pendant la réunion." },
  { key: "taches", label: "Tâches", icon: ListChecks, prompt: "Liste les tâches à faire décidées dans la réunion : qui, quoi, pour quand." },
];
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"])
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function MeetingCopilot({ api, roomLabel, myName, onClose, onActiveChange }: {
  api: MeetingApi | null; roomLabel: string; myName: string; onClose: () => void; onActiveChange?: (a: boolean) => void;
}) {
  const [lang, setLang] = useState<CopilotLang>(() => { try { return (localStorage.getItem("copilot-lang") as CopilotLang) || "fr"; } catch { return "fr"; } });
  const [active, setActive] = useState(false);
  const [toChat, setToChat] = useState(true);
  const [aloud, setAloud] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState<Record<string, Line>>({});
  const [tSource, setTSource] = useState<"jitsi" | "local" | "aucune">("aucune");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otherBot, setOtherBot] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const participants = useRef<Map<string, string>>(new Map());
  const queue = useRef<Item[]>([]);
  const running = useRef(false);
  const convId = useRef<string | null>(null);
  const counter = useRef(0);
  const player = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const localSR = useRef<any>(null);
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;
  const activeRef = useRef(false);
  activeRef.current = active;
  const otherBotRef = useRef<string | null>(null);
  otherBotRef.current = otherBot;
  const settings = useRef({ toChat, aloud, lang });
  settings.current = { toChat, aloud, lang };
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [items]);
  useEffect(() => { try { localStorage.setItem("copilot-lang", lang); } catch { /* ignore */ } }, [lang]);

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(n => n === m ? null : n), 5000); };

  // ── Transcription de la réunion ──
  const transcriptTail = () => {
    const text = linesRef.current.map(l => `${l.name} : ${l.text}`).join("\n");
    return text.length > 15000 ? text.slice(-15000) : text;
  };

  // ── Lecture à voix haute (locale) ──
  const speak = useCallback(async (text: string) => {
    const clean = text.replace(/[*#`>|_]/g, "").slice(0, 1500);
    try {
      const blob = await synthesizeSpeech(clean, settings.current.lang);
      const a = player.current ?? new Audio();
      player.current = a;
      const url = URL.createObjectURL(blob);
      a.src = url;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
      return;
    } catch { /* voix serveur indisponible → navigateur */ }
    const voice = await browserVoice(SPEECH_LANG[settings.current.lang]);
    if (!voice || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.voice = voice; u.lang = voice.lang;
    window.speechSynthesis.speak(u);
  }, []);

  // ── File de questions (une à la fois) ──
  const pump = useCallback(async () => {
    if (running.current) return;
    const it = queue.current.shift();
    if (!it) return;
    running.current = true;
    setBusy(true);
    const patch = (p: Partial<Item>) => setItems(prev => prev.map(x => x.id === it.id ? { ...x, ...p } : x));
    patch({ status: "streaming" });
    let answer = "";
    try {
      answer = await streamCopilot({
        message: it.q,
        conversation_id: convId.current,
        language: settings.current.lang,
        meeting: {
          room: roomLabel,
          participants: [myName, ...participants.current.values()].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 60),
          transcript: transcriptTail(),
          asker: it.asker,
        },
      }, ev => {
        if (ev.conversation?.id) convId.current = ev.conversation.id;
        if (ev.agent?.label) patch({ agent: ev.agent.label });
        if (ev.reset) answer = "";
        if (typeof ev.text === "string") { answer += ev.text; patch({ answer }); }
      });
      patch({ status: "done", answer });
      // Publication dans le chat de la réunion : lisible par tous les participants.
      if (answer && settings.current.toChat && api) {
        const who = it.asker && it.asker !== myName ? `@${it.asker} ` : "";
        api.executeCommand("sendChatMessage", `${BOT_TAG} — ${who}${answer.replace(/\*\*/g, "")}`.slice(0, 2000), "", true);
      }
      if (answer && settings.current.aloud) void speak(answer);
    } catch (e) {
      patch({ status: "error", answer: e instanceof Error ? e.message : "Erreur" });
    } finally {
      running.current = false;
      setBusy(false);
      void pump();
    }
  }, [api, myName, roomLabel, speak]);

  const ask = useCallback((q: string, asker: string, via: Item["via"]) => {
    const text = q.trim();
    if (!text) return;
    const it: Item = { id: ++counter.current, q: text, asker, via, answer: "", status: "pending" };
    setItems(prev => [...prev, it]);
    queue.current.push(it);
    void pump();
  }, [pump]);

  // ── Écoute de la réunion (chat, sous-titres, participants) ──
  useEffect(() => {
    if (!api) return;
    const onJoin = (e: any) => { if (e?.id) participants.current.set(e.id, e.displayName || e.formattedDisplayName || "Participant"); };
    const onLeft = (e: any) => { if (e?.id) participants.current.delete(e.id); };
    const onName = (e: any) => { if (e?.id) participants.current.set(e.id, e.displayname || e.displayName || "Participant"); };
    const onChat = (e: any) => {
      const msg: string = e?.message ?? "";
      const nick: string = e?.nick || "Participant";
      if (msg.startsWith(BOT_TAG)) {
        // Un autre participant a déjà activé le Copilote : on lui laisse le chat.
        if (msg.includes(JOIN_MARK) && activeRef.current) setOtherBot(nick);
        return;
      }
      if (!activeRef.current || otherBotRef.current || e?.privateMessage) return;
      const m = msg.match(WAKE);
      if (m) ask(m[1], nick, "chat");
    };
    const onTranscript = (e: any) => {
      const d = e?.data ?? e;
      const id = d?.messageID ?? d?.messageId ?? String(Date.now());
      const name = d?.participant?.name || "Participant";
      const final = (d?.final ?? "").trim();
      const live = ((d?.stable ?? "") + (d?.unstable ?? "")).trim();
      setTSource("jitsi");
      if (final) {
        setPartial(p => { const n = { ...p }; delete n[id]; return n; });
        setLines(prev => [...prev.filter(l => l.id !== id), { id, name, text: final, at: Date.now() }].slice(-400));
        const m = final.match(WAKE);
        if (m && activeRef.current && !otherBotRef.current) ask(m[1], name, "voix");
      } else if (live) {
        setPartial(p => ({ ...p, [id]: { id, name, text: live, at: Date.now() } }));
      }
    };
    api.addListener("participantJoined", onJoin);
    api.addListener("participantLeft", onLeft);
    api.addListener("displayNameChange", onName);
    api.addListener("incomingMessage", onChat);
    api.addListener("transcriptionChunkReceived", onTranscript);
    return () => {
      api.removeListener?.("participantJoined", onJoin);
      api.removeListener?.("participantLeft", onLeft);
      api.removeListener?.("displayNameChange", onName);
      api.removeListener?.("incomingMessage", onChat);
      api.removeListener?.("transcriptionChunkReceived", onTranscript);
    };
  }, [api, ask]);

  // Repli : si les sous-titres Jitsi ne viennent pas, on transcrit au moins
  // la voix de la personne qui a activé le Copilote (reconnaissance du navigateur).
  const startLocalTranscript = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor || localSR.current) return;
    const sr = new Ctor();
    sr.lang = SPEECH_LANG[settings.current.lang];
    sr.continuous = true; sr.interimResults = true;
    sr.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const id = `local-${i}-${Math.floor(Date.now() / 60000)}`;
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          setPartial(p => { const n = { ...p }; delete n.local; return n; });
          setLines(prev => [...prev, { id, name: myName, text, at: Date.now() }].slice(-400));
          const m = text.match(WAKE);
          if (m && activeRef.current) ask(m[1], myName, "voix");
        } else {
          setPartial(p => ({ ...p, local: { id: "local", name: myName, text: r[0].transcript, at: Date.now() } }));
        }
      }
    };
    sr.onerror = (e: any) => { if (e?.error === "not-allowed" || e?.error === "network") { localSR.current = null; setTSource(s => s === "local" ? "aucune" : s); } };
    sr.onend = () => { if (localSR.current === sr && activeRef.current) { try { sr.start(); } catch { /* relancée */ } } };
    localSR.current = sr;
    try { sr.start(); setTSource(s => s === "jitsi" ? s : "local"); } catch { localSR.current = null; }
  }, [ask, myName]);

  function activate() {
    // Déblocage audio dans le clic (iOS / Safari).
    try { const a = player.current ?? new Audio(); a.src = SILENT_WAV; a.play().catch(() => {}); player.current = a; } catch { /* ignore */ }
    setActive(true);
    setOtherBot(null);
    if (api) {
      api.executeCommand("setSubtitles", true, true);
      api.executeCommand("sendChatMessage",
        `${BOT_TAG} ${JOIN_MARK} (activé par ${myName}). Posez vos questions en écrivant « @copilote … » dans le chat ou en disant « Copilote, … ».`, "", true);
    }
    // Pas de sous-titres Jitsi au bout de 15 s → transcription locale.
    window.setTimeout(() => { if (activeRef.current && linesRef.current.length === 0) startLocalTranscript(); }, 15000);
  }
  function deactivate() {
    setActive(false);
    const sr = localSR.current; localSR.current = null;
    try { sr?.abort(); } catch { /* ignore */ }
    if (api) api.executeCommand("sendChatMessage", `${BOT_TAG} a quitté la réunion.`, "", true);
  }
  useEffect(() => () => { const sr = localSR.current; localSR.current = null; try { sr?.abort(); } catch { /* ignore */ } }, []);

  // ── Question à la voix (bouton micro du panneau) ──
  async function toggleRecord() {
    if (recording) { recRef.current?.stop(); return; }
    const pre = mediaAvailable();
    if (!pre.ok) { flash(pre.reason); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        try {
          const text = await transcribeAudio(new Blob(chunks, { type: mr.mimeType || "audio/webm" }), settings.current.lang);
          if (text) ask(text, myName, "voix"); else flash("Je n'ai rien entendu — réessayez.");
        } catch { flash("Transcription indisponible — écrivez votre question."); }
      };
      recRef.current = { stop: () => { if (mr.state !== "inactive") mr.stop(); } };
      mr.start(250);
      setRecording(true);
    } catch (err) {
      flash(describeMediaError(err));
    }
  }

  const partials = Object.values(partial);

  return (
    <aside className="mc-panel" aria-label="Copilote de la réunion">
      <header className="mc-head">
        <span aria-hidden className={busy ? "pc-orb busy" : "pc-orb"} style={{ ["--orb" as string]: "30px" } as CSSProperties}>
          <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
        </span>
        <div className="mc-head-id">
          <b>Copilote de réunion</b>
          <small>{active ? (otherBot ? `Déjà actif chez ${otherBot}` : "Dans la réunion · écoute") : "Pas encore dans la réunion"}</small>
        </div>
        <select className="mc-lang" value={lang} onChange={e => setLang(e.target.value as CopilotLang)} aria-label="Langue">
          {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
        </select>
        <button type="button" className="cp-icon" aria-label="Fermer le panneau" onClick={onClose}><X size={16} /></button>
      </header>

      {!active ? (
        <div className="mc-intro">
          <p>Faites entrer le Copilote dans la réunion : il suit la conversation (sous-titres) et répond aux questions de <b>tous les participants</b>.</p>
          <ul>
            <li><MessageSquareText size={14} /> Dans le chat : <code>@copilote</code> suivi de la question</li>
            <li><Mic size={14} /> À l'oral : « <b>Copilote,</b> … »</li>
            <li><Sparkles size={14} /> Résumé, décisions, tâches à faire, données de la plateforme</li>
          </ul>
          <button type="button" className="btn-c btn-c-primary" onClick={activate} disabled={!api}>
            <Power size={15} />Faire entrer le Copilote
          </button>
          {!api && <small className="mc-muted">Disponible quand la salle est connectée.</small>}
        </div>
      ) : (
        <>
          <div className="mc-toolbar">
            {QUICK.map(q => (
              <button key={q.key} type="button" className="mc-chip" onClick={() => ask(q.prompt, myName, "action")}><q.icon size={13} />{q.label}</button>
            ))}
            <button type="button" className={showTranscript ? "mc-chip is-on" : "mc-chip"} onClick={() => setShowTranscript(v => !v)}><Captions size={13} />Transcription</button>
          </div>
          <div className="mc-status">
            <span className={`mc-dot is-${tSource}`} />
            {tSource === "jitsi" ? `Sous-titres de la réunion · ${lines.length} phrases` : tSource === "local" ? "Transcription locale (votre voix seulement)" : "En attente des sous-titres…"}
            {otherBot && <span className="mc-warn">Questions du chat laissées au Copilote de {otherBot}</span>}
          </div>

          {showTranscript && (
            <div className="mc-transcript">
              {lines.length === 0 && partials.length === 0 && <div className="mc-muted">Aucune phrase transcrite pour l'instant.</div>}
              {lines.slice(-60).map(l => <p key={l.id}><b>{l.name}</b> {l.text}</p>)}
              {partials.map(l => <p key={l.id} className="is-live"><b>{l.name}</b> {l.text}</p>)}
            </div>
          )}

          <div className="mc-list" ref={listRef}>
            {items.length === 0 && <div className="mc-empty">Posez une question ici, ou laissez les participants l'interroger depuis la réunion.</div>}
            {items.map(it => (
              <div key={it.id} className="mc-item">
                <div className="mc-q"><span className={`mc-via is-${it.via}`}>{it.via}</span><b>{it.asker}</b> {it.q}</div>
                <div className={`mc-a is-${it.status}`}>
                  {it.agent && <span className="mc-agent">{it.agent}</span>}
                  {it.answer || (it.status === "error" ? "Erreur" : <span className="cp-typing"><i /><i /><i /></span>)}
                </div>
              </div>
            ))}
          </div>

          <div className="mc-opts">
            <label><input type="checkbox" checked={toChat} onChange={e => setToChat(e.target.checked)} />Publier les réponses dans le chat</label>
            <button type="button" className={aloud ? "mc-opt is-on" : "mc-opt"} onClick={() => setAloud(v => !v)} aria-pressed={aloud}>
              {aloud ? <Volume2 size={13} /> : <VolumeX size={13} />}Voix
            </button>
            <button type="button" className="mc-opt" onClick={deactivate}><Power size={13} />Retirer</button>
          </div>
          <form className="mc-input" onSubmit={e => { e.preventDefault(); ask(input, myName, "panneau"); setInput(""); }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Demandez au Copilote…" aria-label="Question au Copilote" />
            {input.trim()
              ? <button type="submit" className="cp-send" aria-label="Envoyer"><Send size={14} /></button>
              : <button type="button" className={recording ? "cp-send is-rec" : "cp-send is-mic"} onClick={toggleRecord} aria-label={recording ? "Arrêter" : "Poser à la voix"}>
                  {recording ? <Square size={14} /> : <Mic size={15} />}
                </button>}
          </form>
        </>
      )}
      {notice && <div className="mc-notice">{notice}</div>}
    </aside>
  );
}
