import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Star, ArrowUpRight } from "lucide-react";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

type GrilleRow = { score: number | null; remarque: string | null };
type EvaluationGrille = {
  connaissance_domaine: GrilleRow; formations: GrilleRow; experiences_pro: GrilleRow;
  competences: GrilleRow; outils: GrilleRow;
  travail_equipe: GrilleRow; ponctualite_reactivite: GrilleRow; organisation_autonomie: GrilleRow; motivation: GrilleRow;
  mobilite: GrilleRow; disponibilite: GrilleRow; pretentions_salariales: GrilleRow;
  observations: string | null;
};
type CompetenceRating = { commentaire: string | null; niveau: string | null };
type EvaluationFiche = {
  ponctualite: string | null; maitrise_de_soi: string | null; facon_de_se_presenter: string | null;
  comportement: string | null; interet_poste: string | null;
  competences_corps_metier: CompetenceRating; competences_transverses: CompetenceRating; agilites: CompetenceRating;
  softskills: Record<string, boolean>;
  points_forts: string | null; axes_amelioration: string | null; appreciation_generale: string | null;
};
type Evaluation = {
  interview_id: string; grille: EvaluationGrille; fiche: EvaluationFiche;
  decision: string | null; decision_detail: string | null;
  salary_current: string | null; salary_expected: string | null;
  interviewer_visa: string | null; entite_affectation: string | null;
  type_entretien: string | null; duree_entretien: string | null;
} | null;

const EMPTY_ROW: GrilleRow = { score: null, remarque: null };
const EMPTY_GRILLE: EvaluationGrille = {
  connaissance_domaine: EMPTY_ROW, formations: EMPTY_ROW, experiences_pro: EMPTY_ROW,
  competences: EMPTY_ROW, outils: EMPTY_ROW,
  travail_equipe: EMPTY_ROW, ponctualite_reactivite: EMPTY_ROW, organisation_autonomie: EMPTY_ROW, motivation: EMPTY_ROW,
  mobilite: EMPTY_ROW, disponibilite: EMPTY_ROW, pretentions_salariales: EMPTY_ROW,
  observations: null,
};
const EMPTY_COMPETENCE: CompetenceRating = { commentaire: null, niveau: null };
const EMPTY_FICHE: EvaluationFiche = {
  ponctualite: null, maitrise_de_soi: null, facon_de_se_presenter: null, comportement: null, interet_poste: null,
  competences_corps_metier: EMPTY_COMPETENCE, competences_transverses: EMPTY_COMPETENCE, agilites: EMPTY_COMPETENCE,
  softskills: {}, points_forts: null, axes_amelioration: null, appreciation_generale: null,
};

const GRILLE_SECTIONS: { title: string; rows: { key: keyof EvaluationGrille; label: string }[] }[] = [
  { title: "Entreprise / formations / expérience", rows: [
    { key: "connaissance_domaine", label: "Connaissance du domaine d'activité" },
    { key: "formations", label: "Formations" },
    { key: "experiences_pro", label: "Expériences professionnelles" },
  ] },
  { title: "Savoir-faire — compétences pour le poste", rows: [
    { key: "competences", label: "Compétences" },
    { key: "outils", label: "Outils" },
  ] },
  { title: "Comportements et attitudes", rows: [
    { key: "travail_equipe", label: "Travail en équipe et communication" },
    { key: "ponctualite_reactivite", label: "Ponctualité et réactivité" },
    { key: "organisation_autonomie", label: "Organisation et autonomie" },
    { key: "motivation", label: "Motivation" },
  ] },
  { title: "Adéquation et disponibilité", rows: [
    { key: "mobilite", label: "Mobilité" },
    { key: "disponibilite", label: "Disponibilité" },
    { key: "pretentions_salariales", label: "Prétentions salariales" },
  ] },
];

const FICHE_CRITERIA: { key: keyof Pick<EvaluationFiche, "ponctualite" | "maitrise_de_soi" | "facon_de_se_presenter" | "comportement" | "interet_poste">; label: string; options: string[] }[] = [
  { key: "ponctualite", label: "Ponctualité", options: ["Parfaite", "Dans la marge de tolérance", "Un peu en retard", "Très en retard"] },
  { key: "maitrise_de_soi", label: "Maîtrise de soi", options: ["Très détendu", "Calme", "Impatient", "Stressé"] },
  { key: "facon_de_se_presenter", label: "Façon de se présenter", options: ["Avec assurance", "Avec discrétion", "Avec timidité", "Avec hésitation"] },
  { key: "comportement", label: "Comportement", options: ["Aimable", "Normal", "Déplaisant", "Antipathique"] },
  { key: "interet_poste", label: "Intérêt pour le poste", options: ["S'informe dans les détails", "Se renseigne", "Peu curieux", "Sans intérêt"] },
];

