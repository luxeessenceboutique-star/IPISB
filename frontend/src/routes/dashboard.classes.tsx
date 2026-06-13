import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Users, X, BookOpen } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/classes")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "professor"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: ClassesPage,
});

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  text:    "oklch(34% 0.03 180)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
  pale:    "oklch(94% 0.025 165)",
  cream:   "oklch(97% 0.012 90)",
  success: "oklch(55% 0.14 145)",
  danger:  "oklch(55% 0.18 25)",
};
const sans = '"Manrope", system-ui, sans-serif';

type ClassItem = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  student_count: number;
  professor_name: string;
};

type StudentItem = {
  id: string;
  email: string | null;
  full_name: string | null;
  added_at: string | null;
};

type RosterStudent = {
  id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
};

// ── Create class modal ────────────────────────────────────────

function CreateClassModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [busy, setBusy]         = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Le nom est requis"); return; }
    setBusy(true);
    try {
      await api.post("/api/classes", { name: name.trim(), description: desc.trim() || null });
      toast.success("Classe créée !");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "oklch(0% 0 0 / .45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: sans,
      }}
    >
      <div style={{
        background: PAL.paper, borderRadius: 16, padding: "32px 36px",
        width: "100%", maxWidth: 440, boxShadow: "0 24px 64px oklch(0% 0 0 / .18)",
        position: "relative",
      }}>
        <button type="button" onClick={onClose} style={{
          position: "absolute", top: 16, right: 16, background: "none",
          border: 0, cursor: "pointer", fontSize: 18, color: PAL.muted,
        }}>✕</button>

        <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: PAL.ink }}>
          Créer une classe
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: PAL.muted }}>
          Regroupez vos étudiants pour les réunions et les cours.
        </p>

        <form onSubmit={handleSubmit}>
          <ModalField label="Nom de la classe" value={name} onChange={setName} placeholder="Ex : Groupe A – Soins Infirmiers L2" />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              Description (optionnel)
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Notes sur ce groupe…"
              rows={3}
              style={{
                width: "100%", padding: "10px 14px",
                background: PAL.cream, border: `1px solid ${PAL.line}`,
                borderRadius: 10, fontFamily: sans, fontSize: 14,
                color: PAL.ink, outline: "none", boxSizing: "border-box" as const,
                resize: "vertical" as const,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "11px 0", borderRadius: 999, fontFamily: sans, fontSize: 13,
              fontWeight: 600, cursor: "pointer",
              background: "transparent", border: `1px solid ${PAL.line}`, color: PAL.muted,
            }}>Annuler</button>
            <button type="submit" disabled={busy} style={{
              flex: 2, padding: "11px 0", borderRadius: 999, fontFamily: sans, fontSize: 13,
              fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
              background: PAL.ink, border: 0, color: PAL.paper,
              opacity: busy ? 0.65 : 1,
            }}>
              {busy ? "Création…" : "Créer la classe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "10px 14px",
          background: PAL.cream, border: `1px solid ${PAL.line}`,
          borderRadius: 10, fontFamily: sans, fontSize: 14,
          color: PAL.ink, outline: "none", boxSizing: "border-box" as const,
        }}
      />
    </div>
  );
}

// ── Classes page ──────────────────────────────────────────────

