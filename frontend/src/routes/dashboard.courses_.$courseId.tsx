import { createFileRoute, redirect, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { PageHead, EmptyHint } from "@/components/dashboard/ui";
import { SlideDeckViewer, type ViewerSlide } from "@/components/dashboard/SlideDeckViewer";

export const Route = createFileRoute("/dashboard/courses_/$courseId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: CourseReaderPage,
});

/* ── Types (kept local — this page only needs a read-only slice) ───── */
type CourseInfo = { id: string; title: string; code: string | null; semester: string | null };
type LessonImage = { id: string; caption: string | null; url: string };
type Lesson = { id: string; content: string | null; images: LessonImage[]; slides?: ViewerSlide[] | null };
type ModuleT = {
  id: string; order_num: number; title: string; objectives: string | null;
  hours_theory: number; hours_practice: number; status: "draft" | "published"; lessons: Lesson[];
};

/* ── Markdown → HTML, with [[image:ID]] tokens spliced in and the
   ```diagram DSL rendered as cards instead of raw text — same content
   the PDF renderer produces, just for a browser instead of a page. ── */
const IMAGE_TOKEN_RE = /\[\[image:([a-f0-9-]+)\]\]/g;
const DIAGRAM_BLOCK_RE = /<pre><code class="language-diagram">([\s\S]*?)<\/code><\/pre>/g;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderDiagram(rawEscaped: string): string {
  const text = rawEscaped.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  let title = "";
  const categories: { name: string; items: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^title:/i.test(line)) title = line.split(":").slice(1).join(":").trim();
    else if (/^cat[eé]gorie:/i.test(line)) categories.push({ name: line.split(":").slice(1).join(":").trim(), items: [] });
    else if (line.startsWith("-") && categories.length) categories[categories.length - 1].items.push(line.slice(1).trim());
  }
  if (!categories.length) return `<pre>${rawEscaped}</pre>`;
  const cards = categories.map(c => `
    <div class="reader-diagram-card">
      <strong>${escapeHtml(c.name)}</strong>
      <ul>${c.items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </div>`).join("");
  return `<div class="reader-diagram">${title ? `<p class="reader-diagram-title">${escapeHtml(title)}</p>` : ""}<div class="reader-diagram-grid">${cards}</div></div>`;
}

function renderLessonHtml(content: string, images: LessonImage[]): string {
  const byId = new Map(images.map(img => [img.id, img]));
  const parts = content.split(IMAGE_TOKEN_RE);
  let html = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const img = byId.get(parts[i]);
      if (img) {
        html += `<figure class="reader-image"><img src="${img.url}" alt="${escapeHtml(img.caption || "")}" />${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : ""}</figure>`;
      }
      continue;
    }
    if (!parts[i].trim()) continue;
    let chunk = marked.parse(parts[i], { async: false }) as string;
    chunk = chunk.replace(DIAGRAM_BLOCK_RE, (_m, inner) => renderDiagram(inner));
    html += chunk;
  }
  return html;
}