const COMPETENCE_BLOCKS: { key: "competences_corps_metier" | "competences_transverses" | "agilites"; label: string; options: string[] }[] = [
  { key: "competences_corps_metier", label: "Compétences corps-métier", options: ["Initié", "Qualifié", "Expérimenté", "Master"] },
  { key: "competences_transverses", label: "Compétences métier-transverses", options: ["Initié", "Qualifié", "Expérimenté", "Master"] },
  { key: "agilites", label: "Agilités", options: ["Low", "Medium", "High"] },
];

const SOFTSKILL_CATEGORIES: { title: string; items: { key: string; label: string }[] }[] = [
  { title: "Intellectuelle & stratégique", items: [
    { key: "analyse_problemes_complexes", label: "Analyse les problèmes complexes et propose des solutions innovantes" },
    { key: "compose_incertitude", label: "Compose avec l'incertitude, l'ambiguïté et les contradictions" },
  ] },
  { title: "People", items: [
    { key: "construit_relations", label: "Construit des relations effectives et de confiance avec différents profils" },
    { key: "efficacite_collective", label: "Développe une efficacité collective, un travail d'équipe et casse les silos" },
  ] },
  { title: "Résultat", items: [
    { key: "etablit_priorites", label: "Établit des priorités et maintient le focus sur les résultats" },
    { key: "organise_planifie", label: "Organise et planifie son activité" },
  ] },
  { title: "Change", items: [
    { key: "sadapte_cultures", label: "S'adapte aux différentes cultures, environnements, situations et profils" },
    { key: "defend_idees", label: "Défend ses propres idées, mais aussi sait changer d'avis" },
  ] },
  { title: "Connaissance de soi", items: [
    { key: "lutte_developpement", label: "Lutte pour son propre développement — envie d'apprendre et d'élargir ses compétences" },
  ] },
];

const DECISION_OPTIONS: { value: string; label: string; detailLabel?: string }[] = [
  { value: "negative", label: "Envoyer une réponse négative" },
  { value: "standby", label: "Mettre la candidature en stand-by", detailLabel: "Jusqu'au (date)" },
  { value: "other_interview", label: "Programmer un autre entretien", detailLabel: "Avec (nom)" },
  { value: "offer", label: "Faire une offre salariale / Recruter immédiatement" },
  { value: "other_entity", label: "Proposer à une autre entité", detailLabel: "Entité" },
];

function ScorePicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ background: "none", border: 0, cursor: "pointer", padding: 1 }}>
          <Star size={18} strokeWidth={1.7} fill={value != null && n <= value ? "var(--pal-warn)" : "none"} color={value != null && n <= value ? "var(--pal-warn)" : PAL.line} />
        </button>
      ))}
    </div>
  );
}

type Step = "grille" | "fiche" | "decision";
const STEPS: { key: Step; label: string }[] = [
  { key: "grille", label: "Grille d'entretien" },
  { key: "fiche", label: "Fiche d'appréciation" },
  { key: "decision", label: "Décision" },
];

