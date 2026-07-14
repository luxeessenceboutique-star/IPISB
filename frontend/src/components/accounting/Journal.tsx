import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { History, User } from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";

const PAL = { ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)" };
const sans = '"Manrope", system-ui, sans-serif';
const mono = '"JetBrains Mono", ui-monospace, monospace';

type Entry = {
  id: string; user_id: string | null; action: string; entity_type: string | null;
  entity_id: string | null; meta: any; actor_name: string | null; created_at: string;
};

// Humanise "purchase_request.need_decision" → "Demande d'achat · décision besoin"
const ENTITY: Record<string, string> = {
  purchase_request: "Demande d'achat", purchase: "Achat", quotation: "Devis",
  invoice: "Facture", expense: "Dépense", revenue: "Recette", budget: "Budget",
  supplier: "Fournisseur", class: "Classe", trainer: "Formateur",
};
const VERB: Record<string, string> = {
  create: "création", update: "modification", delete: "suppression",
  need_decision: "décision besoin", quote_decision: "décision devis",
  create_order: "création commande", order_emitted: "commande émise",
  validate_responsable: "validation responsable", validate_comptable: "validation comptable",
};

function label(action: string): { entity: string; verb: string } {
  const [ent, ...rest] = action.split(".");
  const verb = rest.join(".");
  return { entity: ENTITY[ent] ?? ent, verb: VERB[verb] ?? verb.replace(/[._]/g, " ") };
}

export function AccountingJournal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/accounting/dashboard/journal?limit=100")
      .then((d: Entry[]) => setEntries(d ?? []))
      .catch((err: any) => toast.error(err?.message ?? "Erreur lors du chargement."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ fontFamily: sans }}>
      <SectionLabel>Journal comptable — dernières opérations</SectionLabel>
      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 200, borderRadius: 999 }} /></div>
      ) : entries.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<History size={28} strokeWidth={1.7} />} text="Aucune opération enregistrée." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ marginTop: 4 }}>
          {entries.map(e => {
            const l = label(e.action);
            return (
              <div key={e.id} className="row-c" style={{ gap: 12 }}>
                <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><History size={16} strokeWidth={1.7} /></span>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 13.5, color: PAL.ink }}>
                    <strong>{l.entity}</strong> · {l.verb}
                  </div>
                  <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <User size={11} strokeWidth={1.9} />{e.actor_name || "—"}
                    {e.meta?.request_number && <span style={{ fontFamily: mono }}>· {e.meta.request_number}</span>}
                    {e.meta?.invoice_number && <span style={{ fontFamily: mono }}>· {e.meta.invoice_number}</span>}
                  </div>
                </div>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: PAL.muted }}>
                  {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
