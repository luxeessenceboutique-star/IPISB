import { createFileRoute, redirect, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text as KonvaText, Image as KonvaImage, Transformer } from "react-konva";
import Konva from "konva";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Copy, Type, Image as ImageIcon, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Save, Loader2, Check, Eye,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/courses_/$courseId_/editor/$moduleId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: SlideEditorPage,
});

/* ─── Slide/element model — this IS the source of truth, saved as
   course_lessons.slides (jsonb). Nothing here is ever derived from a
   PDF/PPTX; export (later) reads FROM this, never the other way. ────── */
type ElementBase = { id: string; x: number; y: number; width: number; height: number; rotation: number };
type TextEl = ElementBase & {
  type: "text"; content: string; fontSize: number; fontFamily: string;
  bold: boolean; italic: boolean; align: "left" | "center" | "right"; color: string; backgroundColor: string | null;
};
type ImageEl = ElementBase & { type: "image"; src: string };
type SlideElement = TextEl | ImageEl;
type Slide = { id: string; title: string; elements: SlideElement[] };

const STAGE_W = 800;
const STAGE_H = 450; // 16:9

function uid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newTextElement(): TextEl {
  return {
    id: uid(), type: "text", x: 80, y: 180, width: 400, height: 80, rotation: 0,
    content: "Nouveau texte", fontSize: 24, fontFamily: "Manrope, sans-serif",
    bold: false, italic: false, align: "left", color: "#1C2331", backgroundColor: null,
  };
}
function newSlide(title: string): Slide {
  return { id: uid(), title, elements: [] };
}

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/* ─── Editable text overlay — Konva can't edit text in-canvas, the
   documented pattern is to swap in a real <textarea> positioned on top
   while editing, then commit back to state on blur. ────────────────── */
function TextEditOverlay({ el, scale, onCommit, onCancel }: {
  el: TextEl; scale: number; onCommit: (content: string) => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <textarea
      ref={ref}
      defaultValue={el.content}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
      style={{
        position: "absolute",
        left: el.x * scale, top: el.y * scale, width: el.width * scale, height: el.height * scale,
        fontSize: el.fontSize * scale, fontFamily: el.fontFamily, fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal", textAlign: el.align, color: el.color,
        background: el.backgroundColor || "transparent", border: "2px solid var(--pal-primary, #2F6F5E)",
        outline: "none", resize: "none", padding: 2, lineHeight: 1.2, zIndex: 20,
      }}
    />
  );
}

