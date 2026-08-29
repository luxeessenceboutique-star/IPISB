import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Clock, Inbox, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeepLinkFocus } from "@/lib/deep-link";

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
  created_by: string;
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

// ── Admin : boîte de réception unique des validations ───────────────────────
// Tout ce qui attend une décision arrive ici, quelle que soit sa file d'origine :
// saisies caissier, règlements bancaires (chèque, virement, OV, versement),
// suppressions de versement, avances de caisse et de mission, demandes d'achat.
type InboxItem = {
  kind: "operation" | "note" | "purchase_request";
  id: string;
  group: string;
  label: string;
  detail: string | null;
  amount: number | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  approve_url: string | null;
  reject_url: string | null;
  tab?: string;
  four_eyes: boolean;
};

export function AccountingValidations({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const { user } = useAuth();
  const me = user?.id;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const { focusId, attachFocus } = useDeepLinkFocus();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/approvals/inbox");
      setItems(res?.items ?? []);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const key = (it: InboxItem) => `${it.kind}:${it.id}`;

  async function approve(it: InboxItem) {
    if (!it.approve_url) return;
    setBusy(key(it));
    try {
      await api.post(it.approve_url, {});
      toast.success("Demande approuvée ✅");
      setItems(prev => prev.filter(o => key(o) !== key(it)));
    } catch (err) {
      toast.error((err as Error)?.message ?? "Échec de l'approbation.");
    } finally {
      setBusy(null);
    }
  }

  async function reject(it: InboxItem) {
    if (!it.reject_url) return;
    const c = comment.trim();
    if (!c) { toast.error("Le motif du rejet est obligatoire."); return; }
    setBusy(key(it));
    try {
      await api.post(it.reject_url, { comment: c });
      toast.success("Demande rejetée.");
      setItems(prev => prev.filter(o => key(o) !== key(it)));
      setRejecting(null);
      setComment("");
    } catch (err) {
      toast.error((err as Error)?.message ?? "Échec du rejet.");
    } finally {
      setBusy(null);
    }
  }

  // Une section par file d'origine, dans l'ordre où le backend les a renvoyées.
  const groups: { name: string; rows: InboxItem[] }[] = [];
  for (const it of items) {
    const g = groups.find(x => x.name === it.group);
    if (g) g.rows.push(it);
    else groups.push({ name: it.group, rows: [it] });
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
          Aucune demande en attente de validation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {groups.map(group => (
            <div key={group.name}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--pal-muted)", margin: "0 0 10px 2px" }}>
                {group.name} <span style={{ fontWeight: 600 }}>({group.rows.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {group.rows.map(it => {
                  const k = key(it);
                  const blocked = !!me && it.created_by === me && it.four_eyes;
                  const hit = it.id === focusId;
                  return (
                    <div key={k} ref={hit ? attachFocus : undefined} className="dash-card" style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pal-ink)" }}>{it.label}</span>
                          <span style={{ fontSize: 12.5, color: "var(--pal-muted)" }}>
                            {it.detail}
                            {it.detail && it.amount != null ? " · " : null}
                            {it.amount != null ? <>Montant : <strong>{fmtMAD(it.amount)}</strong></> : null}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {it.approve_url ? (
                            <>
                              <button type="button" className="btn-c btn-c-primary btn-c-sm" disabled={busy === k || blocked}
                                title={blocked ? "Vous avez saisi ce règlement : il doit être validé par un autre administrateur." : undefined}
                                onClick={() => approve(it)}>
                                <Check size={14} strokeWidth={2} /> Approuver
                              </button>
                              <button type="button" className="btn-c btn-c-danger btn-c-sm" disabled={busy === k}
                                onClick={() => { setRejecting(rejecting === k ? null : k); setComment(""); }}>
                                <X size={14} strokeWidth={2} /> Rejeter
                              </button>
                            </>
                          ) : (
                            // Demande d'achat : la décision se prend dans son onglet
                            // (validation / retour / annulation, choix du devis).
                            <button type="button" className="btn-c btn-c-soft btn-c-sm" onClick={() => it.tab && onNavigate?.(it.tab)}>
                              Ouvrir la demande <ArrowRight size={14} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--pal-muted)" }}>
                        Saisi par <strong>{it.created_by_name}</strong> · {fmtDate(it.created_at)}
                        {blocked && <> · <span style={{ color: "oklch(58% 0.19 25)", fontWeight: 600 }}>votre saisie — un autre administrateur doit la valider</span></>}
                      </div>
                      {rejecting === k && (
                        <div className="anim-fade" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            autoFocus
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") reject(it); }}
                            placeholder="Motif du rejet (obligatoire)…"
                            className="input-c"
                            style={{ flex: "1 1 260px", minWidth: 0 }}
                          />
                          <button type="button" className="btn-c btn-c-danger btn-c-sm" disabled={busy === k} onClick={() => reject(it)}>
                            Confirmer le rejet
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
  const { focusId, attachFocus } = useDeepLinkFocus();

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
            <div key={op.id} ref={op.id === focusId ? attachFocus : undefined} className="dash-card" style={{ padding: "16px 20px" }}>
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
