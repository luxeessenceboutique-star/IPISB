"""
Fiche de poste — import assisté. Un document (PDF/DOCX/image) est lu et
structuré en grands titres / sous-titres pondérés en UN appel LLM, sur le
même principe que utils/employee_dossier.py (lecture, extraction, JSON
strict — rien n'est deviné). Le résultat n'est qu'une PROPOSITION : le
routeur (rh_job_descriptions.py) ne l'écrit qu'après un appel séparé et
explicite (« Appliquer »), pour laisser les RH revoir avant d'enregistrer.
"""
import json
import logging

from utils.dossier import _extract_file, _image_to_data_url
from utils.templates import MODEL, _client, _strip_markdown_json

log = logging.getLogger(__name__)

MAX_TEXT = 12000
MAX_IMAGES = 8


def _clean_headings(items) -> list[dict]:
    out = []
    for it in items or []:
        label = str((it or {}).get("label") or "").strip()
        if not label:
            continue
        try:
            coeff = float((it or {}).get("coefficient") or 1)
        except (TypeError, ValueError):
            coeff = 1.0
        if coeff <= 0:
            coeff = 1.0
        out.append({"label": label, "coefficient": coeff, "children": _clean_headings((it or {}).get("children"))})
    return out


def analyze_job_description_file(filename: str, content_type: str, data: bytes, department: str, position: str) -> dict:
    """Retourne {"mission": str | None, "headings": [{"label", "coefficient", "children": [...]}, ...]}."""
    try:
        text, images = _extract_file(filename, "fiche_poste", content_type, data, MAX_IMAGES)
    except Exception as e:
        raise ValueError(f"Lecture du fichier impossible : {e}")

    if text and text.strip():
        body = f"Contenu du document :\n{text.strip()[:MAX_TEXT]}"
    elif images:
        body = "(document fourni en image, voir les pages jointes)"
    else:
        raise ValueError("Aucun texte ni image exploitable dans ce fichier.")

    prompt = (
        "Tu es l'assistant RH de l'IPISB (El Jadida, Maroc). Voici une fiche de "
        f"poste pour le poste « {position} » (département « {department} »), "
        f"fournie via le fichier « {filename} ».\n\n{body}\n\n"
        "Ta mission : structurer son contenu en grands titres et sous-titres, "
        "tels qu'ils apparaissent dans le document (ex. « Missions principales », "
        "« Activités », « Compétences requises »…), chaque grand titre pouvant "
        "avoir des sous-points. Si le document indique une pondération / "
        "importance relative entre rubriques, reflète-la dans « coefficient » "
        "(nombre positif, 1 = poids normal) ; sinon mets 1 partout.\n\n"
        "Réponds UNIQUEMENT avec un JSON valide de la forme :\n"
        "{\n"
        '  "mission": "résumé de la mission générale du poste, 1-2 phrases, ou null si absente du document",\n'
        '  "headings": [{"label": "…", "coefficient": 1, "children": '
        '[{"label": "…", "coefficient": 1}, …]}, …]\n'
        "}\n\n"
        "N'invente rien : ne garde que ce qui est réellement dans le document. "
        "JSON :"
    )

    content: list[dict] = [{"type": "text", "text": prompt}]
    for img in images:
        content.append({"type": "image_url", "image_url": {"url": _image_to_data_url(img)}})

    resp = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": content}],
        temperature=0,
        max_tokens=2000,
    )
    raw = _strip_markdown_json(resp.choices[0].message.content or "{}")
    parsed = json.loads(raw)

    mission = str(parsed.get("mission") or "").strip() or None
    return {"mission": mission, "headings": _clean_headings(parsed.get("headings"))}