export function InterviewEvaluationPanel({ interviewId, currentUserName, onChanged, onPromote }: {
  interviewId: string; currentUserName: string; onChanged?: () => void; onPromote?: () => void;
}) {
  const [step, setStep] = useState<Step>("grille");
  const [loading, setLoading] = useState(true);
  const [grille, setGrille] = useState<EvaluationGrille>(EMPTY_GRILLE);
  const [fiche, setFiche] = useState<EvaluationFiche>(EMPTY_FICHE);
  const [decision, setDecision] = useState<string | null>(null);
  const [decisionDetail, setDecisionDetail] = useState("");
  const [salaryCurrent, setSalaryCurrent] = useState("");
  const [salaryExpected, setSalaryExpected] = useState("");
  const [visa, setVisa] = useState("");
  const [entite, setEntite] = useState("");
  const [typeEntretien, setTypeEntretien] = useState("");
  const [duree, setDuree] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/rh/recruitment/interviews/${interviewId}/evaluation`)
      .then((data: Evaluation) => {
        if (data) {
          setGrille({ ...EMPTY_GRILLE, ...data.grille });
          setFiche({ ...EMPTY_FICHE, ...data.fiche });
          setDecision(data.decision);
          setDecisionDetail(data.decision_detail ?? "");
          setSalaryCurrent(data.salary_current ?? "");
          setSalaryExpected(data.salary_expected ?? "");
          setVisa(data.interviewer_visa ?? currentUserName);
          setEntite(data.entite_affectation ?? "");
          setTypeEntretien(data.type_entretien ?? "");
          setDuree(data.duree_entretien ?? "");
        } else {
          setVisa(currentUserName);
        }
      })
      .catch(() => toast.error("Erreur lors du chargement de l'évaluation."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  const filledCount = [
    Object.entries(grille).some(([k, v]) => k !== "observations" && (v as GrilleRow)?.score != null),
    fiche.ponctualite != null || fiche.appreciation_generale,
    decision != null,
  ].filter(Boolean).length;

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.put(`/api/rh/recruitment/interviews/${interviewId}/evaluation`, body);
      toast.success("Évaluation enregistrée.");
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  function setGrilleRow(key: keyof EvaluationGrille, patch: Partial<GrilleRow>) {
    setGrille(g => ({ ...g, [key]: { ...(g[key] as GrilleRow), ...patch } }));
  }

  const grilleAverage = (() => {
    const scores = Object.entries(grille)
      .filter(([k]) => k !== "observations")
      .map(([, v]) => (v as GrilleRow).score)
      .filter((s): s is number => s != null);
    return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  })();

  if (loading) {
    return <div className="shimmer" style={{ height: 220, borderRadius: 16 }} />;
  }

  return (
    <div className="dash-card" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {STEPS.map(s => (
            <button
              key={s.key} type="button" onClick={() => setStep(s.key)}
              style={{
                padding: "7px 14px", borderRadius: 999, border: `1px solid ${step === s.key ? "var(--pal-primary)" : PAL.line}`,
                background: step === s.key ? "var(--pal-pale)" : "transparent", cursor: "pointer",
                fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: step === s.key ? "var(--pal-primary-deep)" : PAL.muted,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="chip-c" style={{ fontSize: 11 }}>{filledCount}/3 sections remplies</span>
      </div>

      {step === "grille" && (
        <div>
          {GRILLE_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 18 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{section.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {section.rows.map(row => {
                  const val = grille[row.key] as GrilleRow;
                  return (
                    <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: sans, fontSize: 13, color: PAL.ink, flex: "1 1 220px", minWidth: 180 }}>{row.label}</span>
                      <ScorePicker value={val.score} onChange={n => setGrilleRow(row.key, { score: n })} />
                      <input
                        type="text" placeholder="Remarque…" value={val.remarque ?? ""}
                        onChange={e => setGrilleRow(row.key, { remarque: e.target.value })}
                        style={{ ...fieldStyle, margin: 0, flex: "1 1 200px", fontSize: 12.5 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <label style={labelStyle}>Observations</label>
          <textarea value={grille.observations ?? ""} onChange={e => setGrille(g => ({ ...g, observations: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted }}>
              Note totale : <strong style={{ color: PAL.ink }}>{grilleAverage != null ? grilleAverage.toFixed(1) : "—"}/5</strong>
            </span>
            <button type="button" disabled={busy} onClick={() => save({ grille })} className="btn-c btn-c-primary">
              {busy ? "…" : "Enregistrer la grille"}
            </button>
          </div>
        </div>
      )}

      {step === "fiche" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Type d'entretien</label>
              <select value={typeEntretien} onChange={e => setTypeEntretien(e.target.value)} style={fieldStyle}>
                <option value="">—</option>
                <option value="presentiel">Présentiel</option>
                <option value="distance">À distance</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Durée de l'entretien</label>
              <input type="text" placeholder="Ex. 45 min" value={duree} onChange={e => setDuree(e.target.value)} style={fieldStyle} />
            </div>
          </div>
          <label style={labelStyle}>Entité d'affectation</label>
          <input type="text" value={entite} onChange={e => setEntite(e.target.value)} style={fieldStyle} />

          <div style={{ ...labelStyle, marginTop: 6, marginBottom: 8 }}>Évaluation du candidat</div>
          {FICHE_CRITERIA.map(c => (
            <div key={c.key} style={{ marginBottom: 10 }}>
              <label style={{ ...labelStyle, fontSize: 10.5 }}>{c.label}</label>
              <select value={fiche[c.key] ?? ""} onChange={e => setFiche(f => ({ ...f, [c.key]: e.target.value || null }))} style={{ ...fieldStyle, marginBottom: 0 }}>
                <option value="">—</option>
                {c.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}

          <div style={{ ...labelStyle, marginTop: 14, marginBottom: 8 }}>Compétences</div>
          {COMPETENCE_BLOCKS.map(b => {
            const val = fiche[b.key] as CompetenceRating;
            return (
              <div key={b.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: sans, fontSize: 13, color: PAL.ink, flex: "1 1 200px", minWidth: 160, paddingTop: 10 }}>{b.label}</span>
                <select
                  value={val.niveau ?? ""} onChange={e => setFiche(f => ({ ...f, [b.key]: { ...val, niveau: e.target.value || null } }))}
                  style={{ ...fieldStyle, margin: 0, flex: "0 1 160px" }}
                >
                  <option value="">Niveau —</option>
                  {b.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input
                  type="text" placeholder="Commentaire…" value={val.commentaire ?? ""}
                  onChange={e => setFiche(f => ({ ...f, [b.key]: { ...val, commentaire: e.target.value } }))}
                  style={{ ...fieldStyle, margin: 0, flex: "1 1 220px" }}
                />
              </div>
            );
          })}

          <div style={{ ...labelStyle, marginTop: 14, marginBottom: 8 }}>Agilités observées</div>
          {SOFTSKILL_CATEGORIES.map(cat => (
            <div key={cat.title} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: "var(--pal-primary-deep)", marginBottom: 4 }}>{cat.title}</div>
              {cat.items.map(item => (
                <label key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, marginBottom: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox" checked={!!fiche.softskills[item.key]}
                    onChange={e => setFiche(f => ({ ...f, softskills: { ...f.softskills, [item.key]: e.target.checked } }))}
                    style={{ marginTop: 3 }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          ))}

          <label style={labelStyle}>Points forts</label>
          <textarea value={fiche.points_forts ?? ""} onChange={e => setFiche(f => ({ ...f, points_forts: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const }} />
          <label style={labelStyle}>Axes d'amélioration</label>
          <textarea value={fiche.axes_amelioration ?? ""} onChange={e => setFiche(f => ({ ...f, axes_amelioration: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const }} />
          <label style={labelStyle}>Appréciation générale</label>
          <textarea value={fiche.appreciation_generale ?? ""} onChange={e => setFiche(f => ({ ...f, appreciation_generale: e.target.value }))} rows={3} style={{ ...fieldStyle, resize: "vertical" as const }} />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button" disabled={busy}
              onClick={() => save({ fiche, type_entretien: typeEntretien || null, duree_entretien: duree || null, entite_affectation: entite || null })}
              className="btn-c btn-c-primary"
            >
              {busy ? "…" : "Enregistrer la fiche"}
            </button>
          </div>
        </div>
      )}

      {step === "decision" && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {DECISION_OPTIONS.map(opt => (
              <label key={opt.value} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${decision === opt.value ? "var(--pal-primary)" : PAL.line}`,
                background: decision === opt.value ? "var(--pal-pale)" : "transparent", cursor: "pointer",
              }}>
                <input type="radio" name="decision" checked={decision === opt.value} onChange={() => setDecision(opt.value)} />
                <span style={{ fontFamily: sans, fontSize: 13.5, color: PAL.ink, fontWeight: decision === opt.value ? 700 : 500, flex: 1 }}>{opt.label}</span>
              </label>
            ))}
          </div>
          {decision && DECISION_OPTIONS.find(o => o.value === decision)?.detailLabel && (
            <>
              <label style={labelStyle}>{DECISION_OPTIONS.find(o => o.value === decision)!.detailLabel}</label>
              <input type="text" value={decisionDetail} onChange={e => setDecisionDetail(e.target.value)} style={fieldStyle} />
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Situation salariale actuelle</label>
              <input type="text" value={salaryCurrent} onChange={e => setSalaryCurrent(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Prétentions salariales</label>
              <input type="text" value={salaryExpected} onChange={e => setSalaryExpected(e.target.value)} style={fieldStyle} />
            </div>
          </div>
          <label style={labelStyle}>Visa interviewer</label>
          <input type="text" value={visa} onChange={e => setVisa(e.target.value)} placeholder="Nom(s) — si comité, préciser noms et fonctions" style={fieldStyle} />

          {decision === "offer" && onPromote && (
            <div style={{ marginBottom: 14 }}>
              <button type="button" onClick={onPromote} className="btn-c btn-c-ghost">
                <ArrowUpRight size={14} strokeWidth={1.7} />Promouvoir ce candidat →
              </button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button" disabled={busy}
              onClick={() => save({
                decision, decision_detail: decisionDetail || null,
                salary_current: salaryCurrent || null, salary_expected: salaryExpected || null,
                interviewer_visa: visa || null,
              })}
              className="btn-c btn-c-primary"
            >
              {busy ? "…" : "Enregistrer la décision"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
