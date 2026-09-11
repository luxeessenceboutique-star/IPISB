import { createFileRoute, redirect } from "@tanstack/react-router";

// La fonctionnalité a fusionné avec "Communication" (barre latérale → Gestion).
export const Route = createFileRoute("/dashboard/announcements")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/communication" });
  },
});
