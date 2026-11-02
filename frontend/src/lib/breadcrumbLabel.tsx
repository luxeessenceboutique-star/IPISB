import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Dynamic-detail routes (course/$courseId, students_/$studentId, …) can't get
 * their breadcrumb label from a static registry — it depends on data loaded
 * client-side (a course title, a student's name). Rather than prop-drilling
 * that title down from the route to the header, the detail page just calls
 * useBreadcrumbLabel(title) once it has it; Breadcrumbs reads it back via
 * context. Falls back to routeMeta's static label when no page has set one
 * (or after navigating away).
 */
const BreadcrumbLabelContext = createContext<{
  label: string | null;
  setLabel: (label: string | null) => void;
} | null>(null);

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return (
    <BreadcrumbLabelContext.Provider value={{ label, setLabel }}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

export function useDynamicBreadcrumbLabel() {
  const ctx = useContext(BreadcrumbLabelContext);
  if (!ctx) throw new Error("useDynamicBreadcrumbLabel must be used within BreadcrumbLabelProvider");
  return ctx.label;
}

/** Call from a detail page once its real title is known (e.g. a fetched course/student name). */
export function useBreadcrumbLabel(label: string | null | undefined) {
  const ctx = useContext(BreadcrumbLabelContext);
  if (!ctx) throw new Error("useBreadcrumbLabel must be used within BreadcrumbLabelProvider");
  const { setLabel } = ctx;
  useEffect(() => {
    setLabel(label ?? null);
    return () => setLabel(null);
  }, [label, setLabel]);
}
