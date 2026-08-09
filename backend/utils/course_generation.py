import io
import json
import logging
import os
import re

import pdfplumber
from docx import Document as DocxDocument
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from supabase import Client

log = logging.getLogger(__name__)

BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://toknroutertybot.tybotflow.com/")
API_KEY  = os.environ.get("OPENAI_API_KEY", "")
MODEL    = "gpt-4.1-mini"

LIBRARY_BUCKET = "reference-library"

# Extensions we can text-extract today. Legacy .doc (pre-2007 binary Word) is
# excluded on purpose — python-docx only reads OOXML (.docx) — so any
# CDC/programme still in .doc format is silently skipped here, not crashed
# on. Convert it to .docx once and it'll be picked up automatically.
_EXTRACTABLE = {".docx", ".pdf"}


def _client(temperature: float = 0.4) -> ChatOpenAI:
    return ChatOpenAI(model=MODEL, base_url=BASE_URL, api_key=API_KEY, temperature=temperature)


def _extract_text(data: bytes, filename: str) -> str | None:
    ext = os.path.splitext(filename)[1].lower()
    try:
        if ext == ".docx":
            doc = DocxDocument(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
            return "\n".join(parts)
        if ext == ".pdf":
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        log.warning("course_generation: failed to extract %s: %s", filename, e)
        return None
    return None  # unsupported extension (.doc, .xls, .xlsx for now)


def gather_grounding_text(
    db: Client,
    specialty_id: str | None,
    categories: list[str],
    char_budget: int = 12000,
) -> str:
    """Pull matching library_files (this filière's docs + any 'général' ones
    in the same categories), download from storage, extract text, and
    concatenate up to char_budget — cheapest docs first isn't meaningful
    here, so we just take rows in upload order and stop once the budget
    is spent, each chunk clearly labelled with its source title."""
    query = db.from_("library_files").select("*").in_("category", categories)
    if specialty_id:
        query = query.or_(f"specialty_id.eq.{specialty_id},specialty_id.is.null")
    else:
        query = query.is_("specialty_id", "null")
    rows = query.order("created_at").execute().data or []

    chunks: list[str] = []
    used = 0
    skipped: list[str] = []
    for row in rows:
        if used >= char_budget:
            break
        ext = os.path.splitext(row["file_path"])[1].lower()
        if ext not in _EXTRACTABLE:
            skipped.append(row["title"])
            continue
        try:
            data = db.storage.from_(LIBRARY_BUCKET).download(row["file_path"])
        except Exception as e:
            log.warning("course_generation: failed to download %s: %s", row["file_path"], e)
            continue
        text = _extract_text(data, row["file_path"])
        if not text:
            continue
        remaining = char_budget - used
        text = text[:remaining]
        chunk = f"--- Source : {row['title']} ({row['category']}) ---\n{text}"
        chunks.append(chunk)
        used += len(chunk)

    if skipped:
        log.info("course_generation: skipped non-extractable sources: %s", skipped)
    return "\n\n".join(chunks)


def _extract_json(text: str, expect: str = "array") -> object:
    pattern = r"\[.*\]" if expect == "array" else r"\{.*\}"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON {expect} found in model output")
    return json.loads(match.group(0))


def generate_module_outline(
    course_title: str, filiere_label: str, grounding: str, already_published: list[str] | None = None,
) -> list[dict]:
    """Stage 1: break ONE existing course/UF (e.g. 'Droit législation') into
    a sequence of teaching chapters — objectives + TH/TP hour split — grounded
    in that filière's CDC/programme/exam-bank material. Returns drafts only;
    caller persists as draft course_modules rows.

    `already_published`: titles of chapters already live for students. When
    given, the model extends the plan with what's still missing instead of
    re-covering the same ground — without this, regenerating after a partial
    publish produces a second "Introduction" chapter with no idea the first
    one already exists."""
    if already_published:
        published_block = (
            "\nCHAPITRES DÉJÀ PUBLIÉS POUR CE COURS (ne les recrée pas, ne les recouvre pas — génère "
            "UNIQUEMENT les chapitres qui manquent encore pour compléter le programme) :\n"
            + "\n".join(f"- {t}" for t in already_published) + "\n"
        )
    else:
        published_block = ""

    system = (
        "Tu es un ingénieur pédagogique dans un institut de formation paramédicale privé au Maroc, "
        "qui structure le contenu interne d'une unité de formation (UF) déjà définie dans le "
        "programme officiel, en s'appuyant sur les documents de référence fournis (cahier des "
        "charges, programme de formation, banque de questions d'examen).\n\n"
        f"UF à structurer : « {course_title} » — filière {filiere_label}.\n"
        f"{published_block}\n"
        "DOCUMENTS DE RÉFÉRENCE :\n"
        f"{grounding}\n\n"
        "Découpe cette UF en séquences pédagogiques (chapitres) cohérentes qui couvrent, au minimum, "
        "TOUS les sujets mentionnés dans les questions d'examen ci-dessus — ce sont les compétences "
        "que les stagiaires doivent maîtriser.\n\n"
        "RÈGLES STRICTES :\n"
        "- Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant/après, sans balises markdown.\n"
        "- Chaque élément : {\"title\": str, \"objectives\": str (1-2 phrases), "
        "\"hours_theory\": number, \"hours_practice\": number}.\n"
        "- 3 à 8 chapitres, dans un ordre pédagogique logique (notions de base avant notions avancées).\n"
        "- hours_practice à 0 si la matière est purement théorique (ex. droit).\n"
        "- Français clair, registre professionnel adapté à des formateurs.\n"
    )
    resp = _client(temperature=0.3).invoke([SystemMessage(content=system), HumanMessage(content="Génère le plan.")])
    raw = resp.content if isinstance(resp.content, str) else str(resp.content)
    items = _extract_json(raw, "array")

    cleaned = []
    for it in items:
        if not it.get("title"):
            continue
        cleaned.append({
            "title": str(it["title"]),
            "objectives": str(it.get("objectives") or ""),
            "hours_theory": float(it.get("hours_theory") or 0),
            "hours_practice": float(it.get("hours_practice") or 0),
        })
    if not cleaned:
        raise ValueError("La génération IA n'a produit aucun chapitre valide. Réessayez.")
    return cleaned


def generate_lesson_content(course_title: str, module_title: str, objectives: str, grounding: str) -> str:
    """Stage 2: full narrative lesson text (markdown) for ONE chapter,
    grounded in the same filière's reference material. This is a DRAFT —
    the caller must keep it unpublished until a qualified formateur has
    reviewed factual claims, especially anything legal/clinical.

    Deliberately pushed toward depth over brevity: this feeds a PDF read by
    students as their actual course material, not a slide deck — a chapter
    that's mostly bullet points reads as a summary of a course, not the
    course itself."""
    system = (
        "Tu es un formateur expérimenté et un expert du domaine, qui rédige un chapitre de cours "
        "complet et approfondi pour des stagiaires en formation paramédicale au Maroc (niveau "
        "avancé — l'équivalent d'un support de cours universitaire, pas une fiche de révision).\n\n"
        f"UF : « {course_title} »\n"
        f"Chapitre à rédiger : « {module_title} »\n"
        f"Objectif pédagogique visé : {objectives}\n\n"
        "DOCUMENTS DE RÉFÉRENCE (source prioritaire quand ils couvrent le sujet ; complète avec tes "
        "connaissances expertes du domaine pour tout ce qu'ils ne couvrent pas — le chapitre doit "
        "être complet même là où la documentation source est courte) :\n"
        f"{grounding}\n\n"
        "EXIGENCES DE FOND — c'est le critère le plus important :\n"
        "- L'unité de base du texte est le PARAGRAPHE rédigé : phrases complètes, articulées, qui "
        "expliquent le POURQUOI et le COMMENT (mécanismes, causes, conséquences, nuances, "
        "exceptions, liens entre notions) — pas seulement le QUOI.\n"
        "- Les listes à puces restent utiles et bienvenues, mais seulement pour ce qui EST "
        "réellement une liste : une classification, les étapes d'une procédure, des critères "
        "à cocher, une énumération d'exemples. N'utilise jamais une liste pour éviter de rédiger un "
        "paragraphe explicatif — le mélange naturel prose/liste d'un vrai manuel est l'objectif, pas "
        "l'élimination totale des listes.\n"
        "- Ajoute, aux endroits pertinents, les remarques qu'un formateur expérimenté ferait à "
        "l'oral et qu'on ne trouve pas dans un simple résumé : pièges et confusions fréquentes "
        "(« Attention à ne pas confondre... »), points qui reviennent souvent à l'examen, "
        "renvois à d'autres notions/chapitres du programme, mise en contexte marocain concrète "
        "(texte de loi, institution, pratique professionnelle réelle). Intègre-les dans le fil du "
        "texte (pas une liste séparée de 'astuces').\n"
        "- Illustre systématiquement avec des exemples concrets et des cas d'application "
        "professionnels ancrés dans le contexte marocain et dans la pratique du métier visé par "
        "cette filière.\n"
        "- Couvre le sujet en profondeur et intégralement au regard de l'objectif visé : ne laisse "
        "aucun sous-thème pertinent de côté sous prétexte qu'il n'apparaît pas dans les documents "
        "de référence.\n"
        "- Registre soutenu, vocabulaire technique précis et correctement défini à sa première "
        "occurrence — ce texte doit pouvoir servir de référence, pas seulement d'introduction.\n"
        "- Longueur : un chapitre de ce niveau fait normalement plusieurs centaines de mots par "
        "sous-section ; un chapitre entier en dessous de 900 mots est presque certainement trop "
        "superficiel pour cet objectif.\n\n"
        "SCHÉMAS : quand une section du chapitre EST fondamentalement une classification/typologie "
        "(ex. « les 3 types de X »), en plus de l'expliquer en prose, représente-la AUSSI comme un "
        "schéma visuel, avec ce format exact (bloc de code de langage `diagram`, 2 à 4 catégories, "
        "3 à 6 éléments courts par catégorie) :\n"
        "```diagram\n"
        "TITLE: <titre du schéma>\n"
        "CATEGORIE: <nom catégorie 1>\n"
        "- <élément court>\n"
        "- <élément court>\n"
        "CATEGORIE: <nom catégorie 2>\n"
        "- <élément court>\n"
        "```\n"
        "N'utilise ce format que pour une vraie classification/typologie centrale au chapitre (pas "
        "plus d'un ou deux schémas par chapitre) — jamais pour du texte qui devrait être un "
        "paragraphe.\n\n"
        "FORME : Markdown structuré (## et ### pour les sections, **gras** pour les termes clés à "
        "leur définition, tableaux pour les comparaisons/synthèses, blocs ```diagram comme décrit "
        "ci-dessus le cas échéant). Termine par une synthèse qui relie les notions entre elles (pas "
        "une simple liste récapitulative). "
        "Ne réponds qu'avec le contenu du cours, sans texte d'introduction ni commentaire méta.\n"
    )
    resp = _client(temperature=0.5).invoke([SystemMessage(content=system), HumanMessage(content="Rédige le chapitre, en profondeur.")])
    content = resp.content if isinstance(resp.content, str) else str(resp.content)
    content = content.strip()
    if not content:
        raise ValueError("La génération IA n'a produit aucun contenu. Réessayez.")
    return content
