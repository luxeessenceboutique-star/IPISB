import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { NotebookPen, Plus, Trash2, X, FileDown, Pencil, Check, Ban } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { useDeepLinkFocus } from "@/lib/deep-link";
import { fmtMAD } from "./Overview";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

type Item = { article: string | null; prestataire: string | null; montant: number };
type NoteStatus = "pending" | "approved" | "rejected" | "paid";
type Note = {
  id: string; reference: string | null; note_date: string;
  beneficiary_name: string; beneficiary_cin: string | null; objet: string | null;
  period_from: string | null; period_to: string | null; accorded_by: string | null;
  items: Item[]; total: number; nc: "noir" | "comptable"; comment: string | null; created_by_name: string | null;
  status: NoteStatus;
  approved_by_name: string | null; paid_by_name: string | null;
  rejection_reason: string | null; payment_method: string | null; payment_date: string | null;
};
type NotesData = { items: Note[]; count: number; total: number };

const STATUS_LABELS: Record<NoteStatus, string> = {
  pending: "En attente N+1", approved: "Approuvée", rejected: "Rejetée", paid: "Payée",
};
const STATUS_TONES: Record<NoteStatus, string> = {
  pending: "chip-c-amber", approved: "chip-c-blue", rejected: "chip-c-red", paid: "chip-c-green",
};

const fieldStyle = { marginTop: 6, marginBottom: 14, width: "100%", padding: "10px 13px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const cell: React.CSSProperties = { padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, fontSize: 13, color: PAL.ink, whiteSpace: "nowrap", verticalAlign: "middle" };

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Backdrop({ children, width = 720 }: { children: React.ReactNode; width?: number }) {
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="dash-card" style={{ padding: "14px 18px", flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ ...labelStyle }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: PAL.ink, marginTop: 6 }}>{value}</div>
    </div>
  );
}

type FormItem = { article: string; prestataire: string; montant: string };
const EMPTY_ROW: FormItem = { article: "", prestataire: "", montant: "" };

