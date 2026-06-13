import { useEffect, useRef, useState } from "react";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { MessageCircle, X, Send, Paperclip, ChevronDown } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

// ── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg:     "oklch(8% 0.02 175)",
  card:   "oklch(13% 0.025 175)",
  card2:  "oklch(17% 0.03 175)",
  border: "oklch(24% 0.025 175)",
  teal:   "oklch(62% 0.085 170)",
  teal2:  "oklch(72% 0.095 165)",
  paper:  "oklch(97% 0.005 160)",
  muted:  "oklch(64% 0.022 175)",
  green:  "oklch(62% 0.13 145)",
  red:    "oklch(60% 0.18 25)",
};
const sans  = '"Manrope", system-ui, sans-serif';
const mono  = '"JetBrains Mono", ui-monospace, monospace';

// ── Types ─────────────────────────────────────────────────────────────────────
type Lang  = "fr" | "en" | "ar" | "darija";
type Stage = "chat" | "collect_info" | "collect_docs" | "review" | "confirmed";
type DocType = "cin" | "bac" | "photo" | "motivation";

interface Msg {
  role:    "user" | "assistant";
  content: string;
}

interface DocInfo {
  url:      string;
  filename: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LANGS = [
  { code: "fr"     as Lang, flag: "🇫🇷", label: "Français",  sub: "Je parle français",  rtl: false },
  { code: "ar"     as Lang, flag: "🇸🇦", label: "العربية",   sub: "أتحدث العربية",      rtl: true  },
  { code: "en"     as Lang, flag: "🇬🇧", label: "English",   sub: "I speak English",    rtl: false },
  { code: "darija" as Lang, flag: "🇲🇦", label: "الدارجة",   sub: "كنهضر بالدارجة",    rtl: true  },
];

const DOC_LABELS: Record<DocType, string> = {
  cin:        "CIN (Carte d'Identité)",
  bac:        "Certificat Bac",
  photo:      "Photo d'identité",
  motivation: "Lettre de Motivation",
};

// Keywords in bot messages that indicate which doc is being requested
const DOC_KEYWORDS: Record<DocType, RegExp> = {
  cin:        /CIN|carte d.identit[ée]|carte nationale|بطاقة.الهوية|هوية.وطنية/i,
  bac:        /baccal[aé]ur[eé]at|certificat bac|diplôme du bac|باكالوريا|baccalaureate/i,
  photo:      /photo d.identit[ée]|photo récente|photo passeport|صورة.شخصية|identity photo/i,
  motivation: /lettre de motivation|motivation letter|رسالة.التحفيز/i,
};

const STAGE_LABELS: Record<Stage, string> = {
  chat:         "",
  collect_info: "Étape 1/4 — Informations",
  collect_docs: "Étape 2/4 — Documents",
  review:       "Étape 3/4 — Récapitulatif",
  confirmed:    "Étape 4/4 — Confirmé",
};

const WELCOME: Record<Lang, string> = {
  fr:     "Bonjour ! Je suis **Aya**, votre conseillère IPISB 🎓\n\nComment puis-je vous aider ? Je peux vous informer sur nos formations, vous aider à choisir votre filière, ou vous guider dans votre inscription.",
  en:     "Hello! I'm **Aya**, your IPISB advisor 🎓\n\nHow can I help you? I can tell you about our programs, help you choose the right field, or guide you through enrollment.",
  ar:     "مرحباً! أنا **آية**، مستشارتك في معهد IPISB 🎓\n\nكيف يمكنني مساعدتك؟ يمكنني إخبارك عن برامجنا، ومساعدتك في اختيار تخصصك، أو إرشادك في عملية التسجيل.",
  darija: "Mrhba bik! Ana **Aya**, l-mstashara dyalkom f IPISB 🎓\n\nKifach nqder n3awnek? Nqder n7kiwlek 3la formations, n3awnek tkhtarek filière dyalek, wla n3awnek f inscription.",
};

const SUGGESTIONS: Record<Lang, string[]> = {
  fr:     ["Formations disponibles", "Comment s'inscrire ?", "Quel programme choisir ?"],
  en:     ["Available programs", "How to enroll?", "Which program suits me?"],
  ar:     ["البرامج المتاحة", "كيف أسجّل؟", "أي تخصص يناسبني؟"],
  darija: ["Formations disponibles", "Kifach nsejjel?", "Anhi filière?"],
};

const PLACEHOLDER: Record<Lang, string> = {
  fr:     "Posez votre question…",
  en:     "Ask your question…",
  ar:     "اكتب سؤالك هنا…",
  darija: "Kteb so2alek…",
};

// ── Local KB fallback (unchanged from original) ───────────────────────────────
const LOCAL_KB: Record<Lang, { patterns: RegExp[]; answer: string }[]> = {
  fr: [
    {
      patterns: [/inscri/i, /s'inscrire/i, /candidature/i, /dossier/i, /admission/i],
      answer: `**Comment s'inscrire à l'IPISB ?**\n\nContactez-nous directement :\n📞 **+212 632-822898**\n✉️ **contact@ipisb.ma**\n🕐 **Lun–Sam 08:00–18:30**`,
    },
    {
      patterns: [/formation/i, /filière/i, /programme/i],
      answer: `**Nos 3 formations :**\n\n🏥 **Infirmier Polyvalent** — 3 ans\n👩‍⚕️ **Infirmier Auxiliaire** — 2 ans\n🤝 **Aide-Soignant** — 1 an`,
    },
    {
      patterns: [/bonjour/i, /salut/i, /hello/i],
      answer: `Bonjour ! Je suis **Aya**, votre conseillère IPISB 🎓\nComment puis-je vous aider ?`,
    },
  ],
  en: [
    {
      patterns: [/enroll/i, /register/i, /apply/i],
      answer: `**How to enroll?**\n\n📞 +212 632-822898\n✉️ contact@ipisb.ma`,
    },
    {
      patterns: [/hello/i, /hi\b/i],
      answer: `Hello! I'm **Aya**, your IPISB advisor 🎓\nHow can I help?`,
    },
  ],
  ar: [
    {
      patterns: [/تسجيل/i, /أسجل/i],
      answer: `**للتسجيل:**\n📞 822898-632-212+\n✉️ contact@ipisb.ma`,
    },
    {
      patterns: [/مرحبا/i, /أهلا/i],
      answer: `مرحباً! أنا **آية**، مستشارتك في IPISB 🎓`,
    },
  ],
  darija: [
    {
      patterns: [/sejjel/i, /inscription/i],
      answer: `**Kifach tsejjel:**\n📞 822898-632+212\n✉️ contact@ipisb.ma`,
    },
    {
      patterns: [/mrhba/i, /salam/i, /bonjour/i],
      answer: `Mrhba bik! Ana **Aya**, l-mstashara dyalkom f IPISB 🎓`,
    },
  ],
};

const DEFAULT_FALLBACK: Record<Lang, string> = {
  fr:     `Je suis **Aya**, votre conseillère IPISB 🎓\n📞 +212 632-822898 — contact@ipisb.ma`,
  en:     `I'm **Aya**, your IPISB advisor 🎓\n📞 +212 632-822898 — contact@ipisb.ma`,
  ar:     `أنا **آية**، مستشارتك في IPISB 🎓\n📞 822898-632-212+`,
  darija: `Ana **Aya**, mstashara dyalkom f IPISB 🎓\n📞 822898-632+212`,
};

function localFallback(text: string, lang: Lang): string {
  for (const entry of LOCAL_KB[lang]) {
    if (entry.patterns.some(p => p.test(text))) return entry.answer;
  }
  return DEFAULT_FALLBACK[lang];
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function detectRequestedDoc(botMessage: string, uploadedDocs: Record<string, DocInfo> = {}): DocType | null {
  for (const [docType, pattern] of Object.entries(DOC_KEYWORDS)) {
    if (pattern.test(botMessage) && !uploadedDocs[docType]) return docType as DocType;
  }
  return null;
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LangPicker({ onSelect }: { onSelect: (l: Lang) => void }) {
  const [hover, setHover] = useState<Lang | null>(null);
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "28px 20px", gap: 22,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 999,
        background: `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, fontWeight: 800, color: D.paper, fontFamily: mono,
        boxShadow: `0 0 28px oklch(62% 0.085 170 / .45)`,
      }}>A</div>
      <div style={{ textAlign: "center", lineHeight: 1.6 }}>
        <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700, color: D.paper }}>
          Aya — IPISB
        </div>
        <div style={{ fontFamily: sans, fontSize: 12, color: D.muted, marginTop: 6 }}>
          Choisissez votre langue
        </div>
        <div style={{ fontFamily: sans, fontSize: 12, color: D.muted }}>
          Choose your language · اختر لغتك
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        {LANGS.map((l, i) => (
          <button
            key={l.code}
            autoFocus={i === 0}
            onClick={() => onSelect(l.code)}
            onMouseEnter={() => setHover(l.code)}
            onMouseLeave={() => setHover(null)}
            aria-label={`${l.label} — ${l.sub}`}
            className="cw-focus"
            style={{
              background: hover === l.code ? "oklch(20% 0.035 175)" : D.card2,
              border:     hover === l.code ? `1px solid ${D.teal}` : `1px solid ${D.border}`,
              borderRadius: 14, padding: "16px 10px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
              transition: "all .18s",
              boxShadow: hover === l.code ? `0 0 18px oklch(62% 0.085 170 / .22)` : "none",
            }}
          >
            <span style={{ fontSize: 26 }}>{l.flag}</span>
            <span style={{
              fontFamily: sans, fontSize: 14, fontWeight: 700,
              color: hover === l.code ? D.teal2 : D.paper,
              direction: l.rtl ? "rtl" : "ltr", transition: "color .18s",
            }}>{l.label}</span>
            <span style={{
              fontFamily: sans, fontSize: 11, color: D.muted,
              direction: l.rtl ? "rtl" : "ltr",
            }}>{l.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  msg, rtl, isWelcome,
}: {
  msg: Msg; rtl: boolean; isWelcome?: boolean;
}) {
  const isBot = msg.role === "assistant";
  return (
    <div style={{
      display: "flex",
      justifyContent: isBot ? "flex-start" : "flex-end",
      marginBottom: 12, alignItems: "flex-end", gap: 8,
    }}>
      {isBot && (
        <div style={{
          width: 28, height: 28, borderRadius: 999, flexShrink: 0,
          background: `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: D.paper, fontFamily: mono,
          boxShadow: `0 0 12px oklch(62% 0.085 170 / .3)`,
          alignSelf: "flex-start",
        }}>A</div>
      )}
      <div style={{
        maxWidth: isWelcome ? "88%" : "78%",
        background: isBot
          ? D.card2
          : `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
        border:       isBot ? `1px solid ${D.border}` : "none",
        borderRadius: isBot ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
        overflow:     "hidden",
        fontFamily:   sans, fontSize: 13, lineHeight: 1.6, color: D.paper,
        boxShadow:    isBot ? "none" : `0 4px 16px oklch(62% 0.085 170 / .25)`,
        direction:    rtl ? "rtl" : "ltr",
        textAlign:    rtl ? "right" : "left",
      }}>
        {isWelcome && isBot && (
          <img
            src="/aya-banner.png"
            alt="Aya IPISB"
            style={{ width: "100%", display: "block", borderBottom: `1px solid ${D.border}` }}
          />
        )}
        <div style={{
          padding: "10px 14px",
          overflowWrap: "break-word",
          whiteSpace: isBot ? "normal" : "pre-wrap",
        }}>
          {isBot
            ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            : msg.content
          }
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
        background: `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: D.paper, fontFamily: mono,
      }}>A</div>
      <div style={{
        background: D.card2, border: `1px solid ${D.border}`,
        borderRadius: "4px 16px 16px 16px", padding: "12px 16px",
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} className="cw-anim" style={{
            width: 6, height: 6, borderRadius: 999, background: D.teal,
            display: "inline-block",
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}

// ── Document upload button ────────────────────────────────────────────────────
function DocUploadButton({
  docType,
  sessionId,
  onUploaded,
  disabled,
}: {
  docType:   DocType;
  sessionId: string;
  onUploaded: (info: { url: string; filename: string; document_type: DocType }) => void;
  disabled:  boolean;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setProgress(10);

    const fd = new FormData();
    fd.append("session_id", sessionId);
    fd.append("document_type", docType);
    fd.append("file", file);

    try {
      // Simulate progress increments while waiting
      const ticker = setInterval(() => {
        setProgress(p => Math.min(p + 15, 85));
      }, 300);

      const res = await fetch(`${API}/api/chat/upload`, {
        method: "POST",
        body: fd,
      });

      clearInterval(ticker);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setStatus("done");
      onUploaded(data);
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
    }
  }

  const label = DOC_LABELS[docType];
  const colors = {
    idle:      { bg: D.card2, border: D.teal,    text: D.teal2,  btn: "Joindre le fichier" },
    uploading: { bg: D.card2, border: D.border,  text: D.muted,  btn: `Envoi… ${progress}%` },
    done:      { bg: D.card2, border: D.green,   text: D.green,  btn: "Envoyé ✓" },
    error:     { bg: D.card2, border: D.red,     text: D.red,    btn: "Réessayer" },
  };
  const c = colors[status];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          10,
      marginBottom: 10,
      marginLeft:   36,
    }}>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
        style={{ display: "none" }}
        onChange={handleFile}
        disabled={disabled || status === "uploading" || status === "done"}
      />
      <button
        onClick={() => {
          if (status === "done") return;
          // Reset value so re-selecting the same file after an error re-fires onChange
          if (fileRef.current) fileRef.current.value = "";
          fileRef.current?.click();
        }}
        disabled={disabled || status === "uploading" || status === "done"}
        aria-label={`${c.btn} — ${label}`}
        className="cw-focus"
        style={{
          background:   c.bg,
          border:       `1px dashed ${c.border}`,
          borderRadius: 10,
          padding:      "8px 14px",
          cursor:       status === "done" ? "default" : "pointer",
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          fontFamily:   sans,
          fontSize:     12,
          color:        c.text,
          transition:   "all .2s",
          opacity:      status === "uploading" ? 0.7 : 1,
        }}
      >
        {status === "done"
          ? <span style={{ fontSize: 14, color: D.green, fontWeight: 700 }}>✓</span>
          : status === "error"
          ? <span style={{ fontSize: 14, color: D.red, fontWeight: 700 }}>⚠</span>
          : <Paperclip size={15} strokeWidth={1.75} />
        }
        <span>
          <span style={{ fontWeight: 600 }}>{c.btn}</span>
          <span style={{ color: D.muted, marginLeft: 6 }}>— {label}</span>
        </span>
      </button>
    </div>
  );
}

