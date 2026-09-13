import { createFileRoute, redirect } from "@tanstack/react-router";

// Pas de site public dans ce projet isolé (Administratif) — la racine
// redirige directement vers le tableau de bord (qui renvoie lui-même vers
// /auth si l'utilisateur n'est pas connecté).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
