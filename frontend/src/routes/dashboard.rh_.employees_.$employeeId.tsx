import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, CalendarClock, Download, Eye, FileText, FolderOpen, Loader2, Pencil,
  Plus, RefreshCw, ScanSearch, Sparkles, Trash2, TriangleAlert, Upload, UserRound, Users, Wallet,
} from "lucide-react";
import { DashAvatar, EmptyHint } from "@/components/dashboard/ui";
import { FormModal, type Employee, type LookupItem } from "@/components/rh/Employees";
import { fmtMAD } from "@/components/rh/Payroll";
import { PreviewModal, urlIsPdf, type Preview } from "@/components/dashboard/preview";

export const Route = createFileRoute("/dashboard/rh_/employees_/$employeeId")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "rh", "assistant_rh"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: EmployeeDetailPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const STATUS_LABEL: Record<string, string> = { active: "Actif", "on-leave": "En congé", inactive: "Inactif" };
function statusChip(status: string) {
  if (status === "active") return "chip-c-green";
  if (status === "inactive") return "chip-c-red";
  return "";
}

/* ─── Fichiers tab ─── */
const FILE_TYPES: { value: string; label: string }[] = [
  { value: "cin", label: "CIN" },
  { value: "diplome", label: "Diplôme" },
  { value: "photo", label: "Photo d'identité" },
  { value: "cv", label: "CV" },
  { value: "contrat", label: "Contrat signé" },
  { value: "autre", label: "Autre" },
];
const FILE_TYPE_LABEL = Object.fromEntries(FILE_TYPES.map(t => [t.value, t.label]));

type EmployeeFile = { id: string; type: string; filename: string; content_type: string; created_at: string };

