import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, useNodesState, applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Network, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 14, width: "100%", padding: "9px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 13, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };

type OrgEmployee = { id: string; full_name: string; position: string | null; department: string | null };
type Member = { employee_id: string; role_in_team: string | null; employee: OrgEmployee };
type Project = { id: string; name: string; description: string | null; color: string; members: Member[] };
type Position = { employee_id: string; x: number; y: number };

function NewProjectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", color: "#0891b2" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try {
      await api.post("/api/rh/orgchart/projects", form);
      toast.success("Projet créé.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 380, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>Nouveau projet / équipe</h2>
        <label style={labelStyle}>Nom *</label>
        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={fieldStyle} />
        <label style={labelStyle}>Description</label>
        <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={fieldStyle} />
        <label style={labelStyle}>Couleur</label>
        <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...fieldStyle, height: 40, padding: 4, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "Créer"}</button>
        </div>
      </div>
    </div>
  );
}

export function RhOrgChart() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [unassigned, setUnassigned] = useState<OrgEmployee[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignPicker, setAssignPicker] = useState<string | null>(null); // project id currently choosing a member for

  async function load() {
    setLoading(true);
    try {
      const [chart, posRes] = await Promise.all([
        api.get("/api/rh/orgchart"),
        api.get("/api/rh/orgchart/positions"),
      ]);
      setProjects(chart.projects ?? []);
      setUnassigned(chart.unassigned ?? []);
      const posMap: Record<string, Position> = {};
      for (const p of posRes ?? []) posMap[p.employee_id] = p;
      setPositions(posMap);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const allEmployees = useMemo(() => {
    const list: { emp: OrgEmployee; color: string }[] = [];
    projects.forEach(p => p.members.forEach(m => list.push({ emp: m.employee, color: p.color })));
    unassigned.forEach(e => list.push({ emp: e, color: "#9ca3af" }));
    return list;
  }, [projects, unassigned]);

  const initialNodes: Node[] = useMemo(() => allEmployees.map(({ emp, color }, i) => {
    const pos = positions[emp.id];
    return {
      id: emp.id,
      position: pos ? { x: pos.x, y: pos.y } : { x: (i % 6) * 180 + 20, y: Math.floor(i / 6) * 110 + 20 },
      data: { label: emp.full_name },
      style: {
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: "8px 12px",
        fontFamily: sans,
        fontSize: 12.5,
        fontWeight: 600,
        background: PAL.paper,
        color: PAL.ink,
        width: 160,
      },
    };
  }), [allEmployees, positions]);

  const [nodes, setNodes] = useNodesState(initialNodes);
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds));
  }, [setNodes]);

  const onNodeDragStop = useCallback(async (_event: unknown, node: Node) => {
    try {
      await api.put(`/api/rh/orgchart/positions/${node.id}`, { x: node.position.x, y: node.position.y });
    } catch {
      toast.error("Impossible d'enregistrer la position.");
    }
  }, []);

  async function deleteProject(p: Project) {
    if (!window.confirm(`Supprimer le projet « ${p.name} » ?`)) return;
    try { await api.delete(`/api/rh/orgchart/projects/${p.id}`); toast.success("Projet supprimé."); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  async function addMember(projectId: string, employeeId: string) {
    try {
      await api.post(`/api/rh/orgchart/projects/${projectId}/members`, { employee_id: employeeId });
      setAssignPicker(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  async function removeMember(projectId: string, employeeId: string) {
    try { await api.delete(`/api/rh/orgchart/projects/${projectId}/members/${employeeId}`); load(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur."); }
  }

  return (
    <div>
      {modalOpen && <NewProjectModal onClose={() => setModalOpen(false)} onSaved={load} />}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <SectionLabel action={
            <button type="button" onClick={() => setModalOpen(true)} className="btn-c btn-c-sm btn-c-primary"><Plus size={13} strokeWidth={1.7} />Projet</button>
          }>Projets & équipes</SectionLabel>

          {loading ? (
            <div className="dash-card" style={{ padding: 20 }}><div className="shimmer" style={{ height: 16, width: 140, borderRadius: 999 }} /></div>
          ) : projects.length === 0 ? (
            <div className="dash-card"><EmptyHint icon={<Network size={24} strokeWidth={1.7} />} text="Aucun projet." /></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {projects.map(p => (
                <div key={p.id} className="dash-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: p.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink, flex: 1 }}>{p.name}</span>
                    <button onClick={() => deleteProject(p)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }}><Trash2 size={13} strokeWidth={1.7} /></button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {p.members.map(m => (
                      <div key={m.employee_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PAL.muted }}>
                        <span style={{ flex: 1 }}>{m.employee?.full_name}</span>
                        <button onClick={() => removeMember(p.id, m.employee_id)} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, display: "flex" }}><X size={12} strokeWidth={1.7} /></button>
                      </div>
                    ))}
                  </div>
                  {assignPicker === p.id ? (
                    <select autoFocus onChange={e => e.target.value && addMember(p.id, e.target.value)} onBlur={() => setAssignPicker(null)} className="u-input" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 6, fontFamily: sans, fontSize: 12 }}>
                      <option value="">— Ajouter un employé —</option>
                      {unassigned.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  ) : (
                    <button type="button" onClick={() => setAssignPicker(p.id)} className="btn-c btn-c-sm btn-c-ghost" style={{ width: "100%", justifyContent: "center" }}>
                      <Plus size={12} strokeWidth={1.7} />Ajouter un membre
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {unassigned.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: PAL.muted }}>{unassigned.length} employé{unassigned.length !== 1 ? "s" : ""} non assigné{unassigned.length !== 1 ? "s" : ""}</div>
          )}
        </div>

        <div className="dash-card" style={{ flex: "2 1 480px", minWidth: 320, height: 560, padding: 0, overflow: "hidden" }}>
          <ReactFlow nodes={nodes} onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} fitView>
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
