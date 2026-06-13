import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <SiteNav />
      <main className="page-enter" style={{ flex: 1 }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
