import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, LogOut, X, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { DashAvatar } from "@/components/dashboard/ui";
import { CollapsibleSection } from "@/components/dashboard/CollapsibleSection";

export type NavLeaf = {
  type: "leaf"; key: string; to: string; icon: LucideIcon;
  exact?: boolean; badge?: boolean; label?: string; search?: Record<string, string>;
};
export type NavGroup = {
  type: "group"; key: string; icon: LucideIcon; homeTo?: string; exact?: boolean; label?: string; children: NavEntry[];
};
export type NavEntry = NavLeaf | NavGroup;

export function leaf(partial: Omit<NavLeaf, "type">): NavLeaf {
  return { type: "leaf", ...partial };
}
export function group(partial: Omit<NavGroup, "type">): NavGroup {
  return { type: "group", ...partial };
}

function entryMatchesPath(entry: NavEntry, pathname: string): boolean {
  return entry.type === "leaf"
    ? pathname.startsWith(entry.to)
    : entry.children.some(c => entryMatchesPath(c, pathname));
}

// Sub-items (Gestion → RH, Comptabilité → onglets…) get a tinted rounded tile
// holding their own icon; the tint cycles through the brand colors by position.
const TILE_COLORS = ["var(--pal-good)", "var(--pal-mid)", "var(--pal-accent)", "var(--pal-primary)"];
function SubTile({ icon: Icon, index, size = 26 }: { icon: LucideIcon; index: number; size?: number }) {
  const color = TILE_COLORS[index % TILE_COLORS.length];
  return (
    <span style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
      background: `color-mix(in oklch, ${color} 20%, transparent)`, color,
    }}>
      <Icon size={size - 12} strokeWidth={1.9} />
    </span>
  );
}

// Sub-item label: wraps instead of truncating (long French labels such as
// « Recettes — Formation continue » must stay readable in the 248px rail).
const subLabelStyle: CSSProperties = { minWidth: 0, lineHeight: 1.25, overflowWrap: "anywhere" };

