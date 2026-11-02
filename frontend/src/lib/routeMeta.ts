/**
 * Single source of truth for breadcrumb labels and parent chains, keyed by
 * TanStack Router's stable route id (confirmed against routeTree.gen.ts, not
 * guessed). Consumed by Breadcrumbs.tsx and CommandPalette.tsx.
 *
 * Dynamic-detail routes (rh/employees/$employeeId, …) get a generic fallback
 * labelKey here — a page can override it at render time with
 * useBreadcrumbLabel() (see lib/breadcrumbLabel.tsx) once its data has loaded.
 */
export type RouteMetaEntry = {
  labelKey: string;
  parentId?: string;
  /** Excluded from command-palette page search (e.g. editors reached only via a list row, not searched directly). */
  hideFromPalette?: boolean;
};

export const routeMeta: Record<string, RouteMetaEntry> = {
  "/dashboard/": { labelKey: "dash.overview" },
  "/dashboard/notifications": { labelKey: "dash.notifications" },
  "/dashboard/profile": { labelKey: "dash.profile" },

  "/dashboard/accounting-tasks": { labelKey: "dash.accountingTasks" },
  "/dashboard/accounting": { labelKey: "dash.accounting" },
  "/dashboard/communication": { labelKey: "dash.communication" },
  "/dashboard/reunions-instances": { labelKey: "dash.reunionsInstances" },
  "/dashboard/documents": { labelKey: "dash.documents" },
  "/dashboard/users": { labelKey: "dash.users" },

  "/dashboard/rh": { labelKey: "dash.rh" },
  "/dashboard/rh_/employees_/$employeeId": { labelKey: "dash.employeeDetail", parentId: "/dashboard/rh" },
  "/dashboard/rh_/candidates_/$candidateId": { labelKey: "dash.candidateDetail", parentId: "/dashboard/rh" },

  // Not linked from the sidebar (reached from the overview tab, a list row or
  // a direct URL) — excluded from the palette so search doesn't surface them.
  "/dashboard/agenda-gestion": { labelKey: "dash.agendaGestion", hideFromPalette: true },
  "/dashboard/tasks": { labelKey: "dash.tasks", hideFromPalette: true },
  "/dashboard/announcements": { labelKey: "dash.announcements", hideFromPalette: true },
  "/dashboard/meetings": { labelKey: "dash.meetings", hideFromPalette: true },
  "/dashboard/purchase-requests": { labelKey: "dash.accounting.purchaseRequests", hideFromPalette: true },
};

/** A trailing `_` before `/` in a route id opts that file out of layout
 * nesting (TanStack's file-router convention) — it's not part of the URL.
 * `/dashboard/rh_/employees_/$employeeId` resolves to the pathname `/dashboard/rh/employees/$employeeId`. */
export function idToPath(routeId: string): string {
  return routeId.replace(/_\//g, "/");
}

/** Walks parentId links from a route id up to the root, closest-first. */
export function breadcrumbChain(routeId: string): RouteMetaEntry[] {
  const chain: RouteMetaEntry[] = [];
  let current: string | undefined = routeId;
  const seen = new Set<string>();
  while (current && routeMeta[current] && !seen.has(current)) {
    seen.add(current);
    chain.push(routeMeta[current]);
    current = routeMeta[current].parentId;
  }
  return chain;
}
