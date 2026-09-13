import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Tags, ChevronDown, ChevronUp, Pencil, Check, X, Package } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL_LINE = "oklch(88% 0.015 170)";
const PAL_PAPER = "oklch(99% 0.005 160)";
const PAL_MUTED = "oklch(48% 0.02 180)";
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

const SUGGESTED = [
  "Équipement informatique", "Mobilier", "Logiciels", "Marketing", "Maintenance",
  "Fournitures de bureau", "Formation", "Équipement médical", "Équipement de laboratoire", "Divers",
];

type Category = { id: string; name: string; code: string | null; created_at: string };
type CategoryArticle = {
  id: string; category_id: string; code_article: string | null; article: string;
  caracteristiques: string | null; commentaire: string | null; created_at: string;
};

const inputStyle = { padding: "9px 12px", border: `1px solid ${PAL_LINE}`, borderRadius: 9, fontFamily: sans, fontSize: 13, background: PAL_PAPER, outline: "none", boxSizing: "border-box" as const };

/** Panneau du catalogue d'articles d'une catégorie (Code article / Article /
 * Caractéristiques / Commentaire) + édition du code de la catégorie elle-même. */
function CategoryArticlesPanel({ category, onCategoryChanged }: { category: Category; onCategoryChanged: () => void }) {
  const [articles, setArticles] = useState<CategoryArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code_article: "", article: "", caracteristiques: "", commentaire: "" });
  const [adding, setAdding] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(category.code || "");
  const [savingCode, setSavingCode] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/api/accounting/categories/${category.id}/articles`)
      .then((d: CategoryArticle[]) => setArticles(d))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement des articles."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [category.id]);

  async function addArticle() {
    if (!form.article.trim()) { toast.error("Le nom de l'article est obligatoire."); return; }
    setAdding(true);
    try {
      await api.post(`/api/accounting/categories/${category.id}/articles`, {
        article: form.article.trim(),
        code_article: form.code_article.trim() || null,
        caracteristiques: form.caracteristiques.trim() || null,
        commentaire: form.commentaire.trim() || null,
      });
      toast.success("Article ajouté.");
      setForm({ code_article: "", article: "", caracteristiques: "", commentaire: "" });
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ajout.");
    } finally {
      setAdding(false);
    }
  }

  async function removeArticle(a: CategoryArticle) {
    if (!window.confirm(`Supprimer l'article « ${a.article} » ?`)) return;
    try {
      await api.delete(`/api/accounting/categories/${category.id}/articles/${a.id}`);
      toast.success("Article supprimé.");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  async function saveCode() {
    setSavingCode(true);
    try {
      await api.patch(`/api/accounting/categories/${category.id}`, { code: codeDraft.trim() || null });
      toast.success("Code mis à jour.");
      setEditingCode(false);
      onCategoryChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement du code.");
    } finally {
      setSavingCode(false);
    }
  }

  return (
    <div style={{ padding: "14px 18px 18px", background: "var(--pal-pale)", borderTop: `1px solid ${PAL_LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL_MUTED, letterSpacing: ".08em", textTransform: "uppercase" }}>Code catégorie</span>
        {editingCode ? (
          <>
            <input
              value={codeDraft} onChange={e => setCodeDraft(e.target.value)} placeholder="ex. DIV"
              style={{ ...inputStyle, width: 110, fontFamily: mono }} autoFocus
              onKeyDown={e => e.key === "Enter" && saveCode()}
            />
            <button onClick={saveCode} disabled={savingCode} className="btn-c btn-c-primary btn-c-sm" title="Enregistrer"><Check size={13} /></button>
            <button onClick={() => { setEditingCode(false); setCodeDraft(category.code || ""); }} className="btn-c btn-c-ghost btn-c-sm" title="Annuler"><X size={13} /></button>
          </>
        ) : (
          <>
            <span className="chip-c chip-c-blue" style={{ fontFamily: mono }}>{category.code || "—"}</span>
            <button onClick={() => setEditingCode(true)} className="btn-c btn-c-ghost btn-c-sm" title="Modifier le code"><Pencil size={12} /></button>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Package size={14} strokeWidth={1.8} style={{ color: "var(--pal-primary)" }} />
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL_MUTED, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Catalogue d'articles ({articles.length})
        </span>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999, marginBottom: 10 }} />
      ) : articles.length > 0 ? (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead>
              <tr>
                {["Code article", "Article", "Caractéristiques", "Commentaire", ""].map((h, i) => (
                  <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL_MUTED, letterSpacing: ".06em", textTransform: "uppercase", borderBottom: `1px solid ${PAL_LINE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map(a => (
                <tr key={a.id}>
                  <td style={{ padding: "8px 10px", fontFamily: mono, fontSize: 12, borderBottom: `1px solid ${PAL_LINE}`, whiteSpace: "nowrap" }}>{a.code_article || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${PAL_LINE}` }}>{a.article}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12.5, color: PAL_MUTED, borderBottom: `1px solid ${PAL_LINE}`, whiteSpace: "normal", minWidth: 160 }}>{a.caracteristiques || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12.5, color: PAL_MUTED, borderBottom: `1px solid ${PAL_LINE}`, whiteSpace: "normal", minWidth: 140 }}>{a.commentaire || "—"}</td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${PAL_LINE}`, textAlign: "right" }}>
                    <button onClick={() => removeArticle(a)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer">
                      <Trash2 size={13} strokeWidth={1.7} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: PAL_MUTED, marginBottom: 12 }}>Aucun article dans cette catégorie pour l'instant.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto", gap: 8, alignItems: "center" }}>
        <input placeholder="Code article" value={form.code_article} onChange={e => setForm(f => ({ ...f, code_article: e.target.value }))} style={{ ...inputStyle, fontFamily: mono }} />
        <input placeholder="Article *" value={form.article} onChange={e => setForm(f => ({ ...f, article: e.target.value }))} style={inputStyle} onKeyDown={e => e.key === "Enter" && addArticle()} />
        <input placeholder="Caractéristiques" value={form.caracteristiques} onChange={e => setForm(f => ({ ...f, caracteristiques: e.target.value }))} style={inputStyle} />
        <input placeholder="Commentaire" value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} style={inputStyle} />
        <button onClick={addArticle} disabled={adding} className="btn-c btn-c-primary btn-c-sm" style={{ whiteSpace: "nowrap" }}>
          <Plus size={13} />Ajouter
        </button>
      </div>
    </div>
  );
}

export function AccountingCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  async function create(n: string, c?: string) {
    if (!n.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/accounting/categories", { name: n.trim(), code: (c || "").trim() || null });
      toast.success("Catégorie créée.");
      setName("");
      setCode("");
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
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && create(name, code)}
          placeholder="Nouvelle catégorie…"
          className="u-input"
          style={{ flex: "2 1 220px", padding: "11px 14px", border: `1px solid ${PAL_LINE}`, borderRadius: 10, fontFamily: sans, fontSize: 14, background: PAL_PAPER, outline: "none" }}
        />
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && create(name, code)}
          placeholder="Code (optionnel)"
          className="u-input"
          style={{ flex: "1 1 120px", padding: "11px 14px", border: `1px solid ${PAL_LINE}`, borderRadius: 10, fontFamily: mono, fontSize: 13, background: PAL_PAPER, outline: "none" }}
        />
        <button type="button" disabled={creating} onClick={() => create(name, code)} className="btn-c btn-c-primary">
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
          {categories.map(c => {
            const expanded = expandedId === c.id;
            return (
              <div key={c.id}>
                <div
                  className="row-c flex-wrap"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                >
                  <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}>
                    <Tags size={18} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--pal-ink)" }}>{c.name}</span>
                    {c.code && <span className="chip-c" style={{ fontFamily: mono, fontSize: 11 }}>{c.code}</span>}
                  </div>
                  {expanded ? <ChevronUp size={16} strokeWidth={1.8} style={{ color: PAL_MUTED }} /> : <ChevronDown size={16} strokeWidth={1.8} style={{ color: PAL_MUTED }} />}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); remove(c); }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <Trash2 size={14} strokeWidth={1.7} />
                  </button>
                </div>
                {expanded && <CategoryArticlesPanel category={c} onCategoryChanged={load} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