function ClassesPage() {
  const { roles, loading: authLoading } = useAuth();
  const [classes,      setClasses]      = useState<ClassItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [selected,     setSelected]     = useState<ClassItem | null>(null);
  const [students,     setStudents]     = useState<StudentItem[]>([]);
  const [studLoading,  setStudLoading]  = useState(false);
  const [roster,       setRoster]       = useState<RosterStudent[]>([]);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [removingId,   setRemovingId]   = useState<string | null>(null);
  const [addingId,     setAddingId]     = useState<string | null>(null);

  const isAdmin = roles.includes("admin");

  async function loadClasses() {
    setLoading(true);
    try {
      const data: ClassItem[] = await api.get("/api/classes");
      setClasses(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents(classId: string) {
    setStudLoading(true);
    try {
      const data: StudentItem[] = await api.get(`/api/classes/${classId}/students`);
      setStudents(data);
    } catch {
      setStudents([]);
    } finally {
      setStudLoading(false);
    }
  }

  async function loadRoster() {
    try {
      const data: RosterStudent[] = await api.get("/api/users");
      setRoster(data.filter(u =>
      u.roles.includes("student") &&
      !u.roles.includes("admin") &&
      !u.roles.includes("professor")
    ));
    } catch {
      setRoster([]);
    }
  }

  useEffect(() => {
    if (!authLoading) {
      loadClasses();
      loadRoster();
    }
  }, [authLoading]);

  async function selectClass(cls: ClassItem) {
    setSelected(cls);
    await loadStudents(cls.id);
  }

  async function deleteClass(cls: ClassItem) {
    if (!window.confirm(`Supprimer définitivement la classe « ${cls.name} » ?`)) return;
    setDeletingId(cls.id);
    try {
      await api.delete(`/api/classes/${cls.id}`);
      toast.success("Classe supprimée");
      if (selected?.id === cls.id) setSelected(null);
      loadClasses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeletingId(null);
    }
  }

  async function removeStudent(studentId: string) {
    if (!selected) return;
    setRemovingId(studentId);
    try {
      await api.delete(`/api/classes/${selected.id}/students/${studentId}`);
      toast.success("Étudiant retiré");
      await loadStudents(selected.id);
      loadClasses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRemovingId(null);
    }
  }

  async function addStudent(studentId: string) {
    if (!selected) return;
    setAddingId(studentId);
    try {
      await api.post(`/api/classes/${selected.id}/students`, { student_id: studentId });
      toast.success("Étudiant ajouté");
      await loadStudents(selected.id);
      loadClasses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Étudiant déjà dans cette classe");
    } finally {
      setAddingId(null);
    }
  }

  const enrolledIds = new Set(students.map(s => s.id));
  const available   = roster.filter(s => !enrolledIds.has(s.id));

  return (
    <>
      {showModal && (
        <CreateClassModal
          onClose={() => setShowModal(false)}
          onCreated={loadClasses}
        />
      )}

      <PageHead
        eyebrow="Encadrement"
        title="Classes"
        sub={isAdmin ? "Toutes les classes de la plateforme" : "Vos groupes d'étudiants"}
        actions={
          <button type="button" onClick={() => setShowModal(true)} className="btn-c btn-c-primary">
            <BookOpen size={15} strokeWidth={1.7} />
            Nouvelle classe
          </button>
        }
      />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" as const }}>

        {/* ── Left panel: class list ── */}
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          {/* Class cards */}
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Loader2 style={{ width: 22, height: 22, color: PAL.muted, animation: "spin 1s linear infinite" }} />
            </div>
          ) : classes.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 24px",
              background: PAL.pale, borderRadius: 16,
              fontFamily: sans, color: PAL.muted, fontSize: 14,
            }}>
              <BookOpen style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.35 }} />
              <p style={{ fontWeight: 600, marginBottom: 4, color: PAL.text }}>Aucune classe</p>
              <p>Créez votre première classe pour regrouper vos étudiants.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {classes.map(cls => {
                const isSelected = selected?.id === cls.id;
                const isDeleting = deletingId === cls.id;
                return (
                  <div
                    key={cls.id}
                    onClick={() => selectClass(cls)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                      background: isSelected ? PAL.pale : PAL.paper,
                      border: `1px solid ${isSelected ? PAL.primary : PAL.line}`,
                      transition: "all .15s",
                      fontFamily: sans,
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: isSelected ? PAL.primary : PAL.pale,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Users style={{ width: 18, height: 18, color: isSelected ? PAL.paper : PAL.primary }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {cls.name}
                      </div>
                      {cls.description && (
                        <div style={{ fontSize: 12, color: PAL.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginTop: 2 }}>
                          {cls.description}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: PAL.muted, marginTop: 4 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Users style={{ width: 11, height: 11 }} />
                          {cls.student_count} étudiant{cls.student_count !== 1 ? "s" : ""}
                        </span>
                        {isAdmin && (
                          <span style={{ marginInlineStart: 10 }}>· {cls.professor_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); deleteClass(cls); }}
                      disabled={isDeleting}
                      title="Supprimer cette classe"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, borderRadius: 8, border: `1px solid ${PAL.line}`,
                        background: "transparent", cursor: isDeleting ? "not-allowed" : "pointer",
                        color: isDeleting ? PAL.muted : PAL.danger,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(97% 0.01 25)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      {isDeleting
                        ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                        : <Trash2 style={{ width: 13, height: 13 }} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right panel: class detail ── */}
        {selected && (
          <div className="dash-card" style={{
            flex: "1 1 340px", minWidth: 0,
            padding: "20px 22px",
            fontFamily: sans,
          }}>
            {/* Panel header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: PAL.ink }}>{selected.name}</div>
                {selected.description && (
                  <div style={{ fontSize: 12, color: PAL.muted, marginTop: 3 }}>{selected.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, fontSize: 18, lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Add student row */}
            {available.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                  Ajouter un étudiant
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" as const }}>
                  {available.map(s => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 8,
                      background: PAL.cream, border: `1px solid ${PAL.line}`,
                      gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {s.full_name || s.email || "—"}
                        </div>
                        <div style={{ fontSize: 11, color: PAL.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {s.email}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addStudent(s.id)}
                        disabled={addingId === s.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 999,
                          background: PAL.primary, border: 0, color: PAL.paper,
                          fontSize: 11, fontWeight: 700, cursor: addingId === s.id ? "not-allowed" : "pointer",
                          opacity: addingId === s.id ? 0.6 : 1, flexShrink: 0,
                          fontFamily: sans,
                        }}
                      >
                        {addingId === s.id
                          ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                          : <Plus style={{ width: 11, height: 11 }} />
                        }
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: PAL.line, margin: "4px 0 16px" }} />

            {/* Enrolled students */}
            <div style={{ fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Étudiants inscrits ({students.length})
            </div>

            {studLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Loader2 style={{ width: 18, height: 18, color: PAL.muted, animation: "spin 1s linear infinite" }} />
              </div>
            ) : students.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: PAL.muted, fontSize: 13 }}>
                Aucun étudiant dans cette classe
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {students.map(s => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 8,
                    border: `1px solid ${PAL.line}`, background: PAL.pale,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 999, flexShrink: 0,
                      background: PAL.primary, color: PAL.paper,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {(s.full_name || s.email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: PAL.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {s.full_name || "—"}
                      </div>
                      <div style={{ fontSize: 11, color: PAL.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {s.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStudent(s.id)}
                      disabled={removingId === s.id}
                      title="Retirer de la classe"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 26, height: 26, borderRadius: 6, border: `1px solid ${PAL.line}`,
                        background: "transparent", cursor: removingId === s.id ? "not-allowed" : "pointer",
                        color: removingId === s.id ? PAL.muted : PAL.danger,
                        flexShrink: 0,
                      }}
                    >
                      {removingId === s.id
                        ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                        : <X style={{ width: 11, height: 11 }} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
