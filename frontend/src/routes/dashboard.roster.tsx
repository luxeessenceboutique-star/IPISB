import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Upload, Download, Trash2, Users, Search } from "lucide-react";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";

export const Route = createFileRoute("/dashboard/roster")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .in("role", ["admin", "rh", "assistant_rh"]);
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: RosterPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

// Mêmes colonnes, même ordre que le classeur "Canevas privé" d'origine.
const COLUMNS: { key: string; label: string }[] = [
  { key: "departement", label: "Département" },
  { key: "region", label: "Région" },
  { key: "province", label: "Province / préfecture" },
  { key: "milieu", label: "Urbain/Rural" },
  { key: "etablissement", label: "Établissement" },
  { key: "mode_formation", label: "Mode de formation" },
  { key: "niveau_formation", label: "Niveau" },
  { key: "secteur", label: "Secteur" },
  { key: "filiere", label: "Filière" },
  { key: "annee_formation", label: "Année" },
  { key: "nom", label: "Nom" },
  { key: "prenom", label: "Prénom" },
  { key: "genre", label: "Genre" },
  { key: "besoins_specifiques", label: "Besoins spécifiques" },
  { key: "type_handicap", label: "Type d'handicap" },
  { key: "cin", label: "CIN" },
  { key: "id_massar", label: "Id massar" },
  { key: "date_naissance", label: "Date de naissance" },
  { key: "nationalite", label: "Nationalité" },
  { key: "etranger_migrant_refugie", label: "Étranger/migrant/réfugié" },
  { key: "pays_origine", label: "Pays d'origine" },
  { key: "niveau_scolaire", label: "Niveau scolaire" },
  { key: "date_dernier_niveau", label: "Dernier niveau scolaire" },
];

type RosterRow = { id: string; academic_year: string; [key: string]: unknown };

function RosterPage() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState("2025-2026");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [items, yrs] = await Promise.all([
        api.get(`/api/roster?academic_year=${encodeURIComponent(year)}`),
        api.get("/api/roster/years"),
      ]);
      setRows(items ?? []);
      setYears(yrs?.length ? yrs : ["2025-2026"]);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const qs = `academic_year=${encodeURIComponent(year)}&replace_existing=${replaceExisting}`;
      const res = await api.uploadFile(`/api/roster/import?${qs}`, fd);
      toast.success(`${res.inserted} stagiaire${res.inserted > 1 ? "s" : ""} importé${res.inserted > 1 ? "s" : ""}${res.skipped ? ` (${res.skipped} ligne(s) ignorée(s))` : ""}.`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'import.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExport() {
    try {
      await api.download(`/api/roster/export?academic_year=${encodeURIComponent(year)}`, `Effectifs_stagiaires_${year.replace("/", "-")}.xlsx`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'export.");
    }
  }

  async function removeRow(id: string) {
    if (!window.confirm("Retirer ce stagiaire de l'effectif ?")) return;
    try {
      await api.delete(`/api/roster/${id}`);
      setRows(rs => rs.filter(r => r.id !== id));
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.nom, r.prenom, r.cin, r.filiere, r.etablissement].some(v => (v ? String(v).toLowerCase().includes(q) : false))
    );
  }, [rows, search]);

  return (
    <div style={{ fontFamily: sans }}>
      <Link to="/dashboard/pedagogique" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: PAL.muted, textDecoration: "none", marginBottom: 16 }}>
        <ArrowLeft size={14} strokeWidth={1.7} />Pédagogique
      </Link>

      <PageHead
        eyebrow="Pédagogique"
        title="Effectifs des stagiaires"
        sub="Import/export au même format que le classeur « Canevas privé » — une ligne par stagiaire, mêmes colonnes."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={year} onChange={e => setYear(e.target.value)} className="u-input" style={{ padding: "8px 12px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, background: PAL.paper }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={handleExport} className="btn-c btn-c-ghost btn-c-sm">
              <Download size={14} strokeWidth={1.7} />Exporter (.xlsx)
            </button>
            <label className="btn-c btn-c-primary btn-c-sm" style={{ cursor: importing ? "wait" : "pointer", opacity: importing ? 0.6 : 1 }}>
              <Upload size={14} strokeWidth={1.7} />{importing ? "Import…" : "Importer (.xlsx)"}
              <input ref={fileInputRef} type="file" accept=".xlsx" disabled={importing} onChange={handleImport} style={{ display: "none" }} />
            </label>
          </div>
        }
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: PAL.muted, pointerEvents: "none" }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (nom, CIN, filière…)"
            style={{ width: "100%", padding: "8px 12px 8px 30px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const }}
            className="u-input"
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, color: PAL.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
          Remplacer l'effectif {year} existant à l'import
        </label>
        <span className="chip-c" style={{ fontSize: 11, marginInlineStart: "auto" }}>{filtered.length} stagiaire{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 22 }}><div className="shimmer" style={{ height: 16, width: 160, borderRadius: 999 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Users size={26} strokeWidth={1.7} />} text="Aucun stagiaire pour cette année — importez un classeur pour commencer." /></div>
      ) : (
        <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: sans, fontSize: 12.5, whiteSpace: "nowrap" as const }}>
              <thead>
                <tr>
                  {COLUMNS.map(c => (
                    <th key={c.key} style={{ position: "sticky", top: 0, background: "var(--pal-cream)", padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: PAL.muted, textTransform: "uppercase" as const, letterSpacing: ".04em", borderBottom: `1px solid ${PAL.line}` }}>
                      {c.label}
                    </th>
                  ))}
                  <th style={{ position: "sticky", top: 0, background: "var(--pal-cream)", borderBottom: `1px solid ${PAL.line}` }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${PAL.line}` }}>
                    {COLUMNS.map(c => (
                      <td key={c.key} style={{ padding: "8px 12px", color: r[c.key] ? PAL.ink : PAL.muted, fontFamily: c.key === "cin" || c.key === "id_massar" ? mono : sans }}>
                        {c.key === "besoins_specifiques" ? (r[c.key] ? "Oui" : "Non") : (r[c.key] as string) || "—"}
                      </td>
                    ))}
                    <td style={{ padding: "8px 12px", textAlign: "right" as const }}>
                      <button type="button" onClick={() => removeRow(r.id)} title="Retirer" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)", display: "inline-flex" }}>
                        <Trash2 size={13} strokeWidth={1.7} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
