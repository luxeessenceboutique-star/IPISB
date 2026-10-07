"""Generic HTML -> ReportLab flowables conversion.

Extracted out of course_pdf.py (which used it to turn markdown-rendered
lesson HTML into a paginated course manual) so other PDF generators can
reuse the same HTML parser and block/inline renderer instead of writing a
second one — first reuse: the document library's "compose a document"
feature, which renders a Tiptap editor's HTML output into a lettered PDF.

No colours/fonts are hardcoded here — every visual choice comes from the
`styles: dict[str, ParagraphStyle]` dict passed in by the caller (same
keys course_pdf.py's own `_styles()` already provides: h1-h4, body, th,
td, table_grid_color, table_header_bg).

`pre_handler(lang, raw, styles) -> list | None` is an optional extension
point for callers that want special handling of a fenced ```lang block
(course_pdf.py uses it for its ```diagram mini-DSL) — return None to fall
through to the default plain-monospace rendering.
"""
from html.parser import HTMLParser
from typing import Callable

from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, ListFlowable, ListItem, Paragraph, Spacer, Table, TableStyle,
)

INLINE_TAG_MAP = {
    "strong": "b", "b": "b",
    "em": "i", "i": "i",
    "u": "u",
    "s": "strike", "strike": "strike",
}

PreHandler = Callable[[str, str, dict], "list | None"]


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
    """Render a node's descendants as ReportLab's mini-markup (b/i/u/strike/br)."""
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(_esc(child))
            continue
        if child.tag in INLINE_TAG_MAP:
            tag = INLINE_TAG_MAP[child.tag]
            parts.append(f"<{tag}>{_inline_text(child)}</{tag}>")
        elif child.tag == "br":
            parts.append("<br/>")
        elif child.tag == "code":
            parts.append(f"<font face='Courier'>{_inline_text(child)}</font>")
        elif child.tag == "p":
            # markdown/editors emit nested <p> inside "loose" <li> items —
            # flatten it into the same run rather than starting a new flowable.
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
        ("GRID", (0, 0), (-1, -1), 0.4, styles["table_grid_color"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header_idx is not None:
        cmds.append(("BACKGROUND", (0, header_idx), (-1, header_idx), styles["table_header_bg"]))
    t.setStyle(TableStyle(cmds))
    return [t, Spacer(1, 3 * mm)]


def _block_flowables(root: _Node, styles: dict, pre_handler: PreHandler | None = None) -> list:
    flowables = []
    for node in root.children:
        if isinstance(node, str):
            continue
        if node.tag == "h1":
            flowables += [Spacer(1, 6 * mm), Paragraph(_inline_text(node), styles.get("h1", styles["h2"]))]
        elif node.tag == "h2":
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
            flowables += [Spacer(1, 2 * mm), HRFlowable(width="100%", thickness=0.5, color=styles["table_grid_color"]), Spacer(1, 2 * mm)]
        elif node.tag == "table":
            flowables += _table_flowable(node, styles)
        elif node.tag == "pre":
            code = next((c for c in node.children if not isinstance(c, str) and c.tag == "code"), None)
            lang = (code.attrs.get("class") or "") if code else ""
            raw = _raw_text(code) if code else _raw_text(node)
            handled = pre_handler(lang, raw, styles) if pre_handler else None
            if handled is not None:
                flowables += handled
            else:
                flowables += [Paragraph(f"<font face='Courier' size='8'>{_esc(raw)}</font>", styles["body"]), Spacer(1, 2 * mm)]
        else:
            # Any other tag (our own "div"/"root" wrappers, or anything this
            # parser doesn't special-case) is treated as a transparent
            # container: recurse into its children instead of dropping them.
            # Losing formatting on an unrecognized tag is fine; silently
            # losing the content underneath it is not.
            flowables += _block_flowables(node, styles, pre_handler)
    return flowables
