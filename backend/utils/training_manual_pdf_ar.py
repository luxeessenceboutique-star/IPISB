"""Rendu de la version arabe du manuel de formation Comptabilité.

Réutilise la géométrie et les éléments de décor purement visuels de
utils/course_pdf.py (dot-grid, diamants, croix santé, fond sauge, carte,
logo, constantes de mise en page) — rien de tout ça n'est du texte, donc
rien n'a besoin d'être réécrit. Tout ce qui EST du texte, en revanche,
est redessiné ici avec le moteur arabe (utils/arabic_text.py : mise en
forme des lettres + réordonnancement RTL), car le pipeline texte de
course_pdf.py (Paragraph, styles Helvetica/Times) ne sait pas rendre
l'arabe correctement.

Les captures d'écran restent en français (c'est l'interface réelle de
l'application) — seul le texte explicatif autour est en arabe.
"""
import io
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, NextPageTemplate, PageBreak,
    PageTemplate, Spacer,
)

from utils.arabic_text import FONT_BOLD, FONT_REGULAR, ArabicParagraph, ar, ensure_arabic_font
from utils.course_pdf import (
    CARD_BOTTOM_Y, CARD_H, CARD_RIGHT, CARD_W, CARD_X, PAGE_H, PAGE_W, SIDEBAR_W, SIDEBAR_X,
    C_GREEN, C_GREEN_DEEP, C_INK, C_LINE, C_MUTED, C_ORANGE, C_PAPER, C_SAGE_1, C_SAGE_2,
    C_SAGE_BG, C_SKY_1, C_SKY_BG, C_TEAL_BAND,
    _card, _diamond, _dot_grid, _health_cross, _logo_at, _sage_backdrop, _y,
)

ensure_arabic_font()


# ─── Chrome text helpers (arabe, dessiné directement sur le canvas) ────────
def _ar_text_at(canvas: Canvas, text: str, font: str, size: float, color,
                 x_mm: float, top_mm: float, align: str = "right") -> None:
    canvas.setFont(font, size)
    canvas.setFillColor(color)
    fn = {"right": canvas.drawRightString, "left": canvas.drawString, "center": canvas.drawCentredString}[align]
    fn(x_mm * mm, _y(top_mm), ar(text))


class _ChapterMarker(Flowable):
    def __init__(self, number: int, title_ar: str):
        super().__init__()
        self.number, self.title_ar = number, title_ar
        self.width = self.height = 0

    def wrap(self, aw, ah):
        return (0, 0)

    def draw(self):
        self.canv._m101_ar_chapter_num = self.number
        self.canv._m101_ar_chapter_title = self.title_ar


def _chapter_ctx(canvas: Canvas) -> tuple[int, str]:
    return getattr(canvas, "_m101_ar_chapter_num", 1), getattr(canvas, "_m101_ar_chapter_title", "")


def _ar_sidebar_tab(canvas: Canvas, num: int) -> None:
    canvas.setFillColor(C_GREEN)
    canvas.roundRect(SIDEBAR_X, CARD_BOTTOM_Y, SIDEBAR_W, CARD_H, 1.5 * mm, fill=1, stroke=0)
    canvas.saveState()
    canvas.translate(SIDEBAR_X + SIDEBAR_W / 2, CARD_BOTTOM_Y + CARD_H / 2)
    canvas.rotate(90)
    canvas.setFillColor(colors.white)
    canvas.setFont(FONT_BOLD, 9.5)
    canvas.drawCentredString(0, -3, ar(f"الفصل {num}"))
    canvas.restoreState()


def _ar_pill_header(canvas: Canvas, kicker: str, subtitle: str) -> None:
    x, top, w, h = -6, 10, 128, 22
    canvas.setFillColor(C_PAPER)
    canvas.setStrokeColor(colors.HexColor("#C9C9C9"))
    canvas.setLineWidth(0.7)
    canvas.roundRect(x * mm, _y(top + h), w * mm, h * mm, h * mm / 2, fill=1, stroke=1)
    canvas.setFont(FONT_BOLD, 10.5)
    canvas.setFillColor(C_GREEN)
    canvas.drawCentredString((x + w / 2) * mm, _y(top + 8.5), ar(kicker))
    canvas.setFont(FONT_REGULAR, 8.5)
    canvas.setFillColor(C_GREEN_DEEP)
    canvas.drawCentredString((x + w / 2) * mm, _y(top + 17), ar(subtitle[:58]))


