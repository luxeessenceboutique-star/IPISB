import { X } from "lucide-react";
import type { AssignableUser } from "./types";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, width: "100%", padding: "11px 14px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 14, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };

/** Sélecteur multi-assignés (chips + liste déroulante d'ajout) — certains
 * canaux (V0/V1/V2) demandent qu'une tâche soit portée par 2-3 personnes à
 * la fois, jamais un seul assigné forcé. Même principe que la page
 * Utilisateurs (rôles en chips + "Ajouter un rôle"). */
export function AssigneePicker({ selectedIds, options, disabled, placeholder = "— Aucun assigné —", onChange }: {
  selectedIds: string[];
  options: AssignableUser[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (ids: string[]) => void;
}) {
  const selected = selectedIds.map(id => options.find(u => u.id === id)).filter((u): u is AssignableUser => !!u);
  const remaining = options.filter(u => !selectedIds.includes(u.id));

  function add(id: string) {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
  }
  function remove(id: string) {
    onChange(selectedIds.filter(x => x !== id));
  }

  return (
    <div>
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {selectedIds.map(id => {
            const u = selected.find(x => x.id === id);
            return (
              <span key={id} className="chip-c" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {u ? (u.full_name || u.email) : id}
                {!disabled && (
                  <button type="button" onClick={() => remove(id)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}>
                    <X size={11} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {!disabled && (
        <select
          value=""
          disabled={remaining.length === 0}
          onChange={e => add(e.target.value)}
          className="u-input"
          style={fieldStyle}
        >
          <option value="">{selectedIds.length === 0 ? placeholder : "+ Ajouter un autre assigné…"}</option>
          {remaining.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
      )}
      {selectedIds.length === 0 && disabled && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: PAL.muted }}>— Aucun assigné —</p>
      )}
    </div>
  );
}
