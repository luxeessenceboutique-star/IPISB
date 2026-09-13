import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, CalendarClock, Trash2, ChevronLeft, ChevronRight, Check, X, CalendarDays, List, FileText, Paperclip, Ban } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { usePermissions } from "@/lib/permissions";
import { useDeepLinkFocus } from "@/lib/deep-link";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

// Taxonomie officielle : 6 types de congé demandables, chacun avec un code
// et une couleur distincte pour le calendrier. "Travail" (T, vert) n'est pas
// un type demandable — c'est un marqueur calendrier pour les jours sans congé
// — et "Annulé" (C, bleu) est un statut appliqué à une demande déjà approuvée,
// pas un type (voir STATUS_LABEL / statusColor).
const TYPES = [
  { value: "recovery", code: "R", label: "Récupération / Compensatoire", color: "#8b5cf6", text: "#fff", border: false },
  { value: "sick", code: "M", label: "Maladie", color: "#eab308", text: "#1a1a1a", border: false },
  { value: "unpaid", code: "CS", label: "Congé sans solde", color: "#f97316", text: "#fff", border: false },
  { value: "permission", code: "P", label: "Permission / Absence autorisée", color: "#6b7280", text: "#fff", border: false },
  { value: "other", code: "A", label: "Autre", color: "#ffffff", text: "#1a1a1a", border: true },
  { value: "unjustified_absence", code: "AJ", label: "Absence injustifiée", color: "#ef4444", text: "#fff", border: false },
];
const WORK_MARKER = { code: "T", label: "Travail", color: "#16a34a", text: "#fff", border: false };
const CANCELLED_MARKER = { code: "C", label: "Congé annulé", color: "#3b82f6", text: "#fff", border: false };

function typeInfo(type: string) {
  return TYPES.find(t => t.value === type) ?? { value: type, code: "?", label: type, color: PAL.muted, text: "#fff", border: false };
}

// Le code/couleur affiché sur une demande annulée est celui du statut
// "Annulé" (bleu), pas celui de son type d'origine.
function displayInfo(l: Leave) {
  return l.status === "cancelled" ? CANCELLED_MARKER : typeInfo(l.type);
}

const STATUS_LABEL: Record<string, string> = { pending: "En attente", approved: "Approuvé", rejected: "Refusé", cancelled: "Annulé" };

type Leave = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  document_path?: string | null;
  document_filename?: string | null;
};

type Balance = {
  annual_total: number; annual_used: number;
  sick_total: number; sick_used: number;
  personal_total: number; personal_used: number;
};

const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function statusColor(status: string) {
  if (status === "approved") return "var(--pal-good)";
  if (status === "rejected") return "var(--pal-danger)";
  if (status === "cancelled") return CANCELLED_MARKER.color;
  return "var(--pal-warn)";
}

function FormModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    employee_id: "", type: "other",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    days: "1", reason: "",
  });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const docRequired = form.type !== "unjustified_absence";

  async function submit() {
    if (!form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    const days = parseInt(form.days, 10);
    if (!days || days <= 0) { toast.error("Le nombre de jours doit être positif."); return; }
    setBusy(true);
    try {
      const created = await api.post("/api/rh/leaves", {
        employee_id: form.employee_id, type: form.type,
        start_date: form.start_date, end_date: form.end_date,
        days, reason: form.reason || null,
      });
      if (docFile) {
        const fd = new FormData();
        fd.append("document", docFile);
        try {
          await api.uploadFile(`/api/rh/leaves/${created.id}/document`, fd);
        } catch {
          toast.error("Demande créée, mais l'envoi du document a échoué — vous pourrez le joindre depuis la fiche.");
        }
      }
      toast.success("Demande de congé créée !");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
          Nouvelle demande de congé
        </h2>

        <label style={labelStyle}>Employé *</label>
        <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className="u-input" style={fieldStyle}>
          <option value="">— Sélectionner —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>

        <label style={labelStyle}>Type de congé</label>
        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="u-input" style={fieldStyle}>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.code} — {t.label}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Du</label>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Au</label>
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="u-input" style={fieldStyle} />
          </div>
        </div>

        <label style={labelStyle}>Nombre de jours</label>
        <input type="number" min="1" value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} className="u-input" style={fieldStyle} />

        <label style={labelStyle}>Motif</label>
        <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const }} />

        <label style={labelStyle}>Document justificatif {docRequired ? "(requis)" : "(non requis)"}</label>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setDocFile(e.target.files?.[0] ?? null)} className="u-input" style={{ ...fieldStyle, marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : "Créer la demande"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BalanceRow({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: PAL.muted }}>{label}</span>
        <span style={{ color: PAL.ink, fontWeight: 600 }}>{used} / {total} j</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "var(--pal-pale)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "var(--pal-primary)" }} />
      </div>
    </div>
  );
}

