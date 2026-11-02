import type { ReactNode } from "react";

/**
 * Generalizes the sidebar's grid-template-rows 0fr/1fr collapse trick into a
 * reusable primitive (no fixed-height measurement needed, unlike a max-height
 * transition). Used by the sidebar's filière groups and the course-detail
 * Programme accordion.
 */
export function CollapsibleSection({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .3s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}
