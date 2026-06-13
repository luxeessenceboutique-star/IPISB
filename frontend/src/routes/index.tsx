import { createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "@/components/PageLayout";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { ProgramsTeaser } from "@/components/landing/ProgramsTeaser";
import { AboutTeaser } from "@/components/landing/AboutTeaser";
import { TestimonialsTeaser } from "@/components/landing/TestimonialsTeaser";
import { NewsTeaser } from "@/components/landing/NewsTeaser";
import { Campuses } from "@/components/landing/Campuses";
import { CtaBand } from "@/components/landing/CtaBand";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <PageLayout>
      <Hero />
      <Features />
      <ProgramsTeaser />
      <AboutTeaser />
      <TestimonialsTeaser />
      <Campuses />
      <NewsTeaser />
      <CtaBand />
    </PageLayout>
  );
}
