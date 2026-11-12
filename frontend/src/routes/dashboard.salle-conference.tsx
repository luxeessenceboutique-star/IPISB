import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, MonitorUp, LayoutGrid, MessageSquare, PhoneOff,
  Link2, Users, Clock, Lock, Building2, GraduationCap, Landmark, Briefcase,
  Sparkles, LogIn, Copy, Loader2, Hash,
} from "lucide-react";
import { PageHead, SectionLabel } from "@/components/dashboard/ui";
import { MeetingCopilot, type MeetingApi } from "@/components/meeting/MeetingCopilot";
import { describeMediaError, mediaAvailable } from "@/lib/media";

const STAFF_ROLES = ["admin", "professor", "rh", "assistant_rh", "comptabilite", "cashier", "accountant"];

export const Route = createFileRoute("/dashboard/salle-conference")({
  validateSearch: (s: Record<string, unknown>) => ({
    salle: typeof s.salle === "string" ? s.salle : undefined,
    code: typeof s.code === "string" ? s.code : undefined,
  }),
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", STAFF_ROLES);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: SalleConferencePage,
});

type Room = { key: string; name: string; description: string; restricted: boolean };
type Target = { kind: "room"; room: Room } | { kind: "instant"; code: string };
type Session = { target: Target; token: string; appId: string; room: string; displayName: string };

const ROOM_ICON: Record<string, typeof Building2> = {
  principale: Building2, direction: Landmark, pedagogie: GraduationCap, administration: Briefcase,
};
const CODE_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;

function targetLabel(t: Target) {
  return t.kind === "room" ? t.room.name : `Réunion ${t.code}`;
}
function inviteLink(t: Target) {
  const q = t.kind === "room" ? `salle=${t.room.key}` : `code=${t.code}`;
  return `${window.location.origin}/dashboard/salle-conference?${q}`;
}
async function copy(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); }
  catch { toast.error("Copie impossible — copiez le lien manuellement."); }
}

// ── API Jitsi (8x8 JaaS) ──────────────────────────────────────────────────────
// Chargée à la demande depuis 8x8.vc : elle donne les commandes (micro, caméra,
// partage d'écran…) et les événements (participants) pour notre propre barre.
type JitsiApi = {
  executeCommand: (cmd: string, ...args: unknown[]) => void;
  addListener: (ev: string, fn: (...a: any[]) => void) => void;
  removeListener?: (ev: string, fn: (...a: any[]) => void) => void;
  getNumberOfParticipants: () => number;
  dispose: () => void;
};
declare global { interface Window { JitsiMeetExternalAPI?: new (domain: string, opts: Record<string, unknown>) => JitsiApi } }

const scriptCache = new Map<string, Promise<void>>();
function loadJitsiScript(appId: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  const src = `https://8x8.vc/${appId}/external_api.js`;
  if (!scriptCache.has(src)) {
    scriptCache.set(src, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptCache.delete(src); reject(new Error("script")); };
      document.head.appendChild(s);
    }));
  }
  return scriptCache.get(src)!;
}

