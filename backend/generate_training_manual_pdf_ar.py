"""Assemble la version arabe du manuel de formation Comptabilité.

Même source d'images que la version française (les captures restent
en français — c'est l'interface réelle de l'application) — seul le
texte explicatif est traduit. Prérequis : avoir déjà lancé
capture.spec.ts (frontend/) et annotate_training_screenshots.py
(backend/), comme pour la version française.

Depuis backend/ (venv actif) :
  python generate_training_manual_pdf_ar.py
"""
from pathlib import Path

from training_manual_content_ar import CHAPTERS_AR
from utils.training_manual_pdf_ar import render_training_manual_pdf_ar

ANNOTATED_DIR = Path(__file__).parent.parent / "frontend" / "tests" / "e2e" / "training-manual" / "output" / "annotated"
OUTPUT_PDF = Path(__file__).parent / "Manuel_Comptabilite_IPISB_AR.pdf"


def load_chapter_images(tab_key: str, images: list[dict]) -> list[dict]:
    loaded = []
    for img in images:
        path = ANNOTATED_DIR / tab_key / img["file"]
        if not path.exists():
            print(f"  [MANQUANT] {tab_key}/{img['file']} — image ignorée")
            continue
        loaded.append({"id": img["id"], "caption_ar": img["caption_ar"], "data": path.read_bytes()})
    return loaded


def main() -> None:
    if not ANNOTATED_DIR.exists():
        raise SystemExit(
            f"Aucune capture annotée trouvée dans {ANNOTATED_DIR}\n"
            "Lancer d'abord capture.spec.ts (frontend/) puis annotate_training_screenshots.py (backend/)."
        )

    chapters = []
    for ch in CHAPTERS_AR:
        images = load_chapter_images(ch["tab_key"], ch["images"])
        print(f"[OK] {ch['title_ar']} : {len(images)}/{len(ch['images'])} image(s)")
        chapters.append({
            "title_ar": ch["title_ar"],
            "objectives_ar": ch["objectives_ar"],
            "blocks": ch["blocks"],
            "images": images,
        })

    print(f"\nAssemblage du PDF arabe ({len(chapters)} chapitres)...")
    pdf_bytes = render_training_manual_pdf_ar(chapters)
    OUTPUT_PDF.write_bytes(pdf_bytes)
    print(f"=== Terminé : {OUTPUT_PDF} ({len(pdf_bytes) / 1024:.0f} Ko) ===")


if __name__ == "__main__":
    main()
