/**
 * Moteur d'appel vocal temps réel du Copilote.
 *
 * - Micro ouvert pendant tout l'appel (annulation d'écho), détection d'activité
 *   vocale (VAD) calibrée sur le bruit ambiant.
 * - Reconnaissance en direct : SpeechRecognition du navigateur quand elle
 *   existe (texte qui s'affiche pendant qu'on parle), sinon enregistrement +
 *   transcription serveur à chaque fin de phrase.
 * - Interruption (« barge-in ») : si l'utilisateur parle pendant que le
 *   Copilote répond, la voix s'arrête aussitôt et sa phrase est prise en compte.
 * - Lecture en continu : la réponse est lue phrase par phrase pendant qu'elle
 *   s'écrit (voix serveur, sinon synthèse du navigateur).
 *
 * L'AudioContext est créé de façon synchrone dans le clic « Appel » : créé
 * après une attente, le navigateur le laisse suspendu et le micro paraît muet.
 */

import { describeMediaError, mediaAvailable } from "./media";

export type CallPhase = "connecting" | "listening" | "hearing" | "thinking" | "speaking";

type SR = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
};

export type VoiceOptions = {
  speechLang: string;                                   // ex. "ar-MA", "fr-FR"
  transcribe: (blob: Blob) => Promise<string>;          // transcription serveur
  synthesize: (text: string) => Promise<Blob>;          // voix serveur (rejette si indisponible)
  onPhase: (p: CallPhase) => void;
  onLevel: (l: number) => void;                         // 0..1 pour l'animation
  onInterim: (text: string) => void;                    // texte en cours de dictée
  onUtterance: (text: string) => void;                  // phrase terminée → à envoyer
  onBargeIn: () => void;                                // l'utilisateur coupe la parole
  onError: (kind: "mic" | "stt" | "tts", detail?: string) => void;
  onVoice?: (source: "serveur" | "navigateur" | "aucune") => void;
};

/** Voix du navigateur pour une langue : correspondance exacte (ar-MA), puis
 *  même langue (ar-*), en préférant les voix « naturelles » / en ligne. */
export async function browserVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise<void>(resolve => {
      const done = () => resolve();
      synth.addEventListener?.("voiceschanged", done, { once: true });
      setTimeout(done, 1200);
    });
    voices = synth.getVoices();
  }
  const l = lang.toLowerCase(), base = l.slice(0, 2);
  const score = (v: SpeechSynthesisVoice) => {
    const vl = (v.lang || "").toLowerCase().replace("_", "-");
    let sc = vl === l ? 100 : vl.startsWith(base) ? 50 : 0;
    if (!sc) return 0;
    if (/natural|neural|online|google|premium|enhanced/i.test(v.name)) sc += 10;
    return sc;
  };
  return voices.map(v => [score(v), v] as const).filter(([sc]) => sc > 0).sort((a, b) => b[0] - a[0])[0]?.[1] ?? null;
}

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"])
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** iPhone / iPad (tous les navigateurs iOS utilisent WebKit). */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// 50 ms de silence : jouée pendant le clic « Appel » pour débloquer la lecture
// audio (iOS refuse sinon de jouer un son déclenché plus tard, sans geste).
const SILENT_WAV = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const SENTENCE = /[^.!?؟…\n]+(?:[.!?؟…]+|\n+)/g;

export class RealtimeVoice {
  private o: VoiceOptions;
  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private active = false;
  private phase: CallPhase = "connecting";
  private muted = false;

  // VAD
  private floor = 0.01;
  private calib: number[] = [];
  private speechSince = 0;
  private silenceSince = 0;
  private inSpeech = false;

  // Reconnaissance
  private sr: SR | null = null;
  private srWorks = true;
  private finalText = "";
  private interim = "";
  private commitTimer = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private committing = false;

  // Lecture
  private queue: string[] = [];
  private pending = "";
  private speakingNow = false;
  private ended = false;
  private audio: HTMLAudioElement | null = null;
  private player: HTMLAudioElement;          // un seul lecteur, débloqué dans le clic
  /** iOS : micro fermé pendant que le Copilote parle (sinon iOS coupe ou
   *  baisse fortement le son) ; on l'interrompt en touchant l'orbe. */
  readonly halfDuplex = isIOS();
  private source: MediaStreamAudioSourceNode | null = null;
  private reacquiring: Promise<boolean> | null = null;
  private serverTts = true;
  private prefetch: Promise<Blob | null> | null = null;
  private prefetchText = "";
  private onSpeechDone: (() => void) | null = null;
  private voiceSource: "serveur" | "navigateur" | "aucune" | null = null;
  private echoPeak = 0;
  private audioStartedAt = 0;   // début réel de la phrase en cours (0 = rien n'est joué)

