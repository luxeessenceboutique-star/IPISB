"""Rendu de texte arabe pour reportlab.

reportlab ne fait ni la mise en forme contextuelle des lettres arabes
(ligatures) ni la réorganisation bidirectionnelle (RTL) — les deux sont
indispensables pour qu'un texte arabe s'affiche autrement que comme des
lettres isolées dans le mauvais ordre. `arabic_reshaper` fait la
première étape, `python-bidi` la seconde.

reportlab.platypus.Paragraph fait aussi sa propre justification de
texte en LTR (retour à la ligne mot par mot, de gauche à droite) : lui
donner du texte déjà réordonné pour un RENDU RTL casserait dès qu'il
faudrait couper sur plusieurs lignes (chaque ligne serait réordonnée
comme si elle finissait le paragraphe). `ArabicParagraph` ci-dessous
contourne le problème en faisant son propre retour à la ligne (par mot,
mesuré sur le texte arabe brut) AVANT de réorganiser chaque ligne
individuellement pour l'affichage — un Flowable minimal mais qui
s'intègre normalement dans la pagination automatique de reportlab.
"""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Flowable

FONT_DIR = Path(r"C:\Windows\Fonts")
FONT_REGULAR = "Tahoma-AR"
FONT_BOLD = "Tahoma-AR-Bold"

_registered = False


def ensure_arabic_font() -> None:
    """Enregistre Tahoma (bon rendu arabe, présent sur ce poste Windows) —
    idempotent, sans effet après le premier appel."""
    global _registered
    if _registered:
        return
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(FONT_DIR / "tahoma.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_DIR / "tahomabd.ttf")))
    _registered = True


def ar(text: str) -> str:
    """Reshape + réordonne pour un rendu correct en une seule ligne
    (drawString/drawRightString) — jamais pour du texte qui sera encore
    coupé en plusieurs lignes après cet appel (voir ArabicParagraph)."""
    return get_display(arabic_reshaper.reshape(text))


class ArabicParagraph(Flowable):
    """Un bloc de texte arabe qui se coupe lui-même sur plusieurs lignes
    (mesurées sur le texte brut, avant mise en forme) et réordonne
    chaque ligne indépendamment au moment du dessin — pas de balisage
    interne (gras/italique) : un ArabicParagraph entier est dans une
    seule graisse, utiliser plusieurs instances pour mélanger les styles."""

    def __init__(self, text: str, font_size: float = 10.5, leading: float | None = None,
                 bold: bool = False, color=(0.25, 0.25, 0.25), align: str = "right",
                 space_after: float = 0):
        super().__init__()
        ensure_arabic_font()
        self.text = text
        self.font_name = FONT_BOLD if bold else FONT_REGULAR
        self.font_size = font_size
        self.leading = leading or font_size * 1.5
        self.color = color
        self.align = align
        self.space_after = space_after
        self._lines: list[str] = []
        self.width = 0.0
        self.height = 0.0

    def wrap(self, avail_width, avail_height):
        words = self.text.split(" ")
        lines: list[str] = []
        current: list[str] = []
        for word in words:
            trial = " ".join(current + [word])
            w = pdfmetrics.stringWidth(trial, self.font_name, self.font_size)
            if w <= avail_width or not current:
                current.append(word)
            else:
                lines.append(" ".join(current))
                current = [word]
        if current:
            lines.append(" ".join(current))
        self._lines = lines
        self.width = avail_width
        self.height = len(lines) * self.leading + self.space_after
        return (self.width, self.height)

    def split(self, avail_width, avail_height):
        # Coupe au nombre de lignes qui tient, renvoie le reste comme un
        # second ArabicParagraph — permet à une longue explication de
        # continuer sur la page de contenu suivante plutôt que de
        # déborder silencieusement hors du cadre.
        max_lines = max(int(avail_height // self.leading), 0)
        if max_lines <= 0 or max_lines >= len(self._lines):
            return []
        head = ArabicParagraph(" ".join(self._lines[:max_lines]), self.font_size, self.leading,
                                self.font_name == FONT_BOLD, self.color, self.align)
        tail = ArabicParagraph(" ".join(self._lines[max_lines:]), self.font_size, self.leading,
                                self.font_name == FONT_BOLD, self.color, self.align, self.space_after)
        return [head, tail]

    def draw(self):
        canv: Canvas = self.canv
        canv.saveState()
        canv.setFont(self.font_name, self.font_size)
        canv.setFillColorRGB(*self.color)
        x = self.width if self.align == "right" else 0
        draw_fn = canv.drawRightString if self.align == "right" else canv.drawString
        y_top = self.height - self.space_after
        for i, line in enumerate(self._lines):
            y = y_top - (i + 1) * self.leading + (self.leading - self.font_size) * 0.28
            draw_fn(x, y, ar(line))
        canv.restoreState()
