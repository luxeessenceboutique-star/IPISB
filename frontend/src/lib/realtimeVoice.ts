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
  onError: (kind: "mic" | "stt", detail?: string) => void;
};

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"])
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

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
  private serverTts = true;
  private prefetch: Promise<Blob | null> | null = null;
  private prefetchText = "";
  private onSpeechDone: (() => void) | null = null;

  constructor(opts: VoiceOptions) {
    this.o = opts;
    // Synchrone, dans le geste utilisateur.
    this.ctx = new AudioContext();
    this.ctx.resume().catch(() => {});
  }

  get currentPhase() { return this.phase; }

  async start() {
    this.active = true;
    this.setPhase("connecting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.o.onError("mic");
      this.stop();
      return;
    }
    await this.ctx.resume().catch(() => {});
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
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
    this.restartRecorder();
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
    this.queue = []; this.pending = ""; this.ended = false;
    this.prefetch = null; this.prefetchText = "";
    this.audio?.pause(); this.audio = null;
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

  private async say(text: string): Promise<void> {
    if (this.serverTts) {
      const blob = this.prefetchText === text && this.prefetch ? await this.prefetch : await this.fetchTts(text);
      this.prefetch = null; this.prefetchText = "";
      // Pré-charge la phrase suivante pendant la lecture de celle-ci.
      const following = this.queue[0];
      if (following && this.serverTts) { this.prefetchText = following; this.prefetch = this.fetchTts(following); }
      if (blob) {
        const url = URL.createObjectURL(blob);
        await new Promise<void>(resolve => {
          const a = new Audio(url);
          this.audio = a;
          a.onended = a.onerror = a.onpause = () => { URL.revokeObjectURL(url); resolve(); };
          a.play().catch(() => resolve());
        });
        return;
      }
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    await new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.o.speechLang;
      const v = synth.getVoices().find(x => x.lang?.toLowerCase().startsWith(this.o.speechLang.slice(0, 2).toLowerCase()));
      if (v) u.voice = v;
      u.rate = 1.05;
      u.onend = () => resolve(); u.onerror = () => resolve();
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
    else if (!this.inSpeech && this.phase !== "speaking") this.floor = this.floor * 0.995 + rms * 0.005;

    const speaking = this.phase === "speaking";
    // Pendant que le Copilote parle, seuil plus haut (écho résiduel des haut-parleurs).
    const threshold = Math.max(0.012, this.floor * (speaking ? 4.5 : 2.6) + 0.006);
    this.o.onLevel(Math.min(1, rms / Math.max(0.05, threshold * 3)));

    if (!this.muted && rms > threshold) {
      this.silenceSince = 0;
      if (!this.speechSince) this.speechSince = now;
      const need = speaking || this.phase === "thinking" ? 280 : 120;
      if (!this.inSpeech && now - this.speechSince > need) {
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
