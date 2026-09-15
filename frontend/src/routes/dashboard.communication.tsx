import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone, X, Users, Send, MessageSquare } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";
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
const sans = '"Manrope", system-ui, sans-serif';

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
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(a => (
            <div key={a.id} className="dash-card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: PAL.ink }}>{a.titre}</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: PAL.muted, lineHeight: 1.5 }}>{a.corps}</p>
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.audience_roles.map(r => (
                      <span key={r} className="chip-c" style={{ fontSize: 10 }}>
                        {ROLES.find(x => x.value === r)?.label ?? r}
                      </span>
                    ))}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <Trash2 size={14} strokeWidth={1.7} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Groupes de discussion (liés à une tâche multi-assignés) ──────────────────

function GroupDetailModal({ groupId, groupName, onClose }: { groupId: string; groupName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

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
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 520, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 21, fontWeight: 500, color: PAL.ink, margin: 0, minWidth: 0 }}>{groupName}</h2>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, flexShrink: 0 }}><X size={18} strokeWidth={1.7} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, minHeight: 220 }}>
          {loading ? (
            <div className="shimmer" style={{ height: 90, borderRadius: 10 }} />
          ) : messages.length === 0 ? (
            <div style={{ fontSize: 13, color: PAL.muted, textAlign: "center", padding: "24px 0" }}>Aucun message — lancez la discussion !</div>
          ) : (
            messages.map(m => (
              <div key={m.id} className="dash-card" style={{ padding: "9px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: PAL.ink }}>{m.author_name ?? "—"}</span>
                  <span style={{ fontSize: 10.5, color: PAL.muted, flexShrink: 0 }}>{new Date(m.created_at).toLocaleString("fr-FR")}</span>
                </div>
                <div style={{ fontSize: 13, color: PAL.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" as const }}>{m.text}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Votre message…"
            className="u-input"
            style={{ flex: 1, padding: "10px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
          />
          <button onClick={send} disabled={sending || !text.trim()} className="btn-c btn-c-primary" style={{ flexShrink: 0, opacity: sending ? .6 : 1 }}>
            <Send size={14} strokeWidth={1.8} />
          </button>
        </div>
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
      {openGroup && <GroupDetailModal groupId={openGroup.id} groupName={openGroup.name} onClose={() => setOpenGroup(null)} />}

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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setOpenGroup(g)}
              className="dash-card"
              style={{ padding: "16px 20px", textAlign: "left" as const, cursor: "pointer", border: 0, width: "100%", fontFamily: sans }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquare size={15} strokeWidth={1.8} style={{ color: PAL.primary, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 14.5, color: PAL.ink }}>{g.name}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: PAL.muted }}>
                    {g.members.map(memberLabel).join(", ")}
                  </div>
                  {g.last_message && (
                    <p style={{ margin: "8px 0 0", fontSize: 12.5, color: PAL.ink, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {g.last_message.text}
                    </p>
                  )}
                </div>
                {g.last_message && (
                  <span style={{ fontSize: 10.5, color: PAL.muted, flexShrink: 0 }}>
                    {new Date(g.last_message.created_at).toLocaleDateString("fr-FR")}
                  </span>
                )}
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

      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${PAL.line}` }}>
        {TABS.map(t => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 16px", marginBottom: -1,
                border: "none", borderBottom: active ? `2px solid ${PAL.primary}` : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                fontFamily: sans, fontSize: 13.5, fontWeight: active ? 700 : 600,
                color: active ? PAL.ink : PAL.muted,
              }}
            >
              <Icon size={15} strokeWidth={1.7} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "announcements" ? <AnnouncementsPanel isAdmin={isAdmin} /> : <GroupsPanel />}
    </div>
  );
}
