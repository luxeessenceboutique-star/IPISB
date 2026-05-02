import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Programs } from "@/components/landing/Programs";
import { About } from "@/components/landing/About";
import { CtaBand } from "@/components/landing/CtaBand";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Features />
        <Programs />
        <About />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