  constructor(opts: VoiceOptions) {
    this.o = opts;
    // Synchrone, dans le geste utilisateur.
    this.ctx = new AudioContext();
    this.ctx.resume().catch(() => {});
    // Déblocage de la lecture (iOS, Safari) : un lecteur réutilisé pour toute
    // la conversation + une synthèse vocale vide, lancés pendant le clic.
    this.player = new Audio();
    this.player.setAttribute("playsinline", "");
    this.player.preload = "auto";
    this.player.src = SILENT_WAV;
    this.player.play().catch(() => {});
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch { /* pas de synthèse vocale */ }
  }

  get currentPhase() { return this.phase; }

  async start() {
    this.active = true;
    this.setPhase("connecting");
    const pre = mediaAvailable();
    if (!pre.ok) { this.o.onError("mic", pre.reason); this.stop(); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      this.o.onError("mic", describeMediaError(err));
      this.stop();
      return;
    }
    await this.ctx.resume().catch(() => {});
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    // Les deux tournent en parallèle : la reconnaissance du navigateur donne le
    // texte en direct ; l'enregistrement sert de filet (transcription serveur)
    // si elle ne renvoie rien (réseau, langue non prise en charge…).
    this.startRecognition();
    this.restartRecorder();
    this.setPhase("listening");
    this.loop();
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.commitTimer);
    this.cancelSpeech();
    try { this.sr?.abort(); } catch { /* ignore */ }
    this.sr = null;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.player.pause();
    this.player.removeAttribute("src");
    this.ctx.close().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.stream?.getAudioTracks().forEach(t => { t.enabled = !m; });
    if (m) { this.interim = ""; this.o.onInterim(""); }
  }

  /** L'application a envoyé la phrase et attend la réponse. */
  thinking() { this.setPhase("thinking"); }
  /** Retour à l'écoute (réponse finie, interrompue ou vide). */
  listen() {
    if (!this.active) return;
    this.setPhase("listening");
    this.finalText = ""; this.interim = "";
    if (this.halfDuplex && !this.stream) { void this.reacquireMic(); return; }
    this.restartRecorder();
  }

  /** iOS : ferme le micro (et la reconnaissance) pendant que le Copilote parle. */
  private releaseMic() {
    if (!this.stream) return;
    const sr = this.sr; this.sr = null;
    try { sr?.abort(); } catch { /* ignore */ }
    const rec = this.recorder; this.recorder = null;
    if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.source = null;
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.inSpeech = false; this.speechSince = 0; this.silenceSince = 0;
  }

  private reacquireMic(): Promise<boolean> {
    if (this.reacquiring) return this.reacquiring;
    this.reacquiring = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (!this.active) { stream.getTracks().forEach(t => t.stop()); return false; }
        this.stream = stream;
        if (this.muted) stream.getAudioTracks().forEach(t => { t.enabled = false; });
        if (this.analyser) { this.source = this.ctx.createMediaStreamSource(stream); this.source.connect(this.analyser); }
        if (this.srWorks) this.startRecognition();
        this.restartRecorder();
        return true;
      } catch (err) {
        this.o.onError("mic", describeMediaError(err));
        return false;
      } finally {
        this.reacquiring = null;
      }
    })();
    return this.reacquiring;
  }

  // ── Lecture en continu ──
  /** Prépare la lecture d'une nouvelle réponse ; `done` est appelé à la fin. */
  beginSpeech(done: () => void) {
    this.cancelSpeech();
    this.ended = false;
    this.onSpeechDone = done;
  }
  pushText(delta: string) {
    this.pending += delta;
    const parts = this.pending.match(SENTENCE);
    if (parts) {
      const consumed = parts.join("");
      this.pending = this.pending.slice(this.pending.indexOf(consumed) + consumed.length);
      for (const p of parts) { const s = clean(p); if (s) this.queue.push(s); }
      this.pump();
    }
  }
  endText() {
    const s = clean(this.pending);
    this.pending = "";
    if (s) this.queue.push(s);
    this.ended = true;
    this.pump();
  }
  cancelSpeech() {
    this.audioStartedAt = 0;
    this.queue = []; this.pending = ""; this.ended = false;
    this.prefetch = null; this.prefetchText = "";
    this.player.pause(); this.audio = null;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    this.speakingNow = false;
    this.onSpeechDone = null;
  }

  private async pump() {
    if (this.speakingNow || !this.active) return;
    const next = this.queue.shift();
    if (!next) {
      if (this.ended && this.onSpeechDone) { const d = this.onSpeechDone; this.onSpeechDone = null; d(); }
      return;
    }
    this.speakingNow = true;
    this.setPhase("speaking");
    if (this.halfDuplex) this.releaseMic();
    const token = this.onSpeechDone;
    try {
      await this.say(next);
    } finally {
      // Annulé pendant la lecture : on ne relance rien.
      if (token === this.onSpeechDone) { this.speakingNow = false; this.pump(); }
    }
  }

  private fetchTts(text: string): Promise<Blob | null> {
    return this.o.synthesize(text).catch(() => { this.serverTts = false; return null; });
  }

  private markAudio(on: boolean) {
    this.audioStartedAt = on ? performance.now() : 0;
    if (on) this.echoPeak = 0;
  }

  private reportVoice(src: "serveur" | "navigateur" | "aucune") {
    if (this.voiceSource !== src) { this.voiceSource = src; this.o.onVoice?.(src); }
  }

  private async say(text: string): Promise<void> {
    if (this.serverTts) {
      const blob = this.prefetchText === text && this.prefetch ? await this.prefetch : await this.fetchTts(text);
      this.prefetch = null; this.prefetchText = "";
      // Pré-charge la phrase suivante pendant la lecture de celle-ci.
      const following = this.queue[0];
      if (following && this.serverTts) { this.prefetchText = following; this.prefetch = this.fetchTts(following); }
      if (blob && blob.size > 200) {
        this.reportVoice("serveur");
        const url = URL.createObjectURL(blob);
        const played = await new Promise<boolean>(resolve => {
          // Toujours le même lecteur : il a été débloqué pendant le clic.
          const a = this.player;
          this.audio = a;
          const done = (ok: boolean) => {
            a.onplaying = a.onended = a.onpause = a.onerror = null;
            this.markAudio(false); URL.revokeObjectURL(url); resolve(ok);
          };
          a.onplaying = () => this.markAudio(true);
          a.onended = a.onpause = () => done(true);
          a.onerror = () => done(false);
          a.src = url;
          a.play().catch(() => done(false));
        });
        if (played) return;
      }
    }
    const synth = window.speechSynthesis;
    const voice = await browserVoice(this.o.speechLang);
    if (!synth || !voice) {
      // Aucune voix pour cette langue sur l'appareil (fréquent pour l'arabe).
      if (this.voiceSource !== "aucune") this.o.onError("tts", this.o.speechLang);
      this.reportVoice("aucune");
      return;
    }
    this.reportVoice("navigateur");
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; clearTimeout(watchdog); this.markAudio(false); resolve(); } };
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang || this.o.speechLang; u.rate = 1.05;
      u.onstart = () => this.markAudio(true);
      u.onend = finish; u.onerror = finish;
      // Certains navigateurs n'envoient jamais « onend » : garde-fou.
      const watchdog = window.setTimeout(finish, 2500 + text.length * 95);
      try { synth.resume(); } catch { /* ignore */ }
      synth.speak(u);
    });
  }

  // ── VAD ──
  private loop = () => {
    if (!this.active || !this.analyser) return;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0; for (const x of buf) sum += x * x;
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();

    // Calibration du bruit de fond sur ~0,6 s, puis suivi lent.
    if (this.calib.length < 36) { this.calib.push(rms); this.floor = Math.max(0.004, this.calib.reduce((a, b) => a + b, 0) / this.calib.length); }
    // Suivi lent du bruit de fond, uniquement pendant l'écoute silencieuse.
    else if (this.phase === "listening" && !this.inSpeech && !this.speechSince) this.floor = this.floor * 0.995 + rms * 0.005;

    const speaking = this.phase === "speaking";
    // Pendant que le Copilote parle, le micro capte aussi sa voix (surtout sans
    // casque) : on mesure ce niveau d'écho pendant les 0,5 s qui suivent le
    // début réel de chaque phrase, puis il faut parler nettement plus fort que
    // lui, assez longtemps, pour l'interrompre.
    const base = Math.max(0.012, this.floor * 2.6 + 0.006);
    const audioAge = speaking && this.audioStartedAt ? now - this.audioStartedAt : -1;
    let threshold = base;
    if (audioAge >= 0) {
      // Écho mesuré seulement sur la fenêtre de calibration : le suivre ensuite
      // absorberait les creux de la voix de l'utilisateur et rendrait le seuil
      // inatteignable.
      if (audioAge < 500) this.echoPeak = Math.max(this.echoPeak, rms);
      threshold = Math.max(base * 1.6, this.echoPeak * 1.6, 0.03);
    }
    this.o.onLevel(Math.min(1, rms / Math.max(0.05, threshold * 3)));

    if (!this.muted && rms > threshold) {
      this.silenceSince = 0;
      if (!this.speechSince) this.speechSince = now;
      const need = speaking ? 480 : this.phase === "thinking" ? 300 : 120;
      const tooEarly = audioAge >= 0 && audioAge < 500; // le temps de mesurer l'écho
      if (!this.inSpeech && !tooEarly && now - this.speechSince > need) {
        this.inSpeech = true;
        if (speaking || this.phase === "thinking") {
          // L'utilisateur coupe la parole : on se tait et on écoute.
          this.cancelSpeech();
          this.o.onBargeIn();
          this.finalText = ""; this.interim = "";
          this.restartRecorder(); // le segment précédent contient la voix du Copilote
        }
        this.setPhase("hearing");
        clearTimeout(this.commitTimer);
      }
    } else {
      this.speechSince = 0;
      if (this.inSpeech) {
        if (!this.silenceSince) this.silenceSince = now;
        if (now - this.silenceSince > 850) {
          this.inSpeech = false;
          this.endOfSpeech();
        }
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private endOfSpeech() {
    clearTimeout(this.commitTimer);
    this.finishUtterance();
  }

  /** Fin d'une phrase : arrête l'enregistrement du segment, laisse ~0,7 s à
   *  la reconnaissance du navigateur pour finaliser, puis utilise son texte —
   *  ou, à défaut, la transcription serveur de l'enregistrement. */
  private finishUtterance() {
    if (this.committing || !this.active) return;
    this.committing = true;
    const rec = this.recorder;
    const blobReady = new Promise<Blob | null>(resolve => {
      if (!rec || rec.state === "inactive") { resolve(null); return; }
      const chunks = this.chunks;
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    this.recorder = null;
    window.setTimeout(async () => {
      const blob = await blobReady;
      this.restartRecorder();
      let text = (this.finalText + this.interim).trim();
      this.finalText = ""; this.interim = "";
      try {
        if (!text && blob && blob.size > 2500) {
          this.o.onInterim("…");
          try { text = (await this.o.transcribe(blob)).trim(); }
          catch (err) { this.o.onError("stt", err instanceof Error ? err.message : String(err)); }
        }
      } finally {
        this.committing = false;
        this.o.onInterim("");
      }
      if (!this.active) return;
      if (text) this.o.onUtterance(text);
      else if (this.phase === "hearing") this.setPhase("listening");
    }, this.useSR() ? 700 : 0);
  }

  // ── Reconnaissance du navigateur ──
  private useSR() { return !!this.sr && this.srWorks; }

  private startRecognition() {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const sr: SR = new Ctor();
    sr.lang = this.o.speechLang;
    sr.continuous = true;
    sr.interimResults = true;
    sr.maxAlternatives = 1;
    sr.onresult = (e: any) => {
      if (this.phase === "speaking" || this.muted) return; // écho de la voix du Copilote
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      this.interim = interim;
      this.o.onInterim((this.finalText + interim).trim());
      if (this.phase === "listening" && (interim || this.finalText)) this.setPhase("hearing");
      // Phrase finalisée sans que la VAD ait vu la fin (voix faible) : on valide.
      if (!this.inSpeech && this.finalText && !interim) {
        clearTimeout(this.commitTimer);
        this.commitTimer = window.setTimeout(() => { if (!this.inSpeech) this.finishUtterance(); }, 900);
      }
    };
    sr.onerror = (e: any) => {
      const err = e?.error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed" || err === "network" || err === "language-not-supported") {
        // Reconnaissance du navigateur indisponible → transcription serveur.
        this.srWorks = false;
        this.sr = null;
      }
    };
    sr.onend = () => {
      if (this.active && this.sr === sr && this.srWorks) { try { sr.start(); } catch { /* déjà relancée */ } }
    };
    this.sr = sr;
    try { sr.start(); } catch { this.srWorks = false; this.sr = null; }
  }

  // ── Enregistrement + transcription serveur (repli) ──
  private restartRecorder() {
    if (!this.stream || !this.active) return;
    const old = this.recorder;
    if (old && old.state !== "inactive") { old.onstop = null; old.stop(); }
    const mime = pickMime();
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    this.chunks = chunks;
    this.recorder = rec;
    rec.start(250);
  }

  private setPhase(p: CallPhase) {
    if (this.phase === p) return;
    this.phase = p;
    this.o.onPhase(p);
  }
}

function clean(s: string) {
  return s.replace(/[*#`>|_]/g, "").replace(/\s+/g, " ").trim();
}
