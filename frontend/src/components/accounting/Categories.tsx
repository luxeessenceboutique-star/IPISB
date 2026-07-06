import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Tags } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL_LINE = "oklch(88% 0.015 170)";
const PAL_PAPER = "oklch(99% 0.005 160)";
const sans = '"Manrope", system-ui, sans-serif';

const SUGGESTED = [
  "Équipement informatique", "Mobilier", "Logiciels", "Marketing", "Maintenance",
  "Fournitures de bureau", "Formation", "Équipement médical", "Équipement de laboratoire", "Divers",
];

type Category = { id: string; name: string; created_at: string };

export function AccountingCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data: Category[] = await api.get("/api/accounting/categories");
      setCategories(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(n: string) {
    if (!n.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/accounting/categories", { name: n.trim() });
      toast.success("Catégorie créée.");
      setName("");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(c: Category) {
    if (!window.confirm(`Supprimer la catégorie « ${c.name} » ?`)) return;
    try {
      await api.delete(`/api/accounting/categories/${c.id}`);
      toast.success("Catégorie supprimée.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Catégorie utilisée par des achats existants.");
    }
  }

  const existingNames = new Set(categories.map(c => c.name.toLowerCase()));
  const suggestions = SUGGESTED.filter(s => !existingNames.has(s.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && create(name)}
          placeholder="Nouvelle catégorie…"
          className="u-input"
          style={{ flex: 1, padding: "11px 14px", border: `1px solid ${PAL_LINE}`, borderRadius: 10, fontFamily: sans, fontSize: 14, background: PAL_PAPER, outline: "none" }}
        />
        <button type="button" disabled={creating} onClick={() => create(name)} className="btn-c btn-c-primary">
          <Plus size={15} strokeWidth={1.7} />Ajouter
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => create(s)}
              className="chip-c"
              style={{ cursor: "pointer", border: `1px dashed ${PAL_LINE}` }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      <SectionLabel>{categories.length} catégorie{categories.length !== 1 ? "s" : ""}</SectionLabel>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}>
          <div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} />
        </div>
      ) : categories.length === 0 ? (
        <div className="dash-card">
          <EmptyHint icon={<Tags size={28} strokeWidth={1.7} />} text="Aucune catégorie pour l'instant." />
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          {categories.map(c => (
            <div key={c.id} className="row-c flex-wrap">
              <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                <Tags size={18} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1" style={{ fontWeight: 700, fontSize: 14, color: "var(--pal-ink)" }}>
                {c.name}
              </div>
              <button
                type="button"
                onClick={() => remove(c)}
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