function fmtElapsed(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ConferenceRoom({ session, startMuted, onLeave }: {
  session: Session; startMuted: { audio: boolean; video: boolean }; onLeave: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [fallback, setFallback] = useState(false);
  const [joined, setJoined] = useState(false);
  const [people, setPeople] = useState(1);
  const [audioMuted, setAudioMuted] = useState(startMuted.audio);
  const [videoMuted, setVideoMuted] = useState(startMuted.video);
  const [sharing, setSharing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const leftRef = useRef(false);
  const [meetingApi, setMeetingApi] = useState<MeetingApi | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotActive, setCopilotActive] = useState(false);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    onLeave();
  }, [onLeave]);

  useEffect(() => {
    let disposed = false;
    loadJitsiScript(session.appId).then(() => {
      if (disposed || !hostRef.current || !window.JitsiMeetExternalAPI) return;
      const api = new window.JitsiMeetExternalAPI("8x8.vc", {
        roomName: `${session.appId}/${session.room}`,
        jwt: session.token,
        parentNode: hostRef.current,
        width: "100%", height: "100%",
        userInfo: { displayName: session.displayName },
        configOverwrite: {
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          startWithAudioMuted: startMuted.audio,
          startWithVideoMuted: startMuted.video,
          defaultLanguage: "fr",
        },
        interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, SHOW_POWERED_BY: false, MOBILE_APP_PROMO: false },
      });
      apiRef.current = api;
      setMeetingApi(api);
      const count = () => setPeople(Math.max(1, api.getNumberOfParticipants()));
      api.addListener("videoConferenceJoined", () => { setJoined(true); count(); });
      api.addListener("participantJoined", count);
      api.addListener("participantLeft", count);
      api.addListener("audioMuteStatusChanged", (e: { muted: boolean }) => setAudioMuted(e.muted));
      api.addListener("videoMuteStatusChanged", (e: { muted: boolean }) => setVideoMuted(e.muted));
      api.addListener("screenSharingStatusChanged", (e: { on: boolean }) => setSharing(e.on));
      api.addListener("readyToClose", leave);
    }).catch(() => { if (!disposed) setFallback(true); });
    return () => { disposed = true; apiRef.current?.dispose(); apiRef.current = null; setMeetingApi(null); };
  }, [session, startMuted, leave]);

  useEffect(() => {
    if (!joined && !fallback) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [joined, fallback]);

  const cmd = (c: string) => apiRef.current?.executeCommand(c);
  const iframeSrc = `https://8x8.vc/${session.appId}/${session.room}?jwt=${session.token}#userInfo.displayName="${encodeURIComponent(session.displayName)}"&config.prejoinPageEnabled=false&config.disableDeepLinking=true&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_POWERED_BY=false`;

  // Portail sur <body> : un parent animé (page-enter) créerait sinon un bloc
  // conteneur qui enfermerait ce plein écran sous l'en-tête.
  return createPortal(
    <div className="cf-room" role="dialog" aria-label={targetLabel(session.target)}>
      <div className="cf-bar">
        <div className="cf-bar-id">
          <span className="cf-live"><i />En direct</span>
          <div style={{ minWidth: 0 }}>
            <div className="cf-bar-title">{targetLabel(session.target)}</div>
            <div className="cf-bar-meta">
              <span><Clock size={12} strokeWidth={2} />{fmtElapsed(elapsed)}</span>
              {!fallback && <span><Users size={12} strokeWidth={2} />{people} participant{people > 1 ? "s" : ""}</span>}
            </div>
          </div>
        </div>
        <div className="cf-bar-actions">
          {!fallback && (
            <button type="button" className={copilotOpen ? "cf-btn is-copilot is-on" : "cf-btn is-copilot"} onClick={() => setCopilotOpen(v => !v)} aria-pressed={copilotOpen} title="Copilote de réunion">
              <Sparkles size={16} strokeWidth={1.9} /><span>Copilote</span>{copilotActive && <i className="cf-bot-dot" />}
            </button>
          )}
          <button type="button" className="cf-btn" onClick={() => copy(inviteLink(session.target), "Lien d'invitation copié.")} title="Copier le lien d'invitation">
            <Link2 size={16} strokeWidth={1.9} /><span>Inviter</span>
          </button>
          <button type="button" className="cf-btn is-end" onClick={() => { cmd("hangup"); leave(); }}>
            <PhoneOff size={16} strokeWidth={1.9} /><span>Quitter</span>
          </button>
        </div>
      </div>

      <div className="cf-body">
      <div className="cf-stage">
        {fallback ? (
          <iframe src={iframeSrc} title={targetLabel(session.target)}
            allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write; speaker-selection; screen-wake-lock" />
        ) : (
          <>
            <div ref={hostRef} className="cf-host" />
            {!joined && (
              <div className="cf-connecting">
                <span className="cf-orb" />
                <Loader2 size={20} strokeWidth={2} className="apv-spin" />
                Connexion à la salle…
              </div>
            )}
          </>
        )}
      </div>

      {!fallback && (
        <div className={copilotOpen ? "cf-side-wrap" : "cf-side-wrap is-hidden"}>
          <MeetingCopilot api={meetingApi} roomLabel={targetLabel(session.target)} myName={session.displayName}
            onClose={() => setCopilotOpen(false)} onActiveChange={setCopilotActive} />
        </div>
      )}
      </div>

      {!fallback && (
        <div className="cf-dock" aria-label="Contrôles">
          <button type="button" className={audioMuted ? "cf-ctl is-off" : "cf-ctl"} onClick={() => cmd("toggleAudio")} aria-pressed={!audioMuted} title={audioMuted ? "Activer le micro" : "Couper le micro"}>
            {audioMuted ? <MicOff size={19} strokeWidth={1.9} /> : <Mic size={19} strokeWidth={1.9} />}
          </button>
          <button type="button" className={videoMuted ? "cf-ctl is-off" : "cf-ctl"} onClick={() => cmd("toggleVideo")} aria-pressed={!videoMuted} title={videoMuted ? "Activer la caméra" : "Couper la caméra"}>
            {videoMuted ? <VideoOff size={19} strokeWidth={1.9} /> : <Video size={19} strokeWidth={1.9} />}
          </button>
          <button type="button" className={sharing ? "cf-ctl is-on" : "cf-ctl"} onClick={() => cmd("toggleShareScreen")} aria-pressed={sharing} title="Partager l'écran">
            <MonitorUp size={19} strokeWidth={1.9} />
          </button>
          <button type="button" className="cf-ctl" onClick={() => cmd("toggleTileView")} title="Vue mosaïque">
            <LayoutGrid size={19} strokeWidth={1.9} />
          </button>
          <button type="button" className="cf-ctl" onClick={() => cmd("toggleChat")} title="Discussion">
            <MessageSquare size={19} strokeWidth={1.9} />
          </button>
          <button type="button" className="cf-ctl is-end" onClick={() => { cmd("hangup"); leave(); }} title="Quitter">
            <PhoneOff size={19} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Aperçu caméra / micro avant d'entrer ──────────────────────────────────────
function DevicePreview({ mic, cam, onMic, onCam, name }: {
  mic: boolean; cam: boolean; onMic: () => void; onCam: () => void; name: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [level, setLevel] = useState(0);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    if (!mic && !cam) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    const pre = mediaAvailable();
    if (!pre.ok) { setDenied(pre.reason); return; }
    navigator.mediaDevices.getUserMedia({ video: cam, audio: mic }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s; setDenied(null);
      if (videoRef.current && cam) videoRef.current.srcObject = s;
      if (mic && s.getAudioTracks().length) {
        ctx = new AudioContext();
        const an = ctx.createAnalyser(); an.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const loop = () => {
          an.getByteFrequencyData(buf);
          setLevel(Math.min(1, buf.reduce((a, v) => a + v, 0) / buf.length / 70));
          raf = requestAnimationFrame(loop);
        };
        loop();
      }
    }).catch(err => { if (!cancelled) setDenied(describeMediaError(err, cam ? "caméra et micro" : "micro")); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
      stream?.getTracks().forEach(t => t.stop());
      setLevel(0);
    };
  }, [mic, cam]);

  const initials = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "·";

  return (
    <div className="cf-preview">
      <div className="cf-video">
        {cam && !denied ? <video ref={videoRef} autoPlay playsInline muted /> : (
          <div className="cf-video-off">
            <span className="cf-avatar">{initials}</span>
            <small>{denied ?? "Caméra désactivée"}</small>
          </div>
        )}
        <div className="cf-name-tag">{name}</div>
        {mic && !denied && (
          <div className="cf-meter" aria-hidden>
            {[0, 1, 2, 3, 4].map(i => <i key={i} style={{ transform: `scaleY(${0.2 + Math.max(0, level - i * 0.12) * 2})` }} />)}
          </div>
        )}
      </div>
      <div className="cf-preview-ctl">
        <button type="button" className={mic ? "cf-ctl" : "cf-ctl is-off"} onClick={onMic} aria-pressed={mic} title={mic ? "Entrer micro coupé" : "Entrer micro activé"}>
          {mic ? <Mic size={18} strokeWidth={1.9} /> : <MicOff size={18} strokeWidth={1.9} />}
        </button>
        <button type="button" className={cam ? "cf-ctl" : "cf-ctl is-off"} onClick={onCam} aria-pressed={cam} title={cam ? "Entrer caméra coupée" : "Entrer caméra activée"}>
          {cam ? <Video size={18} strokeWidth={1.9} /> : <VideoOff size={18} strokeWidth={1.9} />}
        </button>
        <span className="cf-preview-hint">Vous entrerez {mic ? "micro activé" : "micro coupé"} · {cam ? "caméra activée" : "caméra coupée"}</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function SalleConferencePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [instantCode, setInstantCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(search.code ?? "");
  const [joiningKey, setJoiningKey] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [muted, setMuted] = useState({ audio: false, video: false });

  useEffect(() => {
    api.get("/api/conference-rooms")
      .then((r: Room[]) => setRooms(r ?? []))
      .catch((e: any) => toast.error(e?.message ?? "Erreur lors du chargement des salles."))
      .finally(() => setLoading(false));
  }, []);

  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Participant";

  async function join(target: Target) {
    const key = target.kind === "room" ? target.room.key : target.code;
    setJoiningKey(key);
    try {
      const url = target.kind === "room"
        ? `/api/conference-rooms/${target.room.key}/token`
        : `/api/conference-rooms/instant/${target.code}/token`;
      const res = await api.get(url);
      setMuted({ audio: !mic, video: !cam });
      setSession({ target, token: res.token, appId: res.app_id, room: res.room, displayName: res.display_name ?? displayName });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de rejoindre la salle.");
    } finally {
      setJoiningKey(null);
    }
  }

  async function newInstant() {
    try {
      const { code } = await api.get("/api/conference-rooms/instant/new");
      setInstantCode(code);
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de créer la réunion.");
    }
  }

  function joinByCode() {
    const code = codeInput.trim().toLowerCase().replace(/^.*code=/, "");
    if (!CODE_RE.test(code)) { toast.error("Code invalide — format attendu : xxxx-xxxx-xxxx."); return; }
    join({ kind: "instant", code });
  }

  const leave = useCallback(() => {
    setSession(null);
    navigate({ to: "/dashboard/salle-conference", search: { salle: undefined, code: undefined }, replace: true });
  }, [navigate]);

  if (session) return <ConferenceRoom session={session} startMuted={muted} onLeave={leave} />;

  const highlighted = search.salle;

  return (
    <div>
      <PageHead
        eyebrow="Visioconférence · Jitsi"
        title="Salle de conférence"
        sub="Des salles toujours ouvertes pour le personnel, et des réunions instantanées à partager par lien — vidéo, partage d'écran et discussion."
      />

      <div className="cf-lobby">
        <div className="dash-card cf-card">
          <div className="mono-eyebrow" style={{ marginBottom: 10 }}>Avant d'entrer · vérifiez votre caméra et votre micro</div>
          <DevicePreview mic={mic} cam={cam} onMic={() => setMic(v => !v)} onCam={() => setCam(v => !v)} name={displayName} />
        </div>

        <div className="cf-side">
          <div className="dash-card paper-ecg cf-card cf-instant">
            <span className="cf-instant-ico"><Sparkles size={18} strokeWidth={1.9} /></span>
            <div className="cf-instant-title">Réunion instantanée</div>
            <p className="cf-instant-sub">Créez une salle privée en un clic et partagez son lien avec vos collègues.</p>
            {instantCode ? (
              <div className="cf-code-box">
                <span className="cf-code"><Hash size={14} strokeWidth={2} />{instantCode}</span>
                <div className="cf-code-actions">
                  <button type="button" className="btn-c btn-c-sm btn-c-ghost" onClick={() => copy(inviteLink({ kind: "instant", code: instantCode }), "Lien d'invitation copié.")}>
                    <Copy size={13} strokeWidth={1.9} />Copier le lien
                  </button>
                  <button type="button" className="btn-c btn-c-sm btn-c-primary" disabled={joiningKey === instantCode} onClick={() => join({ kind: "instant", code: instantCode })}>
                    {joiningKey === instantCode ? <Loader2 size={13} className="apv-spin" /> : <LogIn size={13} strokeWidth={1.9} />}Entrer
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-c btn-c-primary" onClick={newInstant}>
                <Video size={15} strokeWidth={1.9} />Nouvelle réunion
              </button>
            )}
          </div>

          <form className="dash-card cf-card cf-join" onSubmit={e => { e.preventDefault(); joinByCode(); }}>
            <div className="cf-instant-title" style={{ fontSize: 14 }}>Rejoindre avec un code</div>
            <div className="cf-join-row">
              <input className="u-input cf-join-input" value={codeInput} onChange={e => setCodeInput(e.target.value)}
                placeholder="xxxx-xxxx-xxxx ou lien" aria-label="Code de réunion" />
              <button type="submit" className="btn-c btn-c-soft" disabled={!codeInput.trim() || !!joiningKey}>
                <LogIn size={14} strokeWidth={1.9} />Rejoindre
              </button>
            </div>
          </form>
        </div>
      </div>

      <SectionLabel>Salles permanentes</SectionLabel>
      {loading ? (
        <div className="cf-rooms">{[0, 1, 2].map(i => <div key={i} className="dash-card shimmer" style={{ height: 170 }} />)}</div>
      ) : (
        <div className="cf-rooms">
          {rooms.map((r, i) => {
            const Icon = ROOM_ICON[r.key] ?? Building2;
            const busy = joiningKey === r.key;
            return (
              <div key={r.key} className={highlighted === r.key ? "dash-card cf-room-card is-target" : "dash-card cf-room-card"} style={{ ["--i" as string]: i } as CSSProperties}>
                <div className="cf-room-top">
                  <span className="cf-room-ico"><Icon size={19} strokeWidth={1.8} /></span>
                  {r.restricted && <span className="chip-c" style={{ fontSize: 10 }}><Lock size={10} strokeWidth={2.2} />Accès restreint</span>}
                </div>
                <div className="cf-room-name">{r.name}</div>
                <p className="cf-room-desc">{r.description}</p>
                <div className="cf-room-foot">
                  <span className="cf-open"><i />Toujours ouverte</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="doc-ibtn" title="Copier le lien" aria-label="Copier le lien" onClick={() => copy(inviteLink({ kind: "room", room: r }), "Lien de la salle copié.")}>
                      <Link2 size={14} strokeWidth={1.9} />
                    </button>
                    <button type="button" className="btn-c btn-c-sm btn-c-primary" disabled={busy} onClick={() => join({ kind: "room", room: r })}>
                      {busy ? <Loader2 size={13} className="apv-spin" /> : <LogIn size={13} strokeWidth={1.9} />}Entrer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
