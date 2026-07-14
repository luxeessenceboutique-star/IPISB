import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Check, GraduationCap, Users, Wallet, Building, ChevronRight, FileText, Download } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { fmtMAD } from "./Overview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const LS_INDIRECT = "ipisb_analytics_indirect";

type Session = {
  class_id: string; class_name: string; tuition_per_student: number; nb_students: number;
  ca_facturable: number; encaisse: number; encours: number;
  cout_direct: number; cout_indirect: number; cout_formateurs: number; marge: number;
};
type Trainer = {
  user_id: string; full_name: string; email: string | null;
  hourly_rate: number; social_charge_percent: number; hours: number;
  remuneration: number; cout_direct: number; cout_indirect: number; cout_revient: number; cout_horaire_reel: number;
  by_class: { class_id: string; class_name: string; hours: number }[];
};
type Totals = { ca_facturable: number; encaisse: number; encours: number; cout_direct: number; cout_indirect: number; cout_formateurs: number; marge: number };
type Report = {
  period: { from: string; to: string; label: string };
  indirect_total: number; indirect_rate: number; total_hours: number;
  sessions: Session[]; trainers: Trainer[]; totals: Totals;
};
type StudentInvoice = {
  id: string; invoice_number: string; invoice_date: string | null; due_date: string | null;
  total_incl_vat: number; payment_status: string;
};
type StudentDetail = {
  student_id: string; full_name: string; email: string | null; tuition: number;
  invoices: StudentInvoice[]; facture_total: number; paye: number; encours: number;
};
type UnassignedGroup = { invoices: StudentInvoice[]; facture_total: number; paye: number; encours: number };
type ClassDetail = { class_id: string; class_name: string; students: StudentDetail[]; unassigned: UnassignedGroup };

const STATUS_LABEL: Record<string, string> = { pending: "En attente", partially_paid: "Partiel", paid: "Payé" };
const STATUS_TONE: Record<string, string> = { pending: "chip-c-amber", partially_paid: "chip-c-blue", paid: "chip-c-green" };

const PERIODS = [
  { key: "month", label: "Ce mois" },
  { key: "quarter", label: "Ce trimestre" },
  { key: "year", label: "Cette année" },
];

const num = (v: number) => new Intl.NumberFormat("fr-FR").format(v);

function EditableNumber({ value, suffix, onSave }: { value: number; suffix?: string; onSave: (v: number) => Promise<void> }) {
  const [val, setVal] = useState(String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(String(value)); }, [value]);
  const changed = (parseFloat(val) || 0) !== value;

  async function save() {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) { toast.error("Valeur invalide."); return; }
    setBusy(true);
    try { await onSave(n); } finally { setBusy(false); }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number" min="0" step="any" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && changed) save(); }}
        style={{ width: 78, padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: mono, fontSize: 12.5, textAlign: "right", color: PAL.ink, background: PAL.paper, outline: "none" }}
      />
      {suffix && <span style={{ fontSize: 11, color: PAL.muted }}>{suffix}</span>}
      <button
        onClick={save} disabled={!changed || busy}
        title="Enregistrer"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: 0, cursor: changed && !busy ? "pointer" : "default", background: changed ? "var(--pal-primary)" : "transparent", color: changed ? "#fff" : PAL.line }}
      >
        <Check size={14} strokeWidth={2} />
      </button>
    </span>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="dash-card" style={{ flex: "1 1 170px", minWidth: 160, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: PAL.muted, marginBottom: 10 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const }}>{label}</span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: tone ?? PAL.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: PAL.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: PAL.muted, borderBottom: `1px solid ${PAL.line}`, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: PAL.ink, borderBottom: `1px solid ${PAL.line}`, whiteSpace: "nowrap" };
const tdNum: React.CSSProperties = { ...td, fontFamily: mono, textAlign: "right" };
const thNum: React.CSSProperties = { ...th, textAlign: "right" };

function StatusChips({ invoices }: { invoices: StudentInvoice[] }) {
  if (invoices.length === 0) return <span style={{ color: PAL.muted }}>—</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5 }}>
      {invoices.map(inv => (
        <span key={inv.id} className={`chip-c ${STATUS_TONE[inv.payment_status] ?? ""}`} title={STATUS_LABEL[inv.payment_status] ?? inv.payment_status}>
          {inv.invoice_number} · {fmtMAD(inv.total_incl_vat)}
        </span>
      ))}
    </span>
  );
}

