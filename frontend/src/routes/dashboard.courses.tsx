import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BookOpen, Plus, Users, Loader2, CheckCircle, Trash2, Search, Pencil,
} from "lucide-react";
import { CardGridSkeleton } from "@/components/Skeletons";
import { PageHead, DashAvatar, EmptyHint } from "@/components/dashboard/ui";
import {
  FileText, Link2, Video, Upload, ExternalLink, Play,
  File as FileIcon, FileImage, X, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/courses")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: CoursesPage,
});

/* ─── Types ─────────────────────────────────────────────────── */
type Course = {
  id: string; title: string; description: string | null; code: string | null;
  professor_id: string | null; semester: string | null; credits: number;
  cover_color: string; is_published: boolean; created_at: string;
  professor_name?: string; enrollment_count?: number; is_enrolled?: boolean;
  assigned_classes?: { id: string; name: string }[];
};
type ClassOption = { id: string; name: string };
type ResourceType = "file" | "link" | "video";
type Resource = { id: string; type: ResourceType; title: string; url: string; mime_type?: string; size_bytes?: number };

/* ─── API helpers (via backend to bypass storage RLS) ─────── */
const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function fetchResources(courseId: string): Promise<Resource[]> {
  const headers = await authHeader();
  const res = await fetch(`${API}/api/courses/${courseId}/resources`, { headers });
  if (!res.ok) return [];
  return res.json();
}

function parseApiError(text: string, fallback: string): string {
  try { const j = JSON.parse(text); return j.detail || j.message || text; } catch { return text || fallback; }
}