function FilesTab({ employeeId, onPhotoChanged, onGoToAnalyse }: { employeeId: string; onPhotoChanged: () => void; onGoToAnalyse: () => void }) {
  const [files, setFiles] = useState<EmployeeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileType, setFileType] = useState("autre");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      setFiles(await api.get(`/api/rh/employees/${employeeId}/files`));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des fichiers.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [employeeId]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("type", fileType);
      fd.append("file", file);
      await api.uploadFile(`/api/rh/employees/${employeeId}/files`, fd);
      toast.success(fileType === "photo" ? "Photo ajoutée — elle sera utilisée comme photo de profil." : "Fichier ajouté.");
      if (fileType === "photo") onPhotoChanged();
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openFile(f: EmployeeFile) {
    try {
      const res = await api.get(`/api/rh/employees/${employeeId}/files/${f.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ouverture.");
    }
  }

  async function remove(f: EmployeeFile) {
    if (!window.confirm(`Supprimer « ${f.filename} » ?`)) return;
    try {
      await api.delete(`/api/rh/employees/${employeeId}/files/${f.id}`);
      toast.success("Fichier supprimé.");
      if (f.type === "photo") onPhotoChanged();
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        style={{
          border: `2px dashed ${dragOver ? "var(--pal-primary)" : PAL.line}`,
          background: dragOver ? "var(--pal-pale)" : "transparent",
          borderRadius: 14, padding: "34px 20px", textAlign: "center",
          cursor: uploading ? "wait" : "pointer", transition: "all .15s ease", marginBottom: 18,
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <span style={{ display: "inline-flex", color: PAL.muted, opacity: .6 }}>
          {uploading ? <Loader2 size={26} strokeWidth={1.7} className="animate-spin" /> : <Upload size={26} strokeWidth={1.7} />}
        </span>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: PAL.ink, marginTop: 10 }}>
          {uploading ? "Envoi en cours…" : "Déposer des fichiers ici"}
        </div>
        <div style={{ fontSize: 12, color: PAL.muted, marginTop: 4 }}>PDF, DOCX, JPG, PNG — cliquer pour sélectionner</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const }}>Type :</span>
          <select value={fileType} onChange={e => setFileType(e.target.value)} className="u-input"
            style={{ padding: "6px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none" }}>
            {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 40, borderRadius: 10 }} />
      ) : files.length === 0 ? (
        <EmptyHint icon={<FolderOpen size={26} strokeWidth={1.7} />} text="Aucun fichier." />
      ) : (
        <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" onClick={onGoToAnalyse} className="btn-c btn-c-sm btn-c-ghost">
            <Sparkles size={13} strokeWidth={1.8} />Analyser le dossier
          </button>
        </div>
        <div className="dash-card overflow-hidden">
          {files.map(f => (
            <div key={f.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><FileText size={18} strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{f.filename}</div>
                <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted }}>{new Date(f.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <span className="chip-c">{FILE_TYPE_LABEL[f.type] ?? f.type}</span>
              <button type="button" onClick={() => openFile(f)} className="btn-c btn-c-sm btn-c-ghost" title="Ouvrir">Ouvrir</button>
              <button type="button" onClick={() => remove(f)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

/* ─── Documents tab ─── */
type EmployeeDoc = { id: string; type: string; label: string; employee_id: string; statut: "valide" | "revoque"; verification_code: string; created_at: string };
type DocTemplate = { id: string; name: string; target_type: "student" | "employee" };

function GenerateForEmployeeModal({ employee, onClose, onGenerated, onPreview }: {
  employee: Employee; onClose: () => void; onGenerated: () => void; onPreview: (p: Preview) => void;
}) {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/document-templates")
      .then((ts: DocTemplate[]) => {
        const empTemplates = (ts || []).filter(t => t.target_type === "employee");
        setTemplates(empTemplates);
        if (empTemplates.length) setTemplateId(empTemplates[0].id);
      })
      .catch(() => {});
  }, []);

  async function generate() {
    if (!templateId) { toast.error("Sélectionnez un modèle."); return; }
    setBusy(true);
    try {
      const doc = await api.post(`/api/document-templates/${templateId}/generate`, { employee_id: employee.id });
      toast.success("Document généré !");
      onGenerated();
      onClose();
      if (doc.signed_url) {
        const tpl = templates.find(t => t.id === templateId);
        onPreview({ url: doc.signed_url, title: `${tpl?.name ?? "Document"} — ${employee.full_name}`, isPdf: urlIsPdf(doc.signed_url) });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la génération.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 440, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 6px" }}>
          Générer pour {employee.full_name}
        </h2>
        {templates.length === 0 ? (
          <p style={{ fontFamily: sans, fontSize: 13, color: PAL.muted }}>
            Aucun modèle pour employé disponible.{" "}
            <Link to="/dashboard/documents" style={{ color: "var(--pal-primary-deep)", fontWeight: 600 }}>
              Ajoutez-en un depuis la page Documents →
            </Link>
          </p>
        ) : (
          <>
            <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Modèle</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="u-input"
              style={{ marginTop: 8, marginBottom: 24, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none" }}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          {templates.length > 0 && (
            <button onClick={generate} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
              {busy ? "Génération…" : "Générer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ employeeId, employeeName, refreshKey, onPreview }: {
  employeeId: string; employeeName: string; refreshKey: number; onPreview: (p: Preview) => void;
}) {
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/documents")
      .then((all: EmployeeDoc[]) => setDocs((all || []).filter(d => d.employee_id === employeeId)))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, [employeeId, refreshKey]);

  async function openDoc(d: EmployeeDoc) {
    try {
      const res = await api.get(`/api/documents/${d.id}/download`);
      if (res.signed_url) onPreview({ url: res.signed_url, title: `${d.label} — ${employeeName}`, isPdf: urlIsPdf(res.signed_url) });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'aperçu.");
    }
  }

  async function downloadDoc(d: EmployeeDoc) {
    try {
      const res = await api.get(`/api/documents/${d.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  if (loading) return <div className="shimmer" style={{ height: 40, borderRadius: 10 }} />;
  if (docs.length === 0) return <div className="dash-card"><EmptyHint icon={<FileText size={26} strokeWidth={1.7} />} text="Aucun document pour l'instant." /></div>;

  return (
    <div className="dash-card overflow-hidden">
      {docs.map(d => (
        <div key={d.id} className="row-c flex-wrap">
          <span className="flex shrink-0" style={{ color: d.statut === "valide" ? "var(--pal-primary)" : PAL.muted }}>
            <FileText size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{d.label}</div>
            <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted }}>{new Date(d.created_at).toLocaleDateString("fr-FR")}</div>
          </div>
          <span className={`chip-c ${d.statut === "valide" ? "chip-c-green" : "chip-c-red"}`}>{d.statut === "valide" ? "Valide" : "Révoqué"}</span>
          <button type="button" onClick={() => openDoc(d)} className="btn-c btn-c-sm btn-c-ghost" title="Aperçu"><Eye size={13} strokeWidth={1.7} /></button>
          <button type="button" onClick={() => downloadDoc(d)} className="btn-c btn-c-sm btn-c-ghost" title="Télécharger"><Download size={13} strokeWidth={1.7} /></button>
        </div>
      ))}
    </div>
  );
}

/* ─── Congés tab ─── */
const LEAVE_TYPE_LABEL: Record<string, string> = {
  recovery: "Récupération", sick: "Maladie", unpaid: "Congé sans solde",
  permission: "Permission", other: "Autre", unjustified_absence: "Absence injustifiée",
};
const LEAVE_STATUS_LABEL: Record<string, string> = { pending: "En attente", approved: "Approuvé", rejected: "Refusé", cancelled: "Annulé" };
function leaveStatusColor(status: string) {
  if (status === "approved") return "var(--pal-good)";
  if (status === "rejected" || status === "cancelled") return "var(--pal-danger)";
  return "var(--pal-warn)";
}

type Leave = { id: string; type: string; start_date: string; end_date: string; days: number; status: string };

function CongesTab({ employeeId }: { employeeId: string }) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/rh/leaves?employee_id=${employeeId}&page_size=100`)
      .then(res => setLeaves(res.items ?? []))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <div className="shimmer" style={{ height: 40, borderRadius: 10 }} />;
  if (leaves.length === 0) return <div className="dash-card"><EmptyHint icon={<CalendarClock size={26} strokeWidth={1.7} />} text="Aucune demande de congé enregistrée." /></div>;

  return (
    <div className="dash-card overflow-hidden">
      {leaves.map(l => (
        <div key={l.id} className="row-c flex-wrap">
          <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><CalendarClock size={18} strokeWidth={1.7} /></span>
          <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{LEAVE_TYPE_LABEL[l.type] ?? l.type}</div>
            <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted }}>
              {new Date(l.start_date).toLocaleDateString("fr-FR")} → {new Date(l.end_date).toLocaleDateString("fr-FR")} · {l.days} j
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: leaveStatusColor(l.status), background: "var(--pal-pale)" }}>
            {LEAVE_STATUS_LABEL[l.status] ?? l.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Paie tab ─── */
type PayrollRecord = { id: string; month: number; year: number; base_salary: number; cnss: number; ir: number; net_salary: number; gross_salary: number; status: string };
const PAYROLL_STATUS_LABEL: Record<string, string> = { draft: "Brouillon", validated: "Validé", paid: "Payé" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 100px", background: "var(--pal-cream)", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: PAL.ink, marginTop: 2, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{value}</div>
    </div>
  );
}

function PaieTab({ employeeId }: { employeeId: string }) {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/rh/payroll?employee_id=${employeeId}&page_size=100`)
      .then(res => setRecords(res.items ?? []))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <div className="shimmer" style={{ height: 40, borderRadius: 10 }} />;
  if (records.length === 0) return <div className="dash-card"><EmptyHint icon={<Wallet size={26} strokeWidth={1.7} />} text="Aucune fiche de paie." /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {records.map(r => (
        <div key={r.id} className="dash-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: PAL.ink }}>Mois {r.month} / {r.year}</div>
            <span className="chip-c">{PAYROLL_STATUS_LABEL[r.status] ?? r.status}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat label="Brut" value={fmtMAD(r.gross_salary)} />
            <Stat label="CNSS" value={fmtMAD(r.cnss)} />
            <Stat label="IR" value={fmtMAD(r.ir)} />
            <Stat label="Net" value={fmtMAD(r.net_salary)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Performance tab ─── */
type Goal = { id: string; title: string; description: string | null; status: string; progress: number; due_date: string | null };
type Review = { id: string; period: string; score: number | null; feedback: string | null; status: string };
const GOAL_STATUS_LABEL: Record<string, string> = { pending: "À faire", in_progress: "En cours", done: "Terminé" };
const REVIEW_STATUS_LABEL: Record<string, string> = { draft: "Brouillon", submitted: "Soumise", acknowledged: "Validée" };

function AddGoalForm({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) { toast.error("Le titre est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/performance/goals", { employee_id: employeeId, title, due_date: dueDate || null });
      toast.success("Objectif ajouté.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-card" style={{ padding: 16, marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input type="text" placeholder="Titre de l'objectif" value={title} onChange={e => setTitle(e.target.value)} className="u-input"
        style={{ flex: "1 1 200px", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL.paper }} />
      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="u-input"
        style={{ padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL.paper }} />
      <button type="button" onClick={submit} disabled={busy} className="btn-c btn-c-sm btn-c-primary">{busy ? "…" : "Ajouter"}</button>
      <button type="button" onClick={onClose} className="btn-c btn-c-sm btn-c-ghost">Annuler</button>
    </div>
  );
}

function AddReviewForm({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [period, setPeriod] = useState("");
  const [score, setScore] = useState("3");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!period.trim()) { toast.error("La période est requise."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/performance", { employee_id: employeeId, period, score: parseInt(score, 10), feedback: feedback || null });
      toast.success("Évaluation ajoutée.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-card" style={{ padding: 16, marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input type="text" placeholder="Période (ex. T1 2026)" value={period} onChange={e => setPeriod(e.target.value)} className="u-input"
        style={{ flex: "1 1 160px", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL.paper }} />
      <select value={score} onChange={e => setScore(e.target.value)} className="u-input"
        style={{ padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL.paper }}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
      </select>
      <input type="text" placeholder="Commentaire (optionnel)" value={feedback} onChange={e => setFeedback(e.target.value)} className="u-input"
        style={{ flex: "1 1 200px", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL.paper }} />
      <button type="button" onClick={submit} disabled={busy} className="btn-c btn-c-sm btn-c-primary">{busy ? "…" : "Ajouter"}</button>
      <button type="button" onClick={onClose} className="btn-c btn-c-sm btn-c-ghost">Annuler</button>
    </div>
  );
}

function PerformanceTab({ employeeId }: { employeeId: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [addGoal, setAddGoal] = useState(false);
  const [addReview, setAddReview] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        api.get(`/api/rh/performance/goals?employee_id=${employeeId}`),
        api.get(`/api/rh/performance?employee_id=${employeeId}&page_size=50`),
      ]);
      setGoals(g ?? []);
      setReviews(r.items ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [employeeId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: PAL.muted }}>Objectifs</div>
        <button type="button" onClick={() => setAddGoal(v => !v)} className="btn-c btn-c-sm btn-c-ghost"><Plus size={13} strokeWidth={1.8} />Ajouter</button>
      </div>
      {addGoal && <AddGoalForm employeeId={employeeId} onClose={() => setAddGoal(false)} onSaved={load} />}
      {loading ? (
        <div className="shimmer" style={{ height: 40, borderRadius: 10, marginBottom: 24 }} />
      ) : goals.length === 0 ? (
        <div className="dash-card" style={{ marginBottom: 24 }}><EmptyHint text="Aucun objectif." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ marginBottom: 24 }}>
          {goals.map(g => (
            <div key={g.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{g.title}</div>
                {g.due_date && <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted }}>Échéance : {new Date(g.due_date).toLocaleDateString("fr-FR")}</div>}
              </div>
              <div style={{ width: 90, height: 5, borderRadius: 99, background: "var(--pal-pale)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${g.progress}%`, background: "var(--pal-primary)" }} />
              </div>
              <span className="chip-c">{GOAL_STATUS_LABEL[g.status] ?? g.status}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: PAL.muted }}>Évaluations</div>
        <button type="button" onClick={() => setAddReview(v => !v)} className="btn-c btn-c-sm btn-c-ghost"><Plus size={13} strokeWidth={1.8} />Ajouter</button>
      </div>
      {addReview && <AddReviewForm employeeId={employeeId} onClose={() => setAddReview(false)} onSaved={load} />}
      {loading ? (
        <div className="shimmer" style={{ height: 40, borderRadius: 10 }} />
      ) : reviews.length === 0 ? (
        <div className="dash-card"><EmptyHint text="Aucune évaluation enregistrée." /></div>
      ) : (
        <div className="dash-card overflow-hidden">
          {reviews.map(r => (
            <div key={r.id} className="row-c flex-wrap">
              <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{r.period}</div>
                {r.feedback && <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted }}>{r.feedback}</div>}
              </div>
              {r.score != null && <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: PAL.ink }}>{r.score} / 5</span>}
              <span className="chip-c">{REVIEW_STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Analyse IA tab ─── */
type EmpAnalysis = {
  resume: string;
  infos: { label: string; valeur: string; source: string }[];
  alertes: string[];
  details?: Record<string, string>;
};
type EmpAnalysisState = {
  analysis: EmpAnalysis | null;
  analyzed_at?: string;
  file_count?: number;
  stale?: boolean;
};

function AnalyseTab({ employee, onApplied }: { employee: Employee; onApplied: () => void }) {
  const [state, setState] = useState<EmpAnalysisState | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    api.get(`/api/rh/employees/${employee.id}/analysis`)
      .then(setState)
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement de l'analyse."));
  }, [employee.id]);

  async function run() {
    setRunning(true);
    setSaved(null);
    try {
      const res: EmpAnalysisState = await api.post(`/api/rh/employees/${employee.id}/analysis`, {});
      setState(res);
      toast.success("Analyse terminée !");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'analyse.");
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.post(`/api/rh/employees/${employee.id}/analysis/apply`, {});
      setSaved(res.applied ?? 0);
      toast.success(
        res.applied
          ? `Fiche enregistrée — ${res.applied} champ${res.applied > 1 ? "s" : ""} mis à jour.`
          : "Rien à enregistrer — aucune information exploitable dans cette analyse."
      );
      onApplied();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (!state) return <div className="shimmer" style={{ height: 60, borderRadius: 12 }} />;

  if (running) {
    return (
      <div className="dash-card anim-fade" style={{ padding: "44px 24px", textAlign: "center" }}>
        <Loader2 size={28} strokeWidth={1.7} className="animate-spin" style={{ color: "var(--pal-primary)", display: "inline-block" }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: PAL.ink, marginTop: 14 }}>Analyse en cours…</div>
        <div style={{ fontSize: 12.5, color: PAL.muted, marginTop: 6 }}>
          L'IA lit les fichiers du dossier (CIN, diplôme, contrat…) et en extrait les informations. Cela peut prendre jusqu'à une minute.
        </div>
      </div>
    );
  }

  if (!state.analysis) {
    return (
      <div className="dash-card anim-fade" style={{ padding: "44px 24px", textAlign: "center" }}>
        <span style={{ display: "inline-flex", color: PAL.muted, opacity: .55 }}>
          <ScanSearch size={30} strokeWidth={1.6} />
        </span>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: PAL.ink, marginTop: 12 }}>Aucune analyse pour le moment</div>
        <div style={{ fontSize: 12.5, color: PAL.muted, marginTop: 6, maxWidth: 420, marginInline: "auto" }}>
          L'IA lit les fichiers du dossier de {employee.full_name} (CIN, diplôme, contrat…),
          en extrait les informations et remplit directement la fiche administrative du profil.
        </div>
        <button type="button" onClick={run} className="btn-c btn-c-primary" style={{ marginTop: 18 }}>
          <Sparkles size={14} strokeWidth={1.7} />Analyser le dossier
        </button>
      </div>
    );
  }

  const a = state.analysis;
  return (
    <div className="anim-fade">
      {state.stale && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 12, background: "oklch(96% 0.04 85)", border: "1px solid oklch(85% 0.08 85)", marginBottom: 16, fontSize: 12.5, color: "oklch(40% 0.07 70)" }}>
          <TriangleAlert size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          Le dossier a changé depuis cette analyse — relancez-la pour la mettre à jour.
        </div>
      )}

      {a.resume && (
        <div className="dash-card" style={{ padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Sparkles size={16} strokeWidth={1.7} style={{ color: "var(--pal-primary)", flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: PAL.ink }}>{a.resume}</p>
          </div>
        </div>
      )}

      {a.infos.length > 0 && (
        <div className="dash-card" style={{ padding: "8px 22px 10px", marginBottom: 16 }}>
          {a.infos.map((info, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "11px 0", borderBottom: i < a.infos.length - 1 ? `1px solid ${PAL.line}` : "none", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ width: 170, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".07em", textTransform: "uppercase" as const }}>{info.label}</div>
              <div style={{ fontSize: 13.5, color: PAL.ink, flex: 1, minWidth: 160 }}>{info.valeur}</div>
              {info.source && <span className="chip-c" title="Fichier source" style={{ fontSize: 10.5 }}>{info.source}</span>}
            </div>
          ))}
        </div>
      )}

      {a.alertes.length > 0 && (
        <div className="dash-card" style={{ padding: "16px 22px", marginBottom: 16, borderColor: "oklch(85% 0.08 85)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "oklch(52% 0.12 70)", display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <TriangleAlert size={13} strokeWidth={1.8} />À vérifier
          </div>
          {a.alertes.map((al, i) => (
            <div key={i} style={{ fontSize: 13, color: PAL.ink, lineHeight: 1.55, padding: "4px 0" }}>• {al}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {saved !== null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--pal-primary)", fontWeight: 600 }}>
            <FileText size={14} strokeWidth={1.7} />
            Fiche mise à jour ({saved} champ{saved !== 1 ? "s" : ""})
          </span>
        ) : (
          <button type="button" onClick={save} disabled={saving} className="btn-c btn-c-primary" style={{ opacity: saving ? .6 : 1 }}>
            <FileText size={14} strokeWidth={1.7} />{saving ? "Enregistrement…" : "Enregistrer dans la fiche"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: PAL.muted }}>
          Analysé le {state.analyzed_at ? new Date(state.analyzed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
          {typeof state.file_count === "number" ? ` • ${state.file_count} fichier${state.file_count > 1 ? "s" : ""}` : ""}
        </span>
        <button type="button" onClick={run} className="btn-c btn-c-sm btn-c-ghost">
          <RefreshCw size={13} strokeWidth={1.7} />Relancer l'analyse
        </button>
      </div>
    </div>
  );
}

/* ─── Profil tab ─── */
const GENDER_LABEL: Record<string, string> = { M: "Masculin", F: "Féminin" };

function ProfilTab({ employee }: { employee: Employee }) {
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <div style={{ width: 150, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".07em", textTransform: "uppercase" as const, paddingTop: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: PAL.ink }}>{value ?? "—"}</div>
    </div>
  );
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : null;
  const card = (title: string, children: React.ReactNode) => (
    <div className="dash-card" style={{ padding: "8px 22px 4px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "var(--pal-primary-deep)", padding: "12px 0 4px" }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
      {card("Identité", <>
        {row("Nom complet", employee.full_name)}
        {row("Email", employee.email)}
        {row("Email personnel", employee.personal_email)}
        {row("Téléphone", employee.phone)}
        {row("Genre", employee.gender ? (GENDER_LABEL[employee.gender] ?? employee.gender) : null)}
        {row("Date de naissance", fmtDate(employee.birth_date))}
        {row("Lieu de naissance", employee.place_of_birth)}
        {row("Situation familiale", employee.marital_status)}
        {row("Personnes à charge", employee.dependents_count ?? null)}
        {row("Groupe sanguin", employee.blood_type)}
        {row("Nationalité", employee.nationality)}
      </>)}

      {card("Coordonnées", <>
        {row("Adresse", employee.address)}
        {row("Ville", employee.city)}
        {row("Code postal", employee.postal_code)}
        {row("Pays", employee.country)}
      </>)}

      {card("Pièce d'identité", <>
        {row("N° CIN", employee.cin)}
        {row("Délivrance CIN", fmtDate(employee.cin_issue_date))}
        {row("Validité CIN", fmtDate(employee.cin_expiry_date))}
        {row("N° Passeport", employee.passport_number)}
      </>)}

      {card("Contact d'urgence", <>
        {row("Nom", employee.emergency_contact_name)}
        {row("Téléphone", employee.emergency_contact_phone)}
        {row("Lien de parenté", employee.emergency_contact_relation)}
      </>)}

      {card("Contrat", <>
        {row("Poste", employee.position)}
        {row("Département", employee.department)}
        {row("Manager", employee.manager)}
        {row("Échelon / Niveau", employee.grade)}
        {row("Lieu de travail", employee.work_location)}
        {row("Statut", STATUS_LABEL[employee.status] ?? employee.status)}
        {row("Date d'embauche", fmtDate(employee.hire_date))}
        {row("Type de contrat", employee.contract_type)}
        {row("Début du contrat", fmtDate(employee.contract_start))}
        {row("Fin du contrat", fmtDate(employee.contract_end))}
        {row("Heures hebdomadaires", employee.weekly_hours ?? null)}
        {row("Salaire", employee.salary != null ? fmtMAD(employee.salary) : null)}
      </>)}

      {card("Administratif / Paie", <>
        {row("N° Matricule", employee.matricule)}
        {row("N° CNSS", employee.cnss_number)}
        {row("N° AMO", employee.amo_number)}
        {row("Identifiant fiscal (IF)", employee.tax_id)}
        {row("N° CIMR", employee.cimr_number)}
        {row("Banque", employee.bank_name)}
        {row("RIB / Compte bancaire", employee.bank_account)}
      </>)}
    </div>
  );
}

/* ─── Header avatar — click to upload/change the profile photo directly ─── */
function AvatarUpload({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("type", "photo");
      fd.append("file", file);
      await api.uploadFile(`/api/rh/employees/${employee.id}/files`, fd);
      toast.success("Photo de profil mise à jour.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'envoi de la photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ position: "relative", flexShrink: 0, width: 64, height: 64 }}>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {employee.photo_url ? (
        <img
          src={employee.photo_url}
          alt={employee.full_name || ""}
          style={{ width: 64, height: 64, borderRadius: 999, objectFit: "cover", border: `1px solid ${PAL.line}` }}
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <DashAvatar name={employee.full_name || "?"} size={64} tone="primary" />
      )}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        title="Changer la photo"
        style={{
          position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--pal-ink)", color: "var(--pal-paper)", border: `2px solid ${PAL.paper}`,
          cursor: uploading ? "wait" : "pointer",
        }}
      >
        {uploading ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : <Camera size={12} strokeWidth={2} />}
      </button>
    </div>
  );
}

/* ─── Page ─── */
function EmployeeDetailPage() {
  const { employeeId } = Route.useParams();
  const { tab: initialTab } = Route.useSearch();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"profil" | "fichiers" | "documents" | "conges" | "paie" | "performance" | "analyse">(
    (initialTab as any) ?? "profil"
  );
  const [editOpen, setEditOpen] = useState(false);
  const [departments, setDepartments] = useState<LookupItem[]>([]);
  const [contractTypes, setContractTypes] = useState<LookupItem[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [docsRefresh, setDocsRefresh] = useState(0);

  async function load() {
    try {
      setEmployee(await api.get(`/api/rh/employees/${employeeId}`));
    } catch {
      setNotFound(true);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [employeeId]);
  useEffect(() => {
    api.get("/api/rh/departments").then(setDepartments).catch(() => {});
    api.get("/api/rh/contract-types").then(setContractTypes).catch(() => {});
  }, []);

  if (notFound) {
    return (
      <div style={{ fontFamily: sans }}>
        <EmptyHint icon={<UserRound size={28} strokeWidth={1.7} />} text="Employé introuvable." />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="dash-card" style={{ padding: 26, fontFamily: sans }}>
        <div className="shimmer" style={{ height: 48, width: 48, borderRadius: 999 }} />
        <div className="shimmer" style={{ height: 22, width: "40%", borderRadius: 8, marginTop: 14 }} />
      </div>
    );
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "profil", label: "Profil" },
    { key: "fichiers", label: "Fichiers" },
    { key: "documents", label: "Documents" },
    { key: "conges", label: "Congés" },
    { key: "paie", label: "Paie" },
    { key: "performance", label: "Performance" },
    { key: "analyse", label: "Analyse IA" },
  ];

  return (
    <div style={{ fontFamily: sans }}>
      {editOpen && (
        <FormModal
          editing={employee}
          departments={departments}
          contractTypes={contractTypes}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
      {showGenerate && (
        <GenerateForEmployeeModal
          employee={employee}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => setDocsRefresh(v => v + 1)}
          onPreview={setPreview}
        />
      )}
      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}

      <Link to="/dashboard/rh" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: PAL.muted, textDecoration: "none", marginBottom: 16 }}>
        <ArrowLeft size={14} strokeWidth={1.7} />Personnes
      </Link>

      {/* Header card */}
      <div className="dash-card" style={{ padding: 24, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <AvatarUpload employee={employee} onChanged={load} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 className="h-serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{employee.full_name}</h1>
              <span className={`chip-c ${statusChip(employee.status)}`}>{STATUS_LABEL[employee.status] ?? employee.status}</span>
            </div>
            <div style={{ fontSize: 13, color: PAL.muted, marginTop: 5, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>{employee.position || "—"}{employee.department ? ` · ${employee.department}` : ""}</span>
              {employee.hire_date && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Users size={13} strokeWidth={1.7} />Date d'embauche : {new Date(employee.hire_date).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={() => setEditOpen(true)} className="btn-c btn-c-ghost">
            <Pencil size={14} strokeWidth={1.7} />Modifier
          </button>
          <button type="button" onClick={() => setShowGenerate(true)} className="btn-c btn-c-primary">
            <Sparkles size={14} strokeWidth={1.7} />Générer un document
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${PAL.line}`, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: sans, fontSize: 13.5, fontWeight: 600, padding: "10px 16px",
              background: "transparent", border: 0, cursor: "pointer",
              color: tab === t.key ? "var(--pal-primary)" : PAL.muted,
              borderBottom: tab === t.key ? "2px solid var(--pal-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profil" && <ProfilTab employee={employee} />}
      {tab === "fichiers" && <FilesTab employeeId={employee.id} onPhotoChanged={load} onGoToAnalyse={() => setTab("analyse")} />}
      {tab === "documents" && <DocumentsTab employeeId={employee.id} employeeName={employee.full_name} refreshKey={docsRefresh} onPreview={setPreview} />}
      {tab === "conges" && <CongesTab employeeId={employee.id} />}
      {tab === "paie" && <PaieTab employeeId={employee.id} />}
      {tab === "performance" && <PerformanceTab employeeId={employee.id} />}
      {tab === "analyse" && <AnalyseTab employee={employee} onApplied={load} />}
    </div>
  );
}
