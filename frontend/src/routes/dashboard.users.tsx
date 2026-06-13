import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, X, Loader2, UserPlus, Trash2, Search } from "lucide-react";
import { PageHead, DashAvatar } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/users")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "professor"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  created_by: string | null;
  roles: AppRole[];
};

const ALL_ROLES: AppRole[] = ["admin", "professor", "student"];

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  text:    "oklch(34% 0.03 180)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
  pale:    "oklch(94% 0.025 165)",
  cream:   "oklch(97% 0.012 90)",
  success: "oklch(55% 0.14 145)",
};
const sans = '"Manrope", system-ui, sans-serif';

// ── Create Account Modal ──────────────────────────────────────────────────────

type ModalProps = {
  assignedRole: "professor" | "student";
  onClose: () => void;
  onCreated: () => void;
};

function CreateAccountModal({ assignedRole, onClose, onCreated }: ModalProps) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const label = assignedRole === "professor" ? "Professeur" : "Étudiant";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post("/api/users/create", { email, full_name: fullName, password });
      toast.success(`Compte ${label} créé : ${res.email}`);
      onCreated();
      onClose();
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Erreur inconnue";
      // backend returns JSON error detail wrapped in text
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.detail) msg = parsed.detail;
      } catch {
        // leave as-is
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={onBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "oklch(0% 0 0 / .45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: sans,
      }}
    >
      <div style={{
        background: PAL.paper, borderRadius: 16, padding: "32px 36px",
        width: "100%", maxWidth: 440, boxShadow: "0 24px 64px oklch(0% 0 0 / .18)",
        position: "relative",
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: 0, cursor: "pointer", fontSize: 18, color: PAL.muted, lineHeight: 1 }}
        >
          ✕
        </button>

        <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: PAL.ink }}>
          Créer un compte {label}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: PAL.muted }}>
          Le compte sera immédiatement actif avec le mot de passe fourni.
        </p>

        <form onSubmit={handleSubmit}>
          <ModalField label="Nom complet" type="text" value={fullName} onChange={setFullName} placeholder="Amina El Khattabi" />
          <ModalField label="Adresse e-mail" type="email" value={email} onChange={setEmail} placeholder="prenom.nom@ipisb.ma" />
          <ModalField label="Mot de passe temporaire" type="password" value={password} onChange={setPassword} placeholder="Min. 8 caractères" />

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: "11px 0", borderRadius: 999, fontFamily: sans, fontSize: 13,
                fontWeight: 600, cursor: "pointer",
                background: "transparent", border: `1px solid ${PAL.line}`, color: PAL.muted,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 2, padding: "11px 0", borderRadius: 999, fontFamily: sans, fontSize: 13,
                fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                background: PAL.ink, border: 0, color: PAL.paper,
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? "Création…" : `Créer le compte ${label}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalField({ label, type = "text", placeholder, value, onChange }: {
  label: string; type?: string; placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        style={{
          width: "100%", padding: "10px 14px",
          background: PAL.cream, border: `1px solid ${PAL.line}`,
          borderRadius: 10, fontFamily: sans, fontSize: 14,
          color: PAL.ink, outline: "none", boxSizing: "border-box" as const,
        }}
      />
    </div>
  );
}

// ── Users Page ────────────────────────────────────────────────────────────────

function UsersPage() {
  const { t, lang } = useI18n();
  const { user, roles, loading: authLoading } = useAuth();
  const [rows,       setRows]       = useState<Row[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busyId,     setBusyId]     = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal,  setShowModal]  = useState(false);
  const [q,          setQ]          = useState("");

  const isAdmin = roles.includes("admin");
  const isProf  = roles.includes("professor");

  const canCreateRole: "professor" | "student" | null = isAdmin
    ? "professor"
    : isProf
    ? "student"
    : null;

  async function load() {
    setLoading(true);
    try {
      const data: Row[] = await api.get("/api/users");
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!authLoading) load(); }, [authLoading]);

  async function addRole(userId: string, role: AppRole) {
    if (!isAdmin) return;
    setBusyId(userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("users.role_added"));
    load();
  }

  async function removeRole(userId: string, role: AppRole) {
    if (!isAdmin) return;
    if (userId === user?.id && role === "admin") { toast.error(t("users.cannot_remove_self_admin")); return; }
    setBusyId(userId);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("users.role_removed"));
    load();
  }

  async function deleteUser(userId: string, email: string | null) {
    if (!isAdmin) return;
    if (userId === user?.id) { toast.error("Impossible de supprimer votre propre compte"); return; }
    if (!window.confirm(`Supprimer définitivement le compte ${email ?? userId} ?`)) return;
    setDeletingId(userId);
    try {
      await api.delete(`/api/users/${userId}`);
      toast.success(`Compte supprimé : ${email}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(r =>
        (r.full_name ?? "").toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle))
    : rows;

  const roleColor = (r: AppRole) =>
    r === "admin"
      ? "bg-gradient-brand text-white"
      : r === "professor"
      ? "bg-primary/15 text-primary"
      : "bg-muted text-foreground/70";

  const pageTitle = isAdmin
    ? t("users.title")
    : "Mes Étudiants";
  const pageSubtitle = isAdmin
    ? t("users.subtitle")
    : "Les étudiants que vous avez créés";

  const btnLabel = canCreateRole === "professor"
    ? "Créer un compte Professeur"
    : canCreateRole === "student"
    ? "Créer un compte Étudiant"
    : null;

  return (
    <>
      {showModal && canCreateRole && (
        <CreateAccountModal
          assignedRole={canCreateRole}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}

<div>
        <PageHead
          eyebrow={
            isAdmin
              ? (lang === "fr" ? "Administration" : lang === "ar" ? "الإدارة" : "Administration")
              : (lang === "fr" ? "Encadrement" : lang === "ar" ? "الإشراف" : "Mentoring")
          }
          title={pageTitle}
          sub={pageSubtitle}
          actions={
            <>
              <div className="relative">
                <span className="absolute top-1/2 flex -translate-y-1/2" style={{ insetInlineStart: 12, color: "var(--pal-muted)" }}>
                  <Search size={15} strokeWidth={1.7} />
                </span>
                <input
                  className="input-c"
                  style={{ paddingInlineStart: 36, width: 230 }}
                  placeholder={lang === "fr" ? "Rechercher un utilisateur…" : lang === "ar" ? "ابحث عن مستخدم…" : "Search a user…"}
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>
              {btnLabel && (
                <button type="button" onClick={() => setShowModal(true)} className="btn-c btn-c-primary">
                  <UserPlus size={15} strokeWidth={1.7} />
                  {btnLabel}
                </button>
              )}
            </>
          }
        />

        {!loading && isAdmin && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { l: lang === "fr" ? "Étudiants" : lang === "ar" ? "الطلبة" : "Students", v: rows.filter(r => r.roles.includes("student")).length },
              { l: lang === "fr" ? "Professeurs" : lang === "ar" ? "الأساتذة" : "Professors", v: rows.filter(r => r.roles.includes("professor")).length },
              { l: lang === "fr" ? "Administrateurs" : lang === "ar" ? "المشرفون" : "Admins", v: rows.filter(r => r.roles.includes("admin")).length },
              { l: lang === "fr" ? "Comptes" : lang === "ar" ? "الحسابات" : "Accounts", v: rows.length },
            ].map(s => (
              <div key={s.l} className="dash-card" style={{ padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "var(--pal-muted)", fontWeight: 600, fontFamily: sans }}>{s.l}</div>
                <div className="stat-num" style={{ fontSize: 30 }}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="dash-card" style={{ overflow: "hidden" }}>
          {loading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("users.empty")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {lang === "fr" ? "Aucun résultat pour cette recherche." : lang === "ar" ? "لا توجد نتائج لهذا البحث." : "No results for this search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] font-semibold uppercase tracking-[.08em]">{t("users.col.user")}</TableHead>
                  <TableHead className="hidden font-mono text-[11px] font-semibold uppercase tracking-[.08em] md:table-cell">{t("users.col.email")}</TableHead>
                  <TableHead className="font-mono text-[11px] font-semibold uppercase tracking-[.08em]">{t("users.col.roles")}</TableHead>
                  <TableHead className="hidden font-mono text-[11px] font-semibold uppercase tracking-[.08em] lg:table-cell">{t("users.col.created")}</TableHead>
                  {isAdmin && <TableHead className="text-right font-mono text-[11px] font-semibold uppercase tracking-[.08em]">{t("users.col.actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const available = ALL_ROLES.filter(role => !r.roles.includes(role));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <DashAvatar name={r.full_name || r.email || "?"} size={36} tone="mid" />
                          <div style={{ minWidth: 0 }}>
                            <div className="font-medium" style={{ color: "var(--pal-ink)" }}>{r.full_name || "—"}</div>
                            <div className="text-xs text-muted-foreground md:hidden">{r.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{r.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {r.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {r.roles.map(role => (
                            <Badge key={role} className={`${roleColor(role)} gap-1 border-0 hover:opacity-90`}>
                              {t(`dash.role.${role}`)}
                              {isAdmin && (
                                <button type="button" onClick={() => removeRole(r.id, role)} disabled={busyId === r.id} className="ml-0.5 rounded-full hover:bg-black/10">
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground lg:table-cell">{fmt(r.created_at)}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                            {available.length > 0 && (
                              <Select onValueChange={v => addRole(r.id, v as AppRole)} disabled={busyId === r.id}>
                                <SelectTrigger className="h-8 w-auto gap-1 border-dashed text-xs">
                                  <Plus className="h-3 w-3" /><SelectValue placeholder={t("users.add_role")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {available.map(role => <SelectItem key={role} value={role}>{t(`dash.role.${role}`)}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                            {r.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => deleteUser(r.id, r.email)}
                                disabled={deletingId === r.id}
                                title="Supprimer ce compte"
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 30, height: 30, borderRadius: 8, border: `1px solid ${PAL.line}`,
                                  background: "transparent", cursor: deletingId === r.id ? "not-allowed" : "pointer",
                                  color: deletingId === r.id ? PAL.muted : "oklch(55% 0.18 25)",
                                  transition: "background .15s, color .15s",
                                  flexShrink: 0,
                                }}
                                onMouseEnter={e => { if (deletingId !== r.id) { (e.currentTarget as HTMLButtonElement).style.background = "oklch(97% 0.01 25)"; } }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                              >
                                {deletingId === r.id
                                  ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                                  : <Trash2 style={{ width: 13, height: 13 }} />
                                }
                              </button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
