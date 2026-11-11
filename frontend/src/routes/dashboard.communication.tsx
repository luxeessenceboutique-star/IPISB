import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone, X, Users, Send, MessageSquare, ShieldCheck, GraduationCap, BookOpen, ListChecks, ChevronRight } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint, SegTabs } from "@/components/dashboard/ui";
import { useDeepLinkModal } from "@/lib/deep-link";

export const Route = createFileRoute("/dashboard/communication")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: s.tab === "groups" ? "groups" as const : s.tab === "announcements" ? "announcements" as const : undefined,
  }),
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
  },
  component: CommunicationPage,
});

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
};
const sans = '"Plus Jakarta Sans", system-ui, sans-serif';

const ROLES = [
  { value: "admin", label: "Administrateurs" },
  { value: "professor", label: "Professeurs" },
  { value: "student", label: "Stagiaires" },
];

type Announcement = {
  id: string;
  titre: string;
  corps: string;
  audience_roles: string[];
  created_at: string;
};

type GroupMember = { id: string; full_name: string | null; email: string | null };
type Group = {
  id: string;
  task_id: string;
  name: string;
  created_at: string;
  task_title: string | null;
  task_status: string | null;
  members: GroupMember[];
  last_message: { text: string; created_at: string } | null;
};
type GroupMessage = {
  id: string;
  group_id: string;
  author_id: string | null;
  author_name: string | null;
  text: string;
  created_at: string;
};

function memberLabel(m: GroupMember): string {
  return m.full_name || m.email || "—";
}

const ROLE_ICON: Record<string, typeof Users> = { admin: ShieldCheck, professor: BookOpen, student: GraduationCap };

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

