import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plane, Plus, Trash2, X, FileDown, Pencil, Check, Ban } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth";
import { useDeepLinkFocus } from "@/lib/deep-link";
import { fmtMAD } from "./Overview";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

// Catalogue FIXE des thèmes / articles — MÊMES clés que le backend (MISSION_CATALOG
// dans pdf_generators.py). L'ordre reproduit le modèle bébleo « Note des frais de mission ».
const MISSION_CATALOG: { theme: string; articles: { key: string; label: string }[] }[] = [
  { theme: "Transport", articles: [
    { key: "taxi", label: "Taxi / Bus / Car" },
    { key: "vehicule", label: "Véhicule personnel" },
    { key: "location", label: "Location de voiture" },
    { key: "train", label: "Train" },
  ] },
  { theme: "Hébergement", articles: [
    { key: "hotel", label: "Hôtels" },
    { key: "heb_forfait", label: "Forfait" },
  ] },
  { theme: "Repas", articles: [
    { key: "repas_justif", label: "Justificatifs" },
    { key: "repas_forfait", label: "Forfait" },
  ] },
  { theme: "Divers", articles: [
    { key: "telephone", label: "Téléphone" },
    { key: "peage", label: "Péage Autoroute" },
    { key: "gardiennage", label: "Gardiennage" },
    { key: "autres", label: "Autres" },
  ] },
];
const ALL_ARTICLES = MISSION_CATALOG.flatMap(g => g.articles);
const MAX_DAYS = 7;

