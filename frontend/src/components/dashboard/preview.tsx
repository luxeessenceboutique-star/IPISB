/**
 * Shared document preview modal — used by the Documents page and the
 * student detail page. Renders PDFs inline in an iframe; other formats
 * get a download link (browsers can't render docx inline).
 */
import { Download, ExternalLink, FileText, X } from "lucide-react";

const PAL = {
  ink:     "oklch(22% 0.025 175)",
  muted:   "oklch(48% 0.02 180)",
  primary: "oklch(48% 0.085 175)",
  line:    "oklch(88% 0.015 170)",
  paper:   "oklch(99% 0.005 160)",
};
const sans = '"Manrope", system-ui, sans-serif';

export type Preview = { url: string; title: string; isPdf: boolean };

export function urlIsPdf(url: string): boolean {
  // Signed URLs look like .../documents/<code>.pdf?token=… — the extension
  // sits in the path, before the query string.
  return /\.pdf$/i.test(url.split("?")[0]);
}

export function urlIsInlineViewable(url: string): boolean {
  return /\.(pdf|jpe?g|png)$/i.test(url.split("?")[0]);
}

export function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <div className="anim-fade" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(3px)", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop" style={{ background: PAL.paper, borderRadius: 16, width: "min(920px, 96vw)", height: preview.isPdf ? "min(88vh, 1100px)" : "auto", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${PAL.line}` }}>
          <FileText size={17} strokeWidth={1.7} style={{ color: PAL.primary, flexShrink: 0 }} />
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 14, color: PAL.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview.title}
          </div>
          <a href={preview.url} target="_blank" rel="noreferrer" title="Ouvrir dans un onglet" style={{ color: PAL.muted, display: "flex", padding: 6 }}>
            <ExternalLink size={15} strokeWidth={1.7} />
          </a>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ background: "transparent", border: 0, color: PAL.muted, cursor: "pointer", display: "flex", padding: 6 }}>
            <X size={17} strokeWidth={1.7} />
          </button>
        </div>
        {preview.isPdf ? (
          <iframe src={preview.url} title={preview.title} style={{ flex: 1, width: "100%", border: 0, background: "#525659" }} />
        ) : (
          <div style={{ padding: "36px 24px", textAlign: "center", fontFamily: sans, fontSize: 13, color: PAL.muted }}>
            L'aperçu intégré n'est pas disponible pour ce format.
            <div style={{ marginTop: 14 }}>
              <a href={preview.url} target="_blank" rel="noreferrer" className="btn-c btn-c-primary btn-c-sm" style={{ textDecoration: "none" }}>
                <Download size={13} strokeWidth={1.7} />Télécharger le document
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
