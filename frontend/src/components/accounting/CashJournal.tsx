import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Wallet, Landmark, Plus, Trash2, X, TrendingUp, TrendingDown, Paperclip, Pencil } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { fmtMAD } from "./Overview";
import { ExportMenu, type ExportPeriod } from "./ExportMenu";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

// ── Deux journaux, une même grille (migration l36) — TROIS natures ───────────
//  1. Caisse comptabilisée   : channel='caisse', nc='comptable'  → comptabilisé
//  2. Caisse sociale (noir)  : channel='caisse', nc='noir'       → NON comptabilisé
//  3. Banque (virement/OV/chèque) : channel='banque'             → comptabilisé
//     (le backend force nc='comptable' : pas de banque non déclarée)
export type Channel = "caisse" | "banque";

// Modes de règlement du journal des comptes (clés partagées avec le backend).
const BANK_MODES: [string, string][] = [
  ["virement", "Virement bancaire"],
  ["ov_permanent", "OV permanent"],
  ["ov_ponctuel", "OV ponctuel"],
  ["cheque", "Chèque"],
  ["versement", "Versement bancaire"],
  ["prelevement", "Prélèvement"],
  ["carte", "Carte bancaire"],
];
const MODE_LABELS: Record<string, string> = {
  virement: "Virement", versement: "Versement", ov_permanent: "OV permanent",
  ov_ponctuel: "OV ponctuel", cheque: "Chèque", prelevement: "Prélèvement",
  carte: "Carte bancaire", especes: "Espèces", caisse_sociale: "Caisse sociale", autre: "Autre",
};

const COPY = {
  caisse: {
    section: "Journal de caisse",
    balance: "Solde caisse",
    balanceCol: "Solde Caisse",
    file: "Journal_de_caisse",
    empty: "Aucun mouvement de caisse. Les règlements en espèces alimentent ce journal automatiquement.",
    icon: Wallet,
  },
  banque: {
    section: "Journal des comptes",
    balance: "Solde compte",
    balanceCol: "Solde Compte",
    file: "Journal_des_comptes",
    empty: "Aucun mouvement bancaire. Les règlements par virement, OV ou chèque alimentent ce journal automatiquement.",
    icon: Landmark,
  },
} as const;

type Attachment = { id: string; kind: string | null; file_name: string | null };
type Entry = {
  id: string; entry_date: string; type: "entree" | "sortie"; action: string;
  prestataire: string | null; amount: number; justificatif: string | null;
  nc: "noir" | "comptable"; source_type: string; source_id: string | null;
  channel: Channel; payment_mode: string | null; payment_mode_label: string | null;
  payment_ref: string | null;
  created_by_name: string | null; balance: number; attachments?: Attachment[];
};
type JournalData = { items: Entry[]; balance: number; total_in: number; total_out: number };

