import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Target, Sparkles, AlertTriangle } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import type { Employee } from "./Employees";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 6, marginBottom: 12, width: "100%", padding: "8px 10px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const };

const CATEGORY_LABEL: Record<string, string> = {
  star: "Étoile", solid: "Performant solide", potential: "Fort potentiel",
  needs_improvement: "À accompagner", key_player: "Élément clé",
};
const CATEGORY_COLOR: Record<string, string> = {
  star: "oklch(75% 0.16 145)", solid: "oklch(78% 0.12 220)", potential: "oklch(80% 0.13 90)",
  needs_improvement: "oklch(78% 0.13 30)", key_player: "oklch(88% 0.02 170)",
};

type TalentProfile = {
  id: string; employee_id: string;
  performance_score: number; potential_score: number; talent_category: string;
  flight_risk: string; is_critical_position: boolean; successor_names: string[];
  career_path: string | null; next_role: string | null; notes: string | null;
  employees?: { id: string; full_name: string; position: string | null; department: string | null };
};
type Okr = { id: string; title: string; description: string | null; quarter: string | null; progress: number; status: string };
type PdiItem = { id: string; title: string; action_type: string; target_date: string | null; status: string };

function bucket(score: number): "low" | "mid" | "high" {
  if (score <= 2) return "low";
  if (score >= 4) return "high";
  return "mid";
}

const GRID: { row: "high" | "mid" | "low"; col: "low" | "mid" | "high"; category: string }[] = [
  { row: "high", col: "low", category: "solid" }, { row: "high", col: "mid", category: "key_player" }, { row: "high", col: "high", category: "star" },
  { row: "mid", col: "low", category: "key_player" }, { row: "mid", col: "mid", category: "key_player" }, { row: "mid", col: "high", category: "key_player" },
  { row: "low", col: "low", category: "needs_improvement" }, { row: "low", col: "mid", category: "key_player" }, { row: "low", col: "high", category: "potential" },
];