def _ar_footer(canvas: Canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(C_LINE)
    canvas.setLineWidth(0.4)
    canvas.line(SIDEBAR_X, _y(PAGE_H / mm - 14), CARD_RIGHT, _y(PAGE_H / mm - 14))
    canvas.setFont(FONT_REGULAR, 7.5)
    canvas.setFillColor(C_MUTED)
    canvas.drawCentredString(PAGE_W / 2, 10 * mm, ar("جميع الحقوق محفوظة · IPISB"))
    canvas.setFillColor(C_GREEN)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(SIDEBAR_X, 10 * mm, str(doc.page))
    canvas.restoreState()


# ─── Page templates ─────────────────────────────────────────────────────────
def _make_cover_page(title_ar: str, sub_ar: str):
    def on_page(canvas: Canvas, doc):
        canvas.saveState()
        canvas.setFillColor(C_PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        _dot_grid(canvas, 12, 14, 30, 24)
        _dot_grid(canvas, 12, 66, 30, 30)
        _logo_at(canvas, 12, 12, 20)
        _ar_text_at(canvas, "المعهد الخاص للابتكار في الصحة والرفاهية", FONT_BOLD, 11, C_INK, 190, 20, "right")
        _ar_text_at(canvas, "الجديدة · إدارة البحث وهندسة التكوين", FONT_REGULAR, 8, C_MUTED, 190, 27, "right")

        canvas.setStrokeColor(colors.HexColor("#2AB8A7"))
        canvas.setLineWidth(1.1)
        canvas.line((PAGE_W / mm - 62) * mm, _y(46), (PAGE_W / mm - 20) * mm, _y(46))
        _ar_text_at(canvas, "القطاع : الإدارة والشؤون المالية", FONT_BOLD, 9.5, C_GREEN, 190, 52, "right")
        _ar_text_at(canvas, "دليل تكويني", FONT_REGULAR, 9.5, C_INK, 190, 58.5, "right")

        _diamond(canvas, 60, 82, 34, colors.HexColor("#1E6FBF"))
        _diamond(canvas, 40, 68, 38, colors.HexColor("#17A08C"))
        _diamond(canvas, 36, 96, 30, C_ORANGE)
        _health_cross(canvas, 36, 96, 11)

        canvas.setFont(FONT_BOLD, 20)
        canvas.setFillColor(colors.white)
        title_lines = [title_ar[i:i + 26] for i in range(0, len(title_ar), 26)] or [title_ar]
        band_h = len(title_lines) * 9 + 16
        band_top_mm = 92
        canvas.setFillColor(C_TEAL_BAND)
        canvas.rect((PAGE_W / mm - 128) * mm, _y(band_top_mm) - band_h * mm, 128 * mm, band_h * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont(FONT_BOLD, 18)
        for i, line in enumerate(title_lines):
            canvas.drawRightString((PAGE_W / mm - 8) * mm, _y(band_top_mm) - (8 + (i + 1) * 9) * mm, ar(line))

        after_band_mm = band_top_mm + band_h + 8
        _ar_text_at(canvas, sub_ar, FONT_REGULAR, 11, C_INK, 190, max(160, after_band_mm), "right")

        canvas.setFillColor(C_MUTED)
        canvas.setFont(FONT_REGULAR, 7.5)
        from datetime import datetime
        canvas.drawRightString((PAGE_W / mm - 20) * mm, 16 * mm, ar(f"تم إنشاء هذا المستند بتاريخ {datetime.now().strftime('%d/%m/%Y')}"))
        canvas.restoreState()

    frame = Frame(PAGE_W - 2 * mm, PAGE_H - 2 * mm, 1, 1, id="cover")
    return PageTemplate(id="cover", frames=[frame], onPage=on_page)


def _make_sommaire_page():
    def on_page(canvas: Canvas, doc):
        canvas.saveState()
        canvas.setFillColor(C_PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(C_TEAL_BAND)
        canvas.rect(PAGE_W - 62 * mm, 0, 62 * mm, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.06))
        canvas.circle(PAGE_W - 10 * mm, PAGE_H - 20 * mm, 42 * mm, fill=1, stroke=0)
        _logo_at(canvas, PAGE_W / mm - 30, 16, 16)
        _ar_text_at(canvas, "الفهرس", FONT_BOLD, 13, colors.white, PAGE_W / mm - 14, 52, "right")
        canvas.restoreState()

    frame = Frame(20 * mm, 20 * mm, PAGE_W - 74 * mm - 20 * mm, PAGE_H - 55 * mm, id="sommaire", topPadding=0, leftPadding=0, rightPadding=0)
    return PageTemplate(id="sommaire", frames=[frame], onPage=on_page)


def _make_divider_page():
    def on_page(canvas: Canvas, doc):
        num, title_ar = _chapter_ctx(canvas)
        canvas.saveState()
        canvas.setFillColor(C_PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(C_SKY_BG)
        canvas.rect(PAGE_W - 70 * mm, 0, 70 * mm, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(C_SKY_1)
        canvas.circle(PAGE_W - 70 * mm, PAGE_H * 0.4, 50 * mm, fill=1, stroke=0)
        _logo_at(canvas, PAGE_W / mm - 28, 14, 16)
        _ar_text_at(canvas, f"الفصل {num:02d}", FONT_BOLD, 9, C_ORANGE, PAGE_W / mm - 12, 30, "right")
        canvas.setFont(FONT_BOLD, 19)
        canvas.setFillColor(C_GREEN)
        canvas.drawRightString((PAGE_W / mm - 12) * mm, _y(42), ar(title_ar))
        canvas.restoreState()

    frame = Frame(16 * mm, 26 * mm, PAGE_W - 78 * mm - 16 * mm, PAGE_H - 100 * mm, id="divider", topPadding=0, leftPadding=0, rightPadding=0)
    return PageTemplate(id="divider", frames=[frame], onPage=on_page)


def _make_content_page():
    def on_page(canvas: Canvas, doc):
        num, title_ar = _chapter_ctx(canvas)
        canvas.saveState()
        _sage_backdrop(canvas)
        _ar_pill_header(canvas, f"الفصل {num:02d}", title_ar)
        _logo_at(canvas, 15, 12, 15)
        _card(canvas)
        _ar_sidebar_tab(canvas, num)
        canvas.restoreState()
        _ar_footer(canvas, doc)

    frame = Frame(CARD_X + 4 * mm, CARD_BOTTOM_Y + 4 * mm, CARD_W - 8 * mm, CARD_H - 8 * mm,
                   id="content", topPadding=0, leftPadding=0, rightPadding=0, bottomPadding=0)
    return PageTemplate(id="content", frames=[frame], onPage=on_page)


# ─── Corps de chapitre : blocs typés → flowables ────────────────────────────
def _ar_image_flowable(img: dict) -> list:
    data = img.get("data")
    if not data:
        return []
    try:
        with PILImage.open(io.BytesIO(data)) as pi:
            w, h = pi.size
    except Exception:
        return []
    max_w, max_h = CARD_W, 95 * mm
    scale = min(max_w / w, max_h / h, 1.0)
    flowables = [Spacer(1, 2 * mm), Image(io.BytesIO(data), width=w * scale, height=h * scale)]
    if img.get("caption_ar"):
        flowables.append(ArabicParagraph(img["caption_ar"], font_size=8, color=(0.49, 0.49, 0.49), align="center"))
    flowables.append(Spacer(1, 3 * mm))
    return flowables


def _ar_example_flowable(lines: list[str]) -> list:
    box_lines = [ArabicParagraph("مثال واقعي", font_size=9.5, bold=True, color=(1, 0.47, 0), align="center"),
                 Spacer(1, 1 * mm)]
    box_lines += [ArabicParagraph(f"• {ln}", font_size=8.5, color=(0.25, 0.25, 0.25)) for ln in lines]
    return [Spacer(1, 2 * mm), _BoxedFlowables(box_lines), Spacer(1, 3 * mm)]


class _BoxedFlowables(Flowable):
    """Un cadre orange autour d'un petit groupe de flowables — équivalent
    du style de _diagram_flowable côté français, pour les encarts
    « مثال واقعي »."""

    def __init__(self, inner: list, pad: float = 6):
        super().__init__()
        self.inner = inner
        self.pad = pad * mm
        self.width = self.height = 0
        self._inner_w = 0

    def wrap(self, avail_width, avail_height):
        self._inner_w = avail_width - 2 * self.pad
        h = 0
        for f in self.inner:
            _, fh = f.wrap(self._inner_w, avail_height)
            h += fh
        self.width = avail_width
        self.height = h + 2 * self.pad
        return (self.width, self.height)

    def draw(self):
        canv = self.canv
        canv.setStrokeColor(C_ORANGE)
        canv.setFillColor(C_SAGE_1)
        canv.setLineWidth(0.8)
        canv.roundRect(0, 0, self.width, self.height, 2 * mm, fill=1, stroke=1)
        y = self.height - self.pad
        for f in self.inner:
            fw, fh = f.wrap(self._inner_w, self.height)
            f.drawOn(canv, self.pad, y - fh)
            y -= fh


def _blocks_to_flowables(blocks: list[dict], images_by_id: dict) -> list:
    flowables = []
    for b in blocks:
        t = b["type"]
        if t == "para":
            flowables += [ArabicParagraph(b["text"], font_size=10.5, space_after=2 * mm)]
        elif t == "heading":
            flowables += [Spacer(1, 3 * mm), ArabicParagraph(b["text"], font_size=13, bold=True,
                                                               color=(0, 0.47, 0.26), space_after=2 * mm)]
        elif t == "warning":
            flowables += [Spacer(1, 3 * mm),
                          ArabicParagraph(b["heading"], font_size=11.5, bold=True, color=(0.72, 0.25, 0), space_after=1.5 * mm),
                          ArabicParagraph(b["text"], font_size=10.5, space_after=2 * mm)]
        elif t == "example":
            flowables += _ar_example_flowable(b["lines"])
        elif t == "image":
            img = images_by_id.get(b["id"])
            if img:
                flowables += _ar_image_flowable(img)
    return flowables


def render_training_manual_pdf_ar(chapters: list[dict]) -> bytes:
    """`chapters`: [{title_ar, objectives_ar: list[str], blocks: list[dict],
    images: [{id, caption_ar, data}, ...]}, ...]"""
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4, title="دليل استخدام وحدة المحاسبة", author="IPISB",
        pageTemplates=[
            _make_cover_page("دليل استخدام وحدة المحاسبة", "المحاسبة · الإدارة والشؤون المالية"),
            _make_sommaire_page(),
            _make_divider_page(),
            _make_content_page(),
        ],
    )

    story: list = [NextPageTemplate("sommaire"), PageBreak()]
    for i, ch in enumerate(chapters, start=1):
        story.append(ArabicParagraph(f"{ch['title_ar']}  {i:02d}", font_size=11, bold=True, color=(1, 0.47, 0), space_after=3 * mm))

    for i, ch in enumerate(chapters, start=1):
        images_by_id = {img["id"]: img for img in ch.get("images", [])}
        story += [_ChapterMarker(i, ch["title_ar"])]
        story += [NextPageTemplate("divider"), PageBreak()]
        if ch.get("objectives_ar"):
            story.append(ArabicParagraph("ما ستتعلمه في هذا الفصل:", font_size=10, bold=True,
                                          color=(0, 0.47, 0.26), space_after=2 * mm))
            for obj in ch["objectives_ar"]:
                story.append(ArabicParagraph(f"• {obj}", font_size=10, space_after=1.5 * mm))

        story += [NextPageTemplate("content"), PageBreak(), _ChapterMarker(i, ch["title_ar"])]
        story.append(ArabicParagraph(ch["title_ar"], font_size=13.5, bold=True, color=(0, 0.47, 0.26), space_after=4 * mm))
        story += _blocks_to_flowables(ch.get("blocks", []), images_by_id)

    doc.build(story)
    return buf.getvalue()
