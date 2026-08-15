import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Plus, Download, Ban, QrCode, RefreshCw, Upload, Trash2, Layers, Eye, X } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { PreviewModal, urlIsPdf, type Preview } from "@/components/dashboard/preview";

/* ─── Template API helpers (multipart upload bypasses the JSON-only api client) ─── */
const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function parseApiError(text: string, fallback: string): string {
  try { const j = JSON.parse(text); return j.detail || j.message || text; } catch { return text || fallback; }
}

type TemplateField = { key: string; example_value: string; label: string };
type Template = {
  id: string;
  name: string;
  file_kind: "docx" | "pdf" | "image";
  fields: TemplateField[];
  target_type: "student" | "employee";
  created_at: string;
};

async function listTemplates(): Promise<Template[]> {
  return api.get("/api/document-templates");
}

async function uploadTemplate(name: string, file: File, targetType: "student" | "employee"): Promise<Template> {
  const headers = await authHeader();
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  form.append("target_type", targetType);
  const res = await fetch(`${API}/api/document-templates`, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error(parseApiError(await res.text(), `HTTP ${res.status}`));
  return res.json();
}

async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/api/document-templates/${id}`);
}

async function redetectTemplate(id: string): Promise<Template> {
  return api.post(`/api/document-templates/${id}/redetect`, {});
}

async function generateFromTemplate(templateId: string, personId: string, targetType: "student" | "employee") {
  const body = targetType === "employee" ? { employee_id: personId } : { student_id: personId };
  return api.post(`/api/document-templates/${templateId}/generate`, body);
}

const KIND_LABEL: Record<Template["file_kind"], string> = { docx: "Word", pdf: "PDF", image: "Image" };

export const Route = createFileRoute("/dashboard/documents")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "admin");
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: DocumentsPage,
});

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
  danger:  "oklch(64% 0.18 25)",
};
const sans = '"Manrope", system-ui, sans-serif';

type DocType = "attestation_scolarite" | "certificat" | "convocation" | "releve_notes";
const TYPE_LABEL: Record<DocType, string> = {
  attestation_scolarite: "Certificat de scolarité",
  certificat: "Certificat",
  convocation: "Convocation",
  releve_notes: "Relevé de notes",
};

type Student = { id: string; full_name: string | null; email: string | null };
type EmployeeLite = { id: string; full_name: string };
type Doc = {
  id: string;
  type: DocType;
  label: string;
  student_id: string | null;
  student_name: string | null;
  employee_id: string | null;
  employee_name: string | null;
  statut: "valide" | "revoque";
  verification_code: string;
  file_path?: string;
  created_at: string;
};


function GenerateModal({ students, employees, onClose, onGenerated, onPreview }: { students: Student[]; employees: EmployeeLite[]; onClose: () => void; onGenerated: () => void; onPreview: (p: Preview) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [choice, setChoice] = useState("");
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTemplates()
      .then(ts => {
        setTemplates(ts);
        // Preselect the first template so the common path is one click.
        if (ts.length > 0) setChoice(`tpl:${ts[0].id}`);
        else setChoice("builtin:attestation_scolarite");
      })
      .catch(() => setChoice("builtin:attestation_scolarite"));
  }, []);

  const chosenTemplate = choice.startsWith("tpl:") ? templates.find(t => t.id === choice.slice(4)) : undefined;
  const isEmployeeTarget = chosenTemplate?.target_type === "employee";

  async function generate() {
    if (!personId) { toast.error(isEmployeeTarget ? "Sélectionnez un employé." : "Sélectionnez un stagiaire."); return; }
    if (!choice) { toast.error("Sélectionnez un modèle."); return; }
    setBusy(true);
    try {
      let doc: any;
      let title: string;
      if (choice.startsWith("tpl:")) {
        doc = await generateFromTemplate(choice.slice(4), personId, isEmployeeTarget ? "employee" : "student");
        title = chosenTemplate?.name ?? "Document";
      } else {
        const type = choice.slice(8) as DocType;
        doc = await api.post("/api/documents/generate", { type, student_id: personId });
        title = TYPE_LABEL[type];
      }
      toast.success("Document généré !");
      onGenerated();
      onClose();
      if (doc.signed_url) {
        const name = isEmployeeTarget
          ? employees.find(e => e.id === personId)?.full_name
          : (students.find(s => s.id === personId)?.full_name || students.find(s => s.id === personId)?.email);
        onPreview({ url: doc.signed_url, title: `${title} — ${name || ""}`, isPdf: urlIsPdf(doc.signed_url) });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la génération.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 440, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 20px" }}>
            Générer un document
          </h2>
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 0, lineHeight: 0 }}><X size={20} /></button>
        </div>

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Modèle</label>
        <select value={choice} onChange={e => { setChoice(e.target.value); setPersonId(""); }} className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none" }}>
          {templates.length > 0 && (
            <optgroup label="Vos modèles">
              {templates.map(t => <option key={t.id} value={`tpl:${t.id}`}>{t.name} {t.target_type === "employee" ? "(Employé)" : ""}</option>)}
            </optgroup>
          )}
          <optgroup label="Documents intégrés (mise en page basique)">
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={`builtin:${k}`}>{v}</option>)}
          </optgroup>
        </select>

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>{isEmployeeTarget ? "Employé" : "Stagiaire"}</label>
        <select value={personId} onChange={e => setPersonId(e.target.value)} className="u-input"
          style={{ marginTop: 8, marginBottom: 24, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: personId ? PAL.ink : PAL.muted, background: PAL.paper, outline: "none" }}>
          <option value="">— Sélectionner —</option>
          {isEmployeeTarget
            ? employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)
            : students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
        </select>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={generate} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Génération…" : "Générer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadTemplateModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [targetType, setTargetType] = useState<"student" | "employee">("student");
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !name) {
      // Suggest a name from the filename — admin can still rename freely.
      setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  }

  async function submit() {
    if (!file) { toast.error("Choisissez un fichier."); return; }
    if (!name.trim()) { toast.error("Donnez un nom au modèle."); return; }
    setBusy(true);
    try {
      await uploadTemplate(name.trim(), file, targetType);
      toast.success("Modèle ajouté ! Détection des champs effectuée.");
      onUploaded();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout du modèle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 460, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 8px" }}>
          Ajouter un modèle
        </h2>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted, margin: "0 0 20px" }}>
          Déposez un exemple de document déjà rempli (Word, PDF ou image). Les informations propres à la personne dans l'exemple seront détectées automatiquement.
        </p>

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Fichier</label>
        <input
          type="file"
          accept=".docx,.pdf,.jpg,.jpeg,.png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png"
          onChange={e => pickFile(e.target.files?.[0] ?? null)}
          className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper }}
        />

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Nom du modèle</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="ex. Convention de stage"
          className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none" }}
        />

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Ce modèle concerne</label>
        <div style={{ display: "flex", gap: 4, background: "var(--pal-cream)", padding: 3, borderRadius: 10, marginTop: 8, marginBottom: 24, width: "fit-content" }}>
          {(["student", "employee"] as const).map(t => (
            <button key={t} type="button" onClick={() => setTargetType(t)} style={{
              padding: "7px 16px", borderRadius: 7, border: 0, cursor: "pointer",
              fontFamily: sans, fontSize: 12.5, fontWeight: 600,
              background: targetType === t ? PAL.paper : "transparent",
              color: targetType === t ? "var(--pal-primary-deep)" : PAL.muted,
              boxShadow: targetType === t ? "0 1px 2px rgba(0,0,0,.06)" : "none",
            }}>{t === "student" ? "Un stagiaire" : "Un employé"}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Analyse…" : "Ajouter le modèle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateFromTemplateModal({ template, students, employees, onClose, onGenerated, onPreview }: { template: Template; students: Student[]; employees: EmployeeLite[]; onClose: () => void; onGenerated: () => void; onPreview: (p: Preview) => void }) {
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const isEmployeeTarget = template.target_type === "employee";

  async function generate() {
    if (!personId) { toast.error(isEmployeeTarget ? "Sélectionnez un employé." : "Sélectionnez un stagiaire."); return; }
    setBusy(true);
    try {
      const doc = await generateFromTemplate(template.id, personId, isEmployeeTarget ? "employee" : "student");
      toast.success("Document généré !");
      onGenerated();
      onClose();
      if (doc.signed_url) {
        const name = isEmployeeTarget
          ? employees.find(e => e.id === personId)?.full_name
          : (students.find(s => s.id === personId)?.full_name || students.find(s => s.id === personId)?.email);
        onPreview({ url: doc.signed_url, title: `${template.name} — ${name || ""}`, isPdf: urlIsPdf(doc.signed_url) });
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
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 6px" }}>
          Générer « {template.name} »
        </h2>
        {template.fields.length > 0 && (
          <p style={{ fontFamily: sans, fontSize: 12, color: PAL.muted, margin: "0 0 18px" }}>
            Champs remplis automatiquement : {template.fields.map(f => f.label).join(", ")}
          </p>
        )}

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>{isEmployeeTarget ? "Employé" : "Stagiaire"}</label>
        <select value={personId} onChange={e => setPersonId(e.target.value)} className="u-input"
          style={{ marginTop: 8, marginBottom: 24, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: personId ? PAL.ink : PAL.muted, background: PAL.paper, outline: "none" }}>
          <option value="">— Sélectionner —</option>
          {isEmployeeTarget
            ? employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)
            : students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
        </select>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={generate} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Génération…" : "Générer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesSection({ students, employees, onPreview, onDocsChanged }: { students: Student[]; employees: EmployeeLite[]; onPreview: (p: Preview) => void; onDocsChanged: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [genTemplate, setGenTemplate] = useState<Template | null>(null);
  const [redetecting, setRedetecting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setTemplates(await listTemplates());
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement des modèles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function remove(t: Template) {
    if (!window.confirm(`Supprimer le modèle « ${t.name} » ?`)) return;
    try {
      await deleteTemplate(t.id);
      toast.success("Modèle supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function redetect(t: Template) {
    setRedetecting(t.id);
    try {
      const updated = await redetectTemplate(t.id);
      toast.success(`Champs re-détectés (${updated.fields.length}).`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la re-détection.");
    } finally {
      setRedetecting(null);
    }
  }

  return (
    <div style={{ marginBottom: 36 }}>
      {showUpload && <UploadTemplateModal onClose={() => setShowUpload(false)} onUploaded={load} />}
      {genTemplate && (
        <GenerateFromTemplateModal
          template={genTemplate}
          students={students}
          employees={employees}
          onClose={() => setGenTemplate(null)}
          onGenerated={() => { load(); onDocsChanged(); }}
          onPreview={onPreview}
        />
      )}

      <SectionLabel
        action={
          <button type="button" onClick={() => setShowUpload(true)} className="btn-c btn-c-ghost btn-c-sm">
            <Upload size={13} strokeWidth={1.7} />Ajouter un modèle
          </button>
        }
      >
        Modèles de documents
      </SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : templates.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<Layers size={28} strokeWidth={1.7} />}
            text={
              <span className="flex flex-col items-center gap-3">
                Aucun modèle pour l'instant. Déposez un exemple de document (attestation, convention de stage…) pour commencer.
                <button type="button" onClick={() => setShowUpload(true)} className="btn-c btn-c-ghost btn-c-sm">
                  Ajouter le premier modèle
                </button>
              </span>
            }
          />
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {templates.map(t => (
            <div key={t.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: PAL.primary }}>
                <Layers size={20} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink, display: "flex", alignItems: "center", gap: 8 }}>
                  {t.name}
                  <span className="chip-c" style={{ fontSize: 10 }}>{t.target_type === "employee" ? "Employé" : "Stagiaire"}</span>
                </div>
                <div className="mt-1" style={{ fontSize: 12, color: PAL.muted, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
                  <span style={{ marginRight: 3 }}>{KIND_LABEL[t.file_kind]}</span>
                  {t.fields.length === 0 ? (
                    <span>· aucun champ détecté</span>
                  ) : (
                    [...new Set(t.fields.map(f => f.label))].map(label => (
                      <span key={label} style={{ fontSize: 10.5, fontWeight: 600, color: PAL.primary, border: `1px solid ${PAL.line}`, borderRadius: 999, padding: "2px 9px", background: "oklch(97% 0.01 170)" }}>
                        {label}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setGenTemplate(t)} className="btn-c btn-c-sm btn-c-primary">
                Générer
              </button>
              <button
                type="button"
                onClick={() => redetect(t)}
                disabled={redetecting === t.id}
                className="btn-c btn-c-sm btn-c-ghost"
                title="Re-détecter les champs (IA) — utile après une mise à jour de la plateforme"
              >
                <RefreshCw size={13} strokeWidth={1.7} className={redetecting === t.id ? "animate-spin" : undefined} />
              </button>
              <button
                type="button"
                onClick={() => remove(t)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer"
                title="Supprimer"
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data: Doc[] = await api.get("/api/documents");
      setDocs(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get("/api/students").then((d: Student[]) => setStudents(d ?? [])).catch(() => {});
    api.get("/api/rh/employees?page_size=200").then(r => setEmployees(r.items ?? [])).catch(() => {});
  }, []);

  async function download(doc: Doc) {
    try {
      const res = await api.get(`/api/documents/${doc.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  async function openPreview(doc: Doc) {
    try {
      const res = await api.get(`/api/documents/${doc.id}/download`);
      if (res.signed_url) {
        setPreview({
          url: res.signed_url,
          title: `${doc.label} — ${doc.employee_name || doc.student_name || ""}`,
          isPdf: urlIsPdf(res.signed_url),
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'aperçu.");
    }
  }

  async function revoke(doc: Doc) {
    if (!window.confirm(`Révoquer ce document (${doc.verification_code}) ? Il restera listé mais son QR code indiquera qu'il n'est plus valide.`)) return;
    try {
      await api.post(`/api/documents/${doc.id}/revoke`, {});
      toast.success("Document révoqué.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la révocation.");
    }
  }

  async function removeDoc(doc: Doc) {
    if (!window.confirm(`Supprimer définitivement ce document (${doc.verification_code}) ? Le fichier sera effacé et son QR code ne sera plus vérifiable.`)) return;
    try {
      await api.delete(`/api/documents/${doc.id}`);
      toast.success("Document supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  return (
    <div style={{ fontFamily: sans }}>
      {showGenerate && (
        <GenerateModal students={students} employees={employees} onClose={() => setShowGenerate(false)} onGenerated={load} onPreview={setPreview} />
      )}
      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}

      <PageHead
        eyebrow="Gestion administrative"
        title="Documents"
        sub="Générez des attestations et certificats avec vérification QR."
        actions={
          <button type="button" onClick={() => setShowGenerate(true)} className="btn-c btn-c-primary">
            <Plus size={15} strokeWidth={1.7} />Générer un document
          </button>
        }
      />

      <TemplatesSection students={students} employees={employees} onPreview={setPreview} onDocsChanged={load} />

      <SectionLabel>{docs.length} document{docs.length !== 1 ? "s" : ""} généré{docs.length !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 26, width: "55%", borderRadius: 8, marginTop: 14 }} />
        </div>
      ) : docs.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<FileText size={28} strokeWidth={1.7} />}
            text={
              <span className="flex flex-col items-center gap-3">
                Aucun document généré pour l'instant.
                <button type="button" onClick={() => setShowGenerate(true)} className="btn-c btn-c-ghost btn-c-sm">
                  Générer le premier document
                </button>
              </span>
            }
          />
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {docs.map(d => (
            <div key={d.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: d.statut === "valide" ? PAL.primary : PAL.muted }}>
                <FileText size={20} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink }}>{d.label}</div>
                <div className="mt-0.5" style={{ fontSize: 12, color: PAL.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  {d.employee_name || d.student_name}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5 }}>
                    <QrCode size={11} strokeWidth={1.7} />{d.verification_code}
                  </span>
                </div>
              </div>
              <span className={`chip-c ${d.statut === "valide" ? "chip-c-green" : "chip-c-red"}`}>
                {d.statut === "valide" ? "Valide" : "Révoqué"}
              </span>
              <button type="button" onClick={() => openPreview(d)} className="btn-c btn-c-sm btn-c-ghost" title="Aperçu">
                <Eye size={13} strokeWidth={1.7} />
              </button>
              <button type="button" onClick={() => download(d)} className="btn-c btn-c-sm btn-c-ghost" title="Télécharger">
                <Download size={13} strokeWidth={1.7} />
              </button>
              {d.statut === "valide" && (
                <button
                  type="button"
                  onClick={() => revoke(d)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="Révoquer"
                  title="Révoquer (garde une trace, le QR indique « non valide »)"
                >
                  <Ban size={14} strokeWidth={1.7} />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeDoc(d)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer"
                title="Supprimer définitivement"
              >
                <Trash2 size={14} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