const KIND_LABELS: Record<string, string> = { invoice: "Facture", receipt: "Reçu", document: "Pièce justificative" };

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Backdrop({ children, width = 480 }: { children: React.ReactNode; width?: number }) {
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

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "ink" }) {
  const color = tone === "green" ? "var(--pal-primary)" : tone === "red" ? "var(--pal-danger)" : PAL.ink;
  return (
    <div className="dash-card" style={{ padding: "14px 18px", flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ ...labelStyle }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

/** Champs propres au journal : n/c en caisse, mode + référence bancaire en banque. */
function ChannelFields({ channel, form, set }: {
  channel: Channel;
  form: { nc: string; payment_mode: string; payment_ref: string };
  set: (k: string, v: string) => void;
}) {
  if (channel === "caisse") {
    return (
      <div>
        <label style={labelStyle}>n/c</label>
        <select value={form.nc} onChange={e => set("nc", e.target.value)} className="u-input" style={fieldStyle}>
          <option value="comptable">Caisse comptabilisée</option>
          <option value="noir">Caisse sociale — non comptabilisée</option>
        </select>
      </div>
    );
  }
  return (
    <div>
      <label style={labelStyle}>Mode de règlement</label>
      <select value={form.payment_mode} onChange={e => set("payment_mode", e.target.value)} className="u-input" style={fieldStyle}>
        {BANK_MODES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

type FormState = {
  type: string; entry_date: string; action: string; prestataire: string;
  amount: string; justificatif: string; nc: string; payment_mode: string; payment_ref: string;
};

/** Corps commun des modales de saisie / modification (mêmes colonnes que la grille). */
function EntryFields({ channel, form, set }: { channel: Channel; form: FormState; set: (k: string, v: string) => void }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={form.type} onChange={e => set("type", e.target.value)} className="u-input" style={fieldStyle}>
            <option value="sortie">Sortie (décaissement)</option>
            <option value="entree">Entrée (encaissement)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={form.entry_date} onChange={e => set("entry_date", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
      </div>

      <label style={labelStyle}>Action</label>
      <input value={form.action} onChange={e => set("action", e.target.value)} placeholder="Libellé de l'opération" className="u-input" style={fieldStyle} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Prestataire</label>
          <input value={form.prestataire} onChange={e => set("prestataire", e.target.value)} placeholder="Fournisseur / tiers" className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Montant (DH)</label>
          <input type="number" step="any" min="0" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0,00" className="u-input" style={fieldStyle} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Justificatif</label>
          <input value={form.justificatif} onChange={e => set("justificatif", e.target.value)} placeholder="N° pièce" className="u-input" style={fieldStyle} />
        </div>
        <ChannelFields channel={channel} form={form} set={set} />
      </div>

      {channel === "banque" && (
        <>
          <label style={labelStyle}>Référence (n° chèque / OV / virement)</label>
          <input value={form.payment_ref} onChange={e => set("payment_ref", e.target.value)} placeholder="ex. CHQ 1204587" className="u-input" style={fieldStyle} />
        </>
      )}
    </>
  );
}

function payload(channel: Channel, form: FormState, amount: number) {
  return {
    type: form.type, entry_date: form.entry_date, action: form.action.trim(),
    prestataire: form.prestataire || null, amount,
    justificatif: form.justificatif || null,
    nc: channel === "banque" ? "comptable" : form.nc,
    channel,
    payment_mode: channel === "banque" ? form.payment_mode : null,
    payment_ref: channel === "banque" ? (form.payment_ref || null) : null,
  };
}

function ManualEntryModal({ channel, onClose, onSaved }: { channel: Channel; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({
    type: "sortie", entry_date: new Date().toISOString().slice(0, 10),
    action: "", prestataire: "", amount: "", justificatif: "", nc: "comptable",
    payment_mode: "virement", payment_ref: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.action.trim()) { toast.error("L'action est obligatoire."); return; }
    const amount = parseFloat(form.amount);
    if (!(amount > 0)) { toast.error("Le montant doit être positif."); return; }
    setBusy(true);
    try {
      const res: any = await api.post("/api/accounting/cash-journal", payload(channel, form, amount));
      // `message` est renseigné par le circuit chèque (validation N+1, cf. l37) ;
      // sinon c'est la file de validation classique caissier/comptable.
      if (res?.pending) toast.success(res.message ?? "Saisie envoyée pour validation admin.");
      else toast.success("Mouvement enregistré.");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop width={480}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <H2>{channel === "banque" ? "Saisie bancaire" : "Saisie manuelle"}</H2>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, marginTop: 4 }}><X size={18} strokeWidth={1.7} /></button>
      </div>

      <EntryFields channel={channel} form={form} set={set} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Backdrop>
  );
}

function EditEntryModal({ channel, entry, onClose, onSaved }: { channel: Channel; entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({
    type: entry.type,
    entry_date: (entry.entry_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    action: entry.action || "",
    prestataire: entry.prestataire || "",
    amount: String(entry.amount ?? ""),
    justificatif: entry.justificatif || "",
    nc: entry.nc,
    payment_mode: entry.payment_mode || "virement",
    payment_ref: entry.payment_ref || "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.action.trim()) { toast.error("L'action est obligatoire."); return; }
    const amount = parseFloat(form.amount);
    if (!(amount > 0)) { toast.error("Le montant doit être positif."); return; }
    setBusy(true);
    try {
      const res: any = await api.patch(`/api/accounting/cash-journal/${entry.id}`, payload(channel, form, amount));
      if (res?.pending) toast.success("Modification envoyée pour validation admin.");
      else toast.success("Mouvement mis à jour.");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop width={480}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <H2>Modifier le mouvement</H2>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, marginTop: 4 }}><X size={18} strokeWidth={1.7} /></button>
      </div>

      <EntryFields channel={channel} form={form} set={set} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Backdrop>
  );
}

/** Grille commune aux deux journaux : mêmes colonnes, même solde cumulé.
 *  La 9e colonne porte l'axe propre au journal (n/c en caisse, mode en banque). */
export function JournalView({ channel }: { channel: Channel }) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isAccountant = roles.includes("accountant");
  const isCashier = roles.includes("cashier");
  const isBank = channel === "banque";
  const copy = COPY[channel];
  const Icon = copy.icon;
  const [editing, setEditing] = useState<Entry | null>(null);
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachTarget = useRef<Entry | null>(null);
  function startAttach(e: Entry) { attachTarget.current = e; fileInputRef.current?.click(); }

  function load() {
    setLoading(true);
    api.get(`/api/accounting/cash-journal?channel=${channel}`)
      .then((d: JournalData) => setData(d))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [channel]);

  /** Export du journal sur la période choisie — le jour même par défaut.
   *  Le solde du PDF/Excel est celui de la période demandée : la feuille d'une
   *  journée s'ouvre à zéro et se clôt sur le mouvement net du jour. */
  async function exportJournal(format: string, p: ExportPeriod) {
    const qs = new URLSearchParams({ channel });
    if (p.from) qs.set("date_from", p.from);
    if (p.to) qs.set("date_to", p.to);
    const ext = format === "pdf" ? "pdf" : "xlsx";
    try {
      await api.download(`/api/accounting/cash-journal/${format}?${qs}`, `${copy.file}_${p.suffix}.${ext}`);
      toast.success(`${copy.section} — ${p.label.toLowerCase()} téléchargé.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Téléchargement impossible.");
    }
  }

  async function remove(e: Entry) {
    if (!window.confirm("Supprimer cette saisie manuelle ?")) return;
    try {
      const res: any = await api.delete(`/api/accounting/cash-journal/${e.id}`);
      if (res?.pending) toast.success("Suppression envoyée pour validation admin.");
      else toast.success("Saisie supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  async function openAttachment(att: Attachment) {
    try {
      const res: any = await api.get(`/api/accounting/cash-journal/attachments/${att.id}/download`);
      if (res?.signed_url) window.open(res.signed_url, "_blank");
      else toast.error("Lien de la pièce indisponible.");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible d'ouvrir la pièce.");
    }
  }

  async function uploadPiece(entry: Entry, file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Le fichier dépasse 20 Mo."); return; }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "document");
      await api.uploadFile(`/api/accounting/cash-journal/${entry.id}/attachments`, fd);
      toast.success("Pièce justificative ajoutée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible d'ajouter la pièce.");
    }
  }

  // Droits — caisse : admin / caissier (+ comptable sur les lignes déclarées) ;
  // comptes (trésorerie) : admin / comptable. Caissier et comptable passent par
  // la validation admin (N+1).
  const canWriteBank = isAdmin || isAccountant;
  const canCreate = isBank ? canWriteBank : (isAdmin || isCashier);
  const canEdit = (e: Entry) => isBank ? canWriteBank : (isAdmin || isCashier || (isAccountant && e.nc === "comptable"));
  const canDelete = (e: Entry) => e.source_type === "manual" && (isBank ? canWriteBank : (isAdmin || isCashier));
  const canAttach = (e: Entry) => isBank ? canWriteBank : (isAdmin || isCashier || (isAccountant && e.nc === "comptable"));

  const items = data?.items ?? [];

  return (
    <div style={{ fontFamily: sans }}>
      {showModal && <ManualEntryModal channel={channel} onClose={() => setShowModal(false)} onSaved={load} />}
      {editing && <EditEntryModal channel={channel} entry={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <input
        ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }}
        onChange={ev => { const f = ev.target.files?.[0]; const t = attachTarget.current; if (f && t) uploadPiece(t, f); ev.target.value = ""; attachTarget.current = null; }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <SectionLabel>{copy.section}</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ExportMenu
            label="Exporter"
            formats={[{ key: "pdf", label: "PDF" }, { key: "xlsx", label: "Excel" }]}
            onExport={exportJournal}
          />
          {canCreate && (
            <button onClick={() => setShowModal(true)} className="btn-c btn-c-primary btn-c-sm"><Plus size={14} />Saisie manuelle</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatTile label={copy.balance} value={fmtMAD(data?.balance ?? 0)} tone={(data?.balance ?? 0) >= 0 ? "ink" : "red"} />
        <StatTile label="Total entrées" value={fmtMAD(data?.total_in ?? 0)} tone="green" />
        <StatTile label="Total sorties" value={fmtMAD(data?.total_out ?? 0)} tone="red" />
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Icon size={28} strokeWidth={1.7} />} text={copy.empty} /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr>
                  {["Type", "Date", "Action", "Prestataire", "Montant (DH)", "Justificatif", "Pièce", copy.balanceCol, isBank ? "Mode" : "n/c", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: i === 4 || i === 7 ? "right" : "left", ...labelStyle }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(e => {
                  const isIn = e.type === "entree";
                  return (
                    <tr key={e.id}>
                      <td style={cell}>
                        <span className={`chip-c ${isIn ? "chip-c-green" : "chip-c-red"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {isIn ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{isIn ? "Entrée" : "Sortie"}
                        </span>
                      </td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{fmtDate(e.entry_date)}</td>
                      <td style={{ ...cell, whiteSpace: "normal", minWidth: 200 }}>{e.action}</td>
                      <td style={cell}>{e.prestataire || "—"}</td>
                      <td style={{ ...cell, fontFamily: mono, fontWeight: 700, textAlign: "right", color: isIn ? "var(--pal-primary)" : PAL.ink }}>
                        {isIn ? "+" : "−"}{fmtMAD(e.amount)}
                      </td>
                      <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{e.justificatif || "—"}</td>
                      <td style={cell}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                          {e.attachments?.map(att => (
                            <button key={att.id} onClick={() => openAttachment(att)} className="chip-c chip-c-blue" title={att.file_name || undefined}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", border: 0 }}>
                              <Paperclip size={11} />{KIND_LABELS[att.kind || ""] || "Pièce justificative"}
                            </button>
                          ))}
                          {!e.attachments?.length && !canAttach(e) && <span style={{ color: PAL.muted }}>—</span>}
                          {canAttach(e) && (
                            <button onClick={() => startAttach(e)} title="Joindre une pièce justificative"
                              style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", background: "none", border: `1px dashed ${PAL.line}`, borderRadius: 999, padding: "3px 8px", color: PAL.muted, fontSize: 11 }}>
                              <Plus size={11} />Pièce
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...cell, fontFamily: mono, fontWeight: 700, textAlign: "right" }}>{fmtMAD(e.balance)}</td>
                      <td style={cell}>
                        {isBank ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span className="chip-c chip-c-blue" title="Banque — comptabilisé">{e.payment_mode_label || MODE_LABELS[e.payment_mode || ""] || "—"}</span>
                            {e.payment_ref && <span style={{ fontFamily: mono, fontSize: 11, color: PAL.muted }}>{e.payment_ref}</span>}
                          </div>
                        ) : (
                          <span className={`chip-c ${e.nc === "noir" ? "chip-c-amber" : "chip-c-blue"}`}
                            title={e.nc === "noir" ? "Caisse sociale (espèces) — non comptabilisé" : "Caisse — comptabilisé"}>
                            {e.nc === "noir" ? "Caisse sociale" : "Comptabilisé"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {canEdit(e) && (
                            <button onClick={() => setEditing(e)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Modifier">
                              <Pencil size={14} strokeWidth={1.7} />
                            </button>
                          )}
                          {canDelete(e) && (
                            <button onClick={() => remove(e)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
                              <Trash2 size={14} strokeWidth={1.7} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Journal de caisse — mouvements en espèces (axe n/c). */
export function AccountingCashJournal() {
  return <JournalView channel="caisse" />;
}

const cell: React.CSSProperties = { padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, fontSize: 13, color: PAL.ink, whiteSpace: "nowrap", verticalAlign: "middle" };
