import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeVoice, type CallPhase } from "@/lib/realtimeVoice";
import {
  X, Send, Check, Loader2, Mic, Square, Phone, PhoneOff, Brain, SquarePen, PanelLeft,
  Maximize2, Minimize2, Search, Pin, PinOff, Pencil, Trash2, Copy, Volume2, VolumeX, Sparkles,
  Compass, UserCog, Wallet, Zap, ChevronDown, ListChecks, CircleCheck, Circle, Plus, AudioLines, MicOff,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

// ── Types ────────────────────────────────────────────────────────────────────
type Lang = "fr" | "ar" | "en" | "darija";
type AgentKey = "plateforme" | "rh" | "comptabilite" | "analyste" | "actions";
type ActionProposal = {
  id: string; label: string; summary: string;
  status: "pending" | "confirming" | "confirmed" | "cancelled" | "failed" | "expired";
  error?: string;
};
type Step = { label: string; sub?: boolean };
type Todo = { content: string; status: string };
type Meta = { agent?: { key: AgentKey; label: string }; steps?: Step[]; todos?: Todo[]; action?: ActionProposal; voice?: boolean };
type Msg = { id?: string; role: "user" | "assistant"; content: string; meta?: Meta; streaming?: boolean; note?: string };
type Conversation = { id: string; title: string; language: string; pinned: boolean; updated_at: string };
type Memory = { id: string; content: string; created_at: string };

const LANGS: { code: Lang; flag: string; label: string; rtl: boolean; speech: string }[] = [
  { code: "darija", flag: "🇲🇦", label: "Darija", rtl: false, speech: "ar-MA" },
  { code: "fr", flag: "🇫🇷", label: "Français", rtl: false, speech: "fr-FR" },
  { code: "en", flag: "🇬🇧", label: "English", rtl: false, speech: "en-US" },
  { code: "ar", flag: "🇸🇦", label: "العربية", rtl: true, speech: "ar-SA" },
];

const AGENT_META: Record<AgentKey, { label: string; icon: typeof Compass; tone: string; desc: string }> = {
  plateforme:   { label: "Guide plateforme", icon: Compass, tone: "oklch(48% 0.085 175)", desc: "Où trouver quoi, comment faire" },
  rh:           { label: "Agent RH", icon: UserCog, tone: "oklch(55% 0.12 245)", desc: "Employés, congés, échéances RH" },
  comptabilite: { label: "Agent Comptabilité", icon: Wallet, tone: "oklch(60% 0.12 70)", desc: "Dépenses, budgets, DI/DA" },
  analyste:     { label: "Analyste (Deep Agent)", icon: Sparkles, tone: "oklch(52% 0.14 300)", desc: "Bilans et analyses en plusieurs étapes" },
  actions:      { label: "Agent Actions", icon: Zap, tone: "oklch(58% 0.16 30)", desc: "Prépare une action à confirmer" },
};

const T: Record<Lang, Record<string, string>> = {
  fr: { hello: "Bonjour", ask: "Posez votre question…", newChat: "Nouvelle conversation", history: "Historique", search: "Rechercher…",
        memory: "Mémoire", memoryHint: "Ce que le Copilote retient de vous, dans toutes vos conversations.", addMemory: "Ajouter un souvenir…",
        clearAll: "Tout effacer", noMemory: "Rien pour l'instant — le Copilote retiendra vos préférences au fil des échanges.",
        deep: "Analyse approfondie", listening: "Je vous écoute…", thinking: "Réflexion…", speaking: "Le Copilote parle…",
        call: "Appel vocal", endCall: "Raccrocher", recording: "Enregistrement…", copy: "Copier", listen: "Écouter",
        confirm: "Confirmer", cancel: "Annuler", proposed: "Action proposée", done: "Effectué.", cancelled: "Annulé.",
        executing: "Exécution…", remembered: "Mémorisé", steps: "étapes", voiceMsg: "Message vocal", empty: "Aucune conversation",
        today: "Aujourd'hui", yesterday: "Hier", week: "7 derniers jours", older: "Plus ancien", pinned: "Épinglées",
        welcome: "Comment puis-je vous aider aujourd'hui ?", team: "Votre équipe d'agents", error: "Désolé, une erreur est survenue. Réessayez dans un instant.",
        micDenied: "Micro inaccessible — autorisez-le dans le navigateur." },
  darija: { hello: "Salam", ask: "Kteb so2alek…", newChat: "Conversation jdida", history: "L'historique", search: "9elleb…",
        memory: "Dakira", memoryHint: "Chno kay39el 3lik l-Copilote f ga3 l-conversations dyalek.", addMemory: "Zid chi 7aja y3e9el 3liha…",
        clearAll: "Mse7 kolchi", noMemory: "Mazal walou — ghadi y3e9el 3la les préférences dyalek m3a l-wa9t.",
        deep: "Ta7lil m3emme9", listening: "Kansm3ek…", thinking: "Kanfekker…", speaking: "L-Copilote kayhder…",
        call: "Appel b sswt", endCall: "Sedd l-appel", recording: "Kaytsjjel…", copy: "Copier", listen: "Sme3",
        confirm: "Wafe9", cancel: "Lgha", proposed: "Action m9ter7a", done: "Tdart.", cancelled: "Tlghat.",
        executing: "Kaydir…", remembered: "T9eyyed", steps: "marahil", voiceMsg: "Message vocal", empty: "Ma kayna 7tta conversation",
        today: "Lyoum", yesterday: "Lbare7", week: "7 iyam lekhrin", older: "9dim", pinned: "Mthebbtin",
        welcome: "Kifach n9der n3awnek lyoum?", team: "L'équipe dyal les agents dyalek", error: "Sme7 lia, w9e3 mochkil. 3awed men b3d.",
        micDenied: "Ma9dertch nwsel l-micro — 3tih l-idn f navigateur." },
  en: { hello: "Hello", ask: "Ask your question…", newChat: "New chat", history: "History", search: "Search…",
        memory: "Memory", memoryHint: "What the Copilot remembers about you, across all your chats.", addMemory: "Add a memory…",
        clearAll: "Clear all", noMemory: "Nothing yet — the Copilot will remember your preferences over time.",
        deep: "Deep analysis", listening: "Listening…", thinking: "Thinking…", speaking: "Copilot is speaking…",
        call: "Voice call", endCall: "Hang up", recording: "Recording…", copy: "Copy", listen: "Listen",
        confirm: "Confirm", cancel: "Cancel", proposed: "Proposed action", done: "Done.", cancelled: "Cancelled.",
        executing: "Executing…", remembered: "Remembered", steps: "steps", voiceMsg: "Voice message", empty: "No conversations",
        today: "Today", yesterday: "Yesterday", week: "Last 7 days", older: "Older", pinned: "Pinned",
        welcome: "How can I help you today?", team: "Your agent team", error: "Sorry, something went wrong. Please try again.",
        micDenied: "Microphone unavailable — allow it in your browser." },
  ar: { hello: "مرحباً", ask: "اكتب سؤالك…", newChat: "محادثة جديدة", history: "السجل", search: "بحث…",
        memory: "الذاكرة", memoryHint: "ما يتذكره المساعد عنك في جميع محادثاتك.", addMemory: "أضف معلومة…",
        clearAll: "مسح الكل", noMemory: "لا شيء بعد — سيتذكر المساعد تفضيلاتك مع الوقت.",
        deep: "تحليل معمّق", listening: "أستمع إليك…", thinking: "أفكر…", speaking: "المساعد يتحدث…",
        call: "مكالمة صوتية", endCall: "إنهاء", recording: "جارٍ التسجيل…", copy: "نسخ", listen: "استماع",
        confirm: "تأكيد", cancel: "إلغاء", proposed: "إجراء مقترح", done: "تم.", cancelled: "أُلغي.",
        executing: "جارٍ التنفيذ…", remembered: "تم الحفظ", steps: "خطوات", voiceMsg: "رسالة صوتية", empty: "لا توجد محادثات",
        today: "اليوم", yesterday: "أمس", week: "آخر 7 أيام", older: "أقدم", pinned: "مثبتة",
        welcome: "كيف يمكنني مساعدتك اليوم؟", team: "فريق الوكلاء", error: "عذراً، حدث خطأ. حاول مرة أخرى.",
        micDenied: "الميكروفون غير متاح — اسمح به في المتصفح." },
};

const SUGGESTIONS: Record<Lang, Partial<Record<AgentKey, string>>> = {
  fr: { plateforme: "Comment approuver une demande de congé ?", rh: "Quels congés sont en attente ?", comptabilite: "Fais-moi la synthèse comptable du mois", analyste: "Prépare un bilan RH et financier avec des recommandations" },
  darija: { plateforme: "Kifach nwafe9 3la demande de congé?", rh: "Chno homa les congés li mazal ma tqblouch?", comptabilite: "3tini synthèse dyal la comptabilité", analyste: "Wjjed lia bilan RH o financier m3a recommandations" },
  en: { plateforme: "How do I approve a leave request?", rh: "Which leave requests are pending?", comptabilite: "Give me this month's accounting summary", analyste: "Prepare an HR and financial review with recommendations" },
  ar: { plateforme: "كيف أوافق على طلب إجازة؟", rh: "ما هي طلبات الإجازة المعلقة؟", comptabilite: "أعطني الملخص المحاسبي لهذا الشهر", analyste: "أعدّ تقريراً للموارد البشرية والمالية مع توصيات" },
};

// ── Utilitaires ─────────────────────────────────────────────────────────────
async function authHeaders(json = true): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

function escapeHtml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inline(t: string) {
  return t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}
/** Markdown minimal et sûr (texte échappé d'abord) : titres, listes, gras, code. */
function renderMarkdown(src: string) {
  const lines = escapeHtml(src).split("\n");
  let html = "", list: "ul" | "ol" | null = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { close(); html += `<h4>${inline(h[2])}</h4>`; }
    else if (ul) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(ul[1])}</li>`; }
    else if (ol) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(ol[1])}</li>`; }
    else if (!line.trim()) { close(); html += "<div class='cp-gap'></div>"; }
    else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return html;
}

