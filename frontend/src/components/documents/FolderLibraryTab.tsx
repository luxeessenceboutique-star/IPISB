import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Folder, FolderOpen, FolderPlus, ChevronDown, Hash, FileText,
  Upload, PenSquare, Pencil, Trash2, Move, X,
} from "lucide-react";
import { SectionLabel, EmptyHint } from "@/components/dashboard/ui";
import { urlIsPdf, type Preview } from "@/components/dashboard/preview";

const PAL = {
  ink: "oklch(22% 0.025 175)", muted: "oklch(48% 0.02 180)", primary: "oklch(48% 0.085 175)",
  line: "oklch(88% 0.015 170)", paper: "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';
const fieldStyle = { marginTop: 8, marginBottom: 16, width: "100%", padding: "10px 12px", border: `1px solid ${PAL.line}`, borderRadius: 10, fontFamily: sans, fontSize: 13.5, color: PAL.ink, background: PAL.paper, outline: "none", boxSizing: "border-box" as const };
const labelStyle = { fontFamily: sans, fontSize: 11, fontWeight: 600, color: PAL.muted, letterSpacing: ".1em", textTransform: "uppercase" as const };
const MAX_DEPTH = 2; // 0/1/2 = 3 levels, mirrors backend/routers/document_library.py
const INDENT = 26;

type DocFolder = { id: string; reference_code: string; name: string; parent_id: string | null; depth: number; created_at: string };
type DocFile = {
  id: string; reference_code: string; folder_id: string | null; title: string;
  source: "import" | "composed"; filename: string | null; content_type: string | null;
  created_at: string; updated_at: string; body_html?: string;
};

const refChip = (code: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10.5, color: PAL.muted }}>
    <Hash size={11} strokeWidth={1.7} />{code}
  </span>
);

/* ─── Create/rename folder modal ─── */
function FolderModal({ editing, onClose, onSave }: {
  editing: DocFolder | null; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Le nom est requis."); return; }
    setBusy(true);
    try { await onSave(name.trim()); onClose(); } finally { setBusy(false); }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 400, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 500, color: PAL.ink, margin: "0 0 16px" }}>
          {editing ? "Renommer le dossier" : "Nouveau dossier"}
        </h2>
        <label style={labelStyle}>Nom *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} className="u-input" style={fieldStyle} autoFocus />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Import an existing file ─── */
