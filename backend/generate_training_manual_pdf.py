"""Assemble le manuel de formation PDF du module Comptabilité.

Lit les captures annotées (Étapes 2-3 : frontend/tests/e2e/training-manual/
output/annotated/<tab>/…), les attache au manifeste de contenu
(training_manual_content.py) et appelle le renderer
(utils/training_manual_pdf.py) pour produire le PDF final.

Prérequis : avoir lancé, dans cet ordre —
  1. npx playwright test tests/e2e/training-manual/capture.spec.ts   (frontend/)
  2. python annotate_training_screenshots.py                        (backend/)
puis, depuis backend/ (venv actif) :
  python generate_training_manual_pdf.py
"""
from pathlib import Path

from training_manual_content import CHAPTERS
from utils.training_manual_pdf import render_training_manual_pdf

ANNOTATED_DIR = Path(__file__).parent.parent / "frontend" / "tests" / "e2e" / "training-manual" / "output" / "annotated"
OUTPUT_PDF = Path(__file__).parent / "Manuel_Comptabilite_IPISB.pdf"


def load_chapter_images(tab_key: str, images: list[dict]) -> list[dict]:
    loaded = []
    for img in images:
        path = ANNOTATED_DIR / tab_key / img["file"]
        if not path.exists():
            print(f"  [MANQUANT] {tab_key}/{img['file']} — image ignorée")
            continue
        loaded.append({"id": img["id"], "caption": img["caption"], "data": path.read_bytes()})
    return loaded


def main() -> None:
    if not ANNOTATED_DIR.exists():
        raise SystemExit(
            f"Aucune capture annotée trouvée dans {ANNOTATED_DIR}\n"
            "Lancer d'abord capture.spec.ts (frontend/) puis annotate_training_screenshots.py (backend/)."
        )

    chapters = []
    for ch in CHAPTERS:
        images = load_chapter_images(ch["tab_key"], ch["images"])
        print(f"[OK] {ch['title']} : {len(images)}/{len(ch['images'])} image(s)")
        chapters.append({
            "tab_key": ch["tab_key"],
            "title": ch["title"],
            "objectives": ch["objectives"],
            "content": ch["content"],
            "images": images,
        })

    print(f"\nAssemblage du PDF ({len(chapters)} chapitres)...")
    pdf_bytes = render_training_manual_pdf(chapters)
    OUTPUT_PDF.write_bytes(pdf_bytes)
    print(f"=== Terminé : {OUTPUT_PDF} ({len(pdf_bytes) / 1024:.0f} Ko) ===")


if __name__ == "__main__":
    main()
