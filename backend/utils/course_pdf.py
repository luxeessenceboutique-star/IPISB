"""Renders a course's PUBLISHED modules/lessons into a single multi-page PDF.

Deliberately NOT built on the canvas-drawing style in pdf_generators.py —
those are one-page forms with hand-placed x/y coordinates, fine for an
invoice but wrong for flowing, paginated, multi-thousand-word chapter text.
This uses reportlab's platypus (flowables) engine instead, which handles
text wrapping, page breaks, and tables automatically.

Pure rendering only — no network/storage I/O. Callers that want lesson
images embedded must pre-download them and attach as
lesson["images"] = [{"caption": str, "data": bytes}, ...] before calling
render_course_pdf (see routers/course_generation.py).
"""
import io
import re
from datetime import datetime
from html.parser import HTMLParser

import markdown
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, Image, ListFlowable, ListItem, PageBreak, Paragraph,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)

INK   = colors.HexColor("#1C2331")
MUTED = colors.HexColor("#6B6459")
RULE  = colors.HexColor("#D8D2C2")
GOLD  = colors.HexColor("#8A6A2F")
PAPER = colors.HexColor("#F8F6F0")
DIAGRAM_HEAD = colors.HexColor("#EDE8DC")

INLINE_TAG_MAP = {"strong": "b", "em": "i"}

CONTENT_WIDTH = A4[0] - 44 * mm  # page width minus left+right margins (22mm each)


# ─── Minimal HTML tree (html.parser gives events, not a tree — build one) ──
class _Node:
    __slots__ = ("tag", "attrs", "children")

    def __init__(self, tag: str, attrs: dict | None = None):
        self.tag = tag
        self.attrs = attrs or {}
        self.children: list = []  # list[_Node | str]


class _TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in ("br", "hr", "img"):
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(_Node(tag, dict(attrs)))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline_text(node: _Node) -> str:
    """Render a node's descendants as ReportLab's mini-markup (b/i/br)."""
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(_esc(child))
            continue
        if child.tag in INLINE_TAG_MAP:
            parts.append(f"<{INLINE_TAG_MAP[child.tag]}>{_inline_text(child)}</{INLINE_TAG_MAP[child.tag]}>")
        elif child.tag == "br":
            parts.append("<br/>")
        elif child.tag == "code":
            parts.append(f"<font face='Courier'>{_inline_text(child)}</font>")
        elif child.tag == "p":
            # markdown emits nested <p> inside "loose" <li> items — flatten
            # it into the same run rather than starting a new flowable.
            parts.append(_inline_text(child) + "<br/><br/>")
        else:
            parts.append(_inline_text(child))
    return "".join(parts).strip()


def _raw_text(node: _Node) -> str:
    """Plain-text content, no mini-markup — for parsing (not displaying) a
    fenced code block's contents."""
    parts = []
    for child in node.children:
        parts.append(child if isinstance(child, str) else _raw_text(child))
    return "".join(parts)


