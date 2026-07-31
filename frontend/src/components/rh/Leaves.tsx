import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, CalendarClock, Trash2, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

const TYPES = [
  { value: "annual", label: "Congé annuel" },
  { value: "sick", label: "Maladie" },
  { value: "personal", label: "Personnel" },
  { value: "maternity", label: "Maternité" },
  { value: "paternity", label: "Paternité" },
  { value: "unpaid", label: "Sans solde" },
];

const STATUS_LABEL: Record<string, string> = { pending: "En attente", approved: "Approuvé", rejected: "Refusé" };

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
  return "var(--pal-warn)";
}

function FormModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    employee_id: "", type: "annual",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    days: "1", reason: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.employee_id) { toast.error("Sélectionnez un employé."); return; }
    const days = parseInt(form.days, 10);
    if (!days || days <= 0) { toast.error("Le nombre de jours doit être positif."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/leaves", {
        employee_id: form.employee_id, type: form.type,
        start_date: form.start_date, end_date: form.end_date,
        days, reason: form.reason || null,
      });
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
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
        <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" as const, marginBottom: 24 }} />

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

export function RhLeaves() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Leave | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);

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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, page]);
  useEffect(() => { api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {}); }, []);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {modalOpen && <FormModal employees={employees} onClose={() => setModalOpen(false)} onSaved={load} />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="u-input" style={{ padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
          <option value="">Tous statuts</option>
          <option value="pending">En attente</option>
          <option value="approved">Approuvé</option>
          <option value="rejected">Refusé</option>
        </select>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Nouvelle demande
        </button>
      </div>

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
                <div key={l.id} className="row-c flex-wrap" onClick={() => setSelected(l)} style={{ cursor: "pointer", background: selected?.id === l.id ? "var(--pal-pale)" : undefined }}>
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                    <CalendarClock size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{l.employee_name || "—"}</div>
                    <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted }}>
                      {TYPES.find(t => t.value === l.type)?.label ?? l.type} · {new Date(l.start_date).toLocaleDateString("fr-FR")} → {new Date(l.end_date).toLocaleDateString("fr-FR")} · {l.days} j
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: statusColor(l.status), background: "var(--pal-pale)" }}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                  {l.status === "pending" && (
                    <>
                      <button onClick={(ev) => { ev.stopPropagation(); review(l, "approved"); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-good)" }} title="Approuver"><Check size={16} strokeWidth={2} /></button>
                      <button onClick={(ev) => { ev.stopPropagation(); review(l, "rejected"); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Refuser"><X size={16} strokeWidth={2} /></button>
                    </>
                  )}
                  <button onClick={(ev) => { ev.stopPropagation(); remove(l); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
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
              <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink, marginBottom: 4 }}>{selected.employee_name}</div>
              <div style={{ fontSize: 12.5, color: PAL.muted, marginBottom: 16 }}>Solde de congés — année en cours</div>
              {balance ? (
                <>
                  <BalanceRow label="Congé annuel" used={balance.annual_used} total={balance.annual_total} />
                  <BalanceRow label="Maladie" used={balance.sick_used} total={balance.sick_total} />
                  <BalanceRow label="Personnel" used={balance.personal_used} total={balance.personal_total} />
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