function bucketOf(iso: string): number {
  const d = new Date(iso), start = new Date(); start.setHours(0, 0, 0, 0);
  if (d >= start) return 0;
  if (d.getTime() >= start.getTime() - 86400000) return 1;
  if (d.getTime() >= start.getTime() - 6 * 86400000) return 2;
  return 3;
}

function pickMime(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

// ── Voix : enregistrement, transcription, lecture ───────────────────────────
type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };
function speechRecognition(): (new () => SR) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function transcribe(blob: Blob, lang: Lang): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, `voice.${blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
  fd.append("language", lang);
  const res = await fetch(`${API}/api/copilot/transcribe`, { method: "POST", headers: await authHeaders(false), body: fd });
  if (!res.ok) throw new Error(`stt ${res.status}`);
  return ((await res.json()).text ?? "").trim();
}

let currentAudio: HTMLAudioElement | null = null;
function stopSpeaking() {
  currentAudio?.pause(); currentAudio = null;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
/** Lit un texte : voix serveur (TTS), sinon synthèse du navigateur. */
async function speak(text: string, lang: Lang, onEnd?: () => void) {
  stopSpeaking();
  const clean = text.replace(/[*#`>]/g, "").slice(0, 1500);
  try {
    const res = await fetch(`${API}/api/copilot/speech`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ text: clean, language: lang }) });
    if (!res.ok) throw new Error("tts");
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; onEnd?.(); };
    await audio.play();
  } catch {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = LANGS.find(l => l.code === lang)?.speech ?? "fr-FR";
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  }
}

