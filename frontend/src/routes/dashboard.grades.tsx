import { createFileRoute, redirect } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { Award, ChevronDown, ChevronRight } from "lucide-react";
import { PageHead, SectionLabel, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/grades")({
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
  component: GradesPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

const fieldStyle = { padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };

type ClassItem = { id: string; name: string; formation_code?: string | null };
type StudentItem = { id: string; full_name: string | null; email: string };
type CourseGrade = { course_id: string; title: string | null; coefficient: number; grade: number | null };
type OverallGrade = { average: number | null; courses: CourseGrade[] };

function gradeColor(v: number | null): string {
  if (v == null) return PAL.muted;
  return v >= 10 ? "var(--pal-good, #2f8f5b)" : "var(--pal-danger, #c0392b)";
}

function GradesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [grades, setGrades] = useState<Record<string, OverallGrade | null>>({});
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/classes")
      .then((rows: ClassItem[]) => {
        setClasses(rows ?? []);
        if (rows?.length) setClassId(rows[0].id);
      })
      .catch(() => setClasses([]))
      .finally(() => setLoadingClasses(false));
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); setGrades({}); return; }
    let alive = true;
    setLoadingGrades(true);
    setExpanded(null);
    api.get(`/api/classes/${classId}/students`)
      .then(async (rows: StudentItem[]) => {
        if (!alive) return;
        setStudents(rows ?? []);
        const entries = await Promise.all(
          (rows ?? []).map(async s => {
            try {
              const g = await api.get(`/api/students/${s.id}/overall-grade?class_id=${classId}`);
              return [s.id, g as OverallGrade] as const;
            } catch {
              return [s.id, null] as const;
            }
          })
        );
        if (!alive) return;
        setGrades(Object.fromEntries(entries));
      })
      .catch(() => { if (alive) { setStudents([]); setGrades({}); } })
      .finally(() => { if (alive) setLoadingGrades(false); });
    return () => { alive = false; };
  }, [classId]);

  const ranked = [...students].sort((a, b) => {
    const ga = grades[a.id]?.average;
    const gb = grades[b.id]?.average;
    if (ga == null && gb == null) return (a.full_name || a.email).localeCompare(b.full_name || b.email);
    if (ga == null) return 1;
    if (gb == null) return -1;
    return gb - ga;
  });

  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Scolarité & pédagogie"
        title="Notes"
        sub="Relevé de notes consolidé — moyenne générale et par matière, calculées à partir du Contrôle continu et des Examens."
      />

      <SectionLabel
        action={
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ ...fieldStyle, minWidth: 220 }}>
            {classes.length === 0 && <option value="">Aucune classe</option>}
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.formation_code ? ` · ${c.formation_code}` : ""}</option>
            ))}
          </select>
        }
      >
        Classe
      </SectionLabel>

      {loadingClasses ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : classes.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Award size={28} strokeWidth={1.7} />} text="Aucune classe disponible." /></div>
      ) : loadingGrades ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 260, borderRadius: 999 }} /></div>
      ) : students.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Award size={28} strokeWidth={1.7} />} text="Aucun élève dans cette classe." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
              <thead>
                <tr>
                  {["#", "Élève", "Moyenne générale / 20", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: i === 2 ? "right" : "left", fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => {
                  const g = grades[s.id];
                  const isOpen = expanded === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : s.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, fontFamily: mono, fontSize: 12, color: PAL.muted }}>{i + 1}</td>
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, fontSize: 13.5, color: PAL.ink, fontWeight: 600 }}>{s.full_name || s.email}</td>
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: "right", fontFamily: mono, fontWeight: 700, fontSize: 14, color: gradeColor(g?.average ?? null) }}>
                          {g?.average != null ? g.average.toFixed(2) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: `1px solid ${PAL.line}`, textAlign: "right", color: PAL.muted }}>
                          {isOpen ? <ChevronDown size={16} strokeWidth={1.8} /> : <ChevronRight size={16} strokeWidth={1.8} />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${s.id}-detail`}>
                          <td colSpan={4} style={{ padding: 0, borderBottom: `1px solid ${PAL.line}`, background: "var(--pal-pale)" }}>
                            {!g?.courses?.length ? (
                              <div style={{ padding: "12px 20px", fontSize: 12.5, color: PAL.muted, fontStyle: "italic" }}>Aucune note disponible pour cet élève.</div>
                            ) : (
                              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                <thead>
                                  <tr>
                                    {["Matière", "Coefficient", "Note / 20"].map((h, j) => (
                                      <th key={j} style={{ padding: "8px 20px", textAlign: j === 2 ? "right" : "left", fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".06em", textTransform: "uppercase" as const }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.courses.map(c => (
                                    <tr key={c.course_id}>
                                      <td style={{ padding: "6px 20px", fontSize: 13, color: PAL.ink }}>{c.title || "—"}</td>
                                      <td style={{ padding: "6px 20px", fontSize: 12.5, color: PAL.muted, fontFamily: mono }}>{c.coefficient}</td>
                                      <td style={{ padding: "6px 20px", textAlign: "right", fontFamily: mono, fontWeight: 600, fontSize: 13, color: gradeColor(c.grade) }}>
                                        {c.grade != null ? c.grade.toFixed(2) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