function SlideEditorPage() {
  const { courseId, moduleId } = useParams({ from: "/dashboard/courses_/$courseId_/editor/$moduleId" });
  const navigate = useNavigate();

  const [courseTitle, setCourseTitle] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [past, setPast] = useState<Slide[][]>([]);
  const [future, setFuture] = useState<Slide[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [, forceImgLoad] = useState(0);

  /* ── Load ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [courses, modules] = await Promise.all([
          api.get("/api/courses") as Promise<{ id: string; title: string }[]>,
          api.get(`/api/courses/${courseId}/modules`) as Promise<any[]>,
        ]);
        setCourseTitle(courses.find(c => c.id === courseId)?.title ?? "");
        const mod = modules.find(m => m.id === moduleId);
        if (!mod) { toast.error("Chapitre introuvable"); navigate({ to: "/dashboard/courses" }); return; }
        setModuleTitle(mod.title);
        const lesson = mod.lessons?.[0];
        setLessonId(lesson?.id ?? null);
        const loadedSlides: Slide[] = (lesson?.slides && lesson.slides.length > 0) ? lesson.slides : [newSlide("Diapositive 1")];
        setSlides(loadedSlides);
        setActiveSlideId(loadedSlides[0].id);
      } catch (e: any) {
        toast.error(e.message || "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, moduleId]);

  /* ── Responsive stage scale (design space stays STAGE_W×STAGE_H always) ── */
  useEffect(() => {
    function resize() {
      if (!stageWrapRef.current) return;
      const w = stageWrapRef.current.clientWidth;
      setScale(Math.min(1, w / STAGE_W));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const activeSlide = slides.find(s => s.id === activeSlideId) ?? null;
  const selectedEl = activeSlide?.elements.find(e => e.id === selectedId) ?? null;

  /* ── History-tracked mutation helper — every real change goes through
     this so undo/redo always has a consistent snapshot to fall back to.
     Deliberately NOT using setSlides(prev => { ...side effects...; return next })
     — React 18 StrictMode double-invokes functional state updaters in dev to
     catch impurities, and an updater that also calls setPast/setFuture/setDirty
     as a side effect gets those side effects fired twice per commit, which
     produced real, hard-to-repro slide/element loss under rapid edits. Reading
     "current" slides from a ref kept in sync via a plain (non-updater) effect
     and issuing one plain setState per piece of state keeps every call pure. ── */
  const slidesRef = useRef<Slide[]>(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  const commit = useCallback((updater: (prev: Slide[]) => Slide[]) => {
    const prev = slidesRef.current;
    const next = updater(prev);
    setPast(p => [...p, prev]);
    setFuture([]);
    setDirty(true);
    setSlides(next);
    slidesRef.current = next;
  }, []);

  function undo() {
    if (!past.length) return;
    setFuture(f => [slides, ...f]);
    setSlides(past[past.length - 1]);
    setPast(p => p.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    if (!future.length) return;
    setPast(p => [...p, slides]);
    setSlides(future[0]);
    setFuture(f => f.slice(1));
    setDirty(true);
  }

  function updateElement(elId: string, patch: Partial<SlideElement>) {
    commit(prev => prev.map(s => s.id !== activeSlideId ? s : {
      ...s, elements: s.elements.map(e => e.id === elId ? ({ ...e, ...patch } as SlideElement) : e),
    }));
  }
  function addElement(el: SlideElement) {
    commit(prev => prev.map(s => s.id !== activeSlideId ? s : { ...s, elements: [...s.elements, el] }));
    setSelectedId(el.id);
  }
  function deleteSelected() {
    if (!selectedId) return;
    commit(prev => prev.map(s => s.id !== activeSlideId ? s : { ...s, elements: s.elements.filter(e => e.id !== selectedId) }));
    setSelectedId(null);
  }

  function addSlide() {
    const s = newSlide(`Diapositive ${slides.length + 1}`);
    commit(prev => [...prev, s]);
    setActiveSlideId(s.id);
    setSelectedId(null);
  }
  function duplicateSlide(id: string) {
    const src = slides.find(s => s.id === id);
    if (!src) return;
    const copy: Slide = { id: uid(), title: `${src.title} (copie)`, elements: src.elements.map(e => ({ ...e, id: uid() })) };
    const idx = slides.findIndex(s => s.id === id);
    commit(prev => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
    setActiveSlideId(copy.id);
  }
  function deleteSlide(id: string) {
    if (slides.length <= 1) { toast.error("Le cours doit avoir au moins une diapositive"); return; }
    if (!window.confirm("Supprimer cette diapositive ?")) return;
    commit(prev => prev.filter(s => s.id !== id));
    if (activeSlideId === id) setActiveSlideId(slides.find(s => s.id !== id)?.id ?? null);
  }
  function reorderSlide(fromId: string, toId: string) {
    if (fromId === toId) return;
    commit(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(s => s.id === fromId);
      const toIdx = arr.findIndex(s => s.id === toId);
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  }

  async function handleImageUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !lessonId) return;
    const file = fileList[0];
    if (fileRef.current) fileRef.current.value = "";
    setUploading(true);
    try {
      const headers = await authHeader();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/images`, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(await res.text());
      const img = await res.json();
      addElement({ id: uid(), type: "image", x: 200, y: 120, width: 320, height: 220, rotation: 0, src: img.url });
    } catch (e: any) {
      toast.error(e.message || "Échec de l'ajout de l'image");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!lessonId) return;
    setSaving(true);
    try {
      await api.patch(`/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, { slides });
      setDirty(false);
      toast.success("Enregistré");
    } catch (e: any) {
      toast.error(e.message || "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  // Opens the SAME course reader students use — not a separate mock preview
  // (spec §20/§31). Saves first if there are pending edits, otherwise the
  // preview would show the last-saved deck, not what's on screen.
  async function previewAsStudent() {
    if (dirty) await save();
    window.open(`/dashboard/courses/${courseId}?chapter=${moduleId}`, "_blank");
  }

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); deleteSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, past, future, slides, lessonId]);

  /* ── Attach transformer to the selected node ── */
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const node = selectedId ? stageRef.current.findOne(`#${selectedId}`) : null;
    transformerRef.current.nodes(node ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, activeSlideId, slides]);

  /* ── Preload images referenced on this slide ── */
  useEffect(() => {
    (activeSlide?.elements || []).forEach(el => {
      if (el.type !== "image" || imageCacheRef.current.has(el.src)) return;
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = el.src;
      img.onload = () => { imageCacheRef.current.set(el.src, img); forceImgLoad(n => n + 1); };
    });
  }, [activeSlide]);

  function onTransformEnd(elId: string, node: Konva.Node) {
    const scaleX = node.scaleX(), scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const current = activeSlide?.elements.find(e => e.id === elId);
    if (!current) return;
    updateElement(elId, {
      x: node.x(), y: node.y(), rotation: node.rotation(),
      width: Math.max(20, current.width * scaleX), height: Math.max(20, current.height * scaleY),
    });
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate({ to: "/dashboard/courses" })} className="rounded-full p-1.5 hover:bg-muted transition-colors shrink-0" title="Retour">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{courseTitle}</p>
            <p className="text-sm font-semibold truncate">{moduleTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={undo} disabled={!past.length} className="btn-c btn-c-ghost btn-c-sm" title="Annuler (Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} disabled={!future.length} className="btn-c btn-c-ghost btn-c-sm" title="Rétablir (Ctrl+Y)"><Redo2 className="h-4 w-4" /></button>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" />Enregistrement…</> : dirty ? "Modifications non enregistrées" : <><Check className="h-3 w-3 text-green-600" />Enregistré</>}
          </span>
          <button onClick={save} disabled={saving || !dirty} className="btn-c btn-c-primary btn-c-sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />Enregistrer
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={previewAsStudent} disabled={saving} className="btn-c btn-c-soft btn-c-sm" title="Ouvre la page que verrait un étudiant">
            <Eye className="h-3.5 w-3.5 mr-1.5" />Aperçu élève
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Slide list */}
        <div className="w-48 border-r border-border overflow-y-auto p-2 space-y-2 shrink-0 bg-muted/20">
          {slides.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={e => e.dataTransfer.setData("text/slide-id", s.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); reorderSlide(e.dataTransfer.getData("text/slide-id"), s.id); }}
              onClick={() => { setActiveSlideId(s.id); setSelectedId(null); }}
              className="rounded-lg border-2 p-2 cursor-pointer transition-colors bg-card"
              style={{ borderColor: s.id === activeSlideId ? "var(--pal-primary, #2F6F5E)" : "var(--pal-line-soft, #e2e2e2)" }}
            >
              <div className="aspect-video rounded bg-white border border-border/60 flex items-center justify-center text-[10px] text-muted-foreground overflow-hidden relative">
                {s.elements.length === 0 && <span>Vide</span>}
                {s.elements.slice(0, 6).map(el => (
                  <div key={el.id} style={{
                    position: "absolute", left: `${(el.x / STAGE_W) * 100}%`, top: `${(el.y / STAGE_H) * 100}%`,
                    width: `${(el.width / STAGE_W) * 100}%`, height: `${(el.height / STAGE_H) * 100}%`,
                    background: el.type === "image" ? "#c9c9c9" : "transparent",
                    borderBottom: el.type === "text" ? "2px solid #999" : undefined,
                  }} />
                ))}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] font-medium truncate flex-1">{i + 1}. {s.title}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={e => { e.stopPropagation(); duplicateSlide(s.id); }} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted" title="Dupliquer"><Copy className="h-3 w-3" /></button>
                  <button onClick={e => { e.stopPropagation(); deleteSlide(s.id); }} className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="w-full rounded-lg border-2 border-dashed border-border py-2.5 text-xs font-semibold text-muted-foreground hover:border-primary/60 hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />Ajouter une diapositive
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
            <button onClick={() => addElement(newTextElement())} className="btn-c btn-c-soft btn-c-sm"><Type className="h-3.5 w-3.5 mr-1.5" />Texte</button>
            <label className="cursor-pointer">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => handleImageUpload(e.target.files)} />
              <span className="btn-c btn-c-soft btn-c-sm inline-flex items-center">
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}Image
              </span>
            </label>
            {selectedId && (
              <button onClick={deleteSelected} className="btn-c btn-c-ghost btn-c-sm text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer l'élément</button>
            )}
          </div>

          <div ref={stageWrapRef} className="flex-1 overflow-auto flex items-start justify-center p-6 bg-muted/30 relative">
            <div style={{ position: "relative", width: STAGE_W * scale, height: STAGE_H * scale }}>
              <Stage
                ref={stageRef}
                width={STAGE_W * scale}
                height={STAGE_H * scale}
                scale={{ x: scale, y: scale }}
                onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
                style={{ background: "white", boxShadow: "0 2px 16px rgba(0,0,0,0.12)" }}
              >
                <Layer>
                  <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="#ffffff" />
                  {activeSlide?.elements.map(el => {
                    if (el.type === "text") {
                      return (
                        <KonvaText
                          key={el.id} id={el.id}
                          x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}
                          text={el.content} fontSize={el.fontSize} fontFamily={el.fontFamily}
                          fontStyle={`${el.bold ? "bold" : ""} ${el.italic ? "italic" : ""}`.trim() || "normal"}
                          align={el.align} fill={el.color}
                          draggable
                          onClick={() => setSelectedId(el.id)} onTap={() => setSelectedId(el.id)}
                          onDblClick={() => setEditingTextId(el.id)} onDblTap={() => setEditingTextId(el.id)}
                          onDragEnd={e => updateElement(el.id, { x: e.target.x(), y: e.target.y() })}
                          onTransformEnd={e => onTransformEnd(el.id, e.target)}
                        />
                      );
                    }
                    const img = imageCacheRef.current.get(el.src);
                    return (
                      <KonvaImage
                        key={el.id} id={el.id}
                        x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation}
                        image={img} draggable
                        onClick={() => setSelectedId(el.id)} onTap={() => setSelectedId(el.id)}
                        onDragEnd={e => updateElement(el.id, { x: e.target.x(), y: e.target.y() })}
                        onTransformEnd={e => onTransformEnd(el.id, e.target)}
                      />
                    );
                  })}
                  <Transformer ref={transformerRef} keepRatio={selectedEl?.type === "image"} boundBoxFunc={(_old, next) => (next.width < 20 || next.height < 20 ? _old : next)} />
                </Layer>
              </Stage>
              {editingTextId && activeSlide && (() => {
                const el = activeSlide.elements.find(e => e.id === editingTextId) as TextEl | undefined;
                if (!el) return null;
                return (
                  <TextEditOverlay
                    el={el} scale={scale}
                    onCommit={content => { updateElement(el.id, { content }); setEditingTextId(null); }}
                    onCancel={() => setEditingTextId(null)}
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {/* Properties panel */}
        <div className="w-64 border-l border-border overflow-y-auto p-3 space-y-3 shrink-0 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Propriétés</p>
          {!selectedEl ? (
            <p className="text-xs text-muted-foreground">Sélectionnez un élément pour le modifier.</p>
          ) : selectedEl.type === "text" ? (
            <div className="space-y-3">
              <div className="flex gap-1.5">
                <button onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })} className={`btn-c btn-c-sm flex-1 ${selectedEl.bold ? "btn-c-primary" : "btn-c-ghost"}`}><Bold className="h-3.5 w-3.5" /></button>
                <button onClick={() => updateElement(selectedEl.id, { italic: !selectedEl.italic })} className={`btn-c btn-c-sm flex-1 ${selectedEl.italic ? "btn-c-primary" : "btn-c-ghost"}`}><Italic className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex gap-1.5">
                {(["left", "center", "right"] as const).map(a => (
                  <button key={a} onClick={() => updateElement(selectedEl.id, { align: a })} className={`btn-c btn-c-sm flex-1 ${selectedEl.align === a ? "btn-c-primary" : "btn-c-ghost"}`}>
                    {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span>Taille de police</span>
                <input type="number" min={8} max={120} value={selectedEl.fontSize}
                  onChange={e => updateElement(selectedEl.id, { fontSize: Number(e.target.value) || 12 })}
                  className="w-full h-8 rounded-md border border-border px-2 text-xs" />
              </label>
              <label className="block text-xs text-muted-foreground space-y-1">
                <span>Couleur du texte</span>
                <input type="color" value={selectedEl.color} onChange={e => updateElement(selectedEl.id, { color: e.target.value })} className="w-full h-8 rounded-md border border-border" />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!selectedEl.backgroundColor} onChange={e => updateElement(selectedEl.id, { backgroundColor: e.target.checked ? "#FFF7D6" : null })} />
                Fond coloré
              </label>
              {selectedEl.backgroundColor && (
                <input type="color" value={selectedEl.backgroundColor} onChange={e => updateElement(selectedEl.id, { backgroundColor: e.target.value })} className="w-full h-8 rounded-md border border-border" />
              )}
              <p className="text-[11px] text-muted-foreground italic">Double-cliquez sur le texte dans la diapositive pour le modifier.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <img src={(selectedEl as ImageEl).src} alt="" className="w-full rounded-md border border-border" />
              <p className="text-[11px] text-muted-foreground">Glissez pour déplacer, tirez les poignées pour redimensionner (proportions conservées).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
