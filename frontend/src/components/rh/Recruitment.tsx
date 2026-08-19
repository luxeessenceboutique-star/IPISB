import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Briefcase, UserRound, CalendarClock, Clock, ArrowUpRight, Sparkles, Send, Bot, X, Link2, Linkedin, Globe, FileDown, Eye, Search, Mail, Phone, Calendar, FileText, GraduationCap, Award, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, UploadCloud, Clock3, Languages, MapPin, Home, MessageSquare } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { parseAdContent, renderInline } from "@/lib/adContent";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const iconBtnStyle = { background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 6, padding: "5px 7px", cursor: "pointer", display: "flex" as const };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── Job ads ──────────────────────────────────────────────────────────────

type Ad = { id: string; poste: string; description: string | null; competences: string | null; experience: string | null; contenu: string; is_active: boolean };

function applyUrl(adId: string) {
  return `${window.location.origin}/apply/${adId}`;
}

async function copyApplyLink(ad: Ad) {
  try {
    await navigator.clipboard.writeText(applyUrl(ad.id));
    toast.success("Lien de candidature copié.");
  } catch {
    toast.error("Impossible de copier le lien.");
  }
}

function shareOnLinkedIn(ad: Ad) {
  const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(applyUrl(ad.id))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function AdsPanel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Ad | null }>({ open: false, editing: null });
  const [aiOpen, setAiOpen] = useState(false);

  async function load() {
    setLoading(true);
    try { setAds(await api.get("/api/rh/recruitment/ads")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(a: Ad) {
    if (!window.confirm(`Supprimer l'annonce « ${a.poste} » ?`)) return;
    try { await api.delete(`/api/rh/recruitment/ads/${a.id}`); toast.success("Annonce supprimée."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modal.open && <AdFormModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />}
      {aiOpen && <AiAdGeneratorModal ads={ads} onClose={() => setAiOpen(false)} onSaved={load} />}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={() => setAiOpen(true)} className="btn-c btn-c-soft"><Sparkles size={15} strokeWidth={1.7} />Générer avec l'IA</button>
        <button type="button" onClick={() => setModal({ open: true, editing: null })} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvelle annonce</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : ads.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Briefcase size={26} strokeWidth={1.7} />} text="Aucune annonce." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {ads.map(a => (
            <div key={a.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{a.poste}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>{a.experience || "—"}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: a.is_active ? "var(--pal-good)" : "var(--pal-muted)", background: "var(--pal-pale)" }}>
                {a.is_active ? "Active" : "Inactive"}
              </span>
              <button onClick={() => copyApplyLink(a)} title="Copier le lien de candidature" className="u-ghost" style={{ ...iconBtnStyle, color: PAL.muted }}><Link2 size={14} strokeWidth={1.7} /></button>
              <button onClick={() => shareOnLinkedIn(a)} title="Partager sur LinkedIn" className="u-ghost" style={{ ...iconBtnStyle, color: PAL.muted }}><Linkedin size={14} strokeWidth={1.7} /></button>
              <button onClick={() => setModal({ open: true, editing: a })} title="Modifier" className="u-ghost" style={{ ...iconBtnStyle, color: PAL.muted }}><Pencil size={14} strokeWidth={1.7} /></button>
              <button onClick={() => remove(a)} title="Supprimer" className="u-ghost" style={{ ...iconBtnStyle, color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdFormModal({ editing, onClose, onSaved }: { editing: Ad | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    poste: editing?.poste ?? "", description: editing?.description ?? "", competences: editing?.competences ?? "",
    experience: editing?.experience ?? "", contenu: editing?.contenu ?? "", is_active: editing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.poste.trim() || !form.contenu.trim()) { toast.error("Le poste et le contenu sont requis."); return; }
    setBusy(true);
    try {
      if (editing) await api.patch(`/api/rh/recruitment/ads/${editing.id}`, form);
      else await api.post("/api/rh/recruitment/ads", form);
      toast.success("Annonce enregistrée.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? "Modifier l'annonce" : "Nouvelle annonce"} onClose={onClose}>
      <label style={labelStyle}>Poste *</label>
      <input type="text" value={form.poste} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))} style={fieldStyle} />
      <label style={labelStyle}>Description</label>
      <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={fieldStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Compétences</label>
          <input type="text" value={form.competences} onChange={e => setForm(f => ({ ...f, competences: e.target.value }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Expérience</label>
          <input type="text" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} style={fieldStyle} />
        </div>
      </div>
      <label style={labelStyle}>Contenu de l'annonce *</label>
      <textarea value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} rows={5} style={{ ...fieldStyle, resize: "vertical" as const }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: PAL.ink, marginBottom: 20 }}>
        <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
        Annonce active
      </label>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ── AI ad generator ──────────────────────────────────────────────────────

type ChatMsg = { role: "user" | "assistant"; content: string };

const AI_WELCOME = "Bonjour ! Décrivez-moi le poste à pourvoir (intitulé, missions, compétences recherchées) et je vous proposerai une annonce complète.";

function extractPoste(txt: string): string {
  const match = txt.match(/(?:Titre du poste|Poste)\s*:?\s*([^\n]+)/i) || txt.match(/^#\s*([^\n]+)/m);
  return match ? match[1].trim() : "Nouveau poste";
}

function AiAdGeneratorModal({ ads, onClose, onSaved }: { ads: Ad[]; onClose: () => void; onSaved: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: AI_WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ad, setAd] = useState<{ poste: string; contenu: string } | null>(null);
  const [view, setView] = useState<"preview" | "edit">("preview");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post("/api/rh/recruitment/ads/chat-generate", { messages: history });
      const reply: string = res.reply ?? "";
      setMessages([...history, { role: "assistant", content: reply }]);
      const content = reply.includes("---") ? reply.split("---").slice(-1)[0].trim() : reply;
      setAd(prev => ({ poste: prev?.poste ?? extractPoste(reply), contenu: content }));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la génération.");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!ad?.contenu) return;
    setSaving(true);
    try {
      await api.post("/api/rh/recruitment/ads", {
        poste: ad.poste || "Nouveau poste", contenu: ad.contenu,
        description: null, competences: null, experience: null, is_active: true,
      });
      toast.success("Annonce publiée !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la publication.");
    } finally {
      setSaving(false);
    }
  }

  function selectFromHistory(a: Ad) {
    setAd({ poste: a.poste, contenu: a.contenu });
    setView("preview");
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 18, width: "min(1100px, 95vw)", height: "min(720px, 90vh)", boxShadow: "0 24px 60px rgba(0,0,0,.22)", display: "flex", overflow: "hidden" }}>
        {/* History */}
        <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${PAL.line}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${PAL.line}`, fontFamily: sans, fontSize: 11, fontWeight: 700, color: PAL.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>Historique</div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {ads.length === 0 && <div style={{ padding: 14, fontSize: 12, color: PAL.muted, fontFamily: sans }}>Aucune annonce.</div>}
            {ads.map(a => (
              <div key={a.id} onClick={() => selectFromHistory(a)} className="u-ghost" style={{ padding: "10px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: PAL.ink }}>
                {a.poste}
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${PAL.line}` }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${PAL.line}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pal-pale)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pal-primary)" }}><Bot size={18} strokeWidth={1.7} /></span>
            <div>
              <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: PAL.ink }}>Assistant recrutement</div>
              <div style={{ fontFamily: sans, fontSize: 11.5, color: PAL.muted }}>Décrivez le poste, je rédige l'annonce</div>
            </div>
            <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><X size={18} strokeWidth={1.7} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%",
                padding: "10px 14px", borderRadius: 14, fontFamily: sans, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                background: m.role === "user" ? "var(--pal-ink)" : "var(--pal-pale)",
                color: m.role === "user" ? PAL.paper : PAL.ink,
              }}>{m.content}</div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: 14, background: "var(--pal-pale)" }}>
                <div className="shimmer" style={{ height: 12, width: 100, borderRadius: 999 }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${PAL.line}`, display: "flex", gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ex : Infirmier polyvalent, CDI, expérience bloc opératoire…"
              rows={2}
              style={{ ...fieldStyle, margin: 0, resize: "none" as const, flex: 1 }}
            />
            <button onClick={send} disabled={!input.trim() || loading} className="btn-c btn-c-primary" style={{ alignSelf: "flex-end", opacity: (!input.trim() || loading) ? .5 : 1 }}>
              <Send size={15} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {/* Preview / editor */}
        <div style={{ width: "38%", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${PAL.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--pal-cream)", padding: 3, borderRadius: 8 }}>
              <button onClick={() => setView("preview")} style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: 0, cursor: "pointer", background: view === "preview" ? PAL.paper : "transparent", color: view === "preview" ? "var(--pal-primary-deep)" : PAL.muted }}>Aperçu</button>
              <button onClick={() => setView("edit")} style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: 0, cursor: "pointer", background: view === "edit" ? PAL.paper : "transparent", color: view === "edit" ? "var(--pal-primary-deep)" : PAL.muted }}>Éditer</button>
            </div>
            <button onClick={publish} disabled={saving || !ad?.contenu} className="btn-c btn-c-primary btn-c-sm">{saving ? "…" : "Publier"}</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!ad?.contenu ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: PAL.muted, padding: 30, textAlign: "center" }}>
                <Sparkles size={32} strokeWidth={1.5} style={{ opacity: .3, marginBottom: 14 }} />
                <div style={{ fontFamily: sans, fontSize: 13 }}>L'annonce générée apparaîtra ici.</div>
              </div>
            ) : view === "edit" ? (
              <textarea value={ad.contenu} onChange={e => setAd(a => a ? { ...a, contenu: e.target.value } : a)} style={{ width: "100%", height: "100%", border: 0, padding: 20, fontFamily: sans, fontSize: 13.5, lineHeight: 1.6, resize: "none" as const, outline: "none", boxSizing: "border-box" as const }} />
            ) : (
              <div style={{ padding: 20 }}>
                <input value={ad.poste} onChange={e => setAd(a => a ? { ...a, poste: e.target.value } : a)} style={{ ...fieldStyle, marginTop: 0, fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 20, fontWeight: 600, border: "none", padding: "0 0 8px" }} />
                <AdContentPreview contenu={ad.contenu} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdContentPreview({ contenu }: { contenu: string }) {
  return (
    <>
      {parseAdContent(contenu).map((block, i) => {
        if (block.type === "header") {
          return (
            <h4 key={i} style={{
              fontFamily: sans, fontSize: 13, fontWeight: 700, color: "var(--pal-primary-deep)",
              margin: i === 0 ? "0 0 8px" : "18px 0 8px",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--pal-primary)", flexShrink: 0 }} />
              {block.text}
            </h4>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={i} style={{ margin: "0 0 12px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {block.items.map((item, j) => (
                <li key={j} style={{ display: "flex", gap: 8, fontFamily: sans, fontSize: 13.5, color: PAL.ink, lineHeight: 1.6 }}>
                  <span style={{ color: PAL.muted, flexShrink: 0 }}>—</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 10px", fontFamily: sans, fontSize: 13.5, color: PAL.ink, lineHeight: 1.7 }}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </>
  );
}

// ── Candidates ───────────────────────────────────────────────────────────

type Candidate = {
  id: string; full_name: string; email: string | null; phone: string | null; position: string | null; notes: string | null;
  source?: string | null; applied_ad_id?: string | null; cv_path?: string | null; cv_filename?: string | null;
  education?: string | null; experience_summary?: string | null; skills?: string | null; created_at?: string;
  years_experience?: number | null; languages?: string | null; city?: string | null; address?: string | null;
};

type CandidateComment = { id: string; text: string; created_at: string; author_id: string; author_name: string };

type TimeFilter = "24h" | "7d" | "1m" | "all";
const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "24h", label: "Dernières 24h" }, { key: "7d", label: "7 derniers jours" },
  { key: "1m", label: "Dernier mois" }, { key: "all", label: "Tout" },
];
function timeCutoff(tf: TimeFilter): Date | null {
  const now = Date.now();
  if (tf === "24h") return new Date(now - 24 * 3600 * 1000);
  if (tf === "7d") return new Date(now - 7 * 24 * 3600 * 1000);
  if (tf === "1m") return new Date(now - 30 * 24 * 3600 * 1000);
  return null;
}

function truncate(s: string, n = 46) { return s.length > n ? s.slice(0, n) + "…" : s; }

const PAGE_SIZE = 20;

function Th({ icon, children, align }: { icon?: React.ReactNode; children: React.ReactNode; align?: "right" }) {
  return (
    <th style={{ ...thStyle, textAlign: align ?? "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {icon && <span style={{ color: "var(--pal-primary)", display: "flex" }}>{icon}</span>}
        {children}
      </div>
    </th>
  );
}

function CandidatesPanel() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [promoting, setPromoting] = useState<Candidate | null>(null);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", position: "", city: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [page, setPage] = useState(0);

  async function downloadCv(c: Candidate) {
    try {
      const res = await api.get(`/api/rh/recruitment/candidates/${c.id}/cv-url`);
      if (res.signed_url) window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "CV introuvable.");
    }
  }

  async function uploadCv(c: Candidate, file: File) {
    const fd = new FormData();
    fd.append("cv", file);
    try {
      const res = await fetch(`${API_BASE}/api/rh/recruitment/candidates/${c.id}/cv`, {
        method: "POST", headers: await authHeader(), body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        try { throw new Error(JSON.parse(text).detail || text); } catch (e: any) { throw new Error(e.message || text); }
      }
      const updated: Candidate = await res.json();
      toast.success("CV importé et analysé.");
      setDetail(updated);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'import du CV.");
    }
  }

  async function load() {
    setLoading(true);
    try { setCandidates(await api.get("/api/rh/recruitment/candidates")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.full_name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/candidates", {
        full_name: form.full_name, email: form.email || null, phone: form.phone || null,
        position: form.position || null, city: form.city || null, address: form.address || null,
        notes: form.notes || null,
      });
      toast.success("Candidat ajouté.");
      setForm({ full_name: "", email: "", phone: "", position: "", city: "", address: "", notes: "" });
      setAddOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Candidate) {
    if (!window.confirm(`Supprimer le candidat « ${c.full_name} » ?`)) return;
    try {
      await api.delete(`/api/rh/recruitment/candidates/${c.id}`);
      toast.success("Candidat supprimé.");
      if (detail?.id === c.id) setDetail(null);
      load();
    } catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  const cutoff = timeCutoff(timeFilter);
  const timeFiltered = cutoff ? candidates.filter(c => !c.created_at || new Date(c.created_at) >= cutoff) : candidates;
  const filtered = search.trim()
    ? timeFiltered.filter(c => [c.full_name, c.email, c.phone, c.position, c.notes, c.education, c.experience_summary, c.skills, c.city, c.address]
        .some(v => (v ?? "").toLowerCase().includes(search.toLowerCase())))
    : timeFiltered;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageStart = clampedPage * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, timeFilter]);

  return (
    <div>
      {addOpen && (
        <Modal title="Nouveau candidat" onClose={() => setAddOpen(false)}>
          <label style={labelStyle}>Nom complet *</label>
          <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={fieldStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Téléphone</label><input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={fieldStyle} /></div>
          </div>
          <label style={labelStyle}>Poste visé</label>
          <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} style={fieldStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Ville</label><input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Adresse</label><input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={fieldStyle} /></div>
          </div>
          <label style={labelStyle}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 20 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setAddOpen(false)} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
            <button onClick={create} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Ajouter"}</button>
          </div>
        </Modal>
      )}
      {promoting && <PromoteModal candidate={promoting} onClose={() => setPromoting(null)} onSaved={load} />}
      {detail && (
        <CandidateDetailModal
          candidate={detail}
          onClose={() => setDetail(null)}
          onDownloadCv={downloadCv}
          onUploadCv={uploadCv}
          onPromote={c => { setDetail(null); setPromoting(c); }}
          onDelete={remove}
        />
      )}

      {/* Toolbar: search + time filter + new candidate */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" as const }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: PAL.muted, pointerEvents: "none" }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un candidat…"
            style={{ width: "100%", padding: "8px 12px 8px 30px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
            className="u-input"
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {TIME_FILTERS.map(f => (
            <button key={f.key} type="button" onClick={() => setTimeFilter(f.key)} style={{
              padding: "6px 12px", borderRadius: 999, fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${timeFilter === f.key ? "var(--pal-primary)" : PAL.line}`,
              background: timeFilter === f.key ? "var(--pal-pale)" : "transparent",
              color: timeFilter === f.key ? "var(--pal-primary-deep)" : PAL.muted,
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, fontWeight: 500 }}>
          {loading ? "…" : `${filtered.length} enregistrement${filtered.length !== 1 ? "s" : ""}`}
        </span>
        <button type="button" onClick={() => setAddOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouveau candidat</button>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<UserRound size={26} strokeWidth={1.7} />} text={candidates.length === 0 ? "Aucun candidat." : "Aucun résultat pour ces filtres."} /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: sans, fontSize: 13, minWidth: 1440 }}>
            <thead>
              <tr style={{ background: "var(--pal-cream)", borderBottom: `1px solid ${PAL.line}` }}>
                <Th>#</Th>
                <Th icon={<UserRound size={11} strokeWidth={2} />}>Candidat</Th>
                <Th icon={<Clock3 size={11} strokeWidth={2} />}>Expérience</Th>
                <Th icon={<Award size={11} strokeWidth={2} />}>Compétences</Th>
                <Th icon={<GraduationCap size={11} strokeWidth={2} />}>École</Th>
                <Th icon={<MapPin size={11} strokeWidth={2} />}>Ville</Th>
                <Th icon={<Home size={11} strokeWidth={2} />}>Adresse</Th>
                <Th icon={<Mail size={11} strokeWidth={2} />}>Email</Th>
                <Th icon={<Phone size={11} strokeWidth={2} />}>Téléphone</Th>
                <Th icon={<Briefcase size={11} strokeWidth={2} />}>Poste visé</Th>
                <Th icon={<Link2 size={11} strokeWidth={2} />}>CV</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => setDetail(c)}
                  style={{ borderBottom: `1px solid ${PAL.line}`, cursor: "pointer", transition: "background .12s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--pal-cream)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                >
                  <td style={tdStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 20, padding: "0 5px", borderRadius: 5, border: `1px solid ${PAL.line}`, background: PAL.paper, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5, color: PAL.muted }}>
                      {pageStart + i + 1}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: PAL.ink }}>{c.full_name}</span>
                      {c.source === "public_application" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: "var(--pal-primary-deep)", background: "var(--pal-pale)", whiteSpace: "nowrap" as const }}>
                          <Globe size={10} strokeWidth={1.8} />Via annonce
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: c.years_experience != null || c.experience_summary ? PAL.ink : PAL.muted }} title={c.experience_summary ?? undefined}>
                    {c.years_experience != null && (
                      <span style={{ fontWeight: 700, color: "var(--pal-primary-deep)" }}>{c.years_experience} an{c.years_experience >= 2 ? "s" : ""}</span>
                    )}
                    {c.years_experience != null && c.experience_summary ? " · " : ""}
                    {c.experience_summary ? truncate(c.experience_summary, 40) : (c.years_experience == null ? "—" : "")}
                  </td>
                  <td style={{ ...tdStyle, color: c.skills ? PAL.ink : PAL.muted, maxWidth: 220 }} title={c.skills ?? undefined}>{c.skills ? truncate(c.skills, 44) : "—"}</td>
                  <td style={{ ...tdStyle, color: c.education ? PAL.ink : PAL.muted, maxWidth: 200 }} title={c.education ?? undefined}>{c.education ? truncate(c.education, 40) : "—"}</td>
                  <td style={{ ...tdStyle, color: c.city ? PAL.ink : PAL.muted }}>{c.city || "—"}</td>
                  <td style={{ ...tdStyle, color: c.address ? PAL.ink : PAL.muted, maxWidth: 200 }} title={c.address ?? undefined}>{c.address ? truncate(c.address, 40) : "—"}</td>
                  <td style={{ ...tdStyle, color: c.email ? PAL.ink : PAL.muted }}>{c.email || "—"}</td>
                  <td style={{ ...tdStyle, color: c.phone ? PAL.ink : PAL.muted }}>{c.phone || "—"}</td>
                  <td style={{ ...tdStyle, color: c.position ? PAL.ink : PAL.muted }} title={c.position ?? undefined}>{c.position ? truncate(c.position) : "—"}</td>
                  <td style={tdStyle}>
                    {c.cv_path ? (
                      <button
                        onClick={e => { e.stopPropagation(); setDetail(c); }}
                        title="Voir le résumé extrait par l'IA"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)", fontFamily: sans, fontSize: 12.5, fontWeight: 600, padding: 0 }}
                      >
                        <FileText size={12} strokeWidth={1.8} />Voir
                      </button>
                    ) : <span style={{ color: PAL.muted }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" as const }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button onClick={() => setDetail(c)} title="Voir le détail" className="u-ghost" style={{ ...iconBtnStyle, color: PAL.muted }}><Eye size={13} strokeWidth={1.7} /></button>
                      <button onClick={() => setPromoting(c)} title="Promouvoir" className="u-ghost" style={{ ...iconBtnStyle, color: PAL.muted }}><ArrowUpRight size={13} strokeWidth={1.7} /></button>
                      <button onClick={() => remove(c)} title="Supprimer" className="u-ghost" style={{ ...iconBtnStyle, color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${PAL.line}`, background: "var(--pal-cream)" }}>
              <span style={{ fontFamily: sans, fontSize: 12, color: PAL.muted }}>
                <b style={{ color: PAL.ink }}>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)}</b> sur <b style={{ color: PAL.ink }}>{filtered.length}</b>
              </span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <PageBtn onClick={() => setPage(0)} disabled={clampedPage === 0}><ChevronsLeft size={13} strokeWidth={2} /></PageBtn>
                <PageBtn onClick={() => setPage(p => Math.max(0, p - 1))} disabled={clampedPage === 0}><ChevronLeft size={13} strokeWidth={2} /></PageBtn>
                <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: "var(--pal-primary-deep)", background: "var(--pal-pale)", border: "1px solid var(--pal-primary)", borderRadius: 6, padding: "5px 12px" }}>
                  {clampedPage + 1} / {pageCount}
                </span>
                <PageBtn onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={clampedPage >= pageCount - 1}><ChevronRight size={13} strokeWidth={2} /></PageBtn>
                <PageBtn onClick={() => setPage(pageCount - 1)} disabled={clampedPage >= pageCount - 1}><ChevronsRight size={13} strokeWidth={2} /></PageBtn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="u-ghost" style={{ ...iconBtnStyle, opacity: disabled ? .4 : 1, cursor: disabled ? "not-allowed" : "pointer", color: PAL.ink }}>
      {children}
    </button>
  );
}

const thStyle = { padding: "10px 14px", textAlign: "left" as const, fontFamily: sans, fontWeight: 700, fontSize: 10.5, color: PAL.muted, letterSpacing: ".06em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
const tdStyle = { padding: "10px 14px", fontFamily: sans, fontSize: 13 };

function DetailField({ icon, label, color, children }: { icon: React.ReactNode; label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--pal-cream)", borderRadius: 10, padding: "11px 13px", border: `1px solid ${PAL.line}`, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, color: PAL.muted, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{label}</span>
      </div>
      <div style={{ fontFamily: sans, fontSize: 13, color: PAL.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, paddingLeft: 2 }}>{children}</div>
    </div>
  );
}

function CvUploadZone({ candidate, onUploadCv }: { candidate: Candidate; onUploadCv: (c: Candidate, file: File) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label
      className="u-hover-lift"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", marginTop: 10,
        border: `1.5px dashed ${PAL.line}`, borderRadius: 10, cursor: busy ? "wait" : "pointer", background: "var(--pal-cream)",
      }}
    >
      {busy ? (
        <span style={{ width: 18, height: 18, border: `2px solid ${PAL.line}`, borderTopColor: "var(--pal-primary)", borderRadius: "50%", animation: "spin 1s linear infinite", flexShrink: 0 }} />
      ) : (
        <UploadCloud size={18} strokeWidth={1.6} style={{ color: PAL.muted, flexShrink: 0 }} />
      )}
      <div>
        <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.ink }}>
          {busy ? "Analyse du CV en cours…" : "Aucun CV — importer un CV"}
        </div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: PAL.muted, marginTop: 1 }}>
          PDF, DOCX, JPG ou PNG — extrait automatiquement formation, expérience et compétences
        </div>
      </div>
      <input
        type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" disabled={busy} style={{ display: "none" }}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try { await onUploadCv(candidate, file); } finally { setBusy(false); }
        }}
      />
    </label>
  );
}

function CandidateComments({ candidateId }: { candidateId: string }) {
  const [comments, setComments] = useState<CandidateComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get(`/api/rh/recruitment/candidates/${candidateId}/comments`);
      setComments(data ?? []);
    } catch { /* silent — comments are secondary content */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/rh/recruitment/candidates/${candidateId}/comments`, { text: text.trim() });
      setText("");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout du commentaire.");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/api/rh/recruitment/candidates/${candidateId}/comments/${id}`);
      setComments(cs => cs.filter(cm => cm.id !== id));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <MessageSquare size={13} strokeWidth={1.8} style={{ color: "var(--pal-primary)" }} />
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: PAL.muted, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>
          Commentaires{comments.length > 0 ? ` (${comments.length})` : ""}
        </span>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 40, borderRadius: 10, marginBottom: 12 }} />
      ) : comments.length === 0 ? (
        <div style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted, fontStyle: "italic" as const, marginBottom: 10 }}>
          Aucun commentaire pour l'instant.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 12 }}>
          {comments.map(cm => (
            <div key={cm.id} style={{ background: "var(--pal-cream)", border: `1px solid ${PAL.line}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: PAL.ink }}>{cm.author_name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 10.5, color: PAL.muted }}>
                    {new Date(cm.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button onClick={() => remove(cm.id)} title="Supprimer" style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, display: "flex" }}>
                    <Trash2 size={12} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              <div style={{ fontFamily: sans, fontSize: 13, color: PAL.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" as const }}>{cm.text}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Ajouter un commentaire — impressions d'entretien, avis de l'équipe…"
          rows={2}
          style={{ ...fieldStyle, margin: 0, resize: "vertical" as const, fontSize: 12.5, flex: 1 }}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
        />
        <button
          onClick={submit} disabled={busy || !text.trim()} title="Ajouter (Ctrl/Cmd+Entrée)"
          className="btn-c btn-c-sm btn-c-primary" style={{ flexShrink: 0, opacity: busy || !text.trim() ? .6 : 1 }}
        >
          <Send size={13} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

function CandidateDetailModal({ candidate: c, onClose, onDownloadCv, onUploadCv, onPromote, onDelete }: {
  candidate: Candidate; onClose: () => void;
  onDownloadCv: (c: Candidate) => void; onUploadCv: (c: Candidate, file: File) => void | Promise<void>;
  onPromote: (c: Candidate) => void; onDelete: (c: Candidate) => void;
}) {
  const empty = (v?: string | null) => !v || !v.trim();
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${PAL.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 500, color: PAL.ink }}>{c.full_name}</div>
            {c.source === "public_application" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: "var(--pal-primary-deep)", background: "var(--pal-pale)", marginTop: 4 }}>
                <Globe size={11} strokeWidth={1.8} />Candidature via annonce
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }}><X size={18} strokeWidth={1.7} /></button>
        </div>

        <div style={{ overflowY: "auto", padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <DetailField icon={<Mail size={12} strokeWidth={1.8} />} label="Email" color="var(--pal-primary)">{c.email || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
            <DetailField icon={<Phone size={12} strokeWidth={1.8} />} label="Téléphone" color="var(--pal-good)">{c.phone || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
            <DetailField icon={<Briefcase size={12} strokeWidth={1.8} />} label="Poste visé" color={PAL.muted}>{c.position || <em style={{ color: PAL.muted, fontStyle: "italic" }}>—</em>}</DetailField>
            <DetailField icon={<Calendar size={12} strokeWidth={1.8} />} label="Reçue le" color="var(--pal-warn)">
              {c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}
            </DetailField>
          </div>

          {(!empty(c.city) || !empty(c.address)) && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {!empty(c.city) && (
                <DetailField icon={<MapPin size={12} strokeWidth={1.8} />} label="Ville" color="var(--pal-good)">{c.city}</DetailField>
              )}
              {!empty(c.address) && (
                <DetailField icon={<Home size={12} strokeWidth={1.8} />} label="Adresse" color="var(--pal-good)">{c.address}</DetailField>
              )}
            </div>
          )}

          {(c.years_experience != null || !empty(c.languages)) && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {c.years_experience != null && (
                <DetailField icon={<Clock3 size={12} strokeWidth={1.8} />} label="Années d'expérience" color="var(--pal-warn)">
                  {c.years_experience} an{c.years_experience >= 2 ? "s" : ""}
                </DetailField>
              )}
              {!empty(c.languages) && (
                <DetailField icon={<Languages size={12} strokeWidth={1.8} />} label="Langues" color="var(--pal-good)">{c.languages}</DetailField>
              )}
            </div>
          )}
          {!empty(c.education) && (
            <div style={{ marginTop: 10 }}>
              <DetailField icon={<GraduationCap size={12} strokeWidth={1.8} />} label="Formation" color="var(--pal-primary)">{c.education}</DetailField>
            </div>
          )}
          {!empty(c.experience_summary) && (
            <div style={{ marginTop: 10 }}>
              <DetailField icon={<Briefcase size={12} strokeWidth={1.8} />} label="Expérience" color="var(--pal-primary)">{c.experience_summary}</DetailField>
            </div>
          )}
          {!empty(c.skills) && (
            <div style={{ marginTop: 10 }}>
              <DetailField icon={<Award size={12} strokeWidth={1.8} />} label="Compétences" color="var(--pal-primary)">{c.skills}</DetailField>
            </div>
          )}
          {!empty(c.notes) && (
            <div style={{ marginTop: 10 }}>
              <DetailField icon={<FileText size={12} strokeWidth={1.8} />} label="Notes" color={PAL.muted}>{c.notes}</DetailField>
            </div>
          )}
          {!c.cv_path && <CvUploadZone candidate={c} onUploadCv={onUploadCv} />}

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${PAL.line}` }}>
            <CandidateComments candidateId={c.id} />
          </div>
        </div>

        <div style={{ padding: "14px 22px", borderTop: `1px solid ${PAL.line}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          {c.cv_path && (
            <button onClick={() => onDownloadCv(c)} className="btn-c btn-c-sm btn-c-ghost"><FileDown size={13} strokeWidth={1.7} />Télécharger le CV</button>
          )}
          <button onClick={() => onPromote(c)} className="btn-c btn-c-sm btn-c-ghost"><ArrowUpRight size={13} strokeWidth={1.7} />Promouvoir</button>
          <button onClick={() => onDelete(c)} className="btn-c btn-c-sm" style={{ color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} />Supprimer</button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_REQUIRED_DOCUMENTS = [
  "Copie de la CIN (carte d'identité nationale)",
  "Copie(s) du/des diplôme(s)",
  "CV à jour",
  "2 photos d'identité",
  "RIB (relevé d'identité bancaire)",
  "Certificat médical d'aptitude au travail",
  "Numéro CNSS (si déjà affilié)",
  "Attestation(s) de travail des postes précédents (le cas échéant)",
];

function PromoteModal({ candidate, onClose, onSaved }: { candidate: Candidate; onClose: () => void; onSaved: () => void }) {
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [position, setPosition] = useState(candidate.position ?? "");
  const [probationDays, setProbationDays] = useState(30);
  const [documents, setDocuments] = useState(DEFAULT_REQUIRED_DOCUMENTS.join("\n"));
  const [busy, setBusy] = useState(false);

  const probationEnd = new Date(new Date(hireDate).getTime() + probationDays * 86400000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  async function submit() {
    setBusy(true);
    try {
      const required_documents = documents.split("\n").map(d => d.trim()).filter(Boolean);
      await api.post(`/api/rh/recruitment/candidates/${candidate.id}/promote`, {
        hire_date: hireDate, position: position || null, required_documents,
        probation_duration_days: probationDays,
      });
      toast.success(
        candidate.email
          ? `${candidate.full_name} promu en employé — email de confirmation envoyé.`
          : `${candidate.full_name} promu en employé (pas d'email en dossier, aucun email envoyé).`
      );
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Promouvoir ${candidate.full_name}`} onClose={onClose}>
      <label style={labelStyle}>Date d'embauche</label>
      <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={fieldStyle} />
      <label style={labelStyle}>Poste</label>
      <input type="text" value={position} onChange={e => setPosition(e.target.value)} style={fieldStyle} />
      <label style={labelStyle}>Durée de la période d'essai</label>
      <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4 }}>
        {[30, 60, 90].map(d => (
          <button key={d} type="button" onClick={() => setProbationDays(d)} style={{
            flex: 1, padding: "9px 0", borderRadius: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${probationDays === d ? "var(--pal-primary)" : PAL.line}`,
            background: probationDays === d ? "var(--pal-pale)" : "transparent",
            color: probationDays === d ? "var(--pal-primary-deep)" : PAL.muted,
          }}>{d} jours</button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: PAL.muted, marginBottom: 16 }}>Se termine le {probationEnd}.</div>
      <label style={labelStyle}>Documents requis (un par ligne — envoyés dans l'email de bienvenue)</label>
      <textarea value={documents} onChange={e => setDocuments(e.target.value)} rows={6} style={{ ...fieldStyle, resize: "vertical" as const, fontSize: 12.5, lineHeight: 1.6 }} />
      <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: -10, marginBottom: 20 }}>
        {candidate.email ? `Un email de bienvenue sera envoyé à ${candidate.email}.` : "Aucun email en dossier pour ce candidat — l'email ne sera pas envoyé."}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Promouvoir"}</button>
      </div>
    </Modal>
  );
}

