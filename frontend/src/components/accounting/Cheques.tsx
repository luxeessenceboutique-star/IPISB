import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ScrollText, Plus, Trash2, X, Pencil, Search, AlertTriangle, Banknote, Ban, Send } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { fmtMAD } from "./Overview";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

type Direction = "emis" | "recu";
type Status = "en_attente" | "rejete" | "a_remettre" | "remis" | "encaisse" | "impaye" | "annule";
type Mode = "cheque" | "versement" | "virement" | "ov_permanent" | "ov_ponctuel";

type Cheque = {
  id: string; reference: string | null;
  direction: Direction; status: Status; mode: Mode;
  cheque_number: string | null; bank: string | null;
  amount: number; counterparty: string | null; label: string | null;
  issue_date: string; due_date: string | null; cashed_date: string | null;
  source_type: string; source_id: string | null;
  review_comment: string | null; comment: string | null;
  status_label: string; source_label: string; direction_label: string; mode_label: string;
  // Libellés des boutons calculés par l'API : le vocabulaire d'une pièce
  // (remettre un chèque / transmettre un ordre) n'est pas redit ici.
  next_actions: { status: Status; label: string }[];
  overdue: boolean;
};
type ChequeList = { items: Cheque[]; total: number };
type Bucket = { count: number; amount: number };
type Stats = { buckets: Record<string, Bucket>; overdue: Bucket; en_attente: Bucket; total: number };

const STATUS_TONES: Record<Status, string> = {
  en_attente: "chip-c-amber", rejete: "chip-c-red", a_remettre: "chip-c-blue",
  remis: "chip-c-blue", encaisse: "chip-c-green", impaye: "chip-c-red", annule: "chip-c",
};
const ACTION_ICONS: Record<string, typeof Send> = {
  remis: Send, encaisse: Banknote, impaye: AlertTriangle, annule: Ban,
};

// ── Navigation : deux familles de pièces, chacune suivie une par une ─────────
const TABS = [
  { key: "cheque", label: "Chèques" },
  { key: "transfert", label: "Versements & virements" },
  { key: "", label: "Tout le registre" },
] as const;
// Natures proposées à la saisie manuelle (mêmes clés que l'API).
const MODES: { key: Mode; label: string }[] = [
  { key: "cheque", label: "Chèque" },
  { key: "versement", label: "Versement" },
  { key: "virement", label: "Virement" },
  { key: "ov_permanent", label: "OV permanent" },
  { key: "ov_ponctuel", label: "OV ponctuel" },
];
// Libellés de statut du filtre : le cycle de vie est le même, pas le vocabulaire.
const STATUS_FILTERS = (cheques: boolean) => [
  { key: "", label: "Tous les statuts" },
  { key: "ouverts", label: "En cours (non clos)" },
  { key: "en_attente", label: "En attente de validation" },
  { key: "a_remettre", label: cheques ? "À remettre" : "À exécuter" },
  { key: "remis", label: cheques ? "Remis" : "Ordre transmis" },
  { key: "encaisse", label: cheques ? "Encaissés" : "Exécutés" },
  { key: "impaye", label: cheques ? "Impayés" : "Rejetés par la banque" },
  { key: "rejete", label: "Validation refusée" },
  { key: "annule", label: "Annulés" },
];

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const cell: React.CSSProperties = { padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, fontSize: 13, color: PAL.ink, whiteSpace: "nowrap", verticalAlign: "middle" };

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function errText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw);
    return parsed?.detail || raw;
  } catch {
    return raw;
  }
}