// Teinte stable par personne, dans la gamme de la palette (vert → bleu → ambre).
function hueOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return [175, 195, 215, 245, 150, 70, 30][h % 7];
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function Avatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const h = hueOf(name ?? "");
  return (
    <span className="cm-av" title={name ?? undefined}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(93% 0.04 ${h})`, color: `oklch(38% 0.09 ${h})` }}>
      {initials(name)}
    </span>
  );
}

// ── Annonces ─────────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [audience, setAudience] = useState<string[]>(["admin", "professor", "student"]);
  const [busy, setBusy] = useState(false);

  function toggleRole(role: string) {
    setAudience(a => a.includes(role) ? a.filter(r => r !== role) : [...a, role]);
  }

  async function submit() {
    if (!titre.trim()) { toast.error("Le titre est requis."); return; }
    if (!corps.trim()) { toast.error("Le contenu est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/announcements", { titre, corps, audience_roles: audience });
      toast.success("Annonce publiée !");
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la publication.");
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: 26, fontWeight: 700, color: PAL.ink, margin: "0 0 20px" }}>
            Nouvelle annonce
          </h2>
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 0, lineHeight: 0 }}><X size={20} /></button>
        </div>

        <label style={labelStyle}>Titre *</label>
        <input type="text" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex : Fermeture exceptionnelle" className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }} />

        <label style={labelStyle}>Contenu *</label>
        <textarea value={corps} onChange={e => setCorps(e.target.value)} rows={4} placeholder="Détails de l'annonce…" className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const }} />

        <label style={labelStyle}>Destinataires</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 24 }}>
          {ROLES.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleRole(r.value)}
              className={`chip-c ${audience.includes(r.value) ? "chip-c-green" : ""}`}
              style={{ cursor: "pointer", border: `1px solid ${audience.includes(r.value) ? "transparent" : PAL.line}` }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Publication…" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnouncementsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data: Announcement[] = await api.get("/api/announcements");
      setItems(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!window.confirm("Supprimer cette annonce ?")) return;
    try {
      await api.delete(`/api/announcements/${id}`);
      toast.success("Annonce supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  return (
    <>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionLabel>{items.length} annonce{items.length !== 1 ? "s" : ""}</SectionLabel>
        {isAdmin && (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary btn-c-sm">
            <Plus size={14} strokeWidth={1.7} />Nouvelle annonce
          </button>
        )}
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 26, width: "55%", borderRadius: 8, marginTop: 14 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Megaphone size={28} strokeWidth={1.7} />} text="Aucune annonce pour l'instant." />
        </div>
      ) : (
        <div className="cm-feed">
          {items.map((a, i) => {
            const d = new Date(a.created_at);
            const fresh = Date.now() - d.getTime() < 48 * 3600 * 1000;
            return (
              <article key={a.id} className={fresh ? "cm-ann is-fresh" : "cm-ann"} style={{ ["--i" as string]: i } as React.CSSProperties}>
                <div className="cm-date" aria-hidden>
                  <b>{d.getDate()}</b>
                  <span>{d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span>
                </div>
                <div className="dash-card cm-ann-card">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cm-ann-meta">
                        <Megaphone size={12} strokeWidth={1.9} />
                        <span>{relTime(a.created_at)}</span>
                        {fresh && <span className="chip-c chip-c-green cm-new">Nouveau</span>}
                      </div>
                      <h3 className="cm-ann-title">{a.titre}</h3>
                      <p className="cm-ann-body">{a.corps}</p>
                      <div className="cm-aud">
                        {a.audience_roles.map(r => {
                          const Icon = ROLE_ICON[r] ?? Users;
                          return (
                            <span key={r} className="chip-c">
                              <Icon size={11} strokeWidth={1.9} />{ROLES.find(x => x.value === r)?.label ?? r}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {isAdmin && (
                      <button type="button" onClick={() => remove(a.id)} className="cm-del" aria-label="Supprimer" title="Supprimer">
                        <Trash2 size={14} strokeWidth={1.7} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Groupes de discussion (liés à une tâche multi-assignés) ──────────────────

function GroupDetailModal({ groupId, groupName, members, onClose }: { groupId: string; groupName: string; members: GroupMember[]; onClose: () => void }) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null)); }, []);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, loading]);

  async function load() {
    setLoading(true);
    try {
      setMessages(await api.get(`/api/communication/groups/${groupId}/messages`));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const msg = await api.post(`/api/communication/groups/${groupId}/messages`, { text: t });
      setMessages(ms => [...ms, msg]);
      setText("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop cm-chat">
        <div className="cm-chat-head">
          <span className="cm-chat-ico"><MessageSquare size={17} strokeWidth={1.8} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono-eyebrow">Groupe de tâche · {members.length} membre{members.length !== 1 ? "s" : ""}</div>
            <h2 className="cm-chat-title">{groupName}</h2>
          </div>
          <div className="cm-stack">{members.slice(0, 4).map(m => <Avatar key={m.id} name={memberLabel(m)} size={26} />)}</div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="cm-close"><X size={18} strokeWidth={1.7} /></button>
        </div>

        <div className="cm-thread">
          {loading ? (
            <>
              <div className="shimmer" style={{ height: 42, width: "60%", borderRadius: 14 }} />
              <div className="shimmer" style={{ height: 42, width: "45%", borderRadius: 14, alignSelf: "flex-end" }} />
            </>
          ) : messages.length === 0 ? (
            <div className="cm-empty"><MessageSquare size={22} strokeWidth={1.6} />Aucun message — lancez la discussion !</div>
          ) : (
            messages.map((m, i) => {
              const mine = !!me && m.author_id === me;
              const prev = messages[i - 1];
              const day = new Date(m.created_at).toDateString();
              const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
              const grouped = !newDay && prev && prev.author_id === m.author_id;
              return (
                <div key={m.id} style={{ display: "contents" }}>
                  {newDay && (
                    <div className="cm-day"><span>{new Date(m.created_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span></div>
                  )}
                  <div className={["cm-msg", mine && "is-mine", grouped && "is-grouped"].filter(Boolean).join(" ")}>
                    {!mine && (grouped ? <span className="cm-av-gap" /> : <Avatar name={m.author_name} />)}
                    <div className="cm-bubble">
                      {!mine && !grouped && <div className="cm-author">{m.author_name ?? "—"}</div>}
                      <div className="cm-text">{m.text}</div>
                      <time className="cm-time">{new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form className="cm-compose" onSubmit={e => { e.preventDefault(); send(); }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Votre message…"
            className="u-input"
            aria-label="Message"
          />
          <button type="submit" disabled={sending || !text.trim()} className="btn-c btn-c-primary cm-send" aria-label="Envoyer">
            <Send size={15} strokeWidth={1.9} />
          </button>
        </form>
      </div>
    </div>
  );
}

function GroupsPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);

  async function load() {
    setLoading(true);
    try {
      setGroups(await api.get("/api/communication/groups"));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  useDeepLinkModal(groups.map(g => g.id), id => {
    const g = groups.find(x => x.id === id);
    if (g) setOpenGroup(g);
  });

  return (
    <>
      {openGroup && <GroupDetailModal groupId={openGroup.id} groupName={openGroup.name} members={openGroup.members} onClose={() => { setOpenGroup(null); load(); }} />}

      <SectionLabel>{groups.length} groupe{groups.length !== 1 ? "s" : ""}</SectionLabel>
      <p style={{ margin: "4px 0 14px", fontSize: 12.5, color: PAL.muted, lineHeight: 1.5 }}>
        Un groupe est créé automatiquement dès qu'une tâche compte 2 assignés ou plus (page Tâches) — pour en discuter sans quitter Communication.
      </p>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : groups.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Users size={28} strokeWidth={1.7} />} text="Aucun groupe pour l'instant — assignez une tâche à 2 personnes ou plus pour en créer un." /></div>
      ) : (
        <div className="cm-groups">
          {groups.map((g, i) => (
            <button key={g.id} type="button" onClick={() => setOpenGroup(g)} className="dash-card cm-group" style={{ ["--i" as string]: i } as React.CSSProperties}>
              <div className="cm-group-top">
                <span className="cm-chat-ico"><MessageSquare size={16} strokeWidth={1.8} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cm-group-name">{g.name}</div>
                  {g.task_title && <div className="cm-group-task"><ListChecks size={11} strokeWidth={1.9} />{g.task_title}</div>}
                </div>
                <ChevronRight size={16} strokeWidth={1.8} className="cm-go" />
              </div>
              <div className="cm-preview">
                {g.last_message ? g.last_message.text : <em>Pas encore de message</em>}
              </div>
              <div className="cm-group-foot">
                <div className="cm-stack">
                  {g.members.slice(0, 4).map(m => <Avatar key={m.id} name={memberLabel(m)} size={24} />)}
                  {g.members.length > 4 && <span className="cm-av cm-av-more" style={{ width: 24, height: 24, fontSize: 9.5 }}>+{g.members.length - 4}</span>}
                </div>
                <span className="cm-when">{g.last_message ? relTime(g.last_message.created_at) : `${g.members.length} membres`}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function CommunicationPage() {
  const { tab: searchTab } = Route.useSearch();
  const [tab, setTab] = useState<"announcements" | "groups">(searchTab ?? "announcements");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id).eq("role", "admin");
      setIsAdmin(!!roles?.length);
    });
  }, []);
  useEffect(() => { if (searchTab) setTab(searchTab); }, [searchTab]);

  const TABS: { key: "announcements" | "groups"; label: string; icon: typeof Megaphone }[] = [
    { key: "announcements", label: "Annonces", icon: Megaphone },
    { key: "groups", label: "Groupes", icon: Users },
  ];

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion"
        title="Communication"
        sub="Diffusion interne et discussion d'équipe — annonces ciblées par rôle, et groupes liés aux tâches partagées."
      />

      <SegTabs items={TABS} value={tab} onChange={k => setTab(k)} storageKey="communication" />

      <div className="pouls-pane" key={tab}>
        {tab === "announcements" ? <AnnouncementsPanel isAdmin={isAdmin} /> : <GroupsPanel />}
      </div>
    </div>
  );
}