async function uploadFileToBackend(courseId: string, file: File): Promise<Resource | null> {
  const headers = await authHeader();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/courses/${courseId}/resources/upload`, {
    method: "POST", headers, body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, `HTTP ${res.status}`));
  }
  return res.json();
}

async function saveMetaToBackend(courseId: string, items: Resource[]): Promise<void> {
  const headers = { ...(await authHeader()), "Content-Type": "application/json" };
  const res = await fetch(`${API}/api/courses/${courseId}/resources/meta`, {
    method: "POST", headers, body: JSON.stringify(items),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, `HTTP ${res.status}`));
  }
}

async function deleteResourceFromBackend(courseId: string, resourceId: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(`${API}/api/courses/${courseId}/resources/${encodeURIComponent(resourceId)}`, {
    method: "DELETE", headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, `HTTP ${res.status}`));
  }
}

/* ─── Helpers ────────────────────────────────────────────────── */
const COLOR_MAP: Record<string, string> = {
  green: "from-green-400 to-emerald-600", blue: "from-blue-400 to-indigo-600",
  purple: "from-purple-400 to-violet-600", orange: "from-orange-400 to-red-500",
  pink: "from-pink-400 to-rose-600", teal: "from-teal-400 to-cyan-600",
};

function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(mime?: string, title?: string) {
  const t = (mime ?? title ?? "").toLowerCase();
  if (t.includes("pdf")) return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (t.includes("image") || /\.(png|jpg|jpeg|gif|webp|svg)/.test(t)) return <FileImage className="h-4 w-4 text-blue-500 shrink-0" />;
  if (t.includes("video") || /\.(mp4|mov|avi|webm)/.test(t)) return <Video className="h-4 w-4 text-purple-500 shrink-0" />;
  return <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function videoEmbed(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return url;
  return null;
}

const EMPTY = { title: "", description: "", code: "", semester: "", credits: "3", cover_color: "blue", classIds: [] as string[] };

/* ─── Resource row ───────────────────────────────────────────── */
function ResRow({ res, canEdit, onRemove }: { res: Resource; canEdit: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const embed = res.type === "video" ? videoEmbed(res.url) : null;
  const isDirect = embed && /\.(mp4|webm|ogg)/i.test(embed);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0">
          {res.type === "file" && fileIcon(res.mime_type, res.title)}
          {res.type === "link" && <Link2 className="h-4 w-4 text-blue-500" />}
          {res.type === "video" && <Play className="h-4 w-4 text-purple-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{res.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {res.size_bytes ? formatBytes(res.size_bytes) : res.url.slice(0, 60)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {res.type === "video" && embed && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(o => !o)}>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
            </Button>
          )}
          {res.type !== "video" && (
            <a href={res.url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={res.type === "file" ? "Télécharger" : "Ouvrir"}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {res.type === "video" && open && embed && (
        <div className="px-4 pb-4">
          {isDirect
            ? <video src={embed} controls className="w-full rounded-lg max-h-64" />
            : <iframe src={embed} className="w-full rounded-lg" style={{ height: 260 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen />
          }
        </div>
      )}
    </div>
  );
}

/* ─── Resources Modal ────────────────────────────────────────── */
function ResourcesModal({ course, canEdit, onClose }: { course: Course; canEdit: boolean; onClose: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<"all" | ResourceType>("all");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [addMode, setAddMode]     = useState<"link" | "video" | null>(null);
  const [newTitle, setNewTitle]   = useState("");
  const [newUrl, setNewUrl]       = useState("");
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchResources(course.id).then(r => { setResources(r); setLoading(false); });
  }, [course.id]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    // Snapshot into a real array before resetting the input (FileList is a live DOM reference)
    const files = Array.from(fileList);
    if (fileRef.current) fileRef.current.value = "";
    setUploading(true);

    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        setProgress(Math.round((i / files.length) * 100));
        const res = await uploadFileToBackend(course.id, files[i]);
        if (res) {
          setResources(prev => [...prev, res]);
          successCount++;
        }
        setProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (e: any) {
        const msg = e.message || "Erreur inconnue";
        toast.error(`Échec : ${files[i].name} — ${msg}`);
      }
    }

    setUploading(false);
    setProgress(0);
    if (successCount > 0) {
      toast.success(`${successCount} fichier${successCount > 1 ? "s" : ""} ajouté${successCount > 1 ? "s" : ""}`);
    }
  }

  async function addMeta() {
    if (!newTitle.trim() || !newUrl.trim()) { toast.error("Titre et URL requis"); return; }
    setSaving(true);
    const mode  = addMode!;
    const title = newTitle;
    const url   = newUrl;
    const item: Resource = { id: `${mode}-${Date.now()}`, type: mode, title, url };
    try {
      const currentMeta = resources.filter(r => r.type !== "file");
      await saveMetaToBackend(course.id, [...currentMeta, item]);
      setResources(prev => [...prev, item]);
      setNewTitle(""); setNewUrl(""); setAddMode(null);
      toast.success(mode === "link" ? "Lien ajouté" : "Vidéo ajoutée");
    } catch (e: any) {
      toast.error(e.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function removeRes(res: Resource) {
    try {
      if (res.type === "file") {
        await deleteResourceFromBackend(course.id, res.id);
      } else {
        const remaining = resources.filter(r => r.type !== "file" && r.id !== res.id);
        await saveMetaToBackend(course.id, remaining);
      }
      setResources(prev => prev.filter(r => r.id !== res.id));
      toast.success("Ressource supprimée");
    } catch (e: any) {
      toast.error(`Suppression échouée : ${e.message}`);
    }
  }

  const shown = tab === "all" ? resources : resources.filter(r => r.type === tab);
  const count = (t: typeof tab) => t === "all" ? resources.length : resources.filter(r => r.type === t).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-hidden flex flex-col p-0">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Ressources du cours</p>
            <h2 className="font-display text-xl font-semibold mt-0.5 leading-tight">{course.title}</h2>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-full p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-6 pt-3 pb-1 shrink-0 flex-wrap">
          {(["all", "file", "link", "video"] as const).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors border"
              style={{
                background: tab === k ? "oklch(22% 0.025 175)" : "transparent",
                color: tab === k ? "white" : "oklch(48% 0.02 180)",
                borderColor: tab === k ? "oklch(22% 0.025 175)" : "oklch(88% 0.015 170)",
              }}
            >
              {k === "all" ? "Tous" : k === "file" ? "Fichiers" : k === "link" ? "Liens" : "Vidéos"}
              {" "}({count(k)})
            </button>
          ))}
        </div>

        {/* Action buttons — own row */}
        {canEdit && (
          <div className="flex gap-2 px-6 pb-2 shrink-0 flex-wrap">
            {/* File upload */}
            <label className="cursor-pointer">
              <input ref={fileRef} type="file" multiple accept="*/*" className="hidden"
                onChange={e => handleFiles(e.target.files)} />
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? `Upload… ${progress}%` : "Ajouter un fichier"}
              </div>
            </label>

            <button
              onClick={() => { setAddMode("link"); setNewTitle(""); setNewUrl(""); }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />Ajouter un lien
            </button>

            <button
              onClick={() => { setAddMode("video"); setNewTitle(""); setNewUrl(""); }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Video className="h-3.5 w-3.5" />Ajouter une vidéo
            </button>
          </div>
        )}

        {/* Drop zone */}
        {canEdit && (
          <div
            className="mx-6 mb-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors shrink-0"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="h-3.5 w-3.5 inline mr-1.5 mb-0.5" />
            Glissez n'importe quel fichier ici — PDF, Word, Excel, PowerPoint, vidéo, image…
          </div>
        )}

        {/* Add form */}
        {addMode && (
          <div className="mx-6 mb-2 rounded-xl border border-border bg-muted/40 p-4 space-y-3 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {addMode === "link" ? "Nouveau lien" : "Nouvelle vidéo"}
            </p>
            <Input className="h-9 text-sm" placeholder="Titre" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <Input
              className="h-9 text-sm"
              placeholder={addMode === "video" ? "URL YouTube, Vimeo ou .mp4 direct" : "https://…"}
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs border-0 bg-gradient-brand text-white" disabled={saving} onClick={addMeta}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ajouter"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddMode(null)}>Annuler</Button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto px-6 pb-6 flex-1">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-3 opacity-25" />
              <p className="text-sm">Aucune ressource{tab !== "all" ? " dans cette catégorie" : ""}.</p>
              {canEdit && <p className="text-xs mt-1 opacity-70">Utilisez les boutons ci-dessus pour en ajouter.</p>}
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {shown.map(res => (
                <ResRow key={res.id} res={res} canEdit={canEdit} onRemove={() => removeRes(res)} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Inline resource uploader (used inside the create dialog step 2) ── */
function InlineResourceUploader({ courseId }: { courseId: string }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [addMode,    setAddMode]    = useState<"link" | "video" | null>(null);
  const [newTitle,   setNewTitle]   = useState("");
  const [newUrl,     setNewUrl]     = useState("");
  const [saving,     setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    // Snapshot into a real array before clearing the input — FileList is a live DOM
    // reference that becomes empty as soon as fileRef.current.value is reset.
    const files = Array.from(fileList);
    if (fileRef.current) fileRef.current.value = "";
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        setProgress(Math.round((i / files.length) * 100));
        const res = await uploadFileToBackend(courseId, files[i]);
        if (res) { setResources(prev => [...prev, res]); ok++; }
        setProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (e: any) { toast.error(`${files[i].name} — ${e.message}`); }
    }
    setUploading(false); setProgress(0);
    if (ok > 0) toast.success(`${ok} fichier${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""}`);
  }

  async function addMeta() {
    if (!newTitle.trim() || !newUrl.trim()) { toast.error("Titre et URL requis"); return; }
    setSaving(true);
    const mode = addMode!;
    const title = newTitle;
    const url   = newUrl;
    const item: Resource = { id: `${mode}-${Date.now()}`, type: mode, title, url };
    try {
      const currentMeta = resources.filter(r => r.type !== "file");
      await saveMetaToBackend(courseId, [...currentMeta, item]);
      setResources(prev => [...prev, item]);
      setNewTitle(""); setNewUrl(""); setAddMode(null);
      toast.success(mode === "link" ? "Lien ajouté" : "Vidéo ajoutée");
    } catch (e: any) {
      toast.error(e.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  async function removeRes(res: Resource) {
    try {
      if (res.type === "file") {
        await deleteResourceFromBackend(courseId, res.id);
      } else {
        const remaining = resources.filter(r => r.type !== "file" && r.id !== res.id);
        await saveMetaToBackend(courseId, remaining);
      }
      setResources(prev => prev.filter(r => r.id !== res.id));
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer">
          <input ref={fileRef} type="file" multiple accept="*/*" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? `Upload… ${progress}%` : "Ajouter un fichier"}
          </div>
        </label>
        <button onClick={() => { setAddMode("link"); setNewTitle(""); setNewUrl(""); }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors">
          <Link2 className="h-3.5 w-3.5" />Ajouter un lien
        </button>
        <button onClick={() => { setAddMode("video"); setNewTitle(""); setNewUrl(""); }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors">
          <Video className="h-3.5 w-3.5" />Ajouter une vidéo
        </button>
      </div>

      {/* Drop zone */}
      <div
        className="rounded-xl border-2 border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="h-3.5 w-3.5 inline mr-1.5 mb-0.5" />
        Glissez un fichier ici — PDF, Word, image, vidéo…
      </div>

      {/* URL / video form */}
      {addMode && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {addMode === "link" ? "Nouveau lien" : "Nouvelle vidéo"}
          </p>
          <Input className="h-9 text-sm" placeholder="Titre" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <Input className="h-9 text-sm"
            placeholder={addMode === "video" ? "URL YouTube, Vimeo ou .mp4" : "https://…"}
            value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs border-0 bg-gradient-brand text-white" disabled={saving} onClick={addMeta}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ajouter"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddMode(null)}>Annuler</Button>
          </div>
        </div>
      )}

      {/* Resource list */}
      {resources.length > 0 && (
        <div className="space-y-1.5">
          {resources.map(res => (
            <ResRow key={res.id} res={res} canEdit onRemove={() => removeRes(res)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Courses Page ───────────────────────────────────────────── */
function CoursesPage() {
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const isAdmin   = roles.includes("admin");
  const isProf    = roles.includes("professor");
  const canCreate = isAdmin || isProf;

  const [courses,          setCourses]          = useState<Course[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [showCreate,       setShowCreate]       = useState(false);
  const [creating,         setCreating]         = useState(false);
  const [form,             setForm]             = useState(EMPTY);
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [loadingClasses,   setLoadingClasses]   = useState(false);
  const [newCourse,        setNewCourse]        = useState<Course | null>(null);
  const [resCourse,        setResCourse]        = useState<Course | null>(null);
  const [q,                setQ]                = useState("");
  const [editCourse,       setEditCourse]       = useState<Course | null>(null);
  const [editForm,         setEditForm]         = useState(EMPTY);
  const [editClasses,      setEditClasses]      = useState<ClassOption[]>([]);
  const [loadingEditCls,   setLoadingEditCls]   = useState(false);
  const [updating,         setUpdating]         = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const data: Course[] = await api.get("/api/courses");
      setCourses(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) load(); }, [user]);

  // Fetch available classes every time the create dialog opens
  useEffect(() => {
    if (!showCreate) return;
    setLoadingClasses(true);
    setAvailableClasses([]);
    api.get("/api/classes/all")
      .then((data: any) => setAvailableClasses((data as any[]).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => toast.error(lang === "fr" ? "Impossible de charger les classes" : "Could not load classes"))
      .finally(() => setLoadingClasses(false));
  }, [showCreate]);

  if (!user) return null;

  async function deleteCourse(id: string) {
    if (!window.confirm(lang === "fr" ? "Supprimer ce cours ?" : "Delete this course?")) return;
    try {
      await api.delete(`/api/courses/${id}`);
      toast.success(t("courses.deleted")); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  }

  async function createCourse() {
    if (!form.title.trim()) { toast.error(t("courses.title_required")); return; }
    setCreating(true);
    try {
      const created: Course = await api.post("/api/courses", {
        title:       form.title,
        description: form.description || null,
        code:        form.code || null,
        semester:    form.semester || null,
        credits:     parseInt(form.credits) || 3,
        cover_color: form.cover_color,
        class_ids:   form.classIds,
      });
      toast.success(t("courses.created"));
      setForm(EMPTY);
      setNewCourse(created);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de création");
    } finally {
      setCreating(false);
    }
  }

  function closeCreateDialog() {
    setShowCreate(false);
    setNewCourse(null);
    setForm(EMPTY);
  }

  function openEdit(course: Course) {
    setEditForm({
      title:       course.title,
      description: course.description ?? "",
      code:        course.code ?? "",
      semester:    course.semester ?? "",
      credits:     String(course.credits),
      cover_color: course.cover_color,
      classIds:    (course.assigned_classes ?? []).map(c => c.id),
    });
    setEditCourse(course);
    setLoadingEditCls(true);
    setEditClasses([]);
    api.get("/api/classes/all")
      .then((d: any) => setEditClasses((d as any[]).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
      .finally(() => setLoadingEditCls(false));
  }

  async function updateCourse() {
    if (!editCourse) return;
    if (!editForm.title.trim()) { toast.error(t("courses.title_required")); return; }
    setUpdating(true);
    try {
      await api.patch(`/api/courses/${editCourse.id}`, {
        title:       editForm.title,
        description: editForm.description || null,
        code:        editForm.code        || null,
        semester:    editForm.semester    || null,
        credits:     parseInt(editForm.credits) || 3,
        cover_color: editForm.cover_color,
        class_ids:   editForm.classIds,
      });
      toast.success(lang === "fr" ? "Cours mis à jour" : "Course updated");
      setEditCourse(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUpdating(false);
    }
  }

  const displayed = q.trim()
    ? courses.filter(c =>
        `${c.title} ${c.code ?? ""} ${c.professor_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : courses;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={lang === "fr" ? "Programme" : lang === "ar" ? "البرنامج" : "Curriculum"}
        title={t("dash.courses")}
        sub={t("courses.subtitle")}
        actions={
          <>
            <div className="relative">
              <span className="absolute top-1/2 flex -translate-y-1/2" style={{ insetInlineStart: 12, color: "var(--pal-muted)" }}>
                <Search size={15} strokeWidth={1.7} />
              </span>
              <input
                className="input-c"
                style={{ paddingInlineStart: 36, width: 240 }}
                placeholder={lang === "fr" ? "Rechercher un cours…" : lang === "ar" ? "ابحث عن درس…" : "Search a course…"}
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            {canCreate && (
              <button type="button" onClick={() => setShowCreate(true)} className="btn-c btn-c-primary">
                <Plus size={15} strokeWidth={1.7} />{t("courses.create")}
              </button>
            )}
          </>
        }
      />

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : courses.length === 0 ? (
        <div className="dash-card">
          <EmptyHint
            icon={<BookOpen size={28} strokeWidth={1.7} />}
            text={
              <span className="flex flex-col items-center gap-3">
                {t("courses.empty")}
                {canCreate && (
                  <button type="button" className="btn-c btn-c-ghost btn-c-sm" onClick={() => setShowCreate(true)}>
                    <Plus size={13} strokeWidth={1.7} />{t("courses.create")}
                  </button>
                )}
              </span>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(330px, 100%), 1fr))" }}>
            {displayed.map((course, i) => (
              <article
                key={course.id}
                className="dash-card lift-c card-pop flex flex-col overflow-hidden"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="flex flex-1 flex-col gap-2.5 px-5 pt-4.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="chip-c chip-c-green">{course.code || (lang === "fr" ? "Cours" : "Course")}</span>
                    <span className="chip-c tabular-nums">{course.credits} {lang === "fr" ? "crédits" : "credits"}</span>
                  </div>
                  <h3 className="h-serif" style={{ fontSize: 21, lineHeight: 1.15 }}>{course.title}</h3>
                  {course.professor_name && (
                    <div className="flex items-center gap-2" style={{ color: "var(--pal-muted)", fontSize: 12.5 }}>
                      <DashAvatar name={course.professor_name} size={22} tone="soft" />
                      {course.professor_name}
                    </div>
                  )}
                  {course.description && <p className="line-clamp-2" style={{ fontSize: 12.5, color: "var(--pal-muted)" }}>{course.description}</p>}

                  {/* Assigned classes */}
                  {course.assigned_classes && course.assigned_classes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {course.assigned_classes.map(c => (
                        <span key={c.id} className="chip-c">
                          <Users size={10} strokeWidth={1.7} />{c.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Edit / Delete (prof/admin) */}
                  {(isProf || isAdmin) && (isAdmin || course.professor_id === user!.id) && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded p-0.5 transition-colors hover:opacity-75"
                        style={{ fontSize: 11.5, fontWeight: 700, color: "var(--pal-primary)", background: "none", border: 0, cursor: "pointer" }}
                        onClick={() => openEdit(course)}
                      >
                        <Pencil size={12} strokeWidth={1.7} />{lang === "fr" ? "Modifier" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded p-0.5 transition-colors hover:opacity-75"
                        style={{ fontSize: 11.5, fontWeight: 700, color: "var(--pal-danger)", background: "none", border: 0, cursor: "pointer" }}
                        onClick={() => deleteCourse(course.id)}
                      >
                        <Trash2 size={12} strokeWidth={1.7} />{lang === "fr" ? "Supprimer" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer strip */}
                <div
                  className="mt-3.5 flex items-center justify-between gap-2 px-5 py-3"
                  style={{ borderTop: "1px solid var(--pal-line-soft)", background: "var(--pal-cream)" }}
                >
                  <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--pal-muted)" }}>
                    <Users size={13} strokeWidth={1.7} />
                    {course.enrollment_count} {lang === "fr" ? "étudiants" : "students"}
                    {course.semester ? ` · ${course.semester}` : ""}
                  </div>
                  <button type="button" className="btn-c btn-c-soft btn-c-sm" onClick={() => setResCourse(course)}>
                    {lang === "fr" ? "Ressources" : "Resources"}
                    {(isAdmin || (isProf && course.professor_id === user!.id)) && <span style={{ opacity: 0.7 }}>+</span>}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {displayed.length === 0 && (
            <div className="dash-card">
              <EmptyHint
                icon={<Search size={28} strokeWidth={1.7} />}
                text={lang === "fr" ? `Aucun cours ne correspond à « ${q} »` : `No course matches "${q}"`}
              />
            </div>
          )}
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editCourse} onOpenChange={open => { if (!open) setEditCourse(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {lang === "fr" ? "Modifier le cours" : lang === "ar" ? "تعديل الدرس" : "Edit course"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-sm font-medium">{t("courses.form.title")} *</label>
              <Input className="mt-1.5" value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            {/* Class selector */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Users className="h-4 w-4" />
                {lang === "fr" ? "Classes assignées" : "Assigned classes"}
                {editForm.classIds.length > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                    {editForm.classIds.length} {lang === "fr" ? "sélectionnée(s)" : "selected"}
                  </span>
                )}
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {loadingEditCls ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {lang === "fr" ? "Chargement…" : "Loading…"}
                  </div>
                ) : editClasses.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    {lang === "fr" ? "Aucune classe trouvée." : "No classes found."}
                  </p>
                ) : (
                  editClasses.map(cls => (
                    <label key={cls.id} className={`flex items-center gap-3 cursor-pointer select-none rounded-lg px-2 py-2 transition-colors ${editForm.classIds.includes(cls.id) ? "bg-primary/15 font-semibold" : "hover:bg-primary/10"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-primary"
                        checked={editForm.classIds.includes(cls.id)}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          classIds: e.target.checked
                            ? [...f.classIds, cls.id]
                            : f.classIds.filter(id => id !== cls.id),
                        }))}
                      />
                      <span className="text-sm">{cls.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("courses.form.code")}</label>
                <Input className="mt-1.5" value={editForm.code}
                  onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("courses.form.credits")}</label>
                <Input className="mt-1.5" type="number" min="1" max="10" value={editForm.credits}
                  onChange={e => setEditForm(f => ({ ...f, credits: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("courses.form.semester")}</label>
              <Input className="mt-1.5" value={editForm.semester}
                onChange={e => setEditForm(f => ({ ...f, semester: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("courses.form.description")}</label>
              <Textarea className="mt-1.5" value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{t("courses.form.color")}</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COLOR_MAP).map(([color, gradient]) => (
                  <button key={color} type="button" onClick={() => setEditForm(f => ({ ...f, cover_color: color }))}
                    className={`h-7 w-14 rounded-lg bg-gradient-to-r ${gradient} transition-all ${editForm.cover_color === color ? "ring-2 ring-foreground ring-offset-2" : "opacity-50 hover:opacity-100"}`} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCourse(null)}>
              {lang === "fr" ? "Annuler" : "Cancel"}
            </Button>
            <Button className="border-0 bg-gradient-brand text-white" disabled={updating} onClick={updateCourse}>
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "fr" ? "Enregistrer" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resources modal (existing courses) */}
      {resCourse && (
        <ResourcesModal
          course={resCourse}
          canEdit={isAdmin || (isProf && resCourse.professor_id === user!.id)}
          onClose={() => setResCourse(null)}
        />
      )}

      {/* Create dialog — two-step */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) closeCreateDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg">

          {/* ── Step 1: course details ── */}
          {!newCourse && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{t("courses.create")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div>
                  <label className="text-sm font-medium">{t("courses.form.title")} *</label>
                  <Input className="mt-1.5" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={lang === "fr" ? "ex : Anatomie Générale" : "e.g. General Anatomy"} />
                </div>

                {/* Class selector — placed at top so it's always visible */}
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                    <Users className="h-4 w-4" />
                    {lang === "fr" ? "Attribuer à une classe *" : "Assign to class *"}
                    {form.classIds.length > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                        {form.classIds.length} {lang === "fr" ? "sélectionnée(s)" : "selected"}
                      </span>
                    )}
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {loadingClasses ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {lang === "fr" ? "Chargement des classes…" : "Loading classes…"}
                      </div>
                    ) : availableClasses.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        {lang === "fr"
                          ? "Aucune classe trouvée. Créez d'abord une classe dans l'onglet Classes."
                          : "No classes found. Create a class first in the Classes tab."}
                      </p>
                    ) : (
                      availableClasses.map(cls => (
                        <label key={cls.id} className={`flex items-center gap-3 cursor-pointer select-none rounded-lg px-2 py-2 transition-colors ${form.classIds.includes(cls.id) ? "bg-primary/15 font-semibold" : "hover:bg-primary/10"}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-primary"
                            checked={form.classIds.includes(cls.id)}
                            onChange={e => setForm(f => ({
                              ...f,
                              classIds: e.target.checked
                                ? [...f.classIds, cls.id]
                                : f.classIds.filter(id => id !== cls.id),
                            }))}
                          />
                          <span className="text-sm">{cls.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">{t("courses.form.code")}</label>
                    <Input className="mt-1.5" value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="ex : INF-201" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t("courses.form.credits")}</label>
                    <Input className="mt-1.5" type="number" min="1" max="10" value={form.credits}
                      onChange={e => setForm(f => ({ ...f, credits: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">{t("courses.form.semester")}</label>
                  <Input className="mt-1.5" value={form.semester}
                    onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}
                    placeholder={lang === "fr" ? "ex : S1 2025-2026" : "e.g. Fall 2025"} />
                </div>
                <div>
                  <label className="text-sm font-medium">{t("courses.form.description")}</label>
                  <Textarea className="mt-1.5" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">{t("courses.form.color")}</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(COLOR_MAP).map(([color, gradient]) => (
                      <button key={color} type="button" onClick={() => setForm(f => ({ ...f, cover_color: color }))}
                        className={`h-7 w-14 rounded-lg bg-gradient-to-r ${gradient} transition-all ${form.cover_color === color ? "ring-2 ring-foreground ring-offset-2" : "opacity-50 hover:opacity-100"}`} />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreateDialog}>{lang === "fr" ? "Annuler" : "Cancel"}</Button>
                <Button className="border-0 bg-gradient-brand text-white" disabled={creating} onClick={createCourse}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "fr" ? "Créer le cours →" : "Create course →")}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Step 2: add resources ── */}
          {newCourse && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Cours créé</p>
                </div>
                <DialogTitle className="font-display">{newCourse.title}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Ajoutez des fichiers, liens ou vidéos à ce cours (optionnel).
                </p>
              </DialogHeader>

              <div className="py-1">
                <InlineResourceUploader courseId={newCourse.id} />
              </div>

              <DialogFooter>
                <Button className="border-0 bg-gradient-brand text-white w-full" onClick={closeCreateDialog}>
                  Terminer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