function Backdrop({ children, width = 620 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 30, width, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: titleFont, fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 18px" }}>{children}</h2>;
}

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="dash-card" style={{ padding: "14px 18px", flex: "1 1 170px", minWidth: 0 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: tone || PAL.ink, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontFamily: sans, fontSize: 11.5, color: PAL.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Saisie / correction d'une pièce ─────────────────────────────────────────
function ChequeModal({ cheque, defaultMode, onClose, onSaved }:
  { cheque: Cheque | null; defaultMode: Mode; onClose: () => void; onSaved: () => void }) {
  const editing = !!cheque;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    direction: (cheque?.direction || "recu") as Direction,
    mode: (cheque?.mode || defaultMode) as Mode,
    amount: cheque ? String(cheque.amount) : "",
    counterparty: cheque?.counterparty || "",
    cheque_number: cheque?.cheque_number || "",
    bank: cheque?.bank || "",
    label: cheque?.label || "",
    issue_date: (cheque?.issue_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    due_date: (cheque?.due_date || "").slice(0, 10),
    comment: cheque?.comment || "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const amount = Number(form.amount);
    if (!editing && !(amount > 0)) { toast.error("Le montant doit être supérieur à zéro."); return; }
    setBusy(true);
    try {
      const common = {
        counterparty: form.counterparty.trim() || null,
        cheque_number: form.cheque_number.trim() || null,
        bank: form.bank.trim() || null,
        label: form.label.trim() || null,
        issue_date: form.issue_date || null,
        due_date: form.due_date || null,
        comment: form.comment.trim() || null,
      };
      if (editing) await api.patch(`/api/accounting/cheques/${cheque!.id}`, common);
      else await api.post("/api/accounting/cheques", { ...common, direction: form.direction, mode: form.mode, amount });
      toast.success(editing ? "Pièce mise à jour." : "Pièce inscrite au registre.");
      onSaved(); onClose();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Backdrop>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <H2>{editing ? `${cheque!.mode_label} ${cheque!.reference || ""}` : "Inscrire une pièce"}</H2>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted }}><X size={20} /></button>
      </div>

      {!editing && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={labelStyle}>Nature de la pièce</div>
              <select value={form.mode} onChange={set("mode")} style={fieldStyle}>
                {MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Sens</div>
              <select value={form.direction} onChange={set("direction")} style={fieldStyle}>
                <option value="recu">Reçu — à encaisser</option>
                <option value="emis">Émis — établi par l'école</option>
              </select>
            </div>
          </div>
          <p style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, margin: "-8px 0 14px" }}>
            Une pièce émise saisie ici n'engage aucune écriture comptable : elle n'est donc pas
            soumise à validation. Pour régler une opération par chèque ou par virement, passez par
            l'écran concerné (Paiements, Dépenses, Notes, Journal des comptes) — la validation N+1
            s'y applique.
          </p>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {!editing && (
          <div>
            <div style={labelStyle}>Montant (DH)</div>
            <input type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} style={fieldStyle} />
          </div>
        )}
        <div>
          <div style={labelStyle}>{form.mode === "cheque" ? "N° du chèque" : "Référence (bordereau / OV)"}</div>
          <input value={form.cheque_number} onChange={set("cheque_number")} style={fieldStyle} placeholder="ex. 4581203" />
        </div>
        <div>
          <div style={labelStyle}>{form.direction === "emis" ? "Bénéficiaire" : "Tireur / émetteur"}</div>
          <input value={form.counterparty} onChange={set("counterparty")} style={fieldStyle} />
        </div>
        <div>
          <div style={labelStyle}>Banque</div>
          <input value={form.bank} onChange={set("bank")} style={fieldStyle} placeholder="ex. BMCE" />
        </div>
        <div>
          <div style={labelStyle}>Date d'établissement</div>
          <input type="date" value={form.issue_date} onChange={set("issue_date")} style={fieldStyle} />
        </div>
        <div>
          <div style={labelStyle}>{form.mode === "cheque" ? "Échéance / remise prévue" : "Exécution prévue"}</div>
          <input type="date" value={form.due_date} onChange={set("due_date")} style={fieldStyle} />
        </div>
      </div>

      <div style={labelStyle}>Objet</div>
      <input value={form.label} onChange={set("label")} style={fieldStyle} />
      <div style={labelStyle}>Observation</div>
      <textarea value={form.comment} onChange={set("comment")} rows={2} style={{ ...fieldStyle, resize: "vertical" }} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <button type="button" className="btn-c btn-c-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn-c btn-c-primary" onClick={save} disabled={busy}>
          {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Inscrire"}
        </button>
      </div>
    </Backdrop>
  );
}

// ── Transition de statut ─────────────────────────────────────────────────────
function StatusModal({ cheque, target, actionLabel, onClose, onSaved }:
  { cheque: Cheque; target: Status; actionLabel: string; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const isCheque = cheque.mode === "cheque";
  const needsDate = target === "encaisse" || target === "impaye" || target === "remis";
  const dateLabel = target === "encaisse" ? (isCheque ? "Date d'encaissement" : "Date d'exécution")
    : target === "impaye" ? "Date du rejet bancaire"
    : isCheque ? "Nouvelle échéance (optionnel)" : "Date de transmission (optionnel)";

  const apply = async () => {
    setBusy(true);
    try {
      await api.post(`/api/accounting/cheques/${cheque.id}/status`, {
        status: target,
        date: needsDate ? date || null : null,
        comment: comment.trim() || null,
      });
      toast.success(`${cheque.mode_label} — ${actionLabel.toLowerCase()}.`);
      onSaved(); onClose();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Backdrop width={520}>
      <H2>{actionLabel} — {cheque.cheque_number || cheque.reference}</H2>
      <p style={{ fontFamily: sans, fontSize: 13.5, color: PAL.muted, margin: "0 0 18px" }}>
        {cheque.mode_label} · {cheque.direction_label} · {fmtMAD(cheque.amount)} · {cheque.counterparty || "—"}
      </p>
      {needsDate && (
        <>
          <div style={labelStyle}>{dateLabel}</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />
        </>
      )}
      <div style={labelStyle}>Observation</div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...fieldStyle, resize: "vertical" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn-c btn-c-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className={`btn-c ${target === "impaye" || target === "annule" ? "btn-c-danger" : "btn-c-primary"}`}
          onClick={apply} disabled={busy}>
          {busy ? "…" : actionLabel}
        </button>
      </div>
    </Backdrop>
  );
}

// ── Registre ─────────────────────────────────────────────────────────────────
export function AccountingCheques() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const [data, setData] = useState<ChequeList>({ items: [], total: 0 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  // Une erreur de chargement ne doit pas se confondre avec un registre vide.
  const [error, setError] = useState<string | null>(null);
  // Navigation entre familles : chèques d'un côté, ordres de paiement de l'autre.
  // Chaque onglet garde le suivi pièce par pièce ; les tuiles suivent l'onglet.
  const [tab, setTab] = useState<string>("cheque");
  const [direction, setDirection] = useState<"" | Direction>("");
  // Dans un onglet, on montre TOUT son contenu : filtrer par défaut sur « non clos »
  // affichait un écran vide alors que des pièces encaissées existaient.
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ cheque: Cheque | null } | null>(null);
  const [transition, setTransition] = useState<{ cheque: Cheque; target: Status; label: string } | null>(null);
  const isCheques = tab === "cheque";

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab) params.set("mode", tab);
      if (direction) params.set("direction", direction);
      if (status) params.set("status", status);
      if (search) params.set("q", search);
      const stParams = new URLSearchParams(tab ? { mode: tab } : {});
      const [list, st] = await Promise.all([
        api.get(`/api/accounting/cheques?${params.toString()}`),
        api.get(`/api/accounting/cheques/stats?${stParams.toString()}`),
      ]);
      setData(list); setStats(st); setError(null);
    } catch (e) { setError(errText(e)); toast.error(errText(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [tab, direction, status, search]);
  // Recherche à la frappe : ni Entrée ni clic hors du champ ne sont nécessaires.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const remove = async (c: Cheque) => {
    if (!confirm(`Supprimer ${c.mode_label.toLowerCase()} ${c.cheque_number || c.reference} du registre ?`)) return;
    try { await api.delete(`/api/accounting/cheques/${c.id}`); toast.success("Pièce supprimée."); void load(); }
    catch (e) { toast.error(errText(e)); }
  };

  const bucket = (d: Direction, s: Status): Bucket => stats?.buckets?.[`${d}:${s}`] || { count: 0, amount: 0 };
  const circulation = (d: Direction) => {
    const a = bucket(d, "a_remettre"), r = bucket(d, "remis");
    return { count: a.count + r.count, amount: a.amount + r.amount };
  };
  // Émis + reçus confondus : un impayé ou un encaissement se lit sans distinction de sens.
  const both = (s: Status): Bucket => {
    const e = bucket("emis", s), r = bucket("recu", s);
    return { count: e.count + r.count, amount: e.amount + r.amount };
  };

  const filtered = !!(direction || status || search);
  const resetFilters = () => { setDirection(""); setStatus(""); setQ(""); setSearch(""); };

  return (
    <div style={{ fontFamily: sans }}>
      <SectionLabel>Suivi des règlements bancaires</SectionLabel>

      {/* Navigation : chèques / ordres de paiement / tout le registre. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 16px" }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setStatus(""); }}
            className={`btn-c ${tab === t.key ? "btn-c-soft" : "btn-c-ghost"}`}
            style={{ fontWeight: tab === t.key ? 700 : 500 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tuiles : ce que la trésorerie doit surveiller, dans le périmètre affiché. */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "6px 0 20px" }}>
        <StatTile label="En attente de validation" value={String(stats?.en_attente.count ?? 0)}
          sub={fmtMAD(stats?.en_attente.amount ?? 0)} tone={stats?.en_attente.count ? "oklch(62% 0.16 55)" : undefined} />
        <StatTile label={isCheques ? "Émis en circulation" : "À exécuter / transmis"}
          value={String(circulation("emis").count)} sub={fmtMAD(circulation("emis").amount)} />
        {tab !== "transfert" && (
          <StatTile label="Reçus à encaisser" value={String(circulation("recu").count)} sub={fmtMAD(circulation("recu").amount)} />
        )}
        <StatTile label="Échéance dépassée" value={String(stats?.overdue.count ?? 0)}
          sub={fmtMAD(stats?.overdue.amount ?? 0)} tone={stats?.overdue.count ? "oklch(55% 0.19 25)" : undefined} />
        <StatTile label={isCheques ? "Impayés" : "Rejetés par la banque"} value={String(both("impaye").count)}
          sub={fmtMAD(both("impaye").amount)} tone={both("impaye").count ? "oklch(55% 0.19 25)" : undefined} />
        <StatTile label={isCheques ? "Encaissés" : "Exécutés"} value={String(both("encaisse").count)}
          sub={`${fmtMAD(both("encaisse").amount)} · ${stats?.total ?? 0} au registre`} />
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={direction} onChange={e => setDirection(e.target.value as "" | Direction)}
          style={{ ...fieldStyle, marginTop: 0, marginBottom: 0, width: "auto", minWidth: 150 }}>
          <option value="">Émis et reçus</option>
          <option value="emis">Émis</option>
          <option value="recu">Reçus</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ ...fieldStyle, marginTop: 0, marginBottom: 0, width: "auto", minWidth: 190 }}>
          {STATUS_FILTERS(isCheques).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: PAL.muted }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
            placeholder="N° / référence, bénéficiaire, banque…"
            style={{ ...fieldStyle, marginTop: 0, marginBottom: 0, paddingLeft: 34, paddingRight: q ? 36 : 13 }} />
          {q && (
            <button type="button" onClick={() => setQ("")} title="Effacer la recherche (Échap)"
              aria-label="Effacer la recherche"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, border: "none", borderRadius: 999, background: "transparent", cursor: "pointer", color: PAL.muted }}>
              <X size={15} />
            </button>
          )}
        </div>
        {isAdmin && (
          <button type="button" className="btn-c btn-c-primary" onClick={() => setModal({ cheque: null })}>
            <Plus size={15} strokeWidth={1.7} />{isCheques ? "Inscrire un chèque" : "Inscrire une pièce"}
          </button>
        )}
      </div>

      <div className="dash-card anim-rise" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1160 }}>
          <thead>
            <tr>
              {["Réf.", "Nature", "Sens", "N° / réf.", "Émission", "Échéance", "Tiers", "Objet", "Montant", "Origine", "Statut", ""].map((h, i) => (
                <th key={i} style={{ ...cell, ...labelStyle, borderBottom: `1px solid ${PAL.line}`, textAlign: i === 8 ? "right" : "left", background: "oklch(97% 0.008 170)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map(c => (
              <tr key={c.id} style={c.overdue ? { background: "oklch(97% 0.03 60)" } : undefined}>
                <td style={{ ...cell, fontFamily: mono, fontSize: 12 }}>{c.reference || "—"}</td>
                <td style={cell}>
                  <span className={`chip-c ${c.mode === "cheque" ? "chip-c-blue" : "chip-c"}`}>{c.mode_label}</span>
                </td>
                <td style={cell}>
                  <span className={`chip-c ${c.direction === "emis" ? "chip-c-amber" : "chip-c-green"}`}>{c.direction_label}</span>
                </td>
                <td style={{ ...cell, fontFamily: mono, fontSize: 12.5 }}>{c.cheque_number || "—"}{c.bank ? <div style={{ color: PAL.muted, fontSize: 11 }}>{c.bank}</div> : null}</td>
                <td style={cell}>{fmtDate(c.issue_date)}</td>
                <td style={cell}>
                  {fmtDate(c.due_date)}
                  {c.overdue && <AlertTriangle size={13} style={{ marginLeft: 6, verticalAlign: "-2px", color: "oklch(55% 0.19 25)" }} />}
                </td>
                <td style={{ ...cell, whiteSpace: "normal", maxWidth: 190 }}>{c.counterparty || "—"}</td>
                <td style={{ ...cell, whiteSpace: "normal", maxWidth: 230, color: PAL.muted }}>{c.label || "—"}</td>
                <td style={{ ...cell, textAlign: "right", fontFamily: mono, fontWeight: 700 }}>{fmtMAD(c.amount)}</td>
                <td style={{ ...cell, fontSize: 12, color: PAL.muted }}>{c.source_label}</td>
                <td style={cell}>
                  <span className={`chip-c ${STATUS_TONES[c.status]}`} title={c.review_comment || undefined}>{c.status_label}</span>
                  {c.cashed_date && <div style={{ fontSize: 11, color: PAL.muted, marginTop: 2 }}>{fmtDate(c.cashed_date)}</div>}
                </td>
                <td style={{ ...cell, textAlign: "right" }}>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                      {c.next_actions.map(a => {
                        const Icon = ACTION_ICONS[a.status] || Send;
                        return (
                          <button key={a.status} type="button" title={a.label}
                            onClick={() => setTransition({ cheque: c, target: a.status, label: a.label })}
                            style={{ border: "none", background: "transparent", cursor: "pointer", color: a.status === "impaye" || a.status === "annule" ? "oklch(55% 0.19 25)" : PAL.muted, padding: 4 }}>
                            <Icon size={15} />
                          </button>
                        );
                      })}
                      <button type="button" title="Modifier" onClick={() => setModal({ cheque: c })}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 4 }}>
                        <Pencil size={14} />
                      </button>
                      {c.source_type === "manual" && (
                        <button type="button" title="Supprimer" onClick={() => void remove(c)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "oklch(55% 0.19 25)", padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && error && (
          <EmptyHint icon={<AlertTriangle size={28} strokeWidth={1.7} />}
            text={<>Registre indisponible : {error}{" "}
              <button type="button" onClick={() => void load()}
                style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", font: "inherit", color: "oklch(48% 0.09 180)", textDecoration: "underline" }}>
                Réessayer
              </button>
            </>} />
        )}
        {!loading && !error && data.items.length === 0 && (
          <EmptyHint icon={<ScrollText size={28} strokeWidth={1.7} />}
            text={filtered && (stats?.total ?? 0) > 0 ? (
              <>
                Aucune pièce ne correspond à ce filtre — cet onglet en compte {stats!.total}.{" "}
                <button type="button" onClick={resetFilters}
                  style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", font: "inherit", color: "oklch(48% 0.09 180)", textDecoration: "underline" }}>
                  Voir tout l'onglet
                </button>
              </>
            ) : isCheques
              ? "Aucun chèque au registre. Les chèques s'inscrivent ici automatiquement dès qu'une opération est réglée ou encaissée par chèque."
              : "Aucun versement ni virement au registre. Ils s'y inscrivent automatiquement dès qu'un règlement bancaire est soumis à validation."} />
        )}
        {loading && <div style={{ padding: 24, textAlign: "center", color: PAL.muted, fontSize: 13 }}>Chargement…</div>}
      </div>

      <p style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, marginTop: 12, maxWidth: 820 }}>
        Tout décaissement bancaire — chèque, versement, virement, ordre de virement — est soumis à
        validation N+1 : l'opération reste « en attente » et n'affecte ni la comptabilité ni le
        Journal des comptes avant approbation (onglet Validations), et ne peut pas être validée par
        la personne qui l'a saisie. Chaque pièce est ensuite suivie une par une jusqu'à son
        encaissement ou son exécution. Les encaissements (scolarité, recettes) ne sont pas
        concernés : les chèques reçus sont inscrits directement et suivis jusqu'à leur remise.
      </p>

      {modal && <ChequeModal cheque={modal.cheque} defaultMode={isCheques ? "cheque" : "virement"}
        onClose={() => setModal(null)} onSaved={load} />}
      {transition && <StatusModal cheque={transition.cheque} target={transition.target} actionLabel={transition.label}
        onClose={() => setTransition(null)} onSaved={load} />}
    </div>
  );
}
