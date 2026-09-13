import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Clock, Inbox, RefreshCw, ArrowRight, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeepLinkFocus } from "@/lib/deep-link";

const sans = '"Manrope", system-ui, sans-serif';
const PAL_LINE = "oklch(88% 0.015 170)";
const PAL_PAPER = "oklch(99% 0.005 160)";
const PAL_MUTED = "oklch(48% 0.02 180)";
const filterFieldStyle = { padding: "8px 10px", border: `1px solid ${PAL_LINE}`, borderRadius: 8, fontFamily: sans, fontSize: 13, background: PAL_PAPER, outline: "none", boxSizing: "border-box" as const };
const filterLabelStyle = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL_MUTED, letterSpacing: ".05em", textTransform: "uppercase" as const, marginBottom: 4, display: "block" };

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
  first_approved_by: string | null;
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

  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      const res = await api.post(it.approve_url, {});
      if (res?.pending_second_approval) {
        toast.success("Première validation enregistrée — en attente d'un second administrateur.");
        load(); // toujours en attente : on ne retire pas l'item, on rafraîchit son état.
      } else {
        toast.success("Demande approuvée ✅");
        setItems(prev => prev.filter(o => key(o) !== key(it)));
      }
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

  // Groupes distincts présents dans la boîte (pour le filtre « Catégorie »),
  // dans l'ordre d'apparition renvoyé par le backend.
  const availableGroups: string[] = [];
  for (const it of items) if (!availableGroups.includes(it.group)) availableGroups.push(it.group);

  const activeFilterCount = [search, groupFilter, dateFrom, dateTo].filter(Boolean).length;
  function resetFilters() { setSearch(""); setGroupFilter(""); setDateFrom(""); setDateTo(""); }

  const filteredItems = useMemo(() => items.filter(it => {
    if (groupFilter && it.group !== groupFilter) return false;
    if (dateFrom && it.created_at.slice(0, 10) < dateFrom) return false;
    if (dateTo && it.created_at.slice(0, 10) > dateTo) return false;
    if (search) {
      const hay = `${it.label} ${it.detail ?? ""} ${it.created_by_name}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [items, groupFilter, dateFrom, dateTo, search]);

  // Une section par file d'origine, dans l'ordre où le backend les a renvoyées.
  const groups: { name: string; rows: InboxItem[] }[] = [];
  for (const it of filteredItems) {
    const g = groups.find(x => x.name === it.group);
    if (g) g.rows.push(it);
    else groups.push({ name: it.group, rows: [it] });
  }

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <ShieldCheck size={18} strokeWidth={1.8} color="var(--pal-primary)" />
          <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--pal-ink)" }}>
            Validations en attente {items.length > 0 && <span className="chip-c chip-c-amber" style={{ marginInlineStart: 8 }}>{items.length}</span>}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className={`btn-c btn-c-sm ${showFilters || activeFilterCount > 0 ? "btn-c-primary" : "btn-c-ghost"}`} onClick={() => setShowFilters(s => !s)}>
            <SlidersHorizontal size={13} strokeWidth={1.8} /> Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={load}>
            <RefreshCw size={14} strokeWidth={1.8} /> Actualiser
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="dash-card anim-pop" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div>
              <label style={filterLabelStyle}>Recherche</label>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: PAL_MUTED }} />
                <input type="text" placeholder="Libellé, personne…" value={search} onChange={e => setSearch(e.target.value)} className="u-input" style={{ ...filterFieldStyle, width: "100%", paddingLeft: 28 }} />
              </div>
            </div>
            <div>
              <label style={filterLabelStyle}>Catégorie</label>
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="u-input" style={{ ...filterFieldStyle, width: "100%" }}>
                <option value="">Toutes</option>
                {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={filterLabelStyle}>Date du</label>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="u-input" style={{ ...filterFieldStyle, width: "100%" }} />
            </div>
            <div>
              <label style={filterLabelStyle}>Date au</label>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="u-input" style={{ ...filterFieldStyle, width: "100%" }} />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="btn-c btn-c-ghost btn-c-sm" style={{ marginTop: 12 }}>
              <RotateCcw size={12} />Réinitialiser les filtres
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="dash-card" style={{ padding: 30, textAlign: "center", color: "var(--pal-muted)" }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div className="dash-card" style={{ padding: 40, textAlign: "center", color: "var(--pal-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Check size={30} strokeWidth={1.5} color="var(--pal-primary)" />
          Aucune demande en attente de validation.
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="dash-card" style={{ padding: 40, textAlign: "center", color: "var(--pal-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          Aucun résultat pour ces filtres.
          <button type="button" onClick={resetFilters} className="btn-c btn-c-ghost btn-c-sm">
            <RotateCcw size={12} />Réinitialiser les filtres
          </button>
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
                  const blockedCreator = !!me && it.created_by === me && it.four_eyes;
                  const blockedFirstApprover = !!me && it.first_approved_by === me;
                  const blocked = blockedCreator || blockedFirstApprover;
                  const awaitingSecond = it.four_eyes && !!it.first_approved_by && !blockedFirstApprover;
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
                                title={
                                  blockedCreator ? "Vous avez saisi ce règlement : il doit être validé par un autre administrateur."
                                  : blockedFirstApprover ? "Vous avez déjà donné la première validation : un second administrateur, différent de vous, doit valider."
                                  : undefined
                                }
                                onClick={() => approve(it)}>
                                <Check size={14} strokeWidth={2} /> {awaitingSecond ? "Valider (2e)" : "Approuver"}
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
                        {blockedCreator && <> · <span style={{ color: "oklch(58% 0.19 25)", fontWeight: 600 }}>votre saisie — un autre administrateur doit la valider</span></>}
                        {blockedFirstApprover && <> · <span style={{ color: "oklch(58% 0.19 25)", fontWeight: 600 }}>vous avez déjà validé — en attente d'un second administrateur</span></>}
                        {awaitingSecond && <> · <span style={{ color: "var(--pal-primary)", fontWeight: 600 }}>1ère validation obtenue — votre validation finalisera le paiement</span></>}
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