function DetailPanel({ employeeId, employeeName, onClose, onChanged }: { employeeId: string; employeeName: string; onClose: () => void; onChanged: () => void }) {
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [pdi, setPdi] = useState<PdiItem[]>([]);
  const [form, setForm] = useState<any>(null);
  const [okrForm, setOkrForm] = useState({ title: "", quarter: "" });
  const [pdiForm, setPdiForm] = useState({ title: "", action_type: "formation" });

  async function load() {
    try {
      const p = await api.get(`/api/rh/talents/${employeeId}`);
      setProfile(p);
      setForm({
        performance_score: p.performance_score, potential_score: p.potential_score, flight_risk: p.flight_risk,
        is_critical_position: p.is_critical_position, career_path: p.career_path ?? "", next_role: p.next_role ?? "", notes: p.notes ?? "",
      });
      setOkrs(await api.get(`/api/rh/talents/${employeeId}/okrs`));
      setPdi(await api.get(`/api/rh/talents/${employeeId}/pdi`));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [employeeId]);

  async function save() {
    try {
      await api.patch(`/api/rh/talents/${employeeId}`, {
        ...form, career_path: form.career_path || null, next_role: form.next_role || null, notes: form.notes || null,
      });
      toast.success("Profil enregistré.");
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  async function addOkr() {
    if (!okrForm.title.trim()) return;
    try { await api.post(`/api/rh/talents/${employeeId}/okrs`, okrForm); setOkrForm({ title: "", quarter: "" }); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }
  async function cancelOkr(id: string) {
    try { await api.delete(`/api/rh/talents/okrs/${id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function addPdi() {
    if (!pdiForm.title.trim()) return;
    try { await api.post(`/api/rh/talents/${employeeId}/pdi`, pdiForm); setPdiForm({ title: "", action_type: "formation" }); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }
  async function removePdi(id: string) {
    try { await api.delete(`/api/rh/talents/pdi/${id}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  if (!profile || !form) return <div className="dash-card" style={{ padding: 20 }}><div className="shimmer" style={{ height: 16, width: 140, borderRadius: 999 }} /></div>;

  return (
    <div className="dash-card" style={{ padding: 20, flex: "1 1 340px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: PAL.ink }}>{employeeName}</span>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, fontSize: 18 }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Performance (1-5)</label>
          <input type="number" min="1" max="5" value={form.performance_score} onChange={e => setForm((f: any) => ({ ...f, performance_score: parseInt(e.target.value, 10) || 1 }))} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Potentiel (1-5)</label>
          <input type="number" min="1" max="5" value={form.potential_score} onChange={e => setForm((f: any) => ({ ...f, potential_score: parseInt(e.target.value, 10) || 1 }))} style={fieldStyle} />
        </div>
      </div>
      <label style={labelStyle}>Risque de départ</label>
      <select value={form.flight_risk} onChange={e => setForm((f: any) => ({ ...f, flight_risk: e.target.value }))} style={fieldStyle}>
        <option value="low">Faible</option><option value="medium">Moyen</option><option value="high">Élevé</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: PAL.ink, margin: "4px 0 12px" }}>
        <input type="checkbox" checked={form.is_critical_position} onChange={e => setForm((f: any) => ({ ...f, is_critical_position: e.target.checked }))} />
        Poste critique
      </label>
      <label style={labelStyle}>Prochain rôle envisagé</label>
      <input type="text" value={form.next_role} onChange={e => setForm((f: any) => ({ ...f, next_role: e.target.value }))} style={fieldStyle} />
      <label style={labelStyle}>Parcours de carrière</label>
      <input type="text" value={form.career_path} onChange={e => setForm((f: any) => ({ ...f, career_path: e.target.value }))} style={fieldStyle} />
      <label style={labelStyle}>Notes</label>
      <textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...fieldStyle, resize: "vertical" as const }} />
      <button type="button" onClick={save} className="btn-c btn-c-sm btn-c-primary" style={{ width: "100%", justifyContent: "center", marginBottom: 18 }}>Enregistrer</button>

      <div style={{ height: 1, background: PAL.line, margin: "4px 0 14px" }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 8 }}>OKRs</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input type="text" placeholder="Titre de l'objectif" value={okrForm.title} onChange={e => setOkrForm(f => ({ ...f, title: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
        <input type="text" placeholder="T1" value={okrForm.quarter} onChange={e => setOkrForm(f => ({ ...f, quarter: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0, width: 60 }} />
        <button type="button" onClick={addOkr} className="btn-c btn-c-sm btn-c-ghost"><Plus size={12} strokeWidth={1.7} /></button>
      </div>
      {okrs.map(o => (
        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: PAL.ink, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{o.title} {o.quarter ? `(${o.quarter})` : ""} — {o.progress}%</span>
          <button onClick={() => cancelOkr(o.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={12} strokeWidth={1.7} /></button>
        </div>
      ))}

      <div style={{ height: 1, background: PAL.line, margin: "14px 0" }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Plan de développement (PDI)</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input type="text" placeholder="Action" value={pdiForm.title} onChange={e => setPdiForm(f => ({ ...f, title: e.target.value }))} style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
        <button type="button" onClick={addPdi} className="btn-c btn-c-sm btn-c-ghost"><Plus size={12} strokeWidth={1.7} /></button>
      </div>
      {pdi.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: PAL.ink, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{p.title} — {p.status}</span>
          <button onClick={() => removePdi(p.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={12} strokeWidth={1.7} /></button>
        </div>
      ))}
    </div>
  );
}

export function RhTalents() {
  const [profiles, setProfiles] = useState<TalentProfile[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [bulking, setBulking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setProfiles(await api.get("/api/rh/talents"));
      setStats(await api.get("/api/rh/talents/stats/summary"));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function bulkCreate() {
    setBulking(true);
    try {
      const res = await api.post("/api/rh/talents/bulk-profile", undefined);
      toast.success(`${res.created} profil(s) créé(s).`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBulking(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <SectionLabel>Grille 9-box</SectionLabel>
        <button type="button" onClick={bulkCreate} disabled={bulking} className="btn-c btn-c-sm btn-c-ghost" style={{ opacity: bulking ? 0.6 : 1 }}>
          <Sparkles size={13} strokeWidth={1.7} />{bulking ? "…" : "Initialiser les profils manquants"}
        </button>
      </div>

      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "Profils", value: stats.total },
            { label: "Perf. moyenne", value: stats.avg_performance },
            { label: "Potentiel moyen", value: stats.avg_potential },
            { label: "Risque de départ élevé", value: stats.high_flight_risk },
            { label: "Postes critiques", value: stats.critical_positions },
          ].map(c => (
            <div key={c.label} className="dash-card" style={{ padding: "10px 16px", flex: "1 1 130px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: PAL.muted, letterSpacing: ".08em", textTransform: "uppercase" as const }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: PAL.ink }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : profiles.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Target size={28} strokeWidth={1.7} />} text="Aucun profil de talent. Cliquez sur « Initialiser » pour en créer." /></div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 420px", minWidth: 320 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {GRID.map(cell => {
                const inCell = profiles.filter(p => bucket(p.performance_score) === cell.row && bucket(p.potential_score) === cell.col);
                return (
                  <div key={`${cell.row}-${cell.col}`} style={{ background: CATEGORY_COLOR[cell.category], borderRadius: 12, padding: 10, minHeight: 100 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "oklch(25% 0.02 170)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>
                      {CATEGORY_LABEL[cell.category]}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {inCell.map(p => (
                        <button key={p.id} onClick={() => setSelected({ id: p.employee_id, name: p.employees?.full_name ?? "—" })}
                          style={{ textAlign: "left", background: "rgba(255,255,255,.6)", border: 0, borderRadius: 6, padding: "4px 8px", fontSize: 11.5, fontWeight: 600, color: PAL.ink, cursor: "pointer" }}>
                          {p.employees?.full_name}
                          {p.flight_risk === "high" && <AlertTriangle size={10} strokeWidth={2} style={{ display: "inline", marginInlineStart: 4, verticalAlign: "-1px", color: "var(--pal-danger)" }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: PAL.muted, marginTop: 6 }}>
              <span>← Potentiel faible</span><span>Potentiel élevé →</span>
            </div>
          </div>

          {selected && (
            <DetailPanel employeeId={selected.id} employeeName={selected.name} onClose={() => setSelected(null)} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