// ── Interviews ───────────────────────────────────────────────────────────

type Interviewer = { id: string; full_name: string };
type Interview = { id: string; candidate_id: string; candidate_name: string | null; recruiter_id: string | null; recruiter_name: string | null; date: string; start_time: string; end_time: string; type: string; status: string };
type Slot = { id: string; date: string; start_time: string; end_time: string; status: string };
const INTERVIEW_TYPES = [{ value: "rh", label: "RH" }, { value: "technical", label: "Technique" }, { value: "final", label: "Final" }];
const INTERVIEW_STATUS: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", completed: "Terminé", cancelled: "Annulé" };

function slotLabel(s: Slot) {
  return `${new Date(s.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
}

function InterviewsPanel() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ candidate_id: "", slot_id: "", type: "rh", meet_link: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setInterviews(await api.get("/api/rh/recruitment/interviews")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  async function loadSlots() {
    try { setSlots(await api.get("/api/rh/recruitment/slots")); } catch { /* ignore */ }
  }
  useEffect(() => { load(); loadSlots(); }, []);
  useEffect(() => { api.get("/api/rh/recruitment/candidates").then(setCandidates).catch(() => {}); }, []);

  const availableSlots = slots.filter(s => s.status !== "reserved");

  async function submit() {
    if (!form.candidate_id) { toast.error("Sélectionnez un candidat."); return; }
    const slot = availableSlots.find(s => s.id === form.slot_id);
    if (!slot) { toast.error("Sélectionnez un créneau."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/interviews", {
        candidate_id: form.candidate_id, slot_id: slot.id,
        date: slot.date, start_time: slot.start_time, end_time: slot.end_time,
        type: form.type, meet_link: form.meet_link || null, notes: form.notes || null,
      });
      toast.success("Entretien planifié.");
      setModalOpen(false);
      setForm(f => ({ ...f, candidate_id: "", slot_id: "" }));
      load();
      loadSlots();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(i: Interview, status: string) {
    try { await api.patch(`/api/rh/recruitment/interviews/${i.id}/status?status=${status}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function remove(i: Interview) {
    if (!window.confirm("Supprimer cet entretien ?")) return;
    try { await api.delete(`/api/rh/recruitment/interviews/${i.id}`); toast.success("Entretien supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modalOpen && (
        <Modal title="Nouvel entretien" onClose={() => setModalOpen(false)}>
          <label style={labelStyle}>Candidat *</label>
          <select value={form.candidate_id} onChange={e => setForm(f => ({ ...f, candidate_id: e.target.value }))} style={fieldStyle}>
            <option value="">— Sélectionner —</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <label style={labelStyle}>Créneau *</label>
          {availableSlots.length === 0 ? (
            <div style={{ ...fieldStyle, color: PAL.muted, fontSize: 12.5, display: "flex", alignItems: "center" }}>
              Aucun créneau disponible — créez-en un dans l'onglet « Créneaux ».
            </div>
          ) : (
            <select value={form.slot_id} onChange={e => setForm(f => ({ ...f, slot_id: e.target.value }))} style={fieldStyle}>
              <option value="">— Sélectionner un créneau —</option>
              {availableSlots.map(s => <option key={s.id} value={s.id}>{slotLabel(s)}</option>)}
            </select>
          )}
          <label style={labelStyle}>Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={fieldStyle}>
            {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label style={labelStyle}>Lien visio</label>
          <input type="text" value={form.meet_link} onChange={e => setForm(f => ({ ...f, meet_link: e.target.value }))} style={{ ...fieldStyle, marginBottom: 20 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModalOpen(false)} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
            <button onClick={submit} disabled={busy || availableSlots.length === 0} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: (busy || availableSlots.length === 0) ? "not-allowed" : "pointer", opacity: (busy || availableSlots.length === 0) ? .6 : 1 }}>{busy ? "…" : "Planifier"}</button>
          </div>
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary"><Plus size={15} strokeWidth={1.7} />Nouvel entretien</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : interviews.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<CalendarClock size={26} strokeWidth={1.7} />} text="Aucun entretien planifié." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {interviews.map(i => (
            <div key={i.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{i.candidate_name || "—"}</div>
                <div style={{ fontSize: 12, color: PAL.muted }}>
                  {INTERVIEW_TYPES.find(t => t.value === i.type)?.label} · {new Date(i.date).toLocaleDateString("fr-FR")} {i.start_time}-{i.end_time}
                </div>
              </div>
              <select value={i.status} onChange={e => setStatus(i, e.target.value)} className="u-input" style={{ padding: "6px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12, background: PAL.paper }}>
                {Object.entries(INTERVIEW_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={() => remove(i)} title="Supprimer" className="u-ghost" style={{ ...iconBtnStyle, color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slots ────────────────────────────────────────────────────────────────

function SlotsPanel() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "09:30" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setSlots(await api.get("/api/rh/recruitment/slots")); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addSlot() {
    setBusy(true);
    try {
      await api.post("/api/rh/recruitment/slots", [form]);
      toast.success("Créneau ajouté.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Slot) {
    try { await api.delete(`/api/rh/recruitment/slots/${s.id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      <div className="dash-card" style={{ padding: 18, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div><label style={labelStyle}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <div><label style={labelStyle}>Début</label><input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <div><label style={labelStyle}>Fin</label><input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0 }} /></div>
        <button type="button" onClick={addSlot} disabled={busy} className="btn-c btn-c-primary" style={{ opacity: busy ? 0.6 : 1 }}><Plus size={14} strokeWidth={1.7} />Ajouter</button>
      </div>
      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : slots.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Clock size={26} strokeWidth={1.7} />} text="Aucun créneau." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {slots.map(s => (
            <div key={s.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>
                {new Date(s.date).toLocaleDateString("fr-FR")} · {s.start_time}-{s.end_time}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: s.status === "reserved" ? "var(--pal-warn)" : "var(--pal-good)", background: "var(--pal-pale)" }}>
                {s.status === "reserved" ? "Réservé" : "Libre"}
              </span>
              <button onClick={() => remove(s)} title="Supprimer" className="u-ghost" style={{ ...iconBtnStyle, color: "var(--pal-danger)" }}><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────

type SubTab = "ads" | "candidates" | "interviews" | "slots";
const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "ads", label: "Annonces" }, { key: "candidates", label: "Candidats" },
  { key: "interviews", label: "Entretiens" }, { key: "slots", label: "Créneaux" },
];

export function RhRecruitment() {
  const [subtab, setSubtab] = useState<SubTab>("ads");

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
        {SUBTABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSubtab(t.key)} style={{
            padding: "6px 14px", borderRadius: 999, border: `1px solid ${subtab === t.key ? "var(--pal-primary)" : PAL.line}`,
            background: subtab === t.key ? "var(--pal-pale)" : "transparent", cursor: "pointer",
            fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: subtab === t.key ? "var(--pal-primary-deep)" : PAL.muted,
          }}>{t.label}</button>
        ))}
      </div>
      {subtab === "ads" && <AdsPanel />}
      {subtab === "candidates" && <CandidatesPanel />}
      {subtab === "interviews" && <InterviewsPanel />}
      {subtab === "slots" && <SlotsPanel />}
    </div>
  );
}
