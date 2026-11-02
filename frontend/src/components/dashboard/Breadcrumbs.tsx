import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { breadcrumbChain, routeMeta, idToPath } from "@/lib/routeMeta";
import { useDynamicBreadcrumbLabel } from "@/lib/breadcrumbLabel";

type Crumb = { key: string; label: string; to: string | null };

/** A route id is only safely clickable here if its resolved path has no
 * `$param` segment left — dynamic-parent hrefs would need param substitution
 * we don't attempt (see routeMeta.ts) — so those render as plain inert text
 * instead of a broken Link. */
function hrefFor(routeId: string): string | null {
  const path = idToPath(routeId);
  return path.includes("$") ? null : path.replace(/\/$/, "") || "/dashboard";
}

export function Breadcrumbs() {
  const { t } = useI18n();
  const matches = useMatches();
  const dynamicLabel = useDynamicBreadcrumbLabel();

  const leafMatch = [...matches].reverse().find((m) => routeMeta[m.routeId]);
  if (!leafMatch) return null;

  const chain = breadcrumbChain(leafMatch.routeId).reverse(); // root-first
  const crumbs: Crumb[] = chain.map((entry, i) => {
    const isLeaf = i === chain.length - 1;
    const routeId = Object.keys(routeMeta).find((id) => routeMeta[id] === entry)!;
    return {
      key: routeId,
      label: (isLeaf && dynamicLabel) ? dynamicLabel : t(entry.labelKey),
      to: hrefFor(routeId),
    };
  });

  // Collapse to at most 3 crumbs: first, an ellipsis pointing at the
  // second-to-last, then the last.
  const display: (Crumb | { key: string; ellipsis: true; to: string | null })[] =
    crumbs.length > 2
      ? [crumbs[0], { key: "__ellipsis", ellipsis: true, to: crumbs[crumbs.length - 2].to }, crumbs[crumbs.length - 1]]
      : crumbs;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: "1 1 auto", overflow: "hidden", fontSize: 13.5, fontWeight: 700 }}>
      {display.map((c, i) => (
        <span key={c.key} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flexShrink: i === display.length - 1 ? 0 : 1 }}>
          {i > 0 && <ChevronRight size={14} style={{ flexShrink: 0, color: "var(--pal-soft)" }} />}
          {"ellipsis" in c ? (
            c.to ? (
              <Link to={c.to} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "6px 8px", borderRadius: 9, color: "var(--pal-muted)", textDecoration: "none" }}>…</Link>
            ) : (
              <span style={{ padding: "6px 8px", color: "var(--pal-muted)" }}>…</span>
            )
          ) : c.to ? (
            <Link to={c.to} style={{
              border: "none", background: "transparent", cursor: "pointer",
              padding: "6px 10px", borderRadius: 9, color: "var(--pal-ink)",
              whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 240, textDecoration: "none",
            }}>{c.label}</Link>
          ) : (
            <span style={{
              padding: "6px 10px", color: "var(--pal-ink)", whiteSpace: "nowrap",
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240,
            }}>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