function ImportFileModal({ targetLabel, onClose, onImport }: {
  targetLabel: string; onClose: () => void; onImport: (title: string, file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function submit() {
    if (!file) { toast.error("Choisissez un fichier."); return; }
    if (!title.trim()) { toast.error("Donnez un titre au document."); return; }
    setBusy(true);
    try { await onImport(title.trim(), file); onClose(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'envoi."); }
    finally { setBusy(false); }
  }

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 32, width: 440, maxWidth: "95vw", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 6px" }}>Importer un fichier</h2>
        <p style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted, margin: "0 0 20px" }}>Dans : {targetLabel}</p>

        <label style={labelStyle}>Fichier</label>
        <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => pickFile(e.target.files?.[0] ?? null)}
          className="u-input" style={{ ...fieldStyle, padding: "9px 12px" }} />

        <label style={labelStyle}>Titre</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="u-input" style={fieldStyle} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Envoi…" : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Compose (or re-edit) a document with Tiptap ─── */
function ComposeDocumentModal({ targetLabel, editing, onClose, onSaved }: {
  targetLabel: string; editing: DocFile | null; onClose: () => void;
  onSaved: (title: string, bodyHtml: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [loadingContent, setLoadingContent] = useState(!!editing);
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: "",
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editing || !editor) return;
    api.get(`/api/document-library/files/${editing.id}`)
      .then((full: DocFile) => editor.commands.setContent(full.body_html || ""))
      .catch(() => toast.error("Erreur lors du chargement du document."))
      .finally(() => setLoadingContent(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editor]);

  async function submit() {
    if (!title.trim()) { toast.error("Le titre est requis."); return; }
    if (!editor) return;
    setBusy(true);
    try { await onSaved(title.trim(), editor.getHTML()); onClose(); }
    catch (err: any) { toast.error(err?.message ?? "Erreur lors de l'enregistrement."); }
    finally { setBusy(false); }
  }

  const toolBtn = (active: boolean, disabled: boolean) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    border: `1px solid ${active ? "var(--pal-primary)" : PAL.line}`, borderRadius: 7,
    background: active ? "var(--pal-pale)" : PAL.paper, color: active ? "var(--pal-primary-deep)" : PAL.ink,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1,
  });

  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, padding: 28, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 24, fontWeight: 500, color: PAL.ink, margin: "0 0 4px" }}>
              {editing ? "Modifier le document" : "Composer un document"}
            </h2>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: PAL.muted, margin: 0 }}>Dans : {targetLabel} — en-tête/pied de page officiel appliqués automatiquement</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: PAL.muted, padding: 0, lineHeight: 0 }}><X size={20} /></button>
        </div>

        <label style={{ ...labelStyle, marginTop: 18, display: "block" }}>Titre</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="u-input" style={fieldStyle} />

        {loadingContent ? (
          <div className="shimmer" style={{ height: 240, borderRadius: 10 }} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <button type="button" title="Gras" onClick={() => editor?.chain().focus().toggleBold().run()} style={toolBtn(!!editor?.isActive("bold"), false)}><Bold size={14} strokeWidth={2} /></button>
              <button type="button" title="Italique" onClick={() => editor?.chain().focus().toggleItalic().run()} style={toolBtn(!!editor?.isActive("italic"), false)}><Italic size={14} strokeWidth={2} /></button>
              <button type="button" title="Souligné" onClick={() => editor?.chain().focus().toggleUnderline().run()} style={toolBtn(!!editor?.isActive("underline"), false)}><UnderlineIcon size={14} strokeWidth={2} /></button>
              <button type="button" title="Barré" onClick={() => editor?.chain().focus().toggleStrike().run()} style={toolBtn(!!editor?.isActive("strike"), false)}><Strikethrough size={14} strokeWidth={2} /></button>
              <span style={{ width: 1, background: PAL.line, margin: "2px 4px" }} />
              <button type="button" title="Titre 1" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} style={toolBtn(!!editor?.isActive("heading", { level: 1 }), false)}><Heading1 size={14} strokeWidth={2} /></button>
              <button type="button" title="Titre 2" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} style={toolBtn(!!editor?.isActive("heading", { level: 2 }), false)}><Heading2 size={14} strokeWidth={2} /></button>
              <button type="button" title="Titre 3" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} style={toolBtn(!!editor?.isActive("heading", { level: 3 }), false)}><Heading3 size={14} strokeWidth={2} /></button>
              <span style={{ width: 1, background: PAL.line, margin: "2px 4px" }} />
              <button type="button" title="Liste à puces" onClick={() => editor?.chain().focus().toggleBulletList().run()} style={toolBtn(!!editor?.isActive("bulletList"), false)}><List size={14} strokeWidth={2} /></button>
              <button type="button" title="Liste numérotée" onClick={() => editor?.chain().focus().toggleOrderedList().run()} style={toolBtn(!!editor?.isActive("orderedList"), false)}><ListOrdered size={14} strokeWidth={2} /></button>
            </div>
            <div
              onClick={() => editor?.chain().focus().run()}
              style={{ border: `1px solid ${PAL.line}`, borderRadius: 10, padding: "14px 16px", minHeight: 260, cursor: "text", fontFamily: sans, fontSize: 14, color: PAL.ink }}
            >
              <EditorContent editor={editor} />
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ fontFamily: sans, fontSize: 13, color: PAL.muted, background: "transparent", border: `1px solid ${PAL.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={busy || loadingContent} style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: PAL.paper, background: PAL.ink, border: 0, borderRadius: 8, padding: "10px 22px", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── A single file row, with an inline "move" select ─── */
function FileRow({ file, folders, onOpen, onEdit, onMove, onDelete }: {
  file: DocFile; folders: DocFolder[];
  onOpen: (f: DocFile) => void; onEdit: (f: DocFile) => void;
  onMove: (f: DocFile, folderId: string | null) => void; onDelete: (f: DocFile) => void;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <div className="row-c flex-wrap">
      <span className="flex shrink-0" style={{ color: "var(--pal-primary)" }}><FileText size={17} strokeWidth={1.7} /></span>
      <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{file.title}</div>
        <div className="mt-0.5" style={{ fontSize: 11.5, color: PAL.muted, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {refChip(file.reference_code)}
          <span>{file.source === "composed" ? "Composé" : "Importé"} · {new Date(file.created_at).toLocaleDateString("fr-FR")}</span>
        </div>
      </div>
      {moving ? (
        <select
          autoFocus defaultValue={file.folder_id ?? ""} onBlur={() => setMoving(false)}
          onChange={e => { onMove(file, e.target.value || null); setMoving(false); }}
          className="u-input" style={{ padding: "6px 8px", border: `1px solid ${PAL.line}`, borderRadius: 8, fontFamily: sans, fontSize: 12, background: PAL.paper }}
        >
          <option value="">— Non classé —</option>
          {folders.map(f => <option key={f.id} value={f.id}>{"— ".repeat(f.depth)}{f.name}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setMoving(true)} className="btn-c btn-c-sm btn-c-ghost" title="Déplacer"><Move size={13} strokeWidth={1.7} /></button>
      )}
      <button type="button" onClick={() => onOpen(file)} className="btn-c btn-c-sm btn-c-ghost">Ouvrir</button>
      {file.source === "composed" && (
        <button type="button" onClick={() => onEdit(file)} className="btn-c btn-c-sm btn-c-ghost" title="Modifier"><Pencil size={13} strokeWidth={1.7} /></button>
      )}
      <button type="button" onClick={() => onDelete(file)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
    </div>
  );
}

/* ─── A single folder row (presentational — the 3-level nesting below calls this at each level) ─── */
function FolderRow({ folder, expanded, active, onToggle, onSelect, onRename, onAddChild, onDelete }: {
  folder: DocFolder; expanded: boolean; active: boolean;
  onToggle: () => void; onSelect: () => void; onRename: () => void; onAddChild: (() => void) | null; onDelete: () => void;
}) {
  return (
    <div
      className="row-c flex-wrap"
      style={{ cursor: "pointer", background: active ? "var(--pal-pale)" : undefined, borderRadius: 10 }}
      onClick={onToggle}
    >
      <span className="flex shrink-0" style={{ color: PAL.primary }}>
        {expanded ? <FolderOpen size={18} strokeWidth={1.7} /> : <Folder size={18} strokeWidth={1.7} />}
      </span>
      <div className="min-w-0 flex-1" style={{ minWidth: 140 }} onClick={e => { e.stopPropagation(); onSelect(); }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: PAL.ink }}>{folder.name}</div>
        <div className="mt-0.5">{refChip(folder.reference_code)}</div>
      </div>
      {onAddChild && (
        <button type="button" onClick={e => { e.stopPropagation(); onAddChild(); }} className="btn-c btn-c-sm btn-c-ghost" title="Nouveau sous-dossier"><FolderPlus size={13} strokeWidth={1.7} /></button>
      )}
      <button type="button" onClick={e => { e.stopPropagation(); onRename(); }} style={{ background: "none", border: 0, cursor: "pointer", color: PAL.muted }} title="Renommer"><Pencil size={13} strokeWidth={1.7} /></button>
      <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--pal-danger)" }} title="Supprimer"><Trash2 size={14} strokeWidth={1.7} /></button>
      <ChevronDown size={15} strokeWidth={1.8} style={{ color: PAL.muted, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
    </div>
  );
}

export function FolderLibraryTab({ onPreview }: { onPreview: (p: Preview) => void }) {
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState<{ open: boolean; editing: DocFolder | null; parentId: string | null }>({ open: false, editing: null, parentId: null });
  const [importModal, setImportModal] = useState(false);
  const [composeModal, setComposeModal] = useState<{ open: boolean; editing: DocFile | null }>({ open: false, editing: null });

  async function loadAll() {
    setLoading(true);
    try {
      const [f, d] = await Promise.all([api.get("/api/document-library/folders"), api.get("/api/document-library/files")]);
      setFolders(f); setFiles(d);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll(); }, []);

  const childrenOf = (parentId: string | null) => folders.filter(f => f.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
  const filesIn = (folderId: string | null) => files.filter(f => f.folder_id === folderId).sort((a, b) => a.title.localeCompare(b.title));

  function descendantFolderIds(rootId: string): string[] {
    const byParent = new Map<string | null, string[]>();
    for (const f of folders) byParent.set(f.parent_id, [...(byParent.get(f.parent_id) ?? []), f.id]);
    const out: string[] = [];
    let frontier = [rootId];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) { const kids = byParent.get(id) ?? []; out.push(...kids); next.push(...kids); }
      frontier = next;
    }
    return out;
  }

  function toggle(id: string) {
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const flatFolders = folders.slice().sort((a, b) => a.name.localeCompare(b.name));
  const activeFolder = activeFolderId ? folders.find(f => f.id === activeFolderId) ?? null : null;
  const activeLabel = activeFolder ? activeFolder.name : "Racine (non classé)";

  async function createFolder(name: string) {
    await api.post("/api/document-library/folders", { name, parent_id: folderModal.parentId });
    toast.success("Dossier créé.");
    loadAll();
  }
  async function renameFolder(name: string) {
    if (!folderModal.editing) return;
    await api.patch(`/api/document-library/folders/${folderModal.editing.id}`, { name });
    toast.success("Dossier renommé.");
    loadAll();
  }
  async function deleteFolder(folder: DocFolder) {
    const descendants = descendantFolderIds(folder.id);
    const folderIds = [folder.id, ...descendants];
    const fileCount = files.filter(f => f.folder_id && folderIds.includes(f.folder_id)).length;
    const msg = descendants.length || fileCount
      ? `Supprimer « ${folder.name} » et ${descendants.length} sous-dossier(s) contenant ${fileCount} document(s) ? Tout sera supprimé définitivement.`
      : `Supprimer le dossier « ${folder.name} » ?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/api/document-library/folders/${folder.id}`);
      toast.success("Dossier supprimé.");
      if (activeFolderId === folder.id) setActiveFolderId(null);
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }

  async function importFile(title: string, file: File) {
    const fd = new FormData();
    fd.append("title", title);
    if (activeFolderId) fd.append("folder_id", activeFolderId);
    fd.append("file", file);
    await api.uploadFile("/api/document-library/files/import", fd);
    toast.success("Fichier importé.");
    loadAll();
  }
  async function saveCompose(title: string, bodyHtml: string) {
    if (composeModal.editing) {
      await api.patch(`/api/document-library/files/${composeModal.editing.id}`, { title, body_html: bodyHtml });
    } else {
      await api.post("/api/document-library/files/compose", { folder_id: activeFolderId, title, body_html: bodyHtml });
    }
    toast.success("Document enregistré.");
    loadAll();
  }
  async function moveFile(file: DocFile, folderId: string | null) {
    try {
      await api.patch(`/api/document-library/files/${file.id}`, { folder_id: folderId });
      toast.success("Document déplacé.");
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du déplacement.");
    }
  }
  async function deleteFile(file: DocFile) {
    if (!window.confirm(`Supprimer « ${file.title} » ?`)) return;
    try {
      await api.delete(`/api/document-library/files/${file.id}`);
      toast.success("Document supprimé.");
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  }
  async function openFile(file: DocFile) {
    try {
      const res = await api.get(`/api/document-library/files/${file.id}/download`);
      if (res.signed_url) onPreview({ url: res.signed_url, title: file.title, isPdf: urlIsPdf(res.signed_url) });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'ouverture.");
    }
  }

  function renderFolder(folder: DocFolder) {
    const isExpanded = expanded.has(folder.id);
    return (
      <div key={folder.id}>
        <FolderRow
          folder={folder}
          expanded={isExpanded}
          active={activeFolderId === folder.id}
          onToggle={() => toggle(folder.id)}
          onSelect={() => setActiveFolderId(folder.id)}
          onRename={() => setFolderModal({ open: true, editing: folder, parentId: folder.parent_id })}
          onAddChild={folder.depth < MAX_DEPTH ? () => setFolderModal({ open: true, editing: null, parentId: folder.id }) : null}
          onDelete={() => deleteFolder(folder)}
        />
        {isExpanded && (
          <div style={{ marginLeft: INDENT, borderLeft: `1px solid ${PAL.line}`, paddingLeft: 10 }}>
            {filesIn(folder.id).map(f => (
              <FileRow key={f.id} file={f} folders={flatFolders} onOpen={openFile}
                onEdit={ff => setComposeModal({ open: true, editing: ff })} onMove={moveFile} onDelete={deleteFile} />
            ))}
            {childrenOf(folder.id).map(child => renderFolder(child))}
          </div>
        )}
      </div>
    );
  }

  const rootFolders = childrenOf(null);
  const unfiledFiles = filesIn(null);

  return (
    <div style={{ fontFamily: sans }}>
      {folderModal.open && (
        <FolderModal editing={folderModal.editing} onClose={() => setFolderModal({ open: false, editing: null, parentId: null })}
          onSave={folderModal.editing ? renameFolder : createFolder} />
      )}
      {importModal && (
        <ImportFileModal targetLabel={activeLabel} onClose={() => setImportModal(false)} onImport={importFile} />
      )}
      {composeModal.open && (
        <ComposeDocumentModal targetLabel={activeLabel} editing={composeModal.editing}
          onClose={() => setComposeModal({ open: false, editing: null })} onSaved={saveCompose} />
      )}

      <div className="dash-card" style={{ padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 13, color: PAL.muted }}>
          Ajouter dans : <b style={{ color: PAL.ink }}>{activeLabel}</b>
          {activeFolderId && (
            <button type="button" onClick={() => setActiveFolderId(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--pal-primary-deep)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Revenir à la racine
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setFolderModal({ open: true, editing: null, parentId: activeFolderId })} disabled={!!activeFolder && activeFolder.depth >= MAX_DEPTH} className="btn-c btn-c-sm btn-c-ghost">
            <FolderPlus size={13} strokeWidth={1.7} />Nouveau dossier
          </button>
          <button type="button" onClick={() => setImportModal(true)} className="btn-c btn-c-sm btn-c-ghost">
            <Upload size={13} strokeWidth={1.7} />Importer
          </button>
          <button type="button" onClick={() => setComposeModal({ open: true, editing: null })} className="btn-c btn-c-primary btn-c-sm">
            <PenSquare size={13} strokeWidth={1.7} />Composer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dash-card" style={{ padding: 26 }}><div className="shimmer" style={{ height: 18, width: 180, borderRadius: 999 }} /></div>
      ) : rootFolders.length === 0 && unfiledFiles.length === 0 ? (
        <div className="dash-card"><EmptyHint icon={<Folder size={26} strokeWidth={1.7} />} text="Aucun dossier ni document pour l'instant." /></div>
      ) : (
        <div className="dash-card overflow-hidden" style={{ padding: "6px 10px" }}>
          {rootFolders.map(f => renderFolder(f))}
          {unfiledFiles.length > 0 && (
            <>
              {rootFolders.length > 0 && <SectionLabel>Non classés</SectionLabel>}
              {unfiledFiles.map(f => (
                <FileRow key={f.id} file={f} folders={flatFolders} onOpen={openFile}
                  onEdit={ff => setComposeModal({ open: true, editing: ff })} onMove={moveFile} onDelete={deleteFile} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