function CourseReaderPage() {
  const { courseId } = useParams({ from: "/dashboard/courses_/$courseId" });
  const { lang } = useI18n();
  const { user } = useAuth();

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [modules, setModules] = useState<ModuleT[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setForbidden(false);
      try {
        const [courses, mods] = await Promise.all([
          api.get("/api/courses") as Promise<CourseInfo[]>,
          api.get(`/api/courses/${courseId}/modules`) as Promise<ModuleT[]>,
        ]);
        if (cancelled) return;
        setCourse(courses.find(c => c.id === courseId) ?? null);
        setModules(mods);
        // "Preview as student" from the editor links here with ?chapter=<moduleId>
        // so the professor lands directly on the chapter they were editing.
        const requested = new URLSearchParams(window.location.search).get("chapter");
        setActiveId((requested && mods.some(m => m.id === requested)) ? requested : (mods[0]?.id ?? null));
      } catch (e: any) {
        if (cancelled) return;
        if (String(e.message || "").includes("403")) setForbidden(true);
        else toast.error(e.message || "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, courseId]);

  const activeIndex = modules.findIndex(m => m.id === activeId);
  const active = activeIndex >= 0 ? modules[activeIndex] : null;
  // A chapter authored in the visual editor carries its own slides — that's
  // what students see. Chapters never touched in the editor still fall back
  // to the plain generated markdown, so nothing regresses for older content.
  const activeSlides = active?.lessons?.[0]?.slides;
  const hasSlides = !!activeSlides && activeSlides.length > 0;
  const activeHtml = useMemo(() => {
    if (hasSlides) return "";
    const content = active?.lessons?.[0]?.content;
    if (!content) return "";
    return renderLessonHtml(content, active!.lessons[0].images || []);
  }, [active, hasSlides]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/dashboard/courses" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />{lang === "fr" ? "Retour aux cours" : "Back to courses"}
        </Link>
      </div>

      <PageHead
        eyebrow={course?.code || ""}
        title={course?.title || (loading ? "…" : (lang === "fr" ? "Cours introuvable" : "Course not found"))}
        sub={course?.semester || ""}
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : forbidden ? (
        <div className="dash-card">
          <EmptyHint icon={<BookOpen size={28} strokeWidth={1.7} />} text={lang === "fr" ? "Vous n'avez pas accès à ce cours." : "You don't have access to this course."} />
        </div>
      ) : modules.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<BookOpen size={28} strokeWidth={1.7} />}
            text={lang === "fr" ? "Aucun chapitre publié pour ce cours pour le moment." : "No published chapter for this course yet."}
          />
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "260px minmax(0,1fr)" }}>
          {/* Chapter list */}
          <nav className="dash-card p-2 space-y-1 self-start">
            {modules.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className="w-full text-left rounded-lg px-3 py-2 text-sm transition-colors"
                style={{
                  background: m.id === activeId ? "var(--pal-pale, oklch(94% 0.025 165))" : "transparent",
                  color: m.id === activeId ? "var(--pal-ink, oklch(22% 0.025 175))" : "var(--pal-muted, oklch(48% 0.02 180))",
                  fontWeight: m.id === activeId ? 700 : 500,
                }}
              >
                <span className="tabular-nums mr-2 opacity-60">{String(i + 1).padStart(2, "0")}</span>
                {m.title}
              </button>
            ))}
          </nav>

          {/* Reading pane */}
          <div className="dash-card p-6 min-w-0">
            {active && (
              <>
                <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {lang === "fr" ? "Chapitre" : "Chapter"} {String(activeIndex + 1).padStart(2, "0")}
                </p>
                <h2 className="h-serif mb-1" style={{ fontSize: 26 }}>{active.title}</h2>
                {active.objectives && <p className="text-sm text-muted-foreground italic mb-5">{active.objectives}</p>}
                {hasSlides ? (
                  <SlideDeckViewer slides={activeSlides!} />
                ) : activeHtml ? (
                  <div className="reader-content" dangerouslySetInnerHTML={{ __html: activeHtml }} />
                ) : (
                  <p className="text-sm text-muted-foreground">{lang === "fr" ? "Contenu indisponible." : "Content unavailable."}</p>
                )}

                <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
                  <button
                    className="btn-c btn-c-ghost btn-c-sm"
                    disabled={activeIndex <= 0}
                    onClick={() => setActiveId(modules[activeIndex - 1].id)}
                  >
                    <ChevronLeft size={14} strokeWidth={1.7} />{lang === "fr" ? "Précédent" : "Previous"}
                  </button>
                  <button
                    className="btn-c btn-c-primary btn-c-sm"
                    disabled={activeIndex >= modules.length - 1}
                    onClick={() => setActiveId(modules[activeIndex + 1].id)}
                  >
                    {lang === "fr" ? "Suivant" : "Next"}<ArrowRight size={14} strokeWidth={1.7} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .reader-content { font-size: 14.5px; line-height: 1.7; color: var(--pal-ink, oklch(22% 0.025 175)); }
        .reader-content h2, .reader-content h3 { font-family: "Cormorant Garamond", serif; margin: 1.3em 0 0.4em; color: var(--pal-ink, oklch(22% 0.025 175)); }
        .reader-content h2 { font-size: 22px; } .reader-content h3 { font-size: 18px; }
        .reader-content p { margin: 0 0 1em; }
        .reader-content ul, .reader-content ol { margin: 0 0 1em; padding-left: 1.3em; }
        .reader-content li { margin-bottom: 0.35em; }
        .reader-content strong { font-weight: 700; }
        .reader-content table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13.5px; }
        .reader-content th, .reader-content td { border: 1px solid var(--pal-line-soft, oklch(88% 0.015 170)); padding: 6px 10px; text-align: left; }
        .reader-content th { background: var(--pal-cream, oklch(97% 0.012 90)); font-weight: 700; }
        .reader-image { margin: 1.2em 0; }
        .reader-image img { max-width: 100%; border-radius: 10px; border: 1px solid var(--pal-line-soft, oklch(88% 0.015 170)); }
        .reader-image figcaption { font-size: 12px; color: var(--pal-muted, oklch(48% 0.02 180)); margin-top: 6px; font-style: italic; }
        .reader-diagram { margin: 1.2em 0; }
        .reader-diagram-title { font-size: 12px; font-weight: 700; color: var(--pal-primary, oklch(48% 0.085 175)); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
        .reader-diagram-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
        .reader-diagram-card { border: 1px solid var(--pal-line-soft, oklch(88% 0.015 170)); background: var(--pal-cream, oklch(97% 0.012 90)); border-radius: 10px; padding: 12px; font-size: 13px; }
        .reader-diagram-card ul { margin: 6px 0 0; padding-left: 1.1em; }
      `}</style>
    </div>
  );
}