def _table_flowable(table_node: _Node, styles: dict) -> list:
    rows: list[list] = []
    header_idx = None
    for section in table_node.children:
        if isinstance(section, str):
            continue
        if section.tag == "thead":
            for tr in section.children:
                if isinstance(tr, str) or tr.tag != "tr":
                    continue
                rows.append([Paragraph(_inline_text(c), styles["th"]) for c in tr.children if not isinstance(c, str)])
                header_idx = len(rows) - 1
        elif section.tag == "tbody":
            for tr in section.children:
                if isinstance(tr, str) or tr.tag != "tr":
                    continue
                rows.append([Paragraph(_inline_text(c), styles["td"]) for c in tr.children if not isinstance(c, str)])
    if not rows:
        return []
    ncols = max(len(r) for r in rows)
    for r in rows:
        while len(r) < ncols:
            r.append(Paragraph("", styles["td"]))

    t = Table(rows, hAlign="LEFT", repeatRows=1 if header_idx == 0 else 0)
    cmds = [
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header_idx is not None:
        cmds.append(("BACKGROUND", (0, header_idx), (-1, header_idx), PAPER))
    t.setStyle(TableStyle(cmds))
    return [t, Spacer(1, 3 * mm)]


def _parse_diagram_dsl(text: str) -> dict | None:
    """Parses the ```diagram fenced-block mini-DSL the generation prompt
    asks the model for:
        TITLE: <title>
        CATEGORIE: <name>
        - <item>
        - <item>
        CATEGORIE: <name>
        - <item>
    Defensive: malformed input just yields fewer/empty categories rather
    than raising — a diagram that renders oddly beats one that 500s the PDF.
    """
    title = ""
    categories: list[dict] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.upper().startswith("TITLE:"):
            title = line.split(":", 1)[1].strip()
        elif line.upper().startswith("CATEGORIE:") or line.upper().startswith("CATÉGORIE:"):
            categories.append({"name": line.split(":", 1)[1].strip(), "items": []})
        elif line.startswith("-") and categories:
            categories[-1]["items"].append(line.lstrip("-").strip())
    if not categories:
        return None
    return {"title": title, "categories": categories}


def _diagram_flowable(spec: dict, styles: dict) -> list:
    """A classification/typology rendered as a row of headed cards — a real
    visual break from body text, and far more robust across page widths
    than freehand box/line drawing would be."""
    cats = spec["categories"][:4]  # keep it to what actually fits a page width
    cells = []
    for cat in cats:
        items_html = "<br/>".join(f"• {_esc(it)}" for it in cat["items"][:8])
        cell = Paragraph(f"<b>{_esc(cat['name'])}</b><br/><br/>{items_html}", styles["diagram_cell"])
        cells.append(cell)

    t = Table([cells], colWidths=[CONTENT_WIDTH / len(cells)] * len(cells), hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, GOLD),
        ("BACKGROUND", (0, 0), (-1, -1), DIAGRAM_HEAD),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    flowables = []
    if spec.get("title"):
        flowables.append(Paragraph(_esc(spec["title"]), styles["diagram_title"]))
    flowables += [t, Spacer(1, 3 * mm)]
    return flowables


def _image_flowables(images: list[dict], styles: dict) -> list:
    flowables = []
    for img in images:
        data = img.get("data")
        if not data:
            continue
        try:
            with PILImage.open(io.BytesIO(data)) as pi:
                w, h = pi.size
        except Exception:
            continue  # corrupt/unsupported file — skip rather than crash the whole PDF
        max_w, max_h = CONTENT_WIDTH, 100 * mm
        scale = min(max_w / w, max_h / h, 1.0)
        flowables.append(Spacer(1, 2 * mm))
        flowables.append(Image(io.BytesIO(data), width=w * scale, height=h * scale))
        if img.get("caption"):
            flowables.append(Paragraph(_esc(img["caption"]), styles["caption"]))
        flowables.append(Spacer(1, 3 * mm))
    return flowables


def _block_flowables(root: _Node, styles: dict) -> list:
    flowables = []
    for node in root.children:
        if isinstance(node, str):
            continue
        if node.tag == "h2":
            flowables += [Spacer(1, 5 * mm), Paragraph(_inline_text(node), styles["h2"])]
        elif node.tag == "h3":
            flowables += [Spacer(1, 4 * mm), Paragraph(_inline_text(node), styles["h3"])]
        elif node.tag == "h4":
            flowables += [Spacer(1, 3 * mm), Paragraph(_inline_text(node), styles["h4"])]
        elif node.tag == "p":
            txt = _inline_text(node)
            if txt:
                flowables += [Paragraph(txt, styles["body"]), Spacer(1, 2 * mm)]
        elif node.tag in ("ul", "ol"):
            items = [
                ListItem(Paragraph(_inline_text(li), styles["body"]), spaceAfter=2 * mm)
                for li in node.children if not isinstance(li, str) and li.tag == "li"
            ]
            if items:
                flowables += [
                    ListFlowable(items, bulletType="bullet" if node.tag == "ul" else "1", leftIndent=6 * mm),
                    Spacer(1, 2 * mm),
                ]
        elif node.tag == "hr":
            flowables += [Spacer(1, 2 * mm), HRFlowable(width="100%", thickness=0.5, color=RULE), Spacer(1, 2 * mm)]
        elif node.tag == "table":
            flowables += _table_flowable(node, styles)
        elif node.tag == "pre":
            code = next((c for c in node.children if not isinstance(c, str) and c.tag == "code"), None)
            lang = (code.attrs.get("class") or "") if code else ""
            raw = _raw_text(code) if code else _raw_text(node)
            if "diagram" in lang:
                spec = _parse_diagram_dsl(raw)
                if spec:
                    flowables += _diagram_flowable(spec, styles)
                # malformed diagram block: drop it silently rather than dump
                # the raw DSL as visible text in a student-facing PDF
            else:
                flowables += [Paragraph(f"<font face='Courier' size='8'>{_esc(raw)}</font>", styles["body"]), Spacer(1, 2 * mm)]
        elif node.tag in ("div", "root"):
            flowables += _block_flowables(node, styles)  # our own tbl-wrap-style wrappers, if any
    return flowables


def _styles() -> dict:
    return {
        "cover_inst":    ParagraphStyle("cover_inst", fontName="Helvetica-Bold", fontSize=13, textColor=INK, alignment=TA_CENTER, spaceAfter=2),
        "cover_sub":     ParagraphStyle("cover_sub", fontName="Helvetica", fontSize=9.5, textColor=MUTED, alignment=TA_CENTER),
        "cover_title":   ParagraphStyle("cover_title", fontName="Times-Bold", fontSize=25, textColor=INK, alignment=TA_CENTER, leading=31),
        "cover_foot":    ParagraphStyle("cover_foot", fontName="Helvetica-Oblique", fontSize=8.5, textColor=MUTED, alignment=TA_CENTER),
        "toc_h":         ParagraphStyle("toc_h", fontName="Helvetica-Bold", fontSize=10, textColor=MUTED, spaceAfter=6, tracking=1),
        "eyebrow":       ParagraphStyle("eyebrow", fontName="Helvetica-Bold", fontSize=8.5, textColor=GOLD, spaceAfter=2),
        "chap_title":    ParagraphStyle("chap_title", fontName="Times-Bold", fontSize=19, textColor=INK, leading=23, spaceAfter=3),
        "objective":     ParagraphStyle("objective", fontName="Helvetica-Oblique", fontSize=9.5, textColor=MUTED, spaceAfter=2, leading=13),
        "hours":         ParagraphStyle("hours", fontName="Helvetica-Bold", fontSize=8.5, textColor=GOLD, spaceAfter=4),
        "h2":            ParagraphStyle("h2", fontName="Times-Bold", fontSize=14.5, textColor=INK, leading=18, spaceAfter=3),
        "h3":            ParagraphStyle("h3", fontName="Times-Bold", fontSize=12.5, textColor=INK, leading=16, spaceAfter=3),
        "h4":            ParagraphStyle("h4", fontName="Helvetica-Bold", fontSize=10, textColor=MUTED, leading=13, spaceAfter=3),
        "body":          ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, textColor=INK, leading=15.5, alignment=TA_JUSTIFY),
        "th":            ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8.5, textColor=MUTED),
        "td":            ParagraphStyle("td", fontName="Times-Roman", fontSize=9.5, textColor=INK, leading=13),
        "diagram_title": ParagraphStyle("diagram_title", fontName="Helvetica-Bold", fontSize=9.5, textColor=GOLD, spaceAfter=3, alignment=TA_CENTER),
        "diagram_cell":  ParagraphStyle("diagram_cell", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=12.5),
        "caption":       ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=8, textColor=MUTED, alignment=TA_CENTER),
    }


