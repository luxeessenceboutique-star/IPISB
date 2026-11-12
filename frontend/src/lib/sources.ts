/** Source d'une réponse du Copilote : page (et onglet) de la plateforme où
 *  retrouver l'information. */
export type CopilotSource = { path: string; tab?: string | null; crumbs: string[]; label: string };

export function sourceHref(s: CopilotSource, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...(s.tab ? { tab: s.tab } : {}), ...extra }).toString();
  return q ? `${s.path}?${q}` : s.path;
}