function NoteModal({ note, onClose, onSaved }: { note: Note | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!note;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    note_date: (note?.note_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    beneficiary_name: note?.beneficiary_name || "",
    beneficiary_cin: note?.beneficiary_cin || "",
    objet: note?.objet || "",
    period_from: (note?.period_from || "").slice(0, 10),
    period_to: (note?.period_to || "").slice(0, 10),
    accorded_by: note?.accorded_by || "",
    nc: note?.nc || "comptable",
    comment: note?.comment || "",
  });
  const [items, setItems] = useState<FormItem[]>(
    note?.items?.length
      ? note.items.map(it => ({ article: it.article || "", prestataire: it.prestataire || "", montant: String(it.montant ?? "") }))
      : [{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]
  );
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (i: number, k: keyof FormItem, v: string) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setItems(rows => [...rows, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setItems(rows => rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);

  const total = items.reduce((s, r) => s + (parseFloat(r.montant) || 0), 0);

  async function submit() {
    if (!form.beneficiary_name.trim()) { toast.error("Le nom du bénéficiaire est obligatoire."); return; }
    const payloadItems = items
      .map(r => ({ article: r.article.trim() || null, prestataire: r.prestataire.trim() || null, montant: parseFloat(r.montant) || 0 }))
      .filter(r => r.article || r.prestataire || r.montant);
    if (!payloadItems.length) { toast.error("Ajoutez au moins une ligne au tableau."); return; }
    const payload = {
      note_date: form.note_date,
      beneficiary_name: form.beneficiary_name.trim(),
      beneficiary_cin: form.beneficiary_cin.trim() || null,
      objet: form.objet.trim() || null,
      period_from: form.period_from || null,
      period_to: form.period_to || null,
      accorded_by: form.accorded_by.trim() || null,
      items: payloadItems,
      nc: form.nc,
      comment: form.comment.trim() || null,
    };
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/accounting/cash-notes/${note!.id}`, payload);
        toast.success("Note de caisse mise à jour.");
      } else {
        const res: any = await api.post("/api/accounting/cash-notes", payload);
        toast.success("Avance enregistrée — en attente d'approbation N+1.");
        if (res?.id) api.download(`/api/accounting/cash-notes/${res.id}/pdf`, `Note_de_caisse_${res.reference ?? res.id}.pdf`).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop width={760}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <H2>{editing ? "Modifier la note de caisse" : "Nouvelle note de caisse"}</H2>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, marginTop: 4 }}><X size={18} strokeWidth={1.7} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={form.note_date} onChange={e => set("note_date", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Accordée par</label>
          <input value={form.accorded_by} onChange={e => set("accorded_by", e.target.value)} placeholder="Direction / Responsable" className="u-input" style={fieldStyle} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Nom et Prénom (bénéficiaire) *</label>
          <input value={form.beneficiary_name} onChange={e => set("beneficiary_name", e.target.value)} placeholder="Nom et prénom" className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>CIN</label>
          <input value={form.beneficiary_cin} onChange={e => set("beneficiary_cin", e.target.value)} placeholder="N° CIN" className="u-input" style={fieldStyle} />
        </div>
      </div>

      <label style={labelStyle}>Objet de la note de caisse</label>
      <textarea value={form.objet} onChange={e => set("objet", e.target.value)} placeholder="Motif / objet de l'avance de caisse" rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div>
          <label style={labelStyle}>Période — du</label>
          <input type="date" value={form.period_from} onChange={e => set("period_from", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>… au</label>
          <input type="date" value={form.period_to} onChange={e => set("period_to", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px", alignItems: "center" }}>
        <div>
          <label style={labelStyle}>Nature (journal de caisse)</label>
          <select value={form.nc} onChange={e => set("nc", e.target.value)} className="u-input" style={fieldStyle}>
            <option value="comptable">Comptable (déclaré)</option>
            <option value="noir">Caisse sociale (espèces)</option>
          </select>
        </div>
        <div style={{ fontSize: 12, color: PAL.muted, marginTop: 8 }}>
          Cette avance sera soumise à <strong>approbation N+1</strong>, puis réglée dans l'onglet <strong>Paiements</strong>. La <strong>sortie</strong> au journal de caisse (montant = total, cette nature) n'est comptabilisée qu'au paiement.
        </div>
      </div>

      {/* Tableau dynamique Article / Prestataire / Montant */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 8 }}>
        <label style={labelStyle}>Détail (Article · Prestataire · Montant)</label>
        <button type="button" onClick={addRow} className="btn-c btn-c-soft btn-c-sm"><Plus size={13} />Ajouter une ligne</button>
      </div>
      <div style={{ border: `1px solid ${PAL.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Article", "Prestataire", "Montant (DH)", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", borderBottom: `1px solid ${PAL.line}`, textAlign: i === 2 ? "right" : "left", ...labelStyle }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 6, borderBottom: `1px solid ${PAL.line}` }}>
                  <input value={r.article} onChange={e => setItem(i, "article", e.target.value)} placeholder="Désignation" className="u-input" style={{ ...fieldStyle, margin: 0 }} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${PAL.line}` }}>
                  <input value={r.prestataire} onChange={e => setItem(i, "prestataire", e.target.value)} placeholder="Fournisseur / tiers" className="u-input" style={{ ...fieldStyle, margin: 0 }} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${PAL.line}`, width: 140 }}>
                  <input type="number" step="any" min="0" value={r.montant} onChange={e => setItem(i, "montant", e.target.value)} placeholder="0,00" className="u-input" style={{ ...fieldStyle, margin: 0, textAlign: "right", fontFamily: mono }} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${PAL.line}`, width: 34, textAlign: "center" }}>
                  <button type="button" onClick={() => removeRow(i)} disabled={items.length <= 1} title="Retirer la ligne"
                    style={{ background: "none", border: 0, cursor: items.length <= 1 ? "not-allowed" : "pointer", color: items.length <= 1 ? PAL.line : "var(--pal-danger)" }}>
                    <Trash2 size={15} strokeWidth={1.7} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: PAL.muted, fontFamily: sans, fontSize: 13 }}>Total Global</td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: mono, fontWeight: 700, color: "var(--pal-primary)" }}>{fmtMAD(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <label style={labelStyle}>Commentaire (interne, optionnel)</label>
      <textarea value={form.comment} onChange={e => set("comment", e.target.value)} rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" }} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Annuler</button>
        <button onClick={submit} disabled={busy} className="btn-c btn-c-primary">{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer & télécharger"}</button>
      </div>
    </Backdrop>
  );
}

export function AccountingCashNotes() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isCashier = roles.includes("cashier");
  const canWrite = isAdmin || isCashier;

  const [data, setData] = useState<NotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const { focusId, attachFocus } = useDeepLinkFocus();

  function load() {
    setLoading(true);
    api.get("/api/accounting/cash-notes")
      .then((d: NotesData) => setData(d))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function remove(n: Note) {
    if (!window.confirm(`Supprimer la note de caisse ${n.reference ?? ""} ?`)) return;
    try {
      await api.delete(`/api/accounting/cash-notes/${n.id}`);
      toast.success("Note supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  async function approve(n: Note) {
    if (!window.confirm(`Approuver l'avance ${n.reference ?? ""} (${fmtMAD(n.total)}) ? Elle pourra ensuite être réglée dans l'onglet Paiements.`)) return;
    try {
      await api.post(`/api/accounting/cash-notes/${n.id}/approve`, {});
      toast.success("Avance approuvée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Approbation impossible.");
    }
  }

  async function reject(n: Note) {
    const reason = window.prompt(`Motif du rejet de l'avance ${n.reference ?? ""} :`, "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("Le motif du rejet est obligatoire."); return; }
    try {
      await api.post(`/api/accounting/cash-notes/${n.id}/reject`, { comment: reason.trim() });
      toast.success("Avance rejetée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Rejet impossible.");
    }
  }

  function downloadPdf(n: Note) {
    api.download(`/api/accounting/cash-notes/${n.id}/pdf`, `Note_de_caisse_${n.reference ?? n.id}.pdf`)
      .catch((e: any) => toast.error(e?.message ?? "Téléchargement impossible."));
  }

  const items = data?.items ?? [];

  return (
    <div style={{ fontFamily: sans }}>
      {creating && <NoteModal note={null} onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <NoteModal note={editing} onClose={() => setEditing(null)} onSaved={load} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <SectionLabel>Notes de caisse</SectionLabel>
        {canWrite && (
          <button onClick={() => setCreating(true)} className="btn-c btn-c-primary btn-c-sm"><Plus size={14} />Nouvelle note</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatTile label="Notes émises" value={String(data?.count ?? 0)} />
        <StatTile label="Total cumulé" value={fmtMAD(data?.total ?? 0)} />
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : items.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<NotebookPen size={28} strokeWidth={1.7} />} text="Aucune note de caisse. Créez-en une pour justifier une avance / un remboursement de caisse." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
              <thead>
                <tr>
                  {["N°", "Date", "Bénéficiaire", "CIN", "Objet", "Période", "Total (DH)", "n/c", "Statut", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: i === 6 ? "right" : "left", ...labelStyle }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(n => (
                  <tr key={n.id} ref={n.id === focusId ? attachFocus : undefined}>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{n.reference ?? "—"}</td>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{fmtDate(n.note_date)}</td>
                    <td style={{ ...cell, whiteSpace: "normal", minWidth: 150 }}>{n.beneficiary_name}</td>
                    <td style={cell}>{n.beneficiary_cin || "—"}</td>
                    <td style={{ ...cell, whiteSpace: "normal", minWidth: 200, color: PAL.muted }}>{n.objet || "—"}</td>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>
                      {n.period_from || n.period_to ? `${fmtDate(n.period_from)} → ${fmtDate(n.period_to)}` : "—"}
                    </td>
                    <td style={{ ...cell, fontFamily: mono, fontWeight: 700, textAlign: "right" }}>{fmtMAD(n.total)}</td>
                    <td style={cell}>
                      <span className={`chip-c ${n.nc === "noir" ? "chip-c-amber" : "chip-c-blue"}`}>{n.nc === "noir" ? "Caisse sociale" : "Comptable"}</span>
                    </td>
                    <td style={cell}>
                      <span className={`chip-c ${STATUS_TONES[n.status] ?? "chip-c-amber"}`} title={n.status === "rejected" && n.rejection_reason ? `Motif : ${n.rejection_reason}` : n.status === "paid" && n.payment_date ? `Payée le ${fmtDate(n.payment_date)}${n.paid_by_name ? ` · ${n.paid_by_name}` : ""}` : undefined}>
                        {STATUS_LABELS[n.status] ?? n.status}
                      </span>
                    </td>
                    <td style={{ ...cell, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {isAdmin && n.status === "pending" && (
                          <>
                            <button onClick={() => approve(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-success, green)" }} title="Approuver (N+1)">
                              <Check size={16} strokeWidth={2} />
                            </button>
                            <button onClick={() => reject(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Rejeter">
                              <Ban size={15} strokeWidth={1.9} />
                            </button>
                          </>
                        )}
                        <button onClick={() => downloadPdf(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Télécharger le PDF">
                          <FileDown size={15} strokeWidth={1.7} />
                        </button>
                        {canWrite && n.status === "pending" && (
                          <button onClick={() => setEditing(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-primary)" }} title="Modifier">
                            <Pencil size={14} strokeWidth={1.7} />
                          </button>
                        )}
                        {(isAdmin || (isCashier && (n.status === "pending" || n.status === "rejected"))) && (
                          <button onClick={() => remove(n)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
                            <Trash2 size={14} strokeWidth={1.7} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