function StudentDetailPanel({ data }: { data?: ClassDetail }) {
  if (!data) return null;
  if (data.students.length === 0 && data.unassigned.invoices.length === 0) {
    return <div style={{ padding: 16, fontSize: 12.5, color: PAL.muted }}>Aucun élève inscrit ni facture rattachée à cette promo.</div>;
  }
  const sub: React.CSSProperties = { padding: "8px 12px", fontSize: 12.5, color: PAL.ink, borderBottom: `1px solid ${PAL.line}`, whiteSpace: "nowrap" };
  const subTh: React.CSSProperties = { ...sub, fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: PAL.muted, textAlign: "left" };
  const subNum: React.CSSProperties = { ...sub, fontFamily: mono, textAlign: "right" };
  const subThNum: React.CSSProperties = { ...subTh, textAlign: "right" };
  return (
    <div style={{ padding: "6px 14px 14px 40px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            <th style={subTh}>Élève</th>
            <th style={subThNum}>Scolarité</th>
            <th style={subThNum}>Facturé</th>
            <th style={subThNum}>Payé</th>
            <th style={subThNum}>Reste</th>
            <th style={subTh}>Factures</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map(st => (
            <tr key={st.student_id}>
              <td style={{ ...sub, fontWeight: 600 }}>{st.full_name}</td>
              <td style={subNum}>{fmtMAD(st.tuition)}</td>
              <td style={subNum}>{fmtMAD(st.facture_total)}</td>
              <td style={{ ...subNum, color: "var(--pal-good)" }}>{fmtMAD(st.paye)}</td>
              <td style={{ ...subNum, color: st.encours > 0 ? "var(--pal-danger)" : PAL.muted }}>{fmtMAD(st.encours)}</td>
              <td style={sub}><StatusChips invoices={st.invoices} /></td>
            </tr>
          ))}
          {data.unassigned.invoices.length > 0 && (
            <tr>
              <td style={{ ...sub, fontStyle: "italic", color: PAL.muted }}>Factures sans élève</td>
              <td style={subNum}>—</td>
              <td style={subNum}>{fmtMAD(data.unassigned.facture_total)}</td>
              <td style={{ ...subNum, color: "var(--pal-good)" }}>{fmtMAD(data.unassigned.paye)}</td>
              <td style={{ ...subNum, color: data.unassigned.encours > 0 ? "var(--pal-danger)" : PAL.muted }}>{fmtMAD(data.unassigned.encours)}</td>
              <td style={sub}><StatusChips invoices={data.unassigned.invoices} /></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AccountingAnalytics() {
  const [period, setPeriod] = useState("year");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  // Détail dépliable par promo (élèves + factures rattachées), chargé à la demande.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, ClassDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  async function toggleClass(classId: string) {
    if (expanded === classId) { setExpanded(null); return; }
    setExpanded(classId);
    if (detail[classId]) return;
    setDetailLoading(classId);
    try {
      const res = await api.get(`/api/accounting/analytics/class/${classId}/students`);
      setDetail(d => ({ ...d, [classId]: res }));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement du détail.");
      setExpanded(null);
    } finally {
      setDetailLoading(null);
    }
  }

  // Charges indirectes de la période — saisie libre, mémorisée localement.
  const [indirectInput, setIndirectInput] = useState<string>(() => localStorage.getItem(LS_INDIRECT) ?? "0");
  const [indirect, setIndirect] = useState<number>(() => parseFloat(localStorage.getItem(LS_INDIRECT) ?? "0") || 0);

  // Debounce : on ne relance la requête que 500 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = parseFloat(indirectInput) || 0;
      localStorage.setItem(LS_INDIRECT, String(n));
      setIndirect(n);
    }, 500);
    return () => clearTimeout(t);
  }, [indirectInput]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/api/accounting/analytics/formation?period=${period}&indirect_total=${indirect}`);
      setData(res);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, indirect]);

  async function saveTuition(classId: string, v: number) {
    await api.put(`/api/accounting/analytics/class/${classId}/tuition`, { tuition_per_student: v });
    toast.success("Scolarité mise à jour.");
    setDetail(d => { const n = { ...d }; delete n[classId]; return n; }); // détail périmé → refetch
    load();
  }
  async function saveTrainer(tr: Trainer, patch: { hourly_rate?: number; social_charge_percent?: number }) {
    await api.put(`/api/accounting/analytics/trainer/${tr.user_id}/rate`, {
      hourly_rate: patch.hourly_rate ?? tr.hourly_rate,
      social_charge_percent: patch.social_charge_percent ?? tr.social_charge_percent,
      currency: "MAD",
    });
    toast.success("Formateur mis à jour.");
    load();
  }

  const t = data?.totals;

  return (
    <div style={{ fontFamily: sans }}>
      {/* Sélecteur de période */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: PAL.muted, fontWeight: 600 }}>Période (heures formateurs) :</span>
        <div style={{ display: "inline-flex", border: `1px solid ${PAL.line}`, borderRadius: 10, overflow: "hidden" }}>
          {PERIODS.map(p => (
            <button
              key={p.key} type="button" onClick={() => setPeriod(p.key)}
              style={{ padding: "8px 16px", border: 0, cursor: "pointer", fontFamily: sans, fontSize: 12.5, fontWeight: period === p.key ? 700 : 500, background: period === p.key ? "var(--pal-primary)" : "transparent", color: period === p.key ? "#fff" : PAL.muted }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data && <span style={{ fontSize: 12, color: PAL.muted }}>{data.period.from} → {data.period.to}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={() => api.download(`/api/accounting/analytics/report/pdf?period=${period}&indirect=${indirect}`, "Rapport_Synthese_Comptable.pdf").catch((e: any) => toast.error(e?.message ?? "Erreur lors du téléchargement."))}
            className="btn-c btn-c-sm btn-c-soft"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px" }}
            title="Télécharger le rapport PDF"
          >
            <FileText size={13} strokeWidth={1.7} /> PDF
          </button>
          <button
            onClick={() => api.download(`/api/accounting/analytics/export/csv?period=${period}`, "synthese_financiere.csv").catch((e: any) => toast.error(e?.message ?? "Erreur lors de l'export."))}
            className="btn-c btn-c-sm btn-c-ghost"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px" }}
            title="Exporter en CSV (Excel)"
          >
            <Download size={13} strokeWidth={1.7} /> CSV
          </button>
        </div>
      </div>

      {/* Charges indirectes de la période */}
      <div className="dash-card" style={{ padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Building size={16} strokeWidth={1.7} style={{ color: "var(--pal-primary)" }} />
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PAL.ink }}>Charges indirectes sur la période</div>
          <div style={{ fontSize: 11.5, color: PAL.muted }}>Loyer, électricité, administration… réparties à l'heure sur formateurs et sessions.</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="number" min="0" step="any" value={indirectInput}
            onChange={e => setIndirectInput(e.target.value)}
            style={{ width: 130, padding: "9px 11px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: mono, fontSize: 13.5, textAlign: "right", color: PAL.ink, background: PAL.paper, outline: "none" }}
          />
          <span style={{ fontSize: 12, color: PAL.muted }}>DH</span>
        </div>
        {data && (
          <div style={{ fontSize: 11.5, color: PAL.muted, fontFamily: mono, background: "var(--pal-pale)", padding: "6px 10px", borderRadius: 8 }}>
            {num(data.total_hours)} h · taux {fmtMAD(data.indirect_rate)}/h
          </div>
        )}
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : !data ? (
        <div className="dash-card"><EmptyHint icon={<GraduationCap size={28} strokeWidth={1.7} />} text="Aucune donnée." /></div>
      ) : (
        <>
          {/* KPIs globaux */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
            <KpiCard icon={<GraduationCap size={15} strokeWidth={1.7} />} label="CA facturable" value={fmtMAD(t!.ca_facturable)} />
            <KpiCard icon={<Wallet size={15} strokeWidth={1.7} />} label="Encaissé" value={fmtMAD(t!.encaisse)} tone="var(--pal-good)" />
            <KpiCard icon={<Wallet size={15} strokeWidth={1.7} />} label="Encours facturation" value={fmtMAD(t!.encours)} tone="var(--pal-danger)" />
            <KpiCard icon={<Users size={15} strokeWidth={1.7} />} label="Coût de revient form." value={fmtMAD(t!.cout_formateurs)} sub={`dont indirect ${fmtMAD(t!.cout_indirect)}`} />
            <KpiCard icon={<Wallet size={15} strokeWidth={1.7} />} label="Marge" value={fmtMAD(t!.marge)} tone={t!.marge >= 0 ? "var(--pal-good)" : "var(--pal-danger)"} />
          </div>

          {/* Par session */}
          <SectionLabel>Par session (promo)</SectionLabel>
          <div className="dash-card overflow-hidden" style={{ padding: 0, marginBottom: 28, overflowX: "auto" }}>
            {data.sessions.length === 0 ? (
              <EmptyHint icon={<GraduationCap size={28} strokeWidth={1.7} />} text="Aucune promo. Créez des classes dans la section Classes." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                <thead>
                  <tr>
                    <th style={th}>Promo</th>
                    <th style={thNum}>Scolarité/élève</th>
                    <th style={thNum}>Élèves</th>
                    <th style={thNum}>CA facturable</th>
                    <th style={thNum}>Encaissé</th>
                    <th style={thNum}>Encours</th>
                    <th style={thNum}>Coût revient</th>
                    <th style={thNum}>Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map(s => {
                    const open = expanded === s.class_id;
                    return (
                      <Fragment key={s.class_id}>
                        <tr onClick={() => toggleClass(s.class_id)} style={{ cursor: "pointer", background: open ? "var(--pal-pale)" : undefined }}>
                          <td style={{ ...td, fontWeight: 700 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <ChevronRight size={15} strokeWidth={2} style={{ color: PAL.muted, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }} />
                              {s.class_name}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: "right" }} onClick={e => e.stopPropagation()}><EditableNumber value={s.tuition_per_student} onSave={v => saveTuition(s.class_id, v)} /></td>
                          <td style={tdNum}>{s.nb_students}</td>
                          <td style={tdNum}>{fmtMAD(s.ca_facturable)}</td>
                          <td style={{ ...tdNum, color: "var(--pal-good)" }}>{fmtMAD(s.encaisse)}</td>
                          <td style={{ ...tdNum, color: s.encours > 0 ? "var(--pal-danger)" : PAL.muted }}>{fmtMAD(s.encours)}</td>
                          <td style={tdNum} title={`Direct ${fmtMAD(s.cout_direct)} + indirect ${fmtMAD(s.cout_indirect)}`}>{fmtMAD(s.cout_formateurs)}</td>
                          <td style={{ ...tdNum, fontWeight: 700, color: s.marge >= 0 ? "var(--pal-good)" : "var(--pal-danger)" }}>{fmtMAD(s.marge)}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: "var(--pal-pale)", borderBottom: `1px solid ${PAL.line}` }}>
                              {detailLoading === s.class_id
                                ? <div style={{ padding: 16, fontSize: 12.5, color: PAL.muted }}>Chargement du détail…</div>
                                : <StudentDetailPanel data={detail[s.class_id]} />}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Par formateur */}
          <SectionLabel>Par formateur — coût de revient (sur la période)</SectionLabel>
          <div className="dash-card overflow-hidden" style={{ padding: 0, overflowX: "auto" }}>
            {data.trainers.length === 0 ? (
              <EmptyHint icon={<Users size={28} strokeWidth={1.7} />} text="Aucun formateur. Attribuez le rôle « professeur » à des utilisateurs." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
                <thead>
                  <tr>
                    <th style={th}>Formateur</th>
                    <th style={thNum}>Tarif/h</th>
                    <th style={thNum}>Ch. soc.</th>
                    <th style={thNum}>Heures</th>
                    <th style={thNum}>Coût direct</th>
                    <th style={thNum}>Part indirecte</th>
                    <th style={thNum}>Coût de revient</th>
                    <th style={thNum}>Coût/h réel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trainers.map(tr => (
                    <tr key={tr.user_id}>
                      <td style={{ ...td, fontWeight: 700 }}>{tr.full_name}</td>
                      <td style={{ ...td, textAlign: "right" }}><EditableNumber value={tr.hourly_rate} onSave={v => saveTrainer(tr, { hourly_rate: v })} /></td>
                      <td style={{ ...td, textAlign: "right" }}><EditableNumber value={tr.social_charge_percent} suffix="%" onSave={v => saveTrainer(tr, { social_charge_percent: v })} /></td>
                      <td style={tdNum} title={tr.by_class.map(c => `${c.class_name} (${num(c.hours)} h)`).join(" · ") || "—"}>{num(tr.hours)} h</td>
                      <td style={tdNum}>{fmtMAD(tr.cout_direct)}</td>
                      <td style={tdNum}>{fmtMAD(tr.cout_indirect)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMAD(tr.cout_revient)}</td>
                      <td style={{ ...tdNum, color: "var(--pal-primary)" }}>{tr.hours > 0 ? `${fmtMAD(tr.cout_horaire_reel)}/h` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
