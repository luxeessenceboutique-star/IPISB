"""Rendu du manuel de formation PDF du module Comptabilité.

Fine couche au-dessus de utils/course_pdf.py plutôt qu'un moteur de rendu
réécrit : même charte, mêmes gabarits de page (couverture / sommaire /
page de chapitre / pages de contenu), même moteur markdown→flowables
(_block_flowables, gestion des tokens [[image:ID]], du DSL ```diagram
pour les encarts "Exemple concret" orange). Le manuel de formation n'est
jamais qu'un « cours » dont chaque « module » est une page de
Comptabilité — realiser render_course_pdf() directement garantit que ce
manuel a l'air produit par la même plateforme que les autres.

Pure rendu — aucune I/O. L'appelant doit fournir les images déjà lues en
bytes (voir generate_training_manual_pdf.py).
"""
from utils.course_pdf import render_course_pdf


def render_training_manual_pdf(chapters: list[dict]) -> bytes:
    """`chapters`: liste de dicts {tab_key, title, objectives, content, images}
    - objectives : texte multi-lignes (une ligne = un point clé), affiché
      sur la page de chapitre ("Ce que vous allez apprendre…").
    - content    : corps markdown de la page, avec tokens [[image:ID]] aux
      endroits où une capture doit s'insérer, et blocs ```diagram pour les
      encarts "Exemple concret" (cf. utils/course_pdf._parse_diagram_dsl).
    - images     : [{"id": str, "caption": str, "data": bytes}, ...]
    """
    course = {
        "code": None,
        "title": "Manuel d'utilisation — Module Comptabilité",
        "kind": "Manuel de formation",
        "secteur": "GESTION ADMINISTRATIVE & FINANCIÈRE",
        "semester": "Comptabilité · Direction Administrative & Financière",
    }
    modules = [
        {
            "title": ch["title"],
            "objectives": ch.get("objectives", ""),
            "lessons": [{
                "content": ch.get("content", ""),
                "images": ch.get("images", []),
            }],
        }
        for ch in chapters
    ]
    return render_course_pdf(course, modules)
