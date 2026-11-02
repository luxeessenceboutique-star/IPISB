import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Search, Bell } from "lucide-react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { useI18n } from "@/lib/i18n";

const PAL = {
  ink:      "oklch(22% 0.025 175)",
  muted:    "oklch(48% 0.02 180)",
  cream:    "oklch(97% 0.012 90)",
  paper:    "oklch(99% 0.005 160)",
  danger:   "oklch(64% 0.18 25)",
  pale:     "oklch(94% 0.025 165)",
  primaryDeep: "oklch(38% 0.07 175)",
  line:     "oklch(88% 0.015 170)",
  lineSoft: "oklch(92% 0.012 170)",
};

export function DashboardHeader({ unread }: { unread: number }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isHome = pathname === "/dashboard" || pathname === "/dashboard/";

  return (
    <>
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px clamp(16px, 3vw, 32px)",
        background: `color-mix(in oklab, ${PAL.cream} 85%, transparent)`,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${PAL.lineSoft}`,
      }}>
        <button
          type="button"
          onClick={() => router.history.back()}
          title="Retour"
          disabled={isHome}
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 11,
            border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: isHome ? "default" : "pointer",
            display: "grid", placeItems: "center", color: PAL.ink,
            opacity: isHome ? .35 : 1, transition: "opacity .2s",
          }}
        ><ChevronLeft size={17} strokeWidth={1.8} /></button>

        <Breadcrumbs />

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 9,
            padding: "9px 11px 9px 13px", borderRadius: 11,
            border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: "pointer",
            fontSize: 13, color: PAL.muted, fontFamily: "inherit",
          }}
        >
          <Search size={15} strokeWidth={1.8} />
          <span className="hidden sm:inline">{t("dash.search")}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: PAL.pale, color: PAL.primaryDeep }}>Ctrl K</span>
        </button>

        <button
          type="button"
          onClick={() => router.navigate({ to: "/dashboard/notifications" })}
          title="Notifications"
          style={{
            position: "relative", flexShrink: 0, width: 36, height: 36, borderRadius: 11,
            border: `1px solid ${PAL.line}`, background: PAL.paper, cursor: "pointer",
            display: "grid", placeItems: "center", color: PAL.ink,
          }}
        >
          <Bell size={16} strokeWidth={1.8} />
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -4, insetInlineEnd: -4,
              minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999,
              background: PAL.danger, color: PAL.paper, fontSize: 9.5, fontWeight: 800,
              display: "grid", placeItems: "center", border: `2px solid ${PAL.cream}`,
            }}>{unread > 99 ? "99+" : unread}</span>
          )}
        </button>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