export function DashboardSidebar({
  entries, unread, fullName, roleLabel, spaceLabel, onLogout,
  t, width = "auto", height = "auto", onClose,
  collapsed = false, onToggleCollapse,
}: {
  entries: NavEntry[];
  unread: number;
  fullName: string;
  roleLabel: string;
  spaceLabel: string;
  onLogout: () => void;
  t: (key: string) => string;
  width?: number | "auto";
  height?: number | "100%" | "auto";
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Rendu récursif : un groupe (ex. Comptabilité) peut lui-même contenir des
  // groupes — chaque niveau d'imbrication ajoute son propre repli/dépli et
  // un retrait supplémentaire.
  function renderNavEntry(it: NavEntry, depth: number, index: number): ReactNode {
    const entryStyle: CSSProperties = { animation: "rise .5s cubic-bezier(.22,1,.36,1) both", animationDelay: `${index * 40}ms` };
    // Each nesting level pushes its rows 14px further in (Gestion → Comptabilité → onglets);
    // third-level rows are slightly denser so an expanded Comptabilité still fits the rail.
    const indent = 26 + (depth - 1) * 14;
    const compact = depth > 1;
    const rowStyle: CSSProperties = compact ? { paddingBlock: 6, fontSize: 13 } : {};

    if (it.type === "leaf") {
      const isActive = it.exact ? pathname === it.to : pathname.startsWith(it.to);
      const I = it.icon;
      const label = it.label ?? t(it.key);

      if (depth > 0) {
        return (
          <Link key={it.key} to={it.to as "/dashboard"} search={it.search} title={label}
            className={isActive ? "sb-sublink is-active" : "sb-sublink"}
            style={{ textDecoration: "none", paddingInlineStart: collapsed ? 12 : indent, justifyContent: collapsed ? "center" : "flex-start", ...rowStyle, ...entryStyle }}>
            <SubTile icon={I} index={index} size={compact ? 22 : 26} />
            {!collapsed && <span style={subLabelStyle}>{label}</span>}
          </Link>
        );
      }

      return (
        <Link key={it.key} to={it.to as "/dashboard"} search={it.search} title={label}
          className={isActive ? "side-link is-active" : "side-link"}
          style={{ textDecoration: "none", justifyContent: collapsed ? "center" : "flex-start", ...entryStyle }}>
          <I size={19} strokeWidth={1.8} />
          {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          {!collapsed && it.badge && unread > 0 && (
            <span style={{ marginInlineStart: "auto", fontSize: 10.5, fontWeight: 800, color: "var(--pal-paper)", background: "var(--pal-danger)", padding: "3px 8px", borderRadius: 999 }}>{unread}</span>
          )}
        </Link>
      );
    }

    const GI = it.icon;
    const label = it.label ?? t(it.key);
    const isGroupActive = it.children.some(c => entryMatchesPath(c, pathname));
    const isCollapsed = collapsedGroups.has(it.key);
    // A group nested inside another group (Comptabilité inside Gestion) renders
    // like a sub-item with a chevron, not like a second top-level section.
    const nested = depth > 0;
    return (
      <div key={it.key} style={entryStyle}>
        <button
          type="button"
          onClick={() => toggleGroup(it.key)}
          title={label}
          className={nested ? (isGroupActive ? "sb-sublink is-active" : "sb-sublink") : (isGroupActive ? "side-link is-active" : "side-link")}
          style={{
            textDecoration: "none", width: "100%", border: 0, background: isGroupActive ? undefined : "transparent",
            cursor: "pointer", textAlign: "start", justifyContent: collapsed ? "center" : "flex-start",
            ...(nested ? { paddingInlineStart: collapsed ? 12 : indent, ...rowStyle } : {}),
          }}
        >
          {nested ? <SubTile icon={GI} index={index} size={compact ? 22 : 26} /> : <GI size={19} strokeWidth={1.8} />}
          {!collapsed && <span style={nested ? subLabelStyle : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
          {!collapsed && (
            <ChevronDown size={14} strokeWidth={2}
              style={{ marginInlineStart: "auto", transition: "transform .3s ease", transform: isCollapsed ? "rotate(-90deg)" : "none", opacity: .7, flexShrink: 0 }} />
          )}
        </button>
        {!collapsed && (
          <CollapsibleSection open={!isCollapsed}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
              {it.children.map((c, i) => renderNavEntry(c, depth + 1, i))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  return (
    <aside style={{
      position: "relative", overflow: "hidden",
      background: "var(--pal-ink)", color: "var(--pal-soft)",
      padding: collapsed ? "20px 10px 16px" : "20px 14px 16px",
      display: "flex", flexDirection: "column", gap: 18,
      width, height, minHeight: 0,
      transition: "width .5s cubic-bezier(.2,.8,.2,1), padding .3s",
    }}>
      {/* decorative glow blob — purely cosmetic, matches brand header elsewhere */}
      <div aria-hidden style={{
        position: "absolute", insetInlineStart: -120, top: -120, width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, color-mix(in oklch, var(--pal-mid) 22%, transparent), transparent 70%)",
        pointerEvents: "none", animation: "glow-pulse 6s ease-in-out infinite",
      }} />

      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "2px 4px" }}>
        <Link to="/dashboard" style={{ textDecoration: "none", display: "flex", flexShrink: 0 }}>
          <Wordmark size={34} dark showText={!collapsed} />
        </Link>
        {onToggleCollapse && !onClose && (
          <button onClick={onToggleCollapse} title={collapsed ? t("dash.expand") : t("dash.collapse")}
            style={{
              marginInlineStart: collapsed ? 0 : "auto", flexShrink: 0, width: 28, height: 28, borderRadius: 10,
              border: "1px solid oklch(100% 0 0 / .1)", background: "var(--pal-ink2)", color: "var(--pal-soft)",
              cursor: "pointer", display: "grid", placeItems: "center",
              transition: "transform .5s cubic-bezier(.2,.8,.2,1)", transform: collapsed ? "rotate(180deg)" : "none",
            }}>
            <ChevronLeft size={14} strokeWidth={2.2} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{
            marginInlineStart: "auto", background: "none", border: 0, cursor: "pointer", color: "var(--pal-soft)", lineHeight: 1, display: "flex", padding: 4,
          }}><X size={18} /></button>
        )}
      </div>

      {!collapsed && (
        <svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden style={{ position: "relative", width: "100%", height: 20 }}>
          <path d="M0 18 H110 L120 18 L128 6 L136 27 L145 2 L154 24 L162 18 H300" fill="none"
            stroke="var(--pal-mid)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="300" style={{ animation: "sb-ecg 5s cubic-bezier(.6,0,.3,1) infinite" }} />
        </svg>
      )}

      {!collapsed && (
        <span className="eyebrow" style={{ position: "relative", padding: "0 10px", fontSize: 9.5, color: "var(--pal-mid)" }}>{spaceLabel}</span>
      )}

      <nav className="sb-nav-scroll" style={{ position: "relative", display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0 }}>
        {entries.map((it, i) => renderNavEntry(it, 0, i))}
      </nav>

      {/* user card */}
      <div style={{ position: "relative", padding: 12, borderRadius: 18, background: "var(--pal-ink2)", border: "1px solid oklch(100% 0 0 / .06)", display: "flex", flexDirection: "column", gap: 10 }}>
        <Link to="/dashboard/profile" title={fullName} style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 11, justifyContent: collapsed ? "center" : "flex-start", textDecoration: "none" }}>
          <span style={{ position: "relative", flexShrink: 0 }}>
            <DashAvatar name={fullName} size={collapsed ? 34 : 38} tone="accent" />
            <span style={{ position: "absolute", insetInlineEnd: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: "var(--pal-good)", border: "2.5px solid var(--pal-ink2)" }} />
          </span>
          {!collapsed && (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--pal-paper)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {fullName}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--pal-mid)" }}>{roleLabel}</span>
            </div>
          )}
        </Link>
        <button onClick={onLogout} title={t("dash.logout")} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, borderRadius: 12,
          border: "1px solid oklch(100% 0 0 / .1)", background: "transparent", color: "var(--pal-soft)",
          cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700,
        }}>
          <LogOut size={15} strokeWidth={1.8} />
          {!collapsed && t("dash.logout")}
        </button>
      </div>
    </aside>
  );
}
