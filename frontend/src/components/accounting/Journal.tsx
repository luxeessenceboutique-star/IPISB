import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { History, User, X } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';
const titleFont = '"Cormorant Garamond", Georgia, serif';

type Entry = {
  id: string; user_id: string | null; action: string; entity_type: string | null;
  entity_id: string | null; meta: any; actor_name: string | null; created_at: string;
};

// Humanise "purchase_request.need_decision" → "Demande d'achat · décision besoin"
const ENTITY: Record<string, string> = {
  purchase_request: "Demande d'achat", purchase: "Achat", quotation: "Devis",
  invoice: "Facture", expense: "Dépense", revenue: "Recette", budget: "Budget",
  supplier: "Fournisseur", class: "Classe", trainer: "Formateur",
  purchase_payment: "Reçu / Paiement", tuition_payment: "Versement scolarité",
  inventory_item: "Actif inventaire", cash_journal: "Journal de caisse",
};
const VERB: Record<string, string> = {
  create: "création", update: "modification", delete: "suppression",
  need_decision: "décision besoin", quote_decision: "décision devis",
  create_order: "création commande", order_emitted: "commande émise",
  validate_responsable: "validation responsable", validate_comptable: "validation comptable",
  validate_order: "validation commande",
};

function label(action: string): { entity: string; verb: string } {
  const [ent, ...rest] = action.split(".");
  const verb = rest.join(".");
  return { entity: ENTITY[ent] ?? ent, verb: VERB[verb] ?? verb.replace(/[._]/g, " ") };
}

function metaReference(meta: any): string | null {
  if (!meta) return null;
  return meta.reference || meta.revenue_number || meta.purchase_number || meta.request_number || meta.invoice_number || null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// Petit backdrop (deux couches : overlay anim-fade + carte anim-pop) — cf. design system.
function Backdrop({ children, width = 520 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 30, width, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        {children}
      </div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: titleFont, fontSize: 26, fontWeight: 500, color: PAL.ink, margin: "0 0 18px" }}>{children}</h2>;
}

function DetailRow({ label, value, code }: { label: string; value: React.ReactNode; code?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${PAL.line}` }}>
      <span style={{ color: PAL.muted }}>{label}</span>
      <span style={{ color: PAL.ink, fontWeight: 600, textAlign: "right", wordBreak: "break-word", fontFamily: code ? mono : sans }}>{value ?? "—"}</span>
    </div>
  );
}

function DetailModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const l = label(entry.action);
  const ref = metaReference(entry.meta);
  const date = fmtDate(entry.created_at);
  const metaEntries = Object.entries(entry.meta ?? {});
  const summary = `${entry.actor_name || "Un utilisateur"} a effectué une ${l.verb} · ${l.entity}${ref ? ` ${ref}` : ""} le ${date}.`;

  return (
    <Backdrop width={520}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <H2>Détail de l'opération</H2>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted, marginTop: 4 }} title="Fermer"><X size={18} strokeWidth={1.7} /></button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <DetailRow label="Partie" value={l.entity} />
        <DetailRow label="Action" value={l.verb} />
        <DetailRow label="Auteur" value={entry.actor_name} />
        <DetailRow label="Date" value={date} />
        {ref && <DetailRow label="Référence" value={ref} code />}
        {entry.entity_id && <DetailRow label="ID entité" value={entry.entity_id} code />}
      </div>

      {metaEntries.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel>Métadonnées</SectionLabel>
          <div style={{ marginTop: 6 }}>
            {metaEntries.map(([k, v]) => (
              <DetailRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} code />
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, color: PAL.ink, background: "var(--pal-pale)", padding: "12px 14px", borderRadius: 10, lineHeight: 1.5 }}>
        {summary}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} className="btn-c btn-c-ghost">Fermer</button>
      </div>
    </Backdrop>
  );
}

function ActiveFilterBar({
  dateFrom, setDateFrom, dateTo, setDateTo, actorId, setActorId, entityType, setEntityType, actors,
}: {
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  actorId: string; setActorId: (v: string) => void;
  entityType: string; setEntityType: (v: string) => void;
  actors: { id: string; name: string }[];
}) {
  const fieldStyle = { padding: "8px 11px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12.5, color: PAL.ink, background: PAL.paper, outline: "none" };
  const labelStyle = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: PAL.muted, letterSpacing: ".06em", textTransform: "uppercase" as const, display: "block", marginBottom: 4 };
  const hasFilters = !!(dateFrom || dateTo || actorId || entityType);
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
      <div>
        <label style={labelStyle}>Du</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>Au</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>Profil</label>
        <select value={actorId} onChange={e => setActorId(e.target.value)} style={{ ...fieldStyle, minWidth: 160 }}>
          <option value="">Tous</option>
          {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Type d'opération</label>
        <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{ ...fieldStyle, minWidth: 160 }}>
          <option value="">Tous</option>
          {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => { setDateFrom(""); setDateTo(""); setActorId(""); setEntityType(""); }}
          className="btn-c btn-c-ghost btn-c-sm"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

export function AccountingJournal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorId, setActorId] = useState("");
  const [entityType, setEntityType] = useState("");

  useEffect(() => {
    api.get("/api/accounting/dashboard/journal/actors")
      .then((d: { id: string; name: string }[]) => setActors(d ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (actorId) params.set("user_id", actorId);
      if (entityType) params.set("op_type", entityType);
      api.get(`/api/accounting/dashboard/journal?${params.toString()}`)
        .then((d: Entry[]) => setEntries(d ?? []))
        .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [dateFrom, dateTo, actorId, entityType]);

  return (
    <div style={{ fontFamily: sans }}>
      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} />}

      <SectionLabel>Historique comptable</SectionLabel>
      <ActiveFilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        actorId={actorId} setActorId={setActorId}
        entityType={entityType} setEntityType={setEntityType}
        actors={actors}
      />
      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : entries.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<History size={28} strokeWidth={1.7} />} text="Aucune opération enregistrée." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ marginTop: 4 }}>
          {entries.map(e => {
            const l = label(e.action);
            const ref = metaReference(e.meta);
            return (
              <div key={e.id} className="row-c" style={{ gap: 12, cursor: "pointer" }} onClick={() => setSelected(e)}>
                <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><History size={16} strokeWidth={1.7} /></span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 13.5, color: PAL.ink }}>
                    <strong>{l.entity}</strong> · {l.verb}
                  </div>
                  <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <User size={11} strokeWidth={1.9} />{e.actor_name || "—"}
                    {ref && <span style={{ fontFamily: mono }}>· {ref}</span>}
                  </div>
                </div>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: PAL.muted }}>
                  {fmtDate(e.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
