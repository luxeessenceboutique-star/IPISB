import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Home, ListChecks, Check, X, ShieldCheck, GraduationCap, FileText, Users, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ListSkeleton } from "@/components/Skeletons";
import { Odometer } from "@/components/pouls/Odometer";
import { PulseWeek, type PulseDay } from "@/components/pouls/PulseWeek";
import { AgendaGestionPage } from "./dashboard.agenda-gestion";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async () => {
    // Comptable externe (aucun autre rôle métier) : l'Aperçu académique ne le
    // concerne pas — direction immédiate vers son espace comptable exclusif.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const roles = (data ?? []).map((r) => r.role);
    if (roles.length > 0 && roles.every((r) => r === "accountant")) {
      throw redirect({ to: "/dashboard/accounting", search: { tab: "overview", scope: undefined } });
    }
  },
  component: DashboardHome,
});

type AuditEntry = { id: string; action: string; entity_type: string; entity_id: string | null; created_at: string };
type AdminOverview = {
  total_students: number;
  students_by_class: { class_id: string; class_name: string; count: number }[];
  documents_total: number;
  documents_today: number;
  recent_activity: AuditEntry[];
};
type InboxItem = {
  kind: "operation" | "note" | "purchase_request";
  id: string; group: string; label: string; detail: string | null; amount: number | null;
  created_at: string; created_by_name: string; approve_url: string | null; reject_url: string | null;
  four_eyes: boolean;
};
type CalEvent = { id: string; kind: string; title: string; start: string; end: string; people?: string[]; link: string };

const DAY_NAMES = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
const KIND_LABEL: Record<string, string> = { task: "Tâche", leave: "Congé", contract: "Contrat", probation: "Période d'essai", approval: "Validation" };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtMAD = (n: number | null) => (n == null ? "" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MAD");
const card: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

function weekBounds() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  return { days, start: iso(days[0]), end: iso(days[6]), today: iso(now) };
}

