import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone, X } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/communication")({
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

function CommunicationPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    load();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id).eq("role", "admin");
      setIsAdmin(!!roles?.length);
    });
  }, []);

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
    <div style={{ fontFamily: sans }}>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}

      <PageHead
        eyebrow="Gestion"
        title="Communication"
        sub="Diffusion interne et communication institutionnelle — messages ciblés par rôle, visibles sur toute la plateforme."
        actions={isAdmin ? (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
            <Plus size={15} strokeWidth={1.7} />Nouvelle annonce
          </button>
        ) : undefined}
      />

      <SectionLabel>{items.length} annonce{items.length !== 1 ? "s" : ""}</SectionLabel>

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
    </div>
  );
}