// ── Composant ───────────────────────────────────────────────────────────────
export function PlatformCopilot() {
  const { roles, user } = useAuth();
  const { isMobile } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem("copilot-expanded") === "1"; } catch { return false; } });
  const [lang, setLangState] = useState<Lang>(() => { try { return (localStorage.getItem("copilot-lang") as Lang) || "fr"; } catch { return "fr"; } });
  const [langMenu, setLangMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convQuery, setConvQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [deep, setDeep] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryInput, setMemoryInput] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [recording, setRecording] = useState<{ start: number; level: number } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | number | null>(null);
  const [call, setCall] = useState<null | { phase: CallPhase; level: number; interim: string; heard: string; muted: boolean }>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<{ stop: (send: boolean) => void } | null>(null);
  const voiceRef = useRef<RealtimeVoice | null>(null);
  const turnRef = useRef<AbortController | null>(null);
  const sttFallback = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const t = T[lang];
  const rtl = lang === "ar";
  const fullName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";
  const agentsForMe: AgentKey[] = useMemo(() => {
    const r = new Set(roles);
    const out: AgentKey[] = ["plateforme"];
    const rh = r.has("admin") || r.has("rh") || r.has("assistant_rh");
    const fin = r.has("admin") || r.has("comptabilite") || r.has("cashier") || r.has("accountant");
    if (rh) out.push("rh");
    if (fin) out.push("comptabilite");
    if (rh || fin) out.push("analyste");
    return out;
  }, [roles]);

  function setLang(l: Lang) {
    setLangState(l); setLangMenu(false);
    try { localStorage.setItem("copilot-lang", l); } catch { /* ignore */ }
  }
  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), msg.length > 60 ? 6000 : 2600); }

  // ── Chargements ──
  const loadConversations = useCallback(async (q = "") => {
    try { setConversations(await api.get(`/api/copilot/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`)); } catch { /* hors ligne : liste vide */ }
  }, []);
  const loadMemories = useCallback(async () => {
    try { setMemories(await api.get("/api/copilot/memories")); } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (open) { loadConversations(); loadMemories(); } }, [open, loadConversations, loadMemories]);
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => loadConversations(convQuery.trim()), 250);
    return () => clearTimeout(h);
  }, [convQuery, open, loadConversations]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);
  useEffect(() => { if (open && !call) setTimeout(() => inputRef.current?.focus(), 80); }, [open, activeId, call]);
  useEffect(() => { try { localStorage.setItem("copilot-expanded", expanded ? "1" : "0"); } catch { /* ignore */ } }, [expanded]);

  async function openConversation(id: string) {
    if (streaming) return;
    stopSpeaking();
    setActiveId(id); setLoadingConv(true); setShowHistory(expanded && !isMobile);
    try {
      const res = await api.get(`/api/copilot/conversations/${id}/messages`);
      setMessages((res.messages ?? []).map((m: any) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta ?? {} })));
    } catch { setMessages([]); }
    finally { setLoadingConv(false); }
  }
  function newConversation() {
    if (streaming) return;
    stopSpeaking();
    setActiveId(null); setMessages([]); setInput("");
    if (!expanded || isMobile) setShowHistory(false);
  }

  // ── Envoi + flux SSE ──
  const send = useCallback(async (
    override?: string,
    opts: { voice?: boolean; call?: boolean; signal?: AbortSignal; onText?: (delta: string) => void; onDone?: () => void } = {},
  ): Promise<string> => {
    const text = (override ?? input).trim();
    if (!text || (streaming && !opts.call)) return "";
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (!opts.call) stopSpeaking();
    setMessages(prev => [...prev, { role: "user", content: text, meta: opts.voice ? { voice: true } : {} },
      { role: "assistant", content: "", meta: { steps: [] }, streaming: true }]);
    setStreaming(true);
    let full = "";
    const patchLast = (fn: (m: Msg) => Msg) => setMessages(prev => {
      const next = [...prev]; const i = next.length - 1;
      if (i >= 0 && next[i].role === "assistant") next[i] = fn(next[i]);
      return next;
    });
    try {
      const res = await fetch(`${API}/api/copilot/stream`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({
          message: text, conversation_id: activeIdRef.current, language: lang,
          // En appel : Deep Agent et réponses courtes à dire à voix haute.
          deep: opts.call ? true : deep, voice: !!opts.voice, call: !!opts.call,
        }),
        signal: opts.signal,
      });
      if (!res.ok || !res.body) {
        let detail = "";
        try { const j = await res.json(); detail = typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j); } catch { /* corps non JSON */ }
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { await reader.cancel().catch(() => {}); break outer; }
          let ev: any;
          try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.conversation) {
            const c = ev.conversation;
            setActiveId(c.id); activeIdRef.current = c.id;
            if (c.new) setConversations(prev => [{ id: c.id, title: c.title, language: lang, pinned: false, updated_at: new Date().toISOString() }, ...prev]);
          } else if (ev.agent) {
            patchLast(m => ({ ...m, meta: { ...m.meta, agent: ev.agent } }));
          } else if (ev.step) {
            patchLast(m => ({ ...m, meta: { ...m.meta, steps: [...(m.meta?.steps ?? []), ev.step] } }));
          } else if (ev.todos) {
            patchLast(m => ({ ...m, meta: { ...m.meta, todos: ev.todos } }));
          } else if (ev.reset) {
            full = ""; patchLast(m => ({ ...m, content: "" }));
          } else if (typeof ev.text === "string") {
            full += ev.text; const snap = full; patchLast(m => ({ ...m, content: snap }));
            opts.onText?.(ev.text);
          } else if (ev.action_proposal) {
            patchLast(m => ({ ...m, meta: { ...m.meta, action: { ...ev.action_proposal, status: "pending" } } }));
          } else if (ev.done) {
            opts.onDone?.();
            patchLast(m => ({ ...m, id: ev.done.message_id, streaming: false }));
            setStreaming(false);
          } else if (ev.title) {
            setConversations(prev => prev.map(c => c.id === ev.title.id ? { ...c, title: ev.title.title } : c));
          } else if (ev.warning) {
            flash(ev.warning);
          } else if (ev.memory) {
            const facts = ev.memory as Memory[];
            setMemories(prev => [...facts, ...prev]);
            patchLast(m => ({ ...m, note: facts.map(f => f.content).join(" · ") }));
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Interrompu par l'utilisateur (appel vocal) : on garde ce qui a été dit.
        const snap = full ? full + " …" : "…";
        patchLast(m => ({ ...m, content: snap }));
        return full;
      }
      console.error("Copilot error:", err);
      const reason = err instanceof TypeError
        ? "Serveur injoignable (backend arrêté ou adresse VITE_API_URL incorrecte)."
        : err instanceof Error ? err.message : String(err);
      full = full || `${t.error}\n\n\`${reason}\``;
      const snap = full;
      patchLast(m => ({ ...m, content: snap }));
    } finally {
      patchLast(m => ({ ...m, streaming: false }));
      setStreaming(false);
      setConversations(prev => {
        const id = activeIdRef.current; if (!id) return prev;
        const c = prev.find(x => x.id === id); if (!c) return prev;
        return [{ ...c, updated_at: new Date().toISOString() }, ...prev.filter(x => x.id !== id)];
      });
    }
    return full;
  }, [input, streaming, lang, deep, t.error]);

  // ── Actions proposées ──
  function setActionStatus(id: string, patch: Partial<ActionProposal>) {
    setMessages(prev => prev.map(m => m.meta?.action?.id === id ? { ...m, meta: { ...m.meta, action: { ...m.meta.action!, ...patch } } } : m));
  }
  async function confirmAction(id: string) {
    setActionStatus(id, { status: "confirming" });
    try { await api.post(`/api/copilot/actions/${id}/confirm`, {}); setActionStatus(id, { status: "confirmed" }); }
    catch (err) { setActionStatus(id, { status: "failed", error: err instanceof Error ? err.message : "Erreur" }); }
  }
  async function cancelAction(id: string) {
    setActionStatus(id, { status: "cancelled" });
    try { await api.post(`/api/copilot/actions/${id}/cancel`, {}); } catch { /* best-effort */ }
  }

  // ── Conversations : épingler, renommer, supprimer ──
  async function togglePin(c: Conversation) {
    setConversations(prev => prev.map(x => x.id === c.id ? { ...x, pinned: !c.pinned } : x));
    try { await api.patch(`/api/copilot/conversations/${c.id}`, { pinned: !c.pinned }); } catch { loadConversations(); }
  }
  async function saveRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    setRenaming(null);
    if (!title) return;
    setConversations(prev => prev.map(x => x.id === renaming.id ? { ...x, title } : x));
    try { await api.patch(`/api/copilot/conversations/${renaming.id}`, { title }); } catch { loadConversations(); }
  }
  async function removeConversation(c: Conversation) {
    if (!window.confirm(`Supprimer « ${c.title} » ?`)) return;
    setConversations(prev => prev.filter(x => x.id !== c.id));
    if (activeId === c.id) newConversation();
    try { await api.delete(`/api/copilot/conversations/${c.id}`); } catch { loadConversations(); }
  }

  // ── Mémoire ──
  async function addMemory() {
    const content = memoryInput.trim();
    if (!content) return;
    setMemoryInput("");
    try { const m = await api.post("/api/copilot/memories", { content }); if (m) setMemories(prev => [m, ...prev]); } catch { /* ignore */ }
  }
  async function deleteMemory(id: string) {
    setMemories(prev => prev.filter(m => m.id !== id));
    try { await api.delete(`/api/copilot/memories/${id}`); } catch { loadMemories(); }
  }
  async function clearMemories() {
    if (!window.confirm(t.clearAll + " ?")) return;
    setMemories([]);
    try { await api.delete("/api/copilot/memories"); } catch { loadMemories(); }
  }

  // ── Enregistrement vocal (message vocal + appel) ──
  /** Écoute le micro. `auto` (appel) : s'arrête seul après ~1,3 s de silence
   *  qui suit la parole. Renvoie le texte transcrit. */
  const listen = useCallback((opts: { auto: boolean; onLevel?: (l: number) => void }): Promise<string> => {
    const SRC = speechRecognition();
    // Repli : reconnaissance vocale du navigateur si le serveur ne transcrit pas.
    if (sttFallback.current && SRC) {
      return new Promise((resolve, reject) => {
        const rec = new SRC();
        rec.lang = LANGS.find(l => l.code === lang)?.speech ?? "fr-FR";
        rec.interimResults = false; rec.continuous = !opts.auto;
        let text = "";
        rec.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + " "; };
        rec.onerror = (e: any) => reject(new Error(e?.error ?? "sr"));
        rec.onend = () => { recRef.current = null; resolve(text.trim()); };
        recRef.current = { stop: (sendIt) => { if (!sendIt) text = ""; rec.stop(); } };
        rec.start();
      });
    }
    // AudioContext créé tout de suite, dans le clic : créé après l'attente du
    // micro, le navigateur le laisserait suspendu (niveau toujours à 0).
    const ctx = new AudioContext();
    ctx.resume().catch(() => {});
    return new Promise((resolve, reject) => {
      navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(stream => {
        ctx.resume().catch(() => {});
        const mime = pickMime();
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        let keep = true, raf = 0, heard = false, silentSince = 0;
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const started = performance.now();
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 6);
          opts.onLevel?.(level);
          if (opts.auto) {
            const now = performance.now();
            if (level > 0.08) { heard = true; silentSince = 0; }
            else if (heard) { silentSince ||= now; if (now - silentSince > 1300) { finish(true); return; } }
            if (!heard && now - started > 15000) { finish(false); return; }
            if (now - started > 60000) { finish(true); return; }
          }
          raf = requestAnimationFrame(loop);
        };
        const finish = (sendIt: boolean) => {
          keep = sendIt;
          cancelAnimationFrame(raf);
          if (mr.state !== "inactive") mr.stop();
        };
        mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mr.onstop = async () => {
          stream.getTracks().forEach(tr => tr.stop());
          ctx.close().catch(() => {});
          recRef.current = null;
          if (!keep || !chunks.length) { resolve(""); return; }
          try { resolve(await transcribe(new Blob(chunks, { type: mr.mimeType || "audio/webm" }), lang)); }
          catch (e) {
            // Transcription serveur indisponible → bascule sur le navigateur pour la suite.
            if (SRC) { sttFallback.current = true; }
            reject(e);
          }
        };
        recRef.current = { stop: finish };
        mr.start(250);
        loop();
      }).catch(() => { ctx.close().catch(() => {}); reject(new Error("mic")); });
    });
  }, [lang]);

  async function startVoiceMessage() {
    if (recording || streaming || transcribing) return;
    stopSpeaking();
    setRecording({ start: Date.now(), level: 0 });
    try {
      const promise = listen({ auto: false, onLevel: level => setRecording(r => r ? { ...r, level } : r) });
      const text = await promise.finally(() => setRecording(null));
      if (text) await send(text, { voice: true });
    } catch (e) {
      setRecording(null);
      flash(e instanceof Error && e.message === "mic" ? t.micDenied : "Transcription indisponible — réessayez (bascule sur la dictée du navigateur).");
    }
  }
  function stopVoiceMessage(sendIt: boolean) {
    if (!sendIt) { recRef.current?.stop(false); setRecording(null); return; }
    setTranscribing(true);
    recRef.current?.stop(true);
    setTimeout(() => setTranscribing(false), 400);
  }

  // ── Appel vocal temps réel (Deep Agent) ──
  // Écoute continue, texte en direct, réponse lue phrase par phrase pendant
  // qu'elle s'écrit, et on peut couper la parole au Copilote à tout moment.
  function startCall() {
    if (call) return;
    stopSpeaking();
    const speech = LANGS.find(l => l.code === lang)?.speech ?? "fr-FR";
    const engine = new RealtimeVoice({
      speechLang: speech,
      transcribe: blob => transcribe(blob, lang),
      synthesize: async text => {
        const res = await fetch(`${API}/api/copilot/speech`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ text, language: lang }) });
        if (!res.ok) throw new Error("tts");
        return res.blob();
      },
      onPhase: phase => setCall(c => c ? { ...c, phase } : c),
      onLevel: level => setCall(c => (c && Math.abs(c.level - level) > 0.03) ? { ...c, level } : c),
      onInterim: interim => setCall(c => c ? { ...c, interim } : c),
      onBargeIn: () => { turnRef.current?.abort(); turnRef.current = null; },
      onUtterance: text => { void runTurn(text); },
      onError: (kind, detail) => {
        if (kind === "mic") { flash(t.micDenied); endCall(); }
        else flash(`Transcription indisponible${detail ? ` (${detail})` : ""} — réessayez.`);
      },
    });
    voiceRef.current = engine;
    setCall({ phase: "connecting", level: 0, interim: "", heard: "", muted: false });
    void engine.start();
  }

  async function runTurn(text: string) {
    const engine = voiceRef.current;
    if (!engine) return;
    turnRef.current?.abort();
    const ctrl = new AbortController();
    turnRef.current = ctrl;
    setCall(c => c ? { ...c, heard: text, interim: "" } : c);
    engine.thinking();
    engine.beginSpeech(() => { if (turnRef.current === ctrl) { turnRef.current = null; engine.listen(); } });
    let finished = false;
    const answer = await send(text, {
      voice: true, call: true, signal: ctrl.signal,
      onText: d => { if (turnRef.current === ctrl) engine.pushText(d); },
      // Fin de la réponse : on lit la dernière phrase sans attendre titre et mémoire.
      onDone: () => { if (turnRef.current === ctrl) { finished = true; engine.endText(); } },
    });
    if (turnRef.current !== ctrl) return; // interrompu entre-temps
    if (!answer) { turnRef.current = null; engine.cancelSpeech(); engine.listen(); return; }
    if (!finished) engine.endText();
  }

  function endCall() {
    turnRef.current?.abort(); turnRef.current = null;
    voiceRef.current?.stop(); voiceRef.current = null;
    stopSpeaking();
    setCall(null);
  }
  function interruptSpeaking() {
    const engine = voiceRef.current;
    if (!engine) return;
    turnRef.current?.abort(); turnRef.current = null;
    engine.cancelSpeech();
    engine.listen();
  }
  function toggleMute() {
    setCall(c => {
      if (!c) return c;
      voiceRef.current?.setMuted(!c.muted);
      return { ...c, muted: !c.muted };
    });
  }

  async function toggleListen(m: Msg, key: string | number) {
    if (speakingId === key) { stopSpeaking(); setSpeakingId(null); return; }
    setSpeakingId(key);
    await speak(m.content, lang, () => setSpeakingId(s => s === key ? null : s));
  }

  // ── Ouverture / raccourcis ──
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("ipisb:open-copilot", openIt);
    return () => window.removeEventListener("ipisb:open-copilot", openIt);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (call) endCall(); else if (showMemory) setShowMemory(false); else setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  });
  useEffect(() => () => { turnRef.current?.abort(); voiceRef.current?.stop(); stopSpeaking(); }, []);

  function handleKey(e: RKeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ── Rendu ──
  const groups = useMemo(() => {
    const labels = [t.today, t.yesterday, t.week, t.older];
    const pinned = conversations.filter(c => c.pinned);
    const rest = conversations.filter(c => !c.pinned);
    const out: { label: string; items: Conversation[] }[] = [];
    if (pinned.length) out.push({ label: t.pinned, items: pinned });
    labels.forEach((label, i) => { const items = rest.filter(c => bucketOf(c.updated_at) === i); if (items.length) out.push({ label, items }); });
    return out;
  }, [conversations, t]);

  const wide = expanded && !isMobile;
  const historyVisible = wide || showHistory;
  const activeConv = conversations.find(c => c.id === activeId);
  const recSecs = recording ? Math.floor((Date.now() - recording.start) / 1000) : 0;

  const panel = open && (
    <div role="dialog" aria-label="Copilote IPISB" dir={rtl ? "rtl" : "ltr"}
      className={["cp-panel", wide && "is-wide", isMobile && "is-mobile"].filter(Boolean).join(" ")}>
      {/* Historique */}
      {historyVisible && (
        <aside className={wide ? "cp-history" : "cp-history is-overlay"}>
          <div className="cp-history-head">
            <button type="button" className="cp-new" onClick={newConversation}><SquarePen size={15} strokeWidth={1.9} />{t.newChat}</button>
            {!wide && <button type="button" className="cp-icon" aria-label="Fermer" onClick={() => setShowHistory(false)}><X size={16} /></button>}
          </div>
          <label className="cp-search">
            <Search size={14} strokeWidth={1.9} />
            <input value={convQuery} onChange={e => setConvQuery(e.target.value)} placeholder={t.search} aria-label={t.search} />
          </label>
          <div className="cp-conv-list">
            {groups.length === 0 && <div className="cp-empty">{t.empty}</div>}
            {groups.map(g => (
              <div key={g.label}>
                <div className="cp-conv-group">{g.label}</div>
                {g.items.map(c => (
                  <div key={c.id} className={c.id === activeId ? "cp-conv is-active" : "cp-conv"}>
                    {renaming?.id === c.id ? (
                      <input autoFocus className="cp-rename" value={renaming.title}
                        onChange={e => setRenaming({ id: c.id, title: e.target.value })}
                        onBlur={saveRename} onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null); }} />
                    ) : (
                      <button type="button" className="cp-conv-main" onClick={() => openConversation(c.id)} title={c.title}>
                        {c.pinned && <Pin size={11} strokeWidth={2} className="cp-pin" />}
                        <span>{c.title}</span>
                      </button>
                    )}
                    <div className="cp-conv-tools">
                      <button type="button" className="cp-icon sm" aria-label="Épingler" onClick={() => togglePin(c)}>{c.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
                      <button type="button" className="cp-icon sm" aria-label="Renommer" onClick={() => setRenaming({ id: c.id, title: c.title })}><Pencil size={13} /></button>
                      <button type="button" className="cp-icon sm danger" aria-label="Supprimer" onClick={() => removeConversation(c)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button type="button" className="cp-memory-btn" onClick={() => setShowMemory(true)}>
            <Brain size={15} strokeWidth={1.9} />{t.memory}<span>{memories.length}</span>
          </button>
        </aside>
      )}

      <section className="cp-main">
        {/* En-tête */}
        <header className="cp-head">
          {!wide && <button type="button" className="cp-icon" aria-label={t.history} title={t.history} onClick={() => setShowHistory(v => !v)}><PanelLeft size={17} strokeWidth={1.8} /></button>}
          <span aria-hidden className={streaming ? "pc-orb busy" : "pc-orb"} style={{ ["--orb" as string]: "34px" } as CSSProperties}>
            <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
          </span>
          <div className="cp-head-id">
            <div className="cp-head-title">{activeConv?.title ?? "Copilote IPISB"}</div>
            <div className="cp-head-sub">
              {streaming ? <><span className="cp-live" />{messages[messages.length - 1]?.meta?.agent?.label ?? t.thinking}</> : <>{agentsForMe.length} agents<span className="cp-tech"> · LangGraph</span></>}
            </div>
          </div>
          <div className="cp-head-actions">
            <div className="cp-lang">
              <button type="button" className="cp-lang-btn" onClick={() => setLangMenu(v => !v)} aria-haspopup="listbox" aria-expanded={langMenu}>
                <span>{LANGS.find(l => l.code === lang)?.flag}</span><ChevronDown size={12} />
              </button>
              {langMenu && (
                <div className="cp-lang-menu" role="listbox">
                  {LANGS.map(l => (
                    <button key={l.code} type="button" role="option" aria-selected={l.code === lang} className={l.code === lang ? "is-on" : ""} onClick={() => setLang(l.code)}>
                      <span>{l.flag}</span>{l.label}{l.code === lang && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="cp-icon" aria-label={t.call} title={t.call} onClick={startCall} disabled={streaming}><Phone size={16} strokeWidth={1.9} /></button>
            {!wide && <button type="button" className="cp-icon" aria-label={t.memory} title={t.memory} onClick={() => setShowMemory(true)}><Brain size={16} strokeWidth={1.9} /></button>}
            <button type="button" className="cp-icon" aria-label={t.newChat} title={t.newChat} onClick={newConversation}><SquarePen size={16} strokeWidth={1.9} /></button>
            {!isMobile && (
              <button type="button" className="cp-icon" aria-label="Agrandir" title={expanded ? "Réduire" : "Agrandir"} onClick={() => { setExpanded(v => !v); setShowHistory(false); }}>
                {expanded ? <Minimize2 size={16} strokeWidth={1.9} /> : <Maximize2 size={16} strokeWidth={1.9} />}
              </button>
            )}
            <button type="button" className="cp-icon" aria-label="Fermer" onClick={() => setOpen(false)}><X size={17} strokeWidth={2} /></button>
          </div>
        </header>

        {/* Fil */}
        <div className="cp-thread">
          {loadingConv ? (
            <div className="cp-loading"><Loader2 size={20} className="apv-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="cp-welcome">
              <span aria-hidden className="pc-orb cp-welcome-orb" style={{ ["--orb" as string]: "76px" } as CSSProperties}>
                <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
              </span>
              <h3>{t.hello}{fullName ? ` ${fullName}` : ""} 👋</h3>
              <p>{t.welcome}</p>
              <div className="cp-team-label">{t.team}</div>
              <div className="cp-team">
                {agentsForMe.map((k, i) => {
                  const a = AGENT_META[k]; const Icon = a.icon; const s = SUGGESTIONS[lang][k];
                  return (
                    <button key={k} type="button" className="cp-agent-card" style={{ ["--tone" as string]: a.tone, ["--i" as string]: i } as CSSProperties}
                      onClick={() => { if (k === "analyste") setDeep(true); if (s) send(s); }}>
                      <span className="cp-agent-ico"><Icon size={16} strokeWidth={1.9} /></span>
                      <b>{a.label}</b>
                      <small>{a.desc}</small>
                      {s && <em>« {s} »</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const key = m.id ?? i;
              if (m.role === "user") {
                return (
                  <div key={key} className="cp-row is-user">
                    <div className="cp-bubble is-user">
                      {m.meta?.voice && <span className="cp-voice-tag"><AudioLines size={12} strokeWidth={2} />{t.voiceMsg}</span>}
                      {m.content}
                    </div>
                  </div>
                );
              }
              const agent = m.meta?.agent ? AGENT_META[m.meta.agent.key] : null;
              const AgentIcon = agent?.icon ?? Compass;
              const steps = m.meta?.steps ?? [];
              const todos = m.meta?.todos ?? [];
              const action = m.meta?.action;
              return (
                <div key={key} className="cp-row">
                  <span className="cp-avatar" style={{ ["--tone" as string]: agent?.tone ?? "var(--pal-primary)" } as CSSProperties}><AgentIcon size={14} strokeWidth={2} /></span>
                  <div className="cp-assist">
                    {agent && <div className="cp-agent-tag" style={{ ["--tone" as string]: agent.tone } as CSSProperties}>{m.meta!.agent!.label}</div>}
                    {(steps.length > 0 || todos.length > 0) && (
                      <details className="cp-steps" open={m.streaming}>
                        <summary><ListChecks size={13} strokeWidth={2} />{todos.length ? `${todos.filter(x => x.status === "completed").length}/${todos.length}` : steps.length} {t.steps}{m.streaming && <Loader2 size={12} className="apv-spin" />}</summary>
                        {todos.length > 0 && (
                          <ul className="cp-todos">
                            {todos.map((td, j) => (
                              <li key={j} className={`is-${td.status}`}>
                                {td.status === "completed" ? <CircleCheck size={13} /> : td.status === "in_progress" ? <Loader2 size={13} className="apv-spin" /> : <Circle size={13} />}
                                {td.content}
                              </li>
                            ))}
                          </ul>
                        )}
                        {steps.length > 0 && <ul className="cp-step-list">{steps.map((s, j) => <li key={j} className={s.sub ? "is-sub" : ""}>{s.label}</li>)}</ul>}
                      </details>
                    )}
                    {action ? (
                      <div className="cp-action">
                        <div className="cp-action-title"><Zap size={13} strokeWidth={2} />{t.proposed} · {action.label}</div>
                        <div className="cp-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(action.summary) }} />
                        {action.status === "pending" && (
                          <div className="cp-action-btns">
                            <button type="button" className="btn-c btn-c-sm btn-c-primary" onClick={() => confirmAction(action.id)}><Check size={13} strokeWidth={2.4} />{t.confirm}</button>
                            <button type="button" className="btn-c btn-c-sm btn-c-ghost" onClick={() => cancelAction(action.id)}>{t.cancel}</button>
                          </div>
                        )}
                        {action.status === "confirming" && <div className="cp-action-st"><Loader2 size={13} className="apv-spin" />{t.executing}</div>}
                        {action.status === "confirmed" && <div className="cp-action-st ok"><CircleCheck size={13} />{t.done}</div>}
                        {(action.status === "cancelled" || action.status === "expired") && <div className="cp-action-st">{t.cancelled}</div>}
                        {action.status === "failed" && <div className="cp-action-st err">{action.error ?? "Échec."}</div>}
                      </div>
                    ) : (
                      <div className="cp-bubble">
                        {m.content
                          ? <div className="cp-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                          : <span className="cp-typing"><i /><i /><i /></span>}
                        {m.streaming && m.content && <span className="cp-caret" />}
                      </div>
                    )}
                    {!m.streaming && m.content && (
                      <div className="cp-msg-tools">
                        <button type="button" className="cp-icon sm" aria-label={t.copy} title={t.copy} onClick={() => { navigator.clipboard?.writeText(m.content); flash("✓ " + t.copy); }}><Copy size={13} /></button>
                        <button type="button" className={speakingId === key ? "cp-icon sm is-on" : "cp-icon sm"} aria-label={t.listen} title={t.listen} onClick={() => toggleListen(m, key)}>
                          {speakingId === key ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      </div>
                    )}
                    {m.note && <div className="cp-note"><Brain size={12} strokeWidth={2} />{t.remembered} : {m.note}</div>}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Saisie */}
        <div className="cp-composer">
          {recording ? (
            <div className="cp-recbar">
              <button type="button" className="cp-icon" aria-label={t.cancel} onClick={() => stopVoiceMessage(false)}><Trash2 size={16} /></button>
              <span className="cp-rec-dot" />
              <span className="cp-rec-time">{String(Math.floor(recSecs / 60)).padStart(2, "0")}:{String(recSecs % 60).padStart(2, "0")}</span>
              <div className="cp-wave" aria-hidden>
                {Array.from({ length: 22 }).map((_, j) => (
                  <i key={j} style={{ transform: `scaleY(${0.15 + recording.level * (0.4 + 0.6 * Math.abs(Math.sin(j * 1.7 + recSecs)))})` }} />
                ))}
              </div>
              <button type="button" className="cp-send" aria-label="Envoyer" onClick={() => stopVoiceMessage(true)}><Send size={15} strokeWidth={2} /></button>
            </div>
          ) : (
            <>
              <div className="cp-chips">
                <button type="button" className={deep ? "cp-chip is-on" : "cp-chip"} aria-pressed={deep} onClick={() => setDeep(v => !v)} disabled={!agentsForMe.includes("analyste")}>
                  <Sparkles size={13} strokeWidth={2} />{t.deep}
                </button>
                {transcribing && <span className="cp-chip is-muted"><Loader2 size={12} className="apv-spin" />Transcription…</span>}
              </div>
              <div className="cp-inputrow">
                <textarea
                  ref={inputRef} value={input} rows={1} dir={rtl ? "rtl" : "auto"} placeholder={t.ask}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                  onKeyDown={handleKey}
                />
                {input.trim() ? (
                  <button type="button" className="cp-send" onClick={() => send()} disabled={streaming} aria-label="Envoyer"><Send size={15} strokeWidth={2} /></button>
                ) : (
                  <button type="button" className="cp-send is-mic" onClick={startVoiceMessage} disabled={streaming || transcribing} aria-label={t.voiceMsg} title={`${t.voiceMsg} · Darija · FR · EN · AR`}>
                    {transcribing ? <Loader2 size={15} className="apv-spin" /> : <Mic size={16} strokeWidth={2} />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Mémoire */}
        {showMemory && (
          <div className="cp-sheet" role="dialog" aria-label={t.memory}>
            <div className="cp-sheet-head">
              <Brain size={17} strokeWidth={1.9} />
              <b>{t.memory}</b>
              <button type="button" className="cp-icon" aria-label="Fermer" onClick={() => setShowMemory(false)}><X size={16} /></button>
            </div>
            <p className="cp-sheet-hint">{t.memoryHint}</p>
            <form className="cp-mem-add" onSubmit={e => { e.preventDefault(); addMemory(); }}>
              <input value={memoryInput} onChange={e => setMemoryInput(e.target.value)} placeholder={t.addMemory} maxLength={300} />
              <button type="submit" className="cp-icon" aria-label="Ajouter" disabled={!memoryInput.trim()}><Plus size={16} /></button>
            </form>
            <ul className="cp-mem-list">
              {memories.length === 0 && <li className="cp-empty">{t.noMemory}</li>}
              {memories.map(m => (
                <li key={m.id}>
                  <Brain size={13} strokeWidth={1.9} />
                  <span>{m.content}</span>
                  <button type="button" className="cp-icon sm danger" aria-label="Oublier" onClick={() => deleteMemory(m.id)}><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
            {memories.length > 0 && <button type="button" className="btn-c btn-c-sm btn-c-ghost" onClick={clearMemories}>{t.clearAll}</button>}
          </div>
        )}

        {/* Appel vocal temps réel */}
        {call && (() => {
          const last = [...messages].reverse().find(m => m.role === "assistant");
          const step = last?.streaming ? (last.meta?.todos?.find(x => x.status === "in_progress")?.content ?? last.meta?.steps?.[last.meta.steps.length - 1]?.label) : undefined;
          const caption = call.phase === "speaking" && last?.content ? last.content.replace(/[*#`]/g, "").slice(-180) : "";
          const status = call.phase === "connecting" ? "Connexion du micro…"
            : call.phase === "hearing" ? t.listening
            : call.phase === "thinking" ? (step ?? t.thinking)
            : call.phase === "speaking" ? t.speaking : t.listening;
          return (
            <div className={`cp-call is-${call.phase}`}>
              <div className="cp-call-top">
                <span className="cp-call-lang">{LANGS.find(l => l.code === lang)?.flag} {LANGS.find(l => l.code === lang)?.label}</span>
                <span className="cp-call-lang"><Sparkles size={11} /> Deep Agent</span>
              </div>
              <button type="button" className="cp-call-orb" onClick={interruptSpeaking} title="Toucher pour interrompre"
                style={{ ["--lvl" as string]: call.phase === "hearing" || call.phase === "listening" ? call.level : call.phase === "speaking" ? 0.55 : 0.2 } as CSSProperties}>
                <span className="cp-call-ring r1" /><span className="cp-call-ring r2" /><span className="cp-call-ring r3" />
                <span aria-hidden className="pc-orb busy" style={{ ["--orb" as string]: "120px" } as CSSProperties}>
                  <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
                </span>
              </button>
              <div className="cp-call-status" aria-live="polite">{call.muted ? "Micro coupé" : status}</div>
              <div className="cp-call-text">
                {call.interim ? <span className="cp-call-interim">{call.interim}</span>
                  : caption ? <span className="cp-call-caption">{caption}</span>
                  : call.heard ? <span>« {call.heard} »</span> : <span className="cp-call-hint">Parlez naturellement — vous pouvez couper la parole au Copilote à tout moment.</span>}
              </div>
              <div className="cp-call-btns">
                <button type="button" className={call.muted ? "cp-call-btn is-off" : "cp-call-btn"} onClick={toggleMute} aria-label={call.muted ? "Activer le micro" : "Couper le micro"} aria-pressed={call.muted}>
                  {call.muted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button type="button" className="cp-call-btn is-end" onClick={endCall} aria-label={t.endCall}><PhoneOff size={22} /></button>
                <button type="button" className="cp-call-btn" onClick={interruptSpeaking} aria-label="Interrompre" disabled={call.phase !== "speaking" && call.phase !== "thinking"}><Square size={18} /></button>
              </div>
            </div>
          );
        })()}

        {toast && <div className="cp-toast">{toast}</div>}
      </section>
    </div>
  );

  return (
    <>
      {panel && createPortal(panel, document.body)}
      {createPortal(
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? "Fermer le copilote" : "Ouvrir le copilote IPISB"}
          aria-expanded={open}
          className={["cp-launcher pc-launcher", open && "is-open", isMobile && "is-mobile"].filter(Boolean).join(" ")}
          title="Copilote IPISB"
        >
          {open ? <X size={20} strokeWidth={2} /> : (
            <>
              <span aria-hidden className="pc-ripple" /><span aria-hidden className="pc-ripple r2" />
              <span aria-hidden className="pc-orb" style={{ ["--orb" as string]: "42px" } as CSSProperties}>
                <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
              </span>
            </>
          )}
        </button>,
        document.body,
      )}
    </>
  );
}