function DashboardHome() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isProf = roles.includes("professor");
  const role = isAdmin ? "admin" : isProf ? "professor" : "student";
  const hasHrRole = roles.includes("rh") || roles.includes("assistant_rh");
  const isComptabilite = roles.includes("comptabilite");
  const showAgendaGestion = isAdmin || hasHrRole || isComptabilite;

  type OverviewTab = "apercu" | "agenda-gestion";
  const [tab, setTab] = useState<OverviewTab>("apercu");
  const [unread, setUnread] = useState(0);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [decided, setDecided] = useState<Record<string, "ok" | "no">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const week = useMemo(weekBounds, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("read", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user]);

  // Vue d'ensemble administrative — rafraîchie toutes les 30 s.
  useEffect(() => {
    if (!user || !isAdmin) return;
    setOverviewLoading(true);
    const load = () => api.get("/api/dashboard/admin-overview")
      .then((data: AdminOverview) => setOverview(data))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [user, isAdmin]);

  // File de validation (canal V2) — même source que Comptabilité › Validations.
  useEffect(() => {
    if (!user || !isAdmin) return;
    api.get("/api/approvals/inbox").then((r: { items?: InboxItem[] }) => setInbox(r?.items ?? [])).catch(() => setInbox([]));
  }, [user, isAdmin]);

  // Pouls de la semaine — événements de l'agenda de gestion.
  useEffect(() => {
    if (!user || !showAgendaGestion) return;
    api.get(`/api/agenda-gestion/calendar?start=${week.start}&end=${week.end}`)
      .then((r: { events?: CalEvent[] }) => setEvents(r?.events ?? []))
      .catch(() => setEvents([]));
  }, [user, showAgendaGestion, week.start, week.end]);

  const key = (it: InboxItem) => `${it.kind}:${it.id}`;
  const pending = (inbox ?? []).filter(it => !decided[key(it)]);

  async function approve(it: InboxItem) {
    if (!it.approve_url) return;
    setBusy(key(it));
    try {
      const res = await api.post(it.approve_url, {});
      if (res?.pending_second_approval) toast.success("Première validation enregistrée — en attente d'un second administrateur.");
      else toast.success(`${it.label} validé(e)`);
      setDecided(d => ({ ...d, [key(it)]: "ok" }));
    } catch (err) {
      toast.error((err as Error)?.message ?? "Échec de l'approbation.");
    } finally {
      setBusy(null);
    }
  }

  const pulseDays: PulseDay[] = week.days.map((d, i) => {
    const k = iso(d);
    const dayEvents = events.filter(ev => ev.start <= k && ev.end >= k);
    return {
      label: `${DAY_NAMES[i]} ${d.getDate()}`,
      count: dayEvents.length,
      title: dayEvents.length === 1 ? dayEvents[0].title : undefined,
      past: k < week.today,
      today: k === week.today,
    };
  });
  const todayEvents = events.filter(ev => ev.start <= week.today && ev.end >= week.today);
  const upcoming = events.filter(ev => ev.end >= week.today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0];
  const today = new Date().toLocaleDateString(lang === "ar" ? "ar-MA" : lang === "fr" ? "fr-FR" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const classes = overview?.students_by_class ?? [];
  const maxClass = Math.max(1, ...classes.map(c => c.count));
  const stack = classes.slice(0, 3);
  const stackColors = ["var(--pal-primary)", "var(--pal-mid)", "var(--pal-soft)"];

  return (
    <div className="space-y-6">
      {/* ── En-tête : salutation, copilote, pouls de la semaine ── */}
      <section className="dash-card paper-ecg" aria-label="Bienvenue" style={{ padding: "26px 28px 14px", overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="mono-eyebrow">{today} · {t(`dash.role.${role}`)}</span>
            <h1 className="h-serif page-title" style={{ fontSize: "clamp(36px, 4vw, 54px)", fontWeight: 500, lineHeight: .98, letterSpacing: "-.012em" }}>
              {lang === "fr" ? "Bonjour" : lang === "ar" ? "مرحباً" : "Hello"}
              {firstName ? <>, <em style={{ color: "var(--pal-primary)" }}>{firstName}</em></> : null}.
            </h1>
            <p style={{ color: "var(--pal-muted)", fontSize: 14.5, maxWidth: 560 }}>
              {isAdmin
                ? <>Le pouls de l'institut cette semaine : <strong style={{ color: "var(--pal-ink)" }}>{pending.length} validation{pending.length > 1 ? "s" : ""}</strong> vous attend{pending.length > 1 ? "ent" : ""} et <strong style={{ color: "var(--pal-ink)" }}>{todayEvents.length} événement{todayEvents.length > 1 ? "s" : ""}</strong> aujourd'hui.</>
                : <>Voici un aperçu de votre espace {t(`dash.role.${role}`).toLowerCase()}.</>}
            </p>
          </div>
          <button type="button" className="dash-cmd" style={{ flex: "0 1 380px" }} onClick={() => window.dispatchEvent(new Event("ipisb:open-copilot"))}>
            <span aria-hidden className="pc-orb" style={{ ["--orb" as string]: "40px" } as CSSProperties}>
              <i className="o-glow" /><i className="o-ring" /><i className="o-core" />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, textAlign: "start" }}>
              <span className="mono-eyebrow" style={{ color: "var(--pal-primary)" }}>{lang === "fr" ? "Demandez au Copilote" : "Ask the Copilot"}</span>
              <span className="dash-cmd-txt">
                <span style={{ animationDelay: "0s" }}>« Quelles validations sont urgentes ? »</span>
                <span style={{ animationDelay: "3.2s" }}>« Prépare une demande d'achat »</span>
                <span style={{ animationDelay: "6.4s" }}>« Qui est en congé cette semaine ? »</span>
              </span>
            </span>
            <span className="btn-c btn-c-primary btn-c-sm" style={{ borderRadius: 8 }}>{lang === "fr" ? "Ouvrir" : "Open"}</span>
          </button>
        </div>
        {showAgendaGestion && <div style={{ marginTop: 18 }}><PulseWeek days={pulseDays} /></div>}
      </section>

      {/* ── Onglets Aperçu / Agenda de gestion ── */}
      {showAgendaGestion && (
        <div className="seg-tabs" role="tablist" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 14, background: "oklch(95.5% .012 165)", border: "1px solid var(--pal-line-soft)" }}>
          {([
            { key: "apercu" as const, label: "Aperçu", icon: Home },
            { key: "agenda-gestion" as const, label: t("dash.agendaGestion"), icon: ListChecks },
          ]).map(x => {
            const active = tab === x.key;
            const Icon = x.icon;
            return (
              <button key={x.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(x.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", borderRadius: 10, border: 0, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  background: active ? "var(--pal-paper)" : "transparent", color: active ? "var(--pal-ink)" : "var(--pal-muted)",
                  boxShadow: active ? "0 1px 2px oklch(0% 0 0/.06), 0 6px 16px oklch(30% .03 175/.09)" : "none",
                }}>
                <Icon size={15} strokeWidth={1.7} />{x.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "agenda-gestion" && showAgendaGestion && <AgendaGestionPage />}

      {tab === "apercu" && (
        <>
          {/* ── Constantes de l'institut ── */}
          <section style={card}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="mono-eyebrow">Constantes de l'institut</span>
                <h2 className="h-serif" style={{ fontSize: 28, fontWeight: 600, color: "var(--pal-ink)" }}>Les signes vitaux du jour</h2>
              </div>
            </div>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
              {isAdmin && (
                <div className="dash-card vital">
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mono-eyebrow">Effectifs étudiants</span><span className="vital-tile"><GraduationCap size={16} /></span></div>
                  {overviewLoading && !overview ? <ListSkeleton rows={1} /> : (
                    <>
                      <div className="v"><Odometer value={overview?.total_students ?? 0} label={`${overview?.total_students ?? 0} étudiants`} /></div>
                      {stack.length > 0 && (
                        <>
                          <div className="stackbar" aria-hidden>{stack.map((c, i) => <i key={c.class_id} style={{ flex: c.count, background: stackColors[i], ["--i" as string]: i } as CSSProperties} />)}</div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "var(--pal-muted)" }}>
                            {stack.map((c, i) => <span key={c.class_id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: stackColors[i] }} />{c.class_name} {c.count}</span>)}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {isAdmin && (
                <div className="dash-card vital">
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mono-eyebrow">À valider</span><span className="vital-tile" style={{ background: "oklch(95% .045 80)", color: "oklch(46% .1 65)" }}><ShieldCheck size={16} /></span></div>
                  <div className="v"><Odometer value={pending.length} label={`${pending.length} en attente`} delayIndex={3} /><span className="unit">en attente</span></div>
                  <Link to="/dashboard/accounting" search={{ tab: "validations", scope: undefined }} className="link-c" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--pal-primary)", textDecoration: "none" }}>Ouvrir la file complète →</Link>
                </div>
              )}
              {isAdmin && (
                <div className="dash-card vital">
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mono-eyebrow">Documents générés</span><span className="vital-tile"><FileText size={16} /></span></div>
                  <div className="v"><Odometer value={overview?.documents_total ?? 0} delayIndex={5} /></div>
                  <span style={{ fontSize: 12, color: "var(--pal-muted)" }}>{overview?.documents_today ?? 0} aujourd'hui</span>
                </div>
              )}
              <Link to="/dashboard/notifications" className="dash-card vital" style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="mono-eyebrow">Notifications</span><span className="vital-tile" style={{ background: "oklch(94.5% .03 250)", color: "oklch(42% .1 255)" }}><Bell size={16} /></span></div>
                <div className="v"><Odometer value={unread} delayIndex={8} /><span className="unit">non lues</span></div>
                <span style={{ fontSize: 12, color: "var(--pal-muted)" }}>Les validations urgentes remontent en premier</span>
              </Link>
            </div>
          </section>

          {/* ── File de validation + agenda de la semaine ── */}
          {(isAdmin || showAgendaGestion) && (
            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", alignItems: "start" }}>
              {isAdmin && (
                <section className="dash-card" style={{ ...card, padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="mono-eyebrow">Votre file de validation · canal V2</span>
                      <h2 className="h-serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--pal-ink)" }}>À valider</h2>
                    </div>
                    <span className={pending.length ? "chip-c chip-c-amber" : "chip-c chip-c-green"}>{pending.length ? `${pending.length} en attente` : "Tout est à jour"}</span>
                  </div>
                  {inbox === null ? <ListSkeleton rows={3} /> : (inbox.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--pal-muted)" }}>Aucune demande en attente de votre décision.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {inbox.slice(0, 7).map((it, i) => {
                        const d = decided[key(it)];
                        return (
                          <div key={key(it)} className={"appr" + (d === "ok" ? " ok" : d === "no" ? " no" : "")} style={{ ["--i" as string]: i } as CSSProperties}>
                            <span className="appr-tile">{d === "ok" ? <Check size={16} /> : <ShieldCheck size={16} />}</span>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                              <span className="mono-eyebrow" style={{ letterSpacing: ".08em" }}>{it.group}</span>
                              <strong style={{ fontSize: 13.5, color: "var(--pal-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</strong>
                              <span style={{ fontSize: 12, color: "var(--pal-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {it.created_by_name}{it.amount != null ? ` · ${fmtMAD(it.amount)}` : ""}{it.four_eyes ? " · double validation" : ""}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              {d ? <span className={d === "ok" ? "chip-c chip-c-green" : "chip-c chip-c-red"}>{d === "ok" ? "Validé" : "Refusé"}</span> : (
                                <>
                                  <Link to="/dashboard/accounting" search={{ tab: "validations", scope: undefined }} className="btn-c btn-c-ghost btn-c-sm" aria-label={`Refuser ou examiner ${it.label}`}><X size={14} /></Link>
                                  <button type="button" className="btn-c btn-c-green btn-c-sm" disabled={busy === key(it) || !it.approve_url} onClick={() => approve(it)}>
                                    <Check size={14} /> Valider
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </section>
              )}
              {showAgendaGestion && (
                <section className="dash-card" style={{ ...card, padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="mono-eyebrow">Agenda de gestion</span>
                      <h2 className="h-serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--pal-ink)" }}>Cette semaine</h2>
                    </div>
                    <button type="button" onClick={() => setTab("agenda-gestion")} style={{ border: 0, background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "var(--pal-primary)", fontFamily: "inherit" }}>Tout l'agenda <ChevronRight size={14} /></button>
                  </div>
                  {upcoming.length === 0 ? <p style={{ fontSize: 13, color: "var(--pal-muted)" }}>Aucun événement à venir cette semaine.</p> : (
                    <div className="tl">
                      {upcoming.map((ev, i) => (
                        <div key={ev.id} className={"tl-i" + (ev.start <= week.today && ev.end >= week.today ? " cur" : "")} style={{ ["--i" as string]: i } as CSSProperties}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ font: "600 11px/1 'JetBrains Mono', monospace", color: "var(--pal-muted)" }}>
                              {new Date(ev.start).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            <span className="chip-c chip-c-blue">{KIND_LABEL[ev.kind] ?? ev.kind}</span>
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--pal-ink)", marginTop: 4 }}>{ev.title}</div>
                          {ev.people?.length ? <div style={{ fontSize: 12, color: "var(--pal-muted)" }}>{ev.people.join(", ")}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ── Effectifs par classe + activité récente ── */}
          {isAdmin && overview && (
            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", alignItems: "start" }}>
              <section className="dash-card" style={{ ...card, padding: "20px 22px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="mono-eyebrow">Scolarité</span>
                  <h2 className="h-serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--pal-ink)" }}>Effectifs par classe</h2>
                </div>
                {classes.length === 0 && <p style={{ fontSize: 13, color: "var(--pal-muted)" }}>Aucune classe.</p>}
                {classes.map((c, i) => (
                  <div key={c.class_id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: "var(--pal-ink)" }}>{c.class_name}</span>
                      <span style={{ font: "700 12px/1 'JetBrains Mono', monospace" }}>{c.count}</span>
                    </div>
                    <div className="pouls-bar"><i style={{ width: `${Math.round(c.count / maxClass * 100)}%`, ["--i" as string]: i } as CSSProperties} /></div>
                  </div>
                ))}
              </section>
              <section className="dash-card" style={{ ...card, padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="mono-eyebrow">Journal d'audit</span>
                    <h2 className="h-serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--pal-ink)" }}>Activité récente</h2>
                  </div>
                  <Users size={16} style={{ color: "var(--pal-muted)" }} />
                </div>
                {overview.recent_activity.length === 0 ? <p style={{ fontSize: 13, color: "var(--pal-muted)" }}>Aucune activité récente.</p> : (
                  <div className="tl">
                    {overview.recent_activity.slice(0, 6).map((a, i) => (
                      <div key={a.id} className="tl-i done" style={{ ["--i" as string]: i } as CSSProperties}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <strong style={{ fontSize: 13, color: "var(--pal-ink)" }}>{a.action}</strong>
                          <span style={{ font: "600 11px/1 'JetBrains Mono', monospace", color: "var(--pal-muted)" }}>
                            {new Date(a.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--pal-muted)" }}>{a.entity_type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
