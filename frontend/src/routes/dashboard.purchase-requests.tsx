import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/components/dashboard/ui";
import { AccountingPurchaseRequests } from "@/components/accounting/PurchaseRequests";

// Demandes d'achat en libre-service : ouvert à TOUT utilisateur connecté.
// Chacun crée et suit ses propres demandes ; seul l'admin décide (validation,
// devis, émission de commande).
export const Route = createFileRoute("/dashboard/purchase-requests")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
  },
  component: PurchaseRequestsPage,
});

const sans = '"Manrope", system-ui, sans-serif';

function PurchaseRequestsPage() {
  return (
    <div style={{ fontFamily: sans }}>
      <PageHead
        eyebrow="Gestion administrative"
        title="Demandes d'achat"
        sub="Exprimez un besoin d'achat et suivez son traitement par l'administration."
      />
      <AccountingPurchaseRequests />
    </div>
  );
}
