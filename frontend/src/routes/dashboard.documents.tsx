import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layers, FolderTree } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { PreviewModal, type Preview } from "@/components/dashboard/preview";
import { GeneratedDocumentsTab } from "@/components/documents/GeneratedDocumentsTab";
import { FolderLibraryTab } from "@/components/documents/FolderLibraryTab";

export const Route = createFileRoute("/dashboard/documents")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "admin");
    if (!data?.length) throw redirect({ to: "/dashboard" });
  },
  component: DocumentsPage,
});

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

type Tab = "templates" | "folders";
const TABS: { key: Tab; label: string; icon: typeof Layers }[] = [
  { key: "templates", label: "Modèles & documents générés", icon: Layers },
  { key: "folders",   label: "Dossiers",                     icon: FolderTree },
];

function DocumentsPage() {
  const { tab: searchTab } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(searchTab === "folders" ? "folders" : "templates");
  // Sidebar deep-links all point at this same route with a different ?tab= —
  // resync without a remount, same pattern as dashboard.accounting.tsx.
  useEffect(() => { if (searchTab) setTab(searchTab === "folders" ? "folders" : "templates"); }, [searchTab]);
  const [preview, setPreview] = useState<Preview | null>(null);

  return (
    <div style={{ fontFamily: sans }}>
      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}

      <PageHead
        eyebrow="Gestion administrative"
        title="Documents"
        sub="Modèles, documents générés avec vérification QR, et bibliothèque de dossiers classés."
      />

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${PAL.line}`, marginBottom: 24 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 16px", marginBottom: -1,
                border: "none", borderBottom: active ? `2px solid ${PAL.ink}` : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                fontFamily: sans, fontSize: 13.5, fontWeight: 600,
                color: active ? PAL.ink : PAL.muted,
              }}
            >
              <Icon size={15} strokeWidth={1.8} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === "templates" ? <GeneratedDocumentsTab onPreview={setPreview} /> : <FolderLibraryTab onPreview={setPreview} />}
    </div>
  );
}
