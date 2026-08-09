import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Read-only slide renderer — students see this, never the editor.
   Deliberately reuses the exact same coordinate model as the authoring
   canvas (frontend/src/routes/dashboard.courses_.$courseId_.editor.$moduleId.tsx:
   an 800×450 design space) so what the teacher built is what the student
   sees, pixel-for-pixel, just responsively scaled via container query
   units instead of a fixed-size canvas — this needs to work on phones and
   tablets, which a Konva <Stage> wouldn't (spec §29). No drag/select/edit
   affordances anywhere in this file — that's the whole point of it being
   a separate, learner-only component (spec §19). ────────────────────── */
type ElementBase = { id: string; x: number; y: number; width: number; height: number; rotation: number };
type TextEl = ElementBase & {
  type: "text"; content: string; fontSize: number; fontFamily: string;
  bold: boolean; italic: boolean; align: "left" | "center" | "right"; color: string; backgroundColor: string | null;
};
type ImageEl = ElementBase & { type: "image"; src: string };
type SlideElement = TextEl | ImageEl;
export type ViewerSlide = { id: string; title: string; elements: SlideElement[] };

const STAGE_W = 800;
const STAGE_H = 450;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const cqw = (v: number) => `${(v / STAGE_W) * 100}cqw`;

export function SlideDeckViewer({ slides }: { slides: ViewerSlide[] }) {
  const [active, setActive] = useState(0);
  if (!slides.length) return null;
  const slide = slides[Math.min(active, slides.length - 1)];

  return (
    <div className="space-y-3">
      <div
        className="relative w-full rounded-xl border border-border bg-white shadow-sm overflow-hidden"
        style={{ aspectRatio: "16/9", containerType: "inline-size" } as React.CSSProperties}
      >
        {slide.elements.map(el => {
          const common: React.CSSProperties = {
            position: "absolute",
            left: pct(el.x, STAGE_W), top: pct(el.y, STAGE_H),
            width: pct(el.width, STAGE_W), height: pct(el.height, STAGE_H),
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          };
          if (el.type === "image") {
            return <img key={el.id} src={el.src} alt="" style={{ ...common, objectFit: "fill" }} />;
          }
          return (
            <div
              key={el.id}
              style={{
                ...common,
                fontSize: cqw(el.fontSize), fontFamily: el.fontFamily,
                fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal",
                textAlign: el.align, color: el.color, background: el.backgroundColor || "transparent",
                lineHeight: 1.25, whiteSpace: "pre-wrap", overflow: "hidden", padding: 2,
              }}
            >
              {el.content}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between">
          <button
            className="btn-c btn-c-ghost btn-c-sm"
            disabled={active <= 0}
            onClick={() => setActive(a => Math.max(0, a - 1))}
          >
            <ChevronLeft size={14} strokeWidth={1.7} />Précédent
          </button>
          <div className="flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActive(i)}
                title={s.title}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === active ? 18 : 6, background: i === active ? "var(--pal-primary, #2F6F5E)" : "var(--pal-line, #d8d8d8)" }}
              />
            ))}
          </div>
          <button
            className="btn-c btn-c-ghost btn-c-sm"
            disabled={active >= slides.length - 1}
            onClick={() => setActive(a => Math.min(slides.length - 1, a + 1))}
          >
            Suivant<ChevronRight size={14} strokeWidth={1.7} />
          </button>
        </div>
      )}
    </div>
  );
}