// ── Review summary card ───────────────────────────────────────────────────────
function ReviewCard({
  slots,
  docs,
  onConfirm,
  onCorrect,
}: {
  slots:     Record<string, string>;
  docs:      Record<string, DocInfo>;
  onConfirm: () => void;
  onCorrect: () => void;
}) {
  const slotLabels: Record<string, string> = {
    nom:        "Nom complet",
    telephone:  "Téléphone",
    email:      "Email",
    filiere:    "Filière souhaitée",
    niveau_bac: "Niveau Bac",
    ville:      "Ville",
  };

  return (
    <div style={{
      background:   D.card2,
      border:       `1px solid ${D.teal}`,
      borderRadius: 14,
      padding:      14,
      marginBottom: 12,
      marginLeft:   36,
      fontFamily:   sans,
      fontSize:     12,
      color:        D.paper,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: D.teal2, marginBottom: 10 }}>
        Récapitulatif de votre dossier
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ color: D.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Informations personnelles
        </div>
        {Object.entries(slotLabels).map(([key, label]) =>
          slots[key] ? (
            <div key={key} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
              <span style={{ color: D.muted, minWidth: 110 }}>{label}</span>
              <span style={{ color: D.paper, fontWeight: 600 }}>{slots[key]}</span>
            </div>
          ) : null
        )}
      </div>

      {Object.keys(docs).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: D.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Documents soumis
          </div>
          {Object.entries(docs).map(([docType, info]) => (
            <div key={docType} style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "center" }}>
              <span style={{ color: D.green }}>✓</span>
              <span style={{ color: D.muted, minWidth: 110 }}>{DOC_LABELS[docType as DocType] || docType}</span>
              <span style={{ color: D.paper, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                {info.filename}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onConfirm}
          className="cw-focus"
          style={{
            flex:         1,
            background:   D.green,
            border:       "none",
            borderRadius: 8,
            padding:      "8px 12px",
            cursor:       "pointer",
            fontFamily:   sans,
            fontSize:     13,
            fontWeight:   700,
            color:        D.paper,
            transition:   "opacity .2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Confirmer ✓
        </button>
        <button
          onClick={onCorrect}
          className="cw-focus"
          style={{
            flex:         1,
            background:   "transparent",
            border:       `1px solid ${D.red}`,
            borderRadius: 8,
            padding:      "8px 12px",
            cursor:       "pointer",
            fontFamily:   sans,
            fontSize:     13,
            fontWeight:   700,
            color:        D.red,
            transition:   "opacity .2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Corriger ✗
        </button>
      </div>
    </div>
  );
}

// ── Progress bar in header ────────────────────────────────────────────────────
function StageProgress({ stage }: { stage: Stage }) {
  const label = STAGE_LABELS[stage];
  if (!label) return null;

  const stepMap: Record<Stage, number> = {
    chat:         0,
    collect_info: 1,
    collect_docs: 2,
    review:       3,
    confirmed:    4,
  };
  const step  = stepMap[stage] ?? 0;
  const total = 4;
  const pct   = (step / total) * 100;

  return (
    <div style={{
      padding:    "6px 14px 0",
      flexShrink: 0,
    }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   3,
      }}>
        <span style={{
          fontFamily: sans, fontSize: 11, fontWeight: 600,
          color: stage === "confirmed" ? D.green : D.teal2,
        }}>
          {label}
        </span>
        <span style={{ fontFamily: sans, fontSize: 11, color: D.muted }}>
          {step}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        style={{
          height:       3,
          background:   D.border,
          borderRadius: 999,
          overflow:     "hidden",
          marginBottom: 6,
        }}>
        <div style={{
          height:     "100%",
          width:      `${pct}%`,
          background: stage === "confirmed"
            ? D.green
            : `linear-gradient(90deg, ${D.teal} 0%, ${D.teal2} 100%)`,
          borderRadius: 999,
          transition:   "width .4s ease",
        }} />
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function ChatWidget() {
  const { isMobile } = useBreakpoint();
  const [open,      setOpen]      = useState(false);
  const [lang,      setLang]      = useState<Lang | null>(null);
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [unread,    setUnread]    = useState(0);

  // Registration flow state
  const [stage,     setStage]     = useState<Stage>("chat");
  const [slots,     setSlots]     = useState<Record<string, string>>({});
  const [docs,      setDocs]      = useState<Record<string, DocInfo>>({});
  const [sessionId, setSessionId] = useState<string>("");

  // Which doc is currently being requested (for upload button display)
  const [pendingDoc, setPendingDoc] = useState<DocType | null>(null);
  // Whether the review card has already been shown for the current review stage
  const [reviewShown, setReviewShown] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const rtl = lang === "ar" || lang === "darija";

  // ── Session persistence via localStorage + backend restore ─────────────────
  useEffect(() => {
    const storedId = localStorage.getItem("ipisb_session_id");
    if (storedId) {
      setSessionId(storedId);
      // Restore registration state (stage / slots / docs) from the backend.
      // Fails silently if the backend is down or the session is unknown.
      fetch(`${API}/api/chat/session/${encodeURIComponent(storedId)}`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!data) return;
          if (data.stage) setStage(data.stage as Stage);
          if (data.slots && typeof data.slots === "object") setSlots(data.slots);
          if (data.docs  && typeof data.docs  === "object") setDocs(data.docs);
        })
        .catch(() => { /* backend unavailable — start fresh */ });
    } else {
      const newId = generateSessionId();
      localStorage.setItem("ipisb_session_id", newId);
      setSessionId(newId);
    }
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, pendingDoc, reviewShown]);

  // ── Focus on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setUnread(0);
      if (lang) setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, lang]);

  // ── Detect which doc is requested from the last bot message ────────────────
  useEffect(() => {
    if (stage !== "collect_docs") {
      setPendingDoc(null);
      return;
    }
    const lastBot = messages.slice().reverse().find(m => m.role === "assistant");
    if (lastBot) {
      const detected = detectRequestedDoc(lastBot.content, docs);
      setPendingDoc(detected);
    }
  }, [messages, stage, docs]);

  // ── Reset review card shown when stage changes ──────────────────────────────
  useEffect(() => {
    if (stage !== "review") setReviewShown(false);
  }, [stage]);

  function handleLangSelect(l: Lang) {
    setLang(l);
    setMessages([{ role: "assistant", content: WELCOME[l] }]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Shared SSE streaming core ───────────────────────────────────────────────
  // Posts `history` to /api/chat/stream and streams the reply into the last
  // (empty) assistant message. Handles the leading meta chunk per protocol:
  //   data: {"meta": {stage, slots, docs, session_id}}  then  data: {"text": "…"}
  async function streamChat(history: Msg[], docsOverride?: Record<string, DocInfo>) {
    const res = await fetch(`${API}/api/chat/stream`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        messages:   history.map(m => ({ role: m.role, content: m.content })),
        session_id: sessionId,
        language:   lang ?? "fr",
        stage,
        slots,
        docs:       docsOverride ?? docs,
      }),
    });

    if (!res.ok || !res.body) throw new Error(`Failed: ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full   = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          await reader.cancel().catch(() => {});
          return;
        }
        try {
          const parsed = JSON.parse(payload);

          // Meta chunk — update registration state
          if (parsed.meta) {
            const m = parsed.meta;
            if (m.stage)      setStage(m.stage as Stage);
            if (m.slots)      setSlots(m.slots);
            if (m.docs)       setDocs(m.docs);
            if (m.session_id) {
              setSessionId(m.session_id);
              localStorage.setItem("ipisb_session_id", m.session_id);
            }
            continue;
          }

          // Text chunk — stream into the last bot message
          if (parsed.text) {
            full += parsed.text;
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: full };
              return next;
            });
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }

  // ── Core send function ──────────────────────────────────────────────────────
  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || streaming || !lang) return;
    setInput("");
    setPendingDoc(null);
    // Reset the auto-grown textarea back to a single line
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userMsg: Msg = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      await streamChat(history);
      if (!open) setUnread(u => u + 1);
    } catch (err) {
      console.error("Chat error:", err);
      const fallback = localFallback(text, lang);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: fallback };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  // ── After a doc is uploaded, notify the bot ─────────────────────────────────
  async function handleDocUploaded(info: { url: string; filename: string; document_type: DocType }) {
    const newDocs = { ...docs, [info.document_type]: { url: info.url, filename: info.filename } };
    setDocs(newDocs);
    setPendingDoc(null);

    // Send a synthetic user message to advance the flow
    const label = DOC_LABELS[info.document_type] || info.document_type;
    const confirmText = `[Document envoyé] ${label} : ${info.filename}`;

    const userMsg: Msg = { role: "user", content: confirmText };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      await streamChat(history, newDocs);
    } catch (err) {
      console.error("Post-upload send error:", err);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          role:    "assistant",
          content: `Document **${label}** bien reçu ✓ (${info.filename})`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  // ── Review card actions ─────────────────────────────────────────────────────
  function handleConfirm() {
    setReviewShown(true);
    send("Confirmer");
  }

  function handleCorrect() {
    setReviewShown(true);
    setStage("collect_info");
    send("Je veux corriger mes informations");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ── Escape closes the widget ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  const showReviewCard =
    stage === "review" &&
    !reviewShown &&
    !streaming &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant";

  return (
    <>
      <style>{`
        @keyframes chat-in{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes glow-pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .cw-focus:focus-visible{outline:2px solid ${D.teal2};outline-offset:2px}
        .cw-input:focus{border-color:${D.teal} !important}
        @media (prefers-reduced-motion: reduce){
          .cw-anim{animation:none !important;transition:none !important}
        }
      `}</style>

      {open && (
        <div
          role="dialog"
          aria-label="Chat avec Aya — Conseillère IPISB"
          className="cw-anim"
          style={{
            position: "fixed", zIndex: 1000,
            ...(isMobile
              ? { left: 8, right: 8, bottom: 84, top: 12, width: "auto", height: "auto" }
              : { bottom: 88, right: 24, width: 380, height: 560, maxHeight: "calc(100vh - 112px)" }),
            background: D.bg,
            border: `1px solid ${D.border}`,
            borderRadius: 20,
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 80px oklch(0% 0 0 / .55), 0 0 0 1px oklch(100% 0 0 / .04)",
            overflow: "hidden",
            animation: "chat-in .25s cubic-bezier(.4,0,.2,1)",
          }}>

          {/* Header */}
          <div style={{
            background: D.card,
            borderBottom: `1px solid ${D.border}`,
            flexShrink: 0,
          }}>
            <div style={{
              padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 999,
                background: `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800, color: D.paper, fontFamily: mono,
                flexShrink: 0, boxShadow: `0 0 16px oklch(62% 0.085 170 / .35)`,
              }}>A</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: D.paper }}>Aya</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <span className="cw-anim" style={{
                    width: 6, height: 6, borderRadius: 999, background: D.teal,
                    display: "inline-block", animation: "glow-pulse 2s infinite",
                  }} />
                  <span style={{ fontFamily: sans, fontSize: 11, color: D.muted }}>
                    Conseillère IPISB · En ligne
                  </span>
                </div>
              </div>

              {lang && (
                <button
                  onClick={() => { setLang(null); setMessages([]); setStage("chat"); setSlots({}); setDocs({}); }}
                  title="Changer de langue"
                  aria-label="Changer de langue"
                  className="cw-focus"
                  style={{
                    background: D.card2, border: `1px solid ${D.border}`,
                    borderRadius: 8, padding: "3px 9px", cursor: "pointer",
                    color: D.muted, fontFamily: sans, fontSize: 12,
                    display: "flex", alignItems: "center", gap: 4,
                    transition: "border-color .15s",
                  }}
                >
                  {LANGS.find(l => l.code === lang)?.flag}
                  <ChevronDown size={11} color={D.muted} />
                </button>
              )}

              <button onClick={() => setOpen(false)} aria-label="Fermer le chat" className="cw-focus" style={{
                background: "transparent", border: 0, cursor: "pointer",
                color: D.muted, padding: "4px 6px", borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><X size={16} strokeWidth={2} /></button>
            </div>

            {/* Stage progress bar */}
            {lang && <StageProgress stage={stage} />}
          </div>

          {/* Body */}
          {!lang ? (
            <LangPicker onSelect={handleLangSelect} />
          ) : (
            <>
              {/* Messages */}
              <div
                role="log"
                aria-live="polite"
                aria-busy={streaming}
                aria-label="Messages"
                style={{ flex: 1, overflowY: "auto", padding: "16px 14px", scrollbarWidth: "thin" }}
              >
                {messages.map((m, i) => (
                  <Bubble
                    key={i}
                    msg={m}
                    rtl={rtl}
                    isWelcome={i === 0}
                  />
                ))}

                {/* Typing indicator */}
                {streaming && messages[messages.length - 1]?.content === "" && <TypingIndicator />}

                {/* Document upload button — appears after a doc request in collect_docs stage */}
                {!streaming && pendingDoc && stage === "collect_docs" && sessionId && (
                  <DocUploadButton
                    key={pendingDoc}
                    docType={pendingDoc}
                    sessionId={sessionId}
                    onUploaded={handleDocUploaded}
                    disabled={streaming}
                  />
                )}

                {/* Review card — appears when stage is review */}
                {showReviewCard && (
                  <ReviewCard
                    slots={slots}
                    docs={docs}
                    onConfirm={handleConfirm}
                    onCorrect={handleCorrect}
                  />
                )}

                <div ref={bottomRef} />
              </div>

              {/* Quick suggestions (first message only) */}
              {messages.length <= 1 && stage === "chat" && (
                <div style={{
                  padding: "0 14px 10px",
                  display: "flex", gap: 6, flexWrap: "wrap" as const,
                  justifyContent: rtl ? "flex-end" : "flex-start",
                }}>
                  {SUGGESTIONS[lang].map(s => (
                    <button key={s} onClick={() => send(s)} className="cw-focus" style={{
                      background: D.card2, border: `1px solid ${D.border}`,
                      color: D.teal2, borderRadius: 999, padding: "5px 11px",
                      fontFamily: sans, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      direction: rtl ? "rtl" : "ltr",
                      transition: "border-color .15s, color .15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = D.teal; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = D.border; }}
                    >{s}</button>
                  ))}
                </div>
              )}

              {/* Text input — hidden only while the review card awaits a choice.
                  Shown again after Confirmer/Corriger (reviewShown) so the user
                  is never left without a way to type if the stage stalls. */}
              {(stage !== "review" || reviewShown) && (
                <div style={{
                  padding: "10px 12px", borderTop: `1px solid ${D.border}`,
                  background: D.card, display: "flex", gap: 8,
                  alignItems: "flex-end", flexShrink: 0,
                }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value);
                      // Auto-grow up to maxHeight
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                    }}
                    onKeyDown={handleKey}
                    placeholder={PLACEHOLDER[lang]}
                    aria-label={PLACEHOLDER[lang]}
                    rows={1}
                    dir={rtl ? "rtl" : "ltr"}
                    className="cw-input"
                    style={{
                      flex: 1, background: D.card2, border: `1px solid ${D.border}`,
                      borderRadius: 12, padding: "9px 12px",
                      color: D.paper, fontFamily: sans, fontSize: 13,
                      resize: "none", outline: "none",
                      lineHeight: 1.4, maxHeight: 100, overflowY: "auto",
                      textAlign: rtl ? "right" : "left",
                      transition: "border-color .15s",
                    }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || streaming}
                    aria-label="Envoyer le message"
                    className="cw-focus"
                    style={{
                      width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                      background: input.trim() && !streaming
                        ? `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`
                        : D.border,
                      border: 0, cursor: input.trim() && !streaming ? "pointer" : "default",
                      color: D.paper, fontSize: 16, transition: "background .2s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  ><Send size={15} strokeWidth={2} /></button>
                </div>
              )}

              {/* Review stage hint */}
              {stage === "review" && !reviewShown && (
                <div style={{
                  padding: "8px 14px", borderTop: `1px solid ${D.border}`,
                  background: D.card, flexShrink: 0,
                  fontFamily: sans, fontSize: 11, color: D.muted, textAlign: "center",
                }}>
                  Vérifiez vos informations et cliquez sur Confirmer ou Corriger
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open
          ? "Fermer le chat"
          : `Ouvrir le chat avec Aya${unread > 0 ? ` — ${unread} message(s) non lu(s)` : ""}`}
        aria-expanded={open}
        className="cw-focus"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: open ? 1000 : 50,
          width: 56, height: 56, borderRadius: 999, border: 0, cursor: "pointer",
          background: `linear-gradient(135deg, ${D.teal} 0%, oklch(52% 0.09 175) 100%)`,
          color: D.paper, fontSize: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 24px oklch(62% 0.085 170 / .45)`,
          transition: "transform .2s, box-shadow .2s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        title="Chat avec Aya — Conseillère IPISB"
      >
        {open ? <X size={20} strokeWidth={2} /> : <MessageCircle size={22} strokeWidth={1.75} />}
        {unread > 0 && !open && (
          <span aria-hidden="true" style={{
            position: "absolute", top: -4, right: -4,
            width: 18, height: 18, borderRadius: 999,
            background: "oklch(64% 0.18 25)", color: D.paper,
            fontSize: 10, fontWeight: 700, fontFamily: mono,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unread}</span>
        )}
      </button>
    </>
  );
}
