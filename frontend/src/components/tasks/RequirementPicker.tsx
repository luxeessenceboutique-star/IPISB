import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sectionLabelStyle = { fontSize: 10.5, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const, padding: "4px 8px 2px" };

export type LinkedEntityType = "job_description_heading" | "job_description_heading_task" | "performance_goal";
export type LinkedEntity = { type: LinkedEntityType; id: string; label: string };

type HeadingTask = { id: string; label: string };
type Heading = { id: string; label: string; parent_id: string | null; tasks: HeadingTask[]; children: Heading[] };
type JobDescription = { id: string; department: string; position: string; headings: Heading[] };
type Goal = { id: string; title: string };

function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, padding: "5px 8px", borderRadius: 7, cursor: "pointer", fontSize: 12.5,
        background: selected ? "var(--pal-pale)" : "transparent",
        color: selected ? "var(--pal-primary-deep)" : PAL.ink,
        fontWeight: selected ? 700 : 500,
      }}
    >
      {children}
    </div>
  );
}

function HeadingRow({ heading, depth, selected, onSelect }: {
  heading: Heading; depth: number;
  selected: LinkedEntity | null; onSelect: (e: LinkedEntity) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = heading.tasks.length > 0 || heading.children.length > 0;
  const isSelected = selected?.type === "job_description_heading" && selected.id === heading.id;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: depth * 16 }}>
        {hasContent ? (
          <button type="button" onClick={() => setOpen(o => !o)} style={{ background: "none", border: 0, cursor: "pointer", padding: 2, display: "flex", color: PAL.muted, flexShrink: 0 }}>
            <ChevronDown size={13} strokeWidth={2} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .12s" }} />
          </button>
        ) : <span style={{ width: 17, flexShrink: 0 }} />}
        <Row selected={isSelected} onClick={() => onSelect({ type: "job_description_heading", id: heading.id, label: heading.label })}>
          {heading.label}
        </Row>
      </div>
      {open && (
        <div>
          {heading.tasks.map(t => {
            const taskSelected = selected?.type === "job_description_heading_task" && selected.id === t.id;
            return (
              <div key={t.id} style={{ paddingLeft: (depth + 1) * 16 + 17 }}>
                <Row selected={taskSelected} onClick={() => onSelect({ type: "job_description_heading_task", id: t.id, label: t.label })}>
                  {t.label}
                </Row>
              </div>
            );
          })}
          {heading.children.map(c => (
            <HeadingRow key={c.id} heading={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Sélecteur d'une exigence existante (fiche de poste / objectif RH) à lier
 * à la tâche en cours de création — remplit linked_entity_type/
 * linked_entity_id (colonnes déjà présentes en base, jusqu'ici jamais
 * renseignées par aucune UI). Sélection unique : cliquer un autre élément
 * remplace la sélection, re-cliquer le même l'efface. */
export function RequirementPicker({ selected, onChange }: {
  selected: LinkedEntity | null; onChange: (e: LinkedEntity | null) => void;
}) {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/api/rh/job-descriptions").catch(() => []),
      api.get("/api/rh/performance/goals").catch(() => []),
    ]).then(([jdRes, goalRes]) => {
      setJds(jdRes ?? []);
      setGoals(goalRes ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function select(e: LinkedEntity) {
    onChange(selected?.type === e.type && selected.id === e.id ? null : e);
  }

  const jdsWithHeadings = jds.filter(jd => jd.headings.length > 0);

  return (
    <div>
      {selected && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, color: PAL.muted }}>
          Lié à :
          <span className="chip-c" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {selected.label}
            <button type="button" onClick={() => onChange(null)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}>
              <X size={11} />
            </button>
          </span>
        </div>
      )}
      <div style={{ border: `1px solid ${PAL.line}`, borderRadius: 10, padding: 6, maxHeight: 260, overflowY: "auto", background: PAL.paper }}>
        {loading ? (
          <div className="shimmer" style={{ height: 16, borderRadius: 999, margin: 4 }} />
        ) : goals.length === 0 && jdsWithHeadings.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: PAL.muted, padding: 6 }}>Aucune exigence disponible pour l'instant.</p>
        ) : (
          <>
            {goals.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={sectionLabelStyle}>Objectifs RH</div>
                {goals.map(g => {
                  const goalSelected = selected?.type === "performance_goal" && selected.id === g.id;
                  return (
                    <Row key={g.id} selected={goalSelected} onClick={() => select({ type: "performance_goal", id: g.id, label: g.title })}>
                      {g.title}
                    </Row>
                  );
                })}
              </div>
            )}
            {jdsWithHeadings.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Fiches de poste</div>
                {jdsWithHeadings.map(jd => (
                  <div key={jd.id} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: PAL.ink, padding: "4px 8px 2px" }}>{jd.position} — {jd.department}</div>
                    {jd.headings.map(h => (
                      <HeadingRow key={h.id} heading={h} depth={0} selected={selected} onSelect={select} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