type NoteStatus = "pending" | "approved" | "rejected" | "paid";
type Note = {
  id: string; reference: string | null; note_date: string;
  beneficiary_name: string; beneficiary_cin: string | null;
  accompanied_by: string | null; objet: string | null;
  mission_from: string | null; mission_to: string | null; accorded_by: string | null;
  days: string[]; amounts: Record<string, number[]>; total: number;
  nc: "noir" | "comptable"; comment: string | null; created_by_name: string | null;
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

function fmtNum(v: number): string {
  if (!v) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Backdrop({ children, width = 940 }: { children: React.ReactNode; width?: number }) {
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

function NoteModal({ note, onClose, onSaved }: { note: Note | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!note;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    note_date: (note?.note_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    beneficiary_name: note?.beneficiary_name || "",
    beneficiary_cin: note?.beneficiary_cin || "",
    accompanied_by: note?.accompanied_by || "",
    objet: note?.objet || "",
    mission_from: (note?.mission_from || "").slice(0, 10),
    mission_to: (note?.mission_to || "").slice(0, 10),
    accorded_by: note?.accorded_by || "",
    nc: note?.nc || "comptable",
    comment: note?.comment || "",
  });

  // Colonnes-jour + matrice des montants (chaînes alignées sur l'index de jour).
  const initDays = note?.days?.length ? note.days.map(d => (d || "").slice(0, 10)) : [form.note_date];
  const initAmounts: Record<string, string[]> = {};
  if (note?.amounts) {
    for (const a of ALL_ARTICLES) {
      const row = note.amounts[a.key];
      if (row?.length) initAmounts[a.key] = initDays.map((_, i) => (row[i] ? String(row[i]) : ""));
    }
  }
  const [days, setDays] = useState<string[]>(initDays);
  const [amounts, setAmounts] = useState<Record<string, string[]>>(initAmounts);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const cellVal = (key: string, di: number): string => amounts[key]?.[di] ?? "";
  function setCell(key: string, di: number, v: string) {
    setAmounts(prev => {
      const row = prev[key] ? [...prev[key]] : Array(days.length).fill("");
      while (row.length < days.length) row.push("");
      row[di] = v;
      return { ...prev, [key]: row };
    });
  }
  const setDayDate = (di: number, v: string) => setDays(prev => prev.map((d, i) => (i === di ? v : d)));
  function addDay() {
    if (days.length >= MAX_DAYS) return;
    setDays(prev => [...prev, ""]);
    setAmounts(prev => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, [...r, ""]])));
  }
  function removeDay(di: number) {
    if (days.length <= 1) return;
    setDays(prev => prev.filter((_, i) => i !== di));
    setAmounts(prev => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, r.filter((_, i) => i !== di)])));
  }

  const dayTotal = (di: number) => ALL_ARTICLES.reduce((s, a) => s + (parseFloat(cellVal(a.key, di)) || 0), 0);
  const grandTotal = days.reduce((s, _, di) => s + dayTotal(di), 0);

  async function submit() {
    if (!form.beneficiary_name.trim()) { toast.error("Le nom du bénéficiaire est obligatoire."); return; }
    const payloadAmounts: Record<string, number[]> = {};
    for (const a of ALL_ARTICLES) {
      const row = days.map((_, di) => parseFloat(cellVal(a.key, di)) || 0);
      if (row.some(v => v)) payloadAmounts[a.key] = row;
    }
    if (grandTotal <= 0) { toast.error("Saisissez au moins un montant dans la grille."); return; }
    const payload = {
      note_date: form.note_date,
      beneficiary_name: form.beneficiary_name.trim(),
      beneficiary_cin: form.beneficiary_cin.trim() || null,
      accompanied_by: form.accompanied_by.trim() || null,
      objet: form.objet.trim() || null,
      mission_from: form.mission_from || null,
      mission_to: form.mission_to || null,
      accorded_by: form.accorded_by.trim() || null,
      days: days.map(d => d || ""),
      amounts: payloadAmounts,
      nc: form.nc,
      comment: form.comment.trim() || null,
    };
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/accounting/mission-notes/${note!.id}`, payload);
        toast.success("Note de frais de mission mise à jour.");
      } else {
        const res: any = await api.post("/api/accounting/mission-notes", payload);
        toast.success("Avance enregistrée — en attente d'approbation N+1.");
        if (res?.id) api.download(`/api/accounting/mission-notes/${res.id}/pdf`, `Note_frais_mission_${res.reference ?? res.id}.pdf`).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  const th: React.CSSProperties = { padding: "6px 8px", borderBottom: `1px solid ${PAL.line}`, borderRight: `1px solid ${PAL.line}`, background: "var(--pal-pale)", ...labelStyle, letterSpacing: ".04em", verticalAlign: "middle" };
  const tdBase: React.CSSProperties = { borderBottom: `1px solid ${PAL.line}`, borderRight: `1px solid ${PAL.line}`, fontSize: 12.5, color: PAL.ink };
  const cellInput: React.CSSProperties = { width: 78, padding: "6px 6px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontFamily: mono, fontSize: 12.5, textAlign: "right", color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" };

  return (
    <Backdrop>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <H2>{editing ? "Modifier la note de frais de mission" : "Nouvelle note de frais de mission"}</H2>
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

      <label style={labelStyle}>Accompagné par</label>
      <input value={form.accompanied_by} onChange={e => set("accompanied_by", e.target.value)} placeholder="Personnes accompagnant la mission (optionnel)" className="u-input" style={fieldStyle} />

      <label style={labelStyle}>Objet de mission</label>
      <textarea value={form.objet} onChange={e => set("objet", e.target.value)} placeholder="Motif / objet de la mission" rows={2} className="u-input" style={{ ...fieldStyle, resize: "vertical" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px", alignItems: "end" }}>
        <div>
          <label style={labelStyle}>Mission du</label>
          <input type="date" value={form.mission_from} onChange={e => set("mission_from", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>… au</label>
          <input type="date" value={form.mission_to} onChange={e => set("mission_to", e.target.value)} className="u-input" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Nature (journal de caisse)</label>
          <select value={form.nc} onChange={e => set("nc", e.target.value)} className="u-input" style={fieldStyle}>
            <option value="comptable">Comptable (déclaré)</option>
            <option value="noir">Caisse sociale (espèces)</option>
          </select>
        </div>
      </div>

      {/* Grille matricielle Thème / Article × jours */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 8 }}>
        <label style={labelStyle}>Frais par thème / article et par jour (DH)</label>
        <button type="button" onClick={addDay} disabled={days.length >= MAX_DAYS} className="btn-c btn-c-soft btn-c-sm" style={{ opacity: days.length >= MAX_DAYS ? 0.5 : 1 }}>
          <Plus size={13} />Ajouter un jour
        </button>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${PAL.line}`, borderRadius: 10, marginBottom: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 90, textAlign: "left" }}>Thème</th>
              <th style={{ ...th, width: 150, textAlign: "left" }}>Article</th>
              {days.map((d, di) => (
                <th key={di} style={{ ...th, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span>J{di + 1}</span>
                      {days.length > 1 && (
                        <button type="button" onClick={() => removeDay(di)} title="Retirer ce jour" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)", padding: 0, lineHeight: 0 }}>
                          <X size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    <input type="date" value={d} onChange={e => setDayDate(di, e.target.value)} style={{ width: 118, padding: "4px 5px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontFamily: sans, fontSize: 11, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MISSION_CATALOG.flatMap(group => group.articles.map((a, ai) => (
              <tr key={a.key}>
                {ai === 0 && (
                  <td rowSpan={group.articles.length} style={{ ...tdBase, padding: "8px 10px", fontWeight: 700, color: "var(--pal-primary)", verticalAlign: "middle", background: "oklch(97% 0.01 175)" }}>{group.theme}</td>
                )}
                <td style={{ ...tdBase, padding: "6px 10px" }}>{a.label}</td>
                {days.map((_, di) => (
                  <td key={di} style={{ ...tdBase, padding: 5, textAlign: "center" }}>
                    <input type="number" step="any" min="0" value={cellVal(a.key, di)} onChange={e => setCell(a.key, di, e.target.value)} placeholder="0,00" className="u-input" style={cellInput} />
                  </td>
                ))}
              </tr>
            )))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ ...tdBase, padding: "9px 10px", textAlign: "right", fontWeight: 700, color: PAL.muted, background: "var(--pal-pale)" }}>Total Journalier</td>
              {days.map((_, di) => (
                <td key={di} style={{ ...tdBase, padding: "9px 6px", textAlign: "right", fontFamily: mono, fontWeight: 700, color: PAL.ink, background: "var(--pal-pale)" }}>{fmtNum(dayTotal(di))}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={2} style={{ ...tdBase, padding: "10px", textAlign: "right", fontWeight: 700, color: PAL.muted }}>Total Global</td>
              <td colSpan={days.length} style={{ ...tdBase, padding: "10px", textAlign: "right", fontFamily: mono, fontWeight: 800, fontSize: 14, color: "var(--pal-primary)" }}>{fmtMAD(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize: 12, color: PAL.muted, marginBottom: 12 }}>
        Cette avance sera soumise à <strong>approbation N+1</strong>, puis réglée dans l'onglet <strong>Paiements</strong>. La <strong>sortie</strong> au journal de caisse (montant = total global, nature <strong>{form.nc === "noir" ? "caisse sociale" : "comptable"}</strong>) n'est comptabilisée qu'au paiement.
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

export function AccountingMissionNotes() {
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
    api.get("/api/accounting/mission-notes")
      .then((d: NotesData) => setData(d))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function remove(n: Note) {
    if (!window.confirm(`Supprimer la note de frais de mission ${n.reference ?? ""} ?`)) return;
    try {
      await api.delete(`/api/accounting/mission-notes/${n.id}`);
      toast.success("Note supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  async function approve(n: Note) {
    if (!window.confirm(`Approuver l'avance ${n.reference ?? ""} (${fmtMAD(n.total)}) ? Elle pourra ensuite être réglée dans l'onglet Paiements.`)) return;
    try {
      await api.post(`/api/accounting/mission-notes/${n.id}/approve`, {});
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
      await api.post(`/api/accounting/mission-notes/${n.id}/reject`, { comment: reason.trim() });
      toast.success("Avance rejetée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Rejet impossible.");
    }
  }

  function downloadPdf(n: Note) {
    api.download(`/api/accounting/mission-notes/${n.id}/pdf`, `Note_frais_mission_${n.reference ?? n.id}.pdf`)
      .catch((e: any) => toast.error(e?.message ?? "Téléchargement impossible."));
  }

  const items = data?.items ?? [];

  return (
    <div style={{ fontFamily: sans }}>
      {creating && <NoteModal note={null} onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <NoteModal note={editing} onClose={() => setEditing(null)} onSaved={load} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <SectionLabel>Notes de frais de mission</SectionLabel>
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
        <div className="dash-card"><EmptyHint icon={<Plane size={28} strokeWidth={1.7} />} text="Aucune note de frais de mission. Créez-en une pour justifier les frais engagés lors d'une mission." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
              <thead>
                <tr>
                  {["N°", "Date", "Bénéficiaire", "Objet", "Mission", "Total (DH)", "n/c", "Statut", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: i === 5 ? "right" : "left", ...labelStyle }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(n => (
                  <tr key={n.id} ref={n.id === focusId ? attachFocus : undefined}>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{n.reference ?? "—"}</td>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{fmtDate(n.note_date)}</td>
                    <td style={{ ...cell, whiteSpace: "normal", minWidth: 150 }}>{n.beneficiary_name}</td>
                    <td style={{ ...cell, whiteSpace: "normal", minWidth: 200, color: PAL.muted }}>{n.objet || "—"}</td>
                    <td style={{ ...cell, fontFamily: mono, fontSize: 12, color: PAL.muted }}>
                      {n.mission_from || n.mission_to ? `${fmtDate(n.mission_from)} → ${fmtDate(n.mission_to)}` : "—"}
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
