"""Annotation des captures Playwright pour le manuel de formation Comptabilité.

Lit output/raw/<tab>/annotations.json (produit par
frontend/tests/e2e/training-manual/capture.spec.ts) et, pour chaque PNG :
  - dessine un cadre + un badge numéroté (orange, charte des autres
    manuels PDF de cette plateforme) autour de chaque élément "cliquez ici" ;
  - si l'écran a au moins une annotation, produit en plus un recadrage
    zoomé autour de l'union des cibles (le recadrage part TOUJOURS de
    l'image déjà annotée en pleine résolution — jamais l'inverse, sinon
    il faudrait gérer un second espace de coordonnées).

Usage :
  cd backend && venv\\Scripts\\activate && python annotate_training_screenshots.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAW_DIR = Path(__file__).parent.parent / "frontend" / "tests" / "e2e" / "training-manual" / "output" / "raw"
OUT_DIR = Path(__file__).parent.parent / "frontend" / "tests" / "e2e" / "training-manual" / "output" / "annotated"

# Charte reprise de utils/slide_template_m101.py (numéros, encadrés).
ORANGE = (255, 120, 0)
ORANGE_SOFT = (255, 145, 43)
WHITE = (255, 255, 255)

BADGE_RADIUS = 15
BOX_PAD = 6
BOX_WIDTH = 4
CROP_MARGIN = 220
CROP_MIN_SIZE = (560, 300)

FONT_PATHS = [
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


BADGE_FONT = _load_font(18)


def annotate_screenshot(image: Image.Image, targets: list[dict]) -> Image.Image:
    """Dessine un cadre arrondi + un badge numéroté par cible, sur une copie."""
    out = image.convert("RGB")
    draw = ImageDraw.Draw(out)
    for t in targets:
        b = t["box"]
        x0, y0 = b["x"] - BOX_PAD, b["y"] - BOX_PAD
        x1, y1 = b["x"] + b["width"] + BOX_PAD, b["y"] + b["height"] + BOX_PAD
        draw.rounded_rectangle([x0, y0, x1, y1], radius=10, outline=ORANGE, width=BOX_WIDTH)

        # Badge numéroté ancré au coin supérieur gauche du cadre, à cheval
        # sur le bord pour rester lisible même quand la cible est petite.
        cx, cy = x0, y0
        draw.ellipse(
            [cx - BADGE_RADIUS, cy - BADGE_RADIUS, cx + BADGE_RADIUS, cy + BADGE_RADIUS],
            fill=ORANGE, outline=WHITE, width=2,
        )
        label = str(t["number"])
        tb = draw.textbbox((0, 0), label, font=BADGE_FONT)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        draw.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1]), label, font=BADGE_FONT, fill=WHITE)
    return out


def crop_with_context(image: Image.Image, targets: list[dict],
                       margin: int = CROP_MARGIN, min_size: tuple[int, int] = CROP_MIN_SIZE) -> Image.Image:
    """Recadre autour de l'union des cibles, avec marge, sur l'image déjà annotée."""
    xs0 = [t["box"]["x"] for t in targets]
    ys0 = [t["box"]["y"] for t in targets]
    xs1 = [t["box"]["x"] + t["box"]["width"] for t in targets]
    ys1 = [t["box"]["y"] + t["box"]["height"] for t in targets]
    x0, y0, x1, y1 = min(xs0) - margin, min(ys0) - margin, max(xs1) + margin, max(ys1) + margin

    # Applique la taille minimale en élargissant symétriquement si besoin.
    if x1 - x0 < min_size[0]:
        extra = (min_size[0] - (x1 - x0)) / 2
        x0, x1 = x0 - extra, x1 + extra
    if y1 - y0 < min_size[1]:
        extra = (min_size[1] - (y1 - y0)) / 2
        y0, y1 = y0 - extra, y1 + extra

    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(image.width, int(x1)), min(image.height, int(y1))
    return image.crop((x0, y0, x1, y1))


def process_tab(tab_dir: Path) -> int:
    sidecar = tab_dir / "annotations.json"
    if not sidecar.exists():
        return 0
    annotations = json.loads(sidecar.read_text(encoding="utf-8"))
    out_tab_dir = OUT_DIR / tab_dir.name
    out_tab_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for filename, targets in annotations.items():
        src = tab_dir / filename
        if not src.exists():
            print(f"[SKIP] {tab_dir.name}/{filename} — introuvable")
            continue
        image = Image.open(src)
        stem = src.stem
        full = annotate_screenshot(image, targets) if targets else image.convert("RGB")
        full.save(out_tab_dir / f"{stem}-full.png")
        if targets:
            crop = crop_with_context(full, targets)
            crop.save(out_tab_dir / f"{stem}-crop.png")
        count += 1
    return count


def main() -> None:
    if not RAW_DIR.exists():
        raise SystemExit(f"Aucune capture trouvée dans {RAW_DIR} — lancer d'abord capture.spec.ts.")
    total = 0
    for tab_dir in sorted(p for p in RAW_DIR.iterdir() if p.is_dir()):
        n = process_tab(tab_dir)
        print(f"[OK] {tab_dir.name} : {n} image(s) annotée(s)")
        total += n
    print(f"=== Terminé : {total} image(s) au total, sorties dans {OUT_DIR} ===")


if __name__ == "__main__":
    main()
