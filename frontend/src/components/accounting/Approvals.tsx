import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Clock, Inbox, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

const sans = '"Manrope", system-ui, sans-serif';

type PendingOp = {
  id: string;
  op_type: string;
  op_label: string;
  status: "pending" | "approved" | "rejected";
  amount: number | null;
  created_at: string;
  reviewed_at: string | null;
  review_comment: string | null;
  created_by_name: string;
  student_name: string | null;
  class_name: string | null;
};

function fmtMAD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " MAD";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusChip({ status }: { status: PendingOp["status"] }) {
  const map = {
    pending: { cls: "chip-c chip-c-amber", label: "En attente" },
    approved: { cls: "chip-c chip-c-green", label: "Approuvée" },
    rejected: { cls: "chip-c chip-c-red", label: "Rejetée" },
  } as const;
  const s = map[status];
  return <span className={s.cls}>{s.label}</span>;
}

function OpSummary({ op }: { op: PendingOp }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pal-ink)" }}>{op.op_label}</span>
      <span style={{ fontSize: 12.5, color: "var(--pal-muted)" }}>
        {op.student_name ? <>Élève : <strong>{op.student_name}</strong></> : null}
        {op.class_name ? <> · Promo : {op.class_name}</> : null}
        {op.amount != null ? <> · Montant : <strong>{fmtMAD(op.amount)}</strong></> : null}
      </span>
    </div>
  );
}

// ── Admin : file d'attente de validation N+1 ────────────────────────────────
export function AccountingValidations() {
  const [items, setItems] = useState<PendingOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/approvals/pending");
      setItems(res?.items ?? []);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setBusy(id);
    try {
      await api.post(`/api/approvals/${id}/approve`, {});
      toast.success("Saisie approuvée ✅");
      setItems(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      toast.error((err as Error)?.message ?? "Échec de l'approbation.");
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    const c = comment.trim();
    if (!c) { toast.error("Le motif du rejet est obligatoire."); return; }
    setBusy(id);
    try {
      await api.post(`/api/approvals/${id}/reject`, { comment: c });
      toast.success("Saisie rejetée.");
      setItems(prev => prev.filter(o => o.id !== id));
      setRejecting(null);
      setComment("");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Échec du rejet.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <ShieldCheck size={18} strokeWidth={1.8} color="var(--pal-primary)" />
          <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--pal-ink)" }}>
            Validations en attente {items.length > 0 && <span className="chip-c chip-c-amber" style={{ marginInlineStart: 8 }}>{items.length}</span>}
          </span>
        </div>
        <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={load}>
          <RefreshCw size={14} strokeWidth={1.8} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 30, textAlign: "center", color: "var(--pal-muted)" }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div className="dash-card" style={{ padding: 40, textAlign: "center", color: "var(--pal-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Check size={30} strokeWidth={1.5} color="var(--pal-primary)" />
          Aucune saisie en attente de validation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(op => (
            <div key={op.id} className="dash-card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <OpSummary op={op} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <button type="button" className="btn-c btn-c-primary btn-c-sm" disabled={busy === op.id} onClick={() => approve(op.id)}>
                    <Check size={14} strokeWidth={2} /> Approuver
                  </button>
                  <button type="button" className="btn-c btn-c-danger btn-c-sm" disabled={busy === op.id} onClick={() => { setRejecting(rejecting === op.id ? null : op.id); setComment(""); }}>
                    <X size={14} strokeWidth={2} /> Rejeter
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--pal-muted)" }}>
                Saisi par <strong>{op.created_by_name}</strong> · {fmtDate(op.created_at)}
              </div>
              {rejecting === op.id && (
                <div className="anim-fade" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    autoFocus
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") reject(op.id); }}
                    placeholder="Motif du rejet (obligatoire)…"
                    className="input-c"
                    style={{ flex: "1 1 260px", minWidth: 0 }}
                  />
                  <button type="button" className="btn-c btn-c-danger btn-c-sm" disabled={busy === op.id} onClick={() => reject(op.id)}>
                    Confirmer le rejet
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Caissier : mes saisies (statut + motif de rejet) ────────────────────────
export function MySubmissions() {
  const [items, setItems] = useState<PendingOp[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/approvals/mine");
      setItems(res?.items ?? []);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Inbox size={18} strokeWidth={1.8} color="var(--pal-primary)" />
          <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--pal-ink)" }}>Mes saisies</span>
        </div>
        <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={load}>
          <RefreshCw size={14} strokeWidth={1.8} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 30, textAlign: "center", color: "var(--pal-muted)" }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div className="dash-card" style={{ padding: 40, textAlign: "center", color: "var(--pal-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Clock size={30} strokeWidth={1.5} color="var(--pal-muted)" />
          Aucune saisie pour le moment.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(op => (
            <div key={op.id} className="dash-card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <OpSummary op={op} />
                <StatusChip status={op.status} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--pal-muted)" }}>
                Saisi le {fmtDate(op.created_at)}
                {op.reviewed_at ? <> · Traité le {fmtDate(op.reviewed_at)}</> : null}
              </div>
              {op.status === "rejected" && op.review_comment && (
                <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, background: "var(--pal-red-soft, oklch(95% 0.03 25))", fontSize: 12.5, color: "var(--pal-ink)" }}>
                  <strong>Motif du rejet :</strong> {op.review_comment}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