function LeaveCalendar({ leaves }: { leaves: Leave[] }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function leavesOnDay(day: Date) {
    const t = day.getTime();
    return leaves.filter(l => {
      const s = new Date(l.start_date + "T00:00:00").getTime();
      const e = new Date(l.end_date + "T00:00:00").getTime();
      return t >= s && t <= e;
    });
  }

  const todayStr = new Date().toDateString();
  const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="dash-card" style={{ padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="btn-c btn-c-sm btn-c-ghost">
            <ChevronLeft size={14} strokeWidth={1.7} />
          </button>
          <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 600, color: PAL.ink, textTransform: "capitalize" as const, minWidth: 170, textAlign: "center" as const }}>
            {monthLabel}
          </div>
          <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="btn-c btn-c-sm btn-c-ghost">
            <ChevronRight size={14} strokeWidth={1.7} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", maxWidth: 460 }}>
          {[WORK_MARKER, ...TYPES, CANCELLED_MARKER].map(t => (
            <div key={t.code} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: PAL.muted, fontFamily: sans }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                background: t.color, color: t.text, fontSize: 8.5, fontWeight: 800,
                border: t.border ? `1px solid ${PAL.line}` : "none",
              }}>{t.code}</span>
              {t.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: PAL.line, border: `1px solid ${PAL.line}`, borderRadius: 12, overflow: "hidden" }}>
        {weekdayLabels.map(w => (
          <div key={w} style={{ background: "var(--pal-cream)", padding: "8px 6px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: PAL.muted, textAlign: "center" as const, fontFamily: sans }}>
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ background: PAL.paper, minHeight: 92 }} />;
          const dayLeaves = leavesOnDay(day);
          const isToday = day.toDateString() === todayStr;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div key={i} style={{ background: PAL.paper, minHeight: 92, padding: "6px 6px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{
                fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? "var(--pal-primary-deep)" : PAL.ink,
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "50%", background: isToday ? "var(--pal-pale)" : "transparent",
              }}>
                {day.getDate()}
              </span>
              {dayLeaves.length === 0 && !isWeekend ? (
                <div title="Travail" style={{
                  fontSize: 10, fontWeight: 700, color: WORK_MARKER.text, background: WORK_MARKER.color,
                  borderRadius: 5, padding: "2px 6px", width: "fit-content", opacity: 0.75,
                }}>
                  {WORK_MARKER.code}
                </div>
              ) : dayLeaves.slice(0, 3).map(l => {
                const info = displayInfo(l);
                return (
                  <div key={l.id} title={`${l.employee_name ?? ""} — ${info.code} ${typeInfo(l.type).label}${l.status === "pending" ? " (en attente)" : l.status === "cancelled" ? " (annulé)" : ""}`} style={{
                    fontSize: 10.5, fontWeight: 600, color: info.text, background: info.color,
                    borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    opacity: l.status === "pending" ? 0.6 : 1,
                    border: info.border ? `1px solid ${PAL.line}` : "none",
                    textDecoration: l.status === "cancelled" ? "line-through" : "none",
                  }}>
                    <b>{info.code}</b> {l.employee_name ?? "—"}
                  </div>
                );
              })}
              {dayLeaves.length > 3 && (
                <div style={{ fontSize: 10, color: PAL.muted, fontWeight: 600 }}>+{dayLeaves.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RhLeaves() {
  const { can } = usePermissions();
  // Canal 2 : RH/assistant_rh créent et consultent ; seul un admin (V2)
  // approuve/rejette/annule/supprime une demande de congé.
  const canValidate = can("rh.leaves", "validate_v2");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [calendarLeaves, setCalendarLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Leave | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const { focusId, attachFocus } = useDeepLinkFocus();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (status) params.set("status", status);
      const res = await api.get(`/api/rh/leaves?${params.toString()}`);
      setLeaves(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendar() {
    try {
      const res = await api.get("/api/rh/leaves?page_size=500");
      setCalendarLeaves((res.items ?? []).filter((l: Leave) => l.status !== "rejected"));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement du calendrier.");
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, page]);
  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (view === "calendar") loadCalendar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  // Deep-link depuis un rappel (?focus=<leaveId>) : ouvre d'office le volet de
  // détail de la demande visée (le défilement + le nettoyage d'URL sont gérés
  // par attachFocus posé sur la ligne).
  useEffect(() => {
    if (!focusId || view !== "list") return;
    const l = leaves.find(x => x.id === focusId);
    if (l) setSelected(l);
  }, [focusId, leaves, view]);

  useEffect(() => {
    if (!selected) { setBalance(null); return; }
    api.get(`/api/rh/leaves/balance/${selected.employee_id}`).then(setBalance).catch(() => setBalance(null));
  }, [selected]);

  async function review(l: Leave, decision: "approved" | "rejected") {
    try {
      await api.patch(`/api/rh/leaves/${l.id}/review?status=${decision}`);
      toast.success(decision === "approved" ? "Demande approuvée." : "Demande refusée.");
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du traitement.");
    }
  }

  async function remove(l: Leave) {
    if (!window.confirm("Supprimer cette demande de congé ?")) return;
    try {
      await api.delete(`/api/rh/leaves/${l.id}`);
      toast.success("Demande supprimée.");
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function cancelLeave(l: Leave) {
    if (!window.confirm("Annuler ce congé déjà approuvé ?")) return;
    try {
      await api.patch(`/api/rh/leaves/${l.id}/cancel`);
      toast.success("Congé annulé.");
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'annulation.");
    }
  }

  async function viewDocument(l: Leave) {
    try {
      const res = await api.get(`/api/rh/leaves/${l.id}/document-url`);
      window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible d'ouvrir le document.");
    }
  }

  async function uploadDocument(l: Leave, file: File) {
    const fd = new FormData();
    fd.append("document", file);
    try {
      const updated = await api.uploadFile(`/api/rh/leaves/${l.id}/document`, fd);
      toast.success("Document ajouté.");
      setSelected(updated);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi du document.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modalOpen && <FormModal employees={employees} onClose={() => setModalOpen(false)} onSaved={load} />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--pal-cream)", padding: 3, borderRadius: 10 }}>
          <button type="button" onClick={() => setView("list")} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: 0, cursor: "pointer",
            fontFamily: sans, fontSize: 12.5, fontWeight: 600,
            background: view === "list" ? PAL.paper : "transparent",
            color: view === "list" ? "var(--pal-primary-deep)" : PAL.muted,
            boxShadow: view === "list" ? "0 1px 2px rgba(0,0,0,.06)" : "none",
          }}><List size={13} strokeWidth={1.8} />Liste</button>
          <button type="button" onClick={() => setView("calendar")} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: 0, cursor: "pointer",
            fontFamily: sans, fontSize: 12.5, fontWeight: 600,
            background: view === "calendar" ? PAL.paper : "transparent",
            color: view === "calendar" ? "var(--pal-primary-deep)" : PAL.muted,
            boxShadow: view === "calendar" ? "0 1px 2px rgba(0,0,0,.06)" : "none",
          }}><CalendarDays size={13} strokeWidth={1.8} />Calendrier</button>
        </div>
        {view === "list" && (
          <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
            <option value="">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvé</option>
            <option value="rejected">Refusé</option>
            <option value="cancelled">Annulé</option>
          </select>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle demande
        </button>
      </div>

      {view === "calendar" ? (
        <LeaveCalendar leaves={calendarLeaves} />
      ) : (
        <>
      <SectionLabel>{total} demande{total !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : leaves.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<CalendarClock size={28} strokeWidth={1.7} />} text="Aucune demande de congé trouvée." />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div className="dash-card overflow-hidden">
              {leaves.map(l => (
                <div key={l.id} ref={l.id === focusId ? attachFocus : undefined} className="row-c flex-wrap" onClick={() => setSelected(l)} style={{ cursor: "pointer", background: selected?.id === l.id ? "var(--pal-pale)" : undefined }}>
                  <span title={displayInfo(l).label} style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                    background: displayInfo(l).color, color: displayInfo(l).text, fontSize: 10, fontWeight: 800, fontFamily: sans,
                    border: displayInfo(l).border ? `1px solid ${PAL.line}` : "none",
                  }}>
                    {displayInfo(l).code}
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{l.employee_name || "—"}</div>
                    <div className="mt-0.5" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PAL.muted }}>
                      {typeInfo(l.type).label} · {new Date(l.start_date).toLocaleDateString("fr-FR")} → {new Date(l.end_date).toLocaleDateString("fr-FR")} · {l.days} j
                      {l.document_path && <FileText size={12} strokeWidth={1.8} />}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: statusColor(l.status), background: "var(--pal-pale)" }}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                  {l.status === "pending" && canValidate && (
                    <>
                      <button onClick={(ev) => { ev.stopPropagation(); review(l, "approved"); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-good)" }} title="Approuver"><Check size={16} strokeWidth={2} /></button>
                      <button onClick={(ev) => { ev.stopPropagation(); review(l, "rejected"); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Refuser"><X size={16} strokeWidth={2} /></button>
                    </>
                  )}
                  {l.status === "approved" && canValidate && (
                    <button onClick={(ev) => { ev.stopPropagation(); cancelLeave(l); }} style={{ background: "none", border: 0, cursor: "pointer", color: CANCELLED_MARKER.color }} title="Annuler ce congé"><Ban size={15} strokeWidth={1.8} /></button>
                  )}
                  {canValidate && (
                    <button onClick={(ev) => { ev.stopPropagation(); remove(l); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={14} strokeWidth={1.7} /></button>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>Page {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} strokeWidth={1.7} /></button>
            </div>
          </div>

          {selected && (
            <div className="dash-card" style={{ flex: "1 1 300px", minWidth: 0, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  background: displayInfo(selected).color, color: displayInfo(selected).text, fontSize: 10, fontWeight: 800, fontFamily: sans,
                  border: displayInfo(selected).border ? `1px solid ${PAL.line}` : "none", flexShrink: 0,
                }}>
                  {displayInfo(selected).code}
                </span>
                <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink }}>{selected.employee_name}</div>
              </div>
              <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 16 }}>{typeInfo(selected.type).label} · Solde de congés — année en cours</div>
              {balance ? (
                <>
                  <BalanceRow label="Autre (A)" used={balance.annual_used} total={balance.annual_total} />
                  <BalanceRow label="Maladie (M)" used={balance.sick_used} total={balance.sick_total} />
                  <BalanceRow label="Permission (P)" used={balance.personal_used} total={balance.personal_total} />
                </>
              ) : (
                <div className="shimmer" style={{ height: 40, borderRadius: 8 }} />
              )}
              {selected.reason && (
                <>
                  <div style={{ height: 1, background: PAL.line, margin: "16px 0 12px" }} />
                  <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 6 }}>Motif</div>
                  <div style={{ fontSize: 13, color: PAL.ink }}>{selected.reason}</div>
                </>
              )}

              <div style={{ height: 1, background: PAL.line, margin: "16px 0 12px" }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Document justificatif</div>
              {selected.document_path ? (
                <button type="button" onClick={() => viewDocument(selected)} className="btn-c btn-c-sm btn-c-ghost">
                  <FileText size={13} strokeWidth={1.8} />{selected.document_filename || "Voir le document"}
                </button>
              ) : (
                <label className="btn-c btn-c-sm btn-c-ghost" style={{ cursor: "pointer" }}>
                  <Paperclip size={13} strokeWidth={1.8} />Joindre un document
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(selected, f); }} />
                </label>
              )}

              {selected.status === "approved" && canValidate && (
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={() => cancelLeave(selected)} className="btn-c btn-c-sm" style={{ color: CANCELLED_MARKER.color, border: `1px solid ${CANCELLED_MARKER.color}`, background: "transparent" }}>
                    <Ban size={13} strokeWidth={1.8} />Annuler ce congé
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
