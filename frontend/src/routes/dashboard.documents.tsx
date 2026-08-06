import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Plus, Download, Ban, QrCode, X } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

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

type DocType = "attestation_scolarite" | "certificat" | "convocation";
const TYPE_LABEL: Record<DocType, string> = {
  attestation_scolarite: "Attestation de scolarité",
  certificat: "Certificat",
  convocation: "Convocation",
};

type Student = { id: string; full_name: string | null; email: string | null };
type Doc = {
  id: string;
  type: DocType;
  label: string;
  student_id: string;
  student_name: string;
  statut: "valide" | "revoque";
  verification_code: string;
  created_at: string;
};

function GenerateModal({ students, onClose, onGenerated }: { students: Student[]; onClose: () => void; onGenerated: () => void }) {
  const [type, setType] = useState<DocType>("attestation_scolarite");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!studentId) { toast.error("Sélectionnez un stagiaire."); return; }
    setBusy(true);
    try {
      const doc = await api.post("/api/documents/generate", { type, student_id: studentId });
      toast.success("Document généré !");
      if (doc.signed_url) window.open(doc.signed_url, "_blank");
      onGenerated();
      onClose();
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

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Type de document</label>
        <select value={type} onChange={e => setType(e.target.value as DocType)} className="u-input"
          style={{ marginTop: 8, marginBottom: 16, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none" }}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <label style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const }}>Stagiaire</label>
        <select value={studentId} onChange={e => setStudentId(e.target.value)} className="u-input"
          style={{ marginTop: 8, marginBottom: 24, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: studentId ? PAL.ink : PAL.muted, background: PAL.paper, outline: "none" }}>
          <option value="">— Sélectionner —</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
        </select>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="u-ghost" style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={generate} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 24px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Génération…" : "Générer le PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);

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
  }, []);

  async function download(doc: Doc) {
    try {
      const res = await api.get(`/api/documents/${doc.id}/download`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du téléchargement.");
    }
  }

  async function revoke(doc: Doc) {
    if (!window.confirm(`Révoquer ce document (${doc.verification_code}) ?`)) return;
    try {
      await api.delete(`/api/documents/${doc.id}`);
      toast.success("Document révoqué.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la révocation.");
    }
  }

  return (
    <div style={{ fontFamily: sans }}>
      {showGenerate && (
        <GenerateModal students={students} onClose={() => setShowGenerate(false)} onGenerated={load} />
      )}

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
                  {d.student_name}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5 }}>
                    <QrCode size={11} strokeWidth={1.7} />{d.verification_code}
                  </span>
                </div>
              </div>
              <span className={`chip-c ${d.statut === "valide" ? "chip-c-green" : "chip-c-red"}`}>
                {d.statut === "valide" ? "Valide" : "Révoqué"}
              </span>
              <button type="button" onClick={() => download(d)} className="btn-c btn-c-sm btn-c-ghost" title="Télécharger">
                <Download size={13} strokeWidth={1.7} />
              </button>
              {d.statut === "valide" && (
                <button
                  type="button"
                  onClick={() => revoke(d)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="Révoquer"
                  title="Révoquer"
                >
                  <Ban size={14} strokeWidth={1.7} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