def _footer(canvas, doc):
    canvas.saveState()
    width, _height = A4
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(20 * mm, 14 * mm, width - 20 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 10 * mm, "IPISB — document généré, à usage pédagogique interne")
    canvas.drawRightString(width - 20 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


# A professor places an image mid-chapter by leaving one of these tokens in
# the lesson text (the "Insérer ici" button in the editor writes it at the
# cursor position — see dashboard.courses.tsx). Markdown doesn't treat [[ ]]
# as anything special, so it survives the markdown→HTML pass as plain text
# inside a <p>; we split the RAW text on it before that pass instead, so it
# never has to round-trip through HTML at all.
IMAGE_TOKEN_RE = re.compile(r"\[\[image:([a-f0-9-]+)\]\]")


def _render_lesson_body(content: str, images: list[dict], styles: dict) -> list:
    """Splits the chapter's markdown on [[image:ID]] tokens and interleaves
    the referenced image at that exact point. Any image NOT referenced by a
    token (uploaded before this feature existed, or a token got deleted by
    accident) falls back to appearing after the text, so nothing silently
    disappears from the PDF."""
    images_by_id = {img["id"]: img for img in images if img.get("data")}
    used_ids: set[str] = set()
    flowables: list = []

    pieces = IMAGE_TOKEN_RE.split(content)  # [text, id, text, id, text, ...]
    for i, piece in enumerate(pieces):
        if i % 2 == 1:  # odd indices are captured image ids
            img = images_by_id.get(piece)
            if img:
                flowables += _image_flowables([img], styles)
                used_ids.add(piece)
            continue
        if not piece.strip():
            continue
        html = markdown.markdown(piece, extensions=["tables", "fenced_code"])
        tree = _TreeBuilder()
        tree.feed(html)
        flowables += _block_flowables(tree.root, styles)

    leftover = [img for img in images if img.get("id") not in used_ids]
    if leftover:
        flowables += _image_flowables(leftover, styles)
    return flowables


def render_course_pdf(course: dict, modules: list[dict]) -> bytes:
    """`modules` must already be filtered to status == 'published', each with
    its `lessons` list attached (see routers/course_generation.py list_modules
    for the shape) — this function doesn't filter, it just renders what it's
    given. A lesson may optionally carry `images`: [{"caption": str, "data":
    bytes}, ...], pre-downloaded by the caller (this module does no I/O)."""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=24 * mm, bottomMargin=22 * mm, leftMargin=22 * mm, rightMargin=22 * mm,
        title=course.get("title") or "Cours",
        author="IPISB",
    )

    story = []

    # ── Cover ──
    story.append(Spacer(1, 45 * mm))
    story.append(Paragraph("IPISB", styles["cover_inst"]))
    story.append(Paragraph(course.get("semester") or "", styles["cover_sub"]))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph(_esc(course.get("title") or ""), styles["cover_title"]))
    if course.get("code"):
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(_esc(course["code"]), styles["cover_sub"]))
    story.append(Spacer(1, 30 * mm))
    story.append(Paragraph(f"Document généré le {datetime.now().strftime('%d/%m/%Y')}", styles["cover_foot"]))
    story.append(PageBreak())

    # ── Sommaire ──
    story.append(Paragraph("SOMMAIRE", styles["toc_h"]))
    toc_items = [
        ListItem(Paragraph(f"{i:02d}.&nbsp;&nbsp;{_esc(m['title'])}", styles["body"]), spaceAfter=2 * mm)
        for i, m in enumerate(modules, start=1)
    ]
    story.append(ListFlowable(toc_items, bulletType="bullet", leftIndent=4 * mm))
    story.append(PageBreak())

    # ── Chapters ──
    for i, m in enumerate(modules, start=1):
        story.append(Paragraph(f"CHAPITRE {i:02d}", styles["eyebrow"]))
        story.append(Paragraph(_esc(m["title"]), styles["chap_title"]))
        if m.get("objectives"):
            story.append(Paragraph(_esc(m["objectives"]), styles["objective"]))
        hours = []
        if m.get("hours_theory"):
            hours.append(f"{m['hours_theory']:g}h théorie")
        if m.get("hours_practice"):
            hours.append(f"{m['hours_practice']:g}h pratique")
        if hours:
            story.append(Paragraph(" · ".join(hours), styles["hours"]))
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.7, color=GOLD))
        story.append(Spacer(1, 5 * mm))

        lessons = m.get("lessons") or []
        lesson = lessons[0] if lessons else None
        content = lesson.get("content") if lesson else None
        images = (lesson or {}).get("images") or []
        if content:
            story += _render_lesson_body(content, images, styles)
        else:
            story.append(Paragraph("(Contenu non disponible pour ce chapitre.)", styles["body"]))

        if i < len(modules):
            story.append(PageBreak())

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
