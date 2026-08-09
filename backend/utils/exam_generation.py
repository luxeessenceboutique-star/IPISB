import json
import logging
import os
import re

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

log = logging.getLogger(__name__)

BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://toknroutertybot.tybotflow.com/")
API_KEY  = os.environ.get("OPENAI_API_KEY", "")
MODEL    = "gpt-4.1-mini"

# Real excerpts from IPAIS's own exam bank (Droit — Aide-Soignant 1ère année, and
# Gériatrie — Aide-Soignant 1ère année), used as grounding so generated questions
# match this institution's actual vocabulary, topic granularity, and register
# instead of a generic/textbook style.
FEW_SHOT_REFERENCE = """
--- Exemple réel 1 (UF Droit et législation, Aide-Soignant 1ère année) ---
Question posée : "Quelle est la différence entre droit objectif et droit subjectif ?"
Corrigé : "Le droit objectif : l'ensemble des règles juridiques régissant la vie en société et
sanctionnées par la puissance publique. Le droit subjectif : l'ensemble des prérogatives
attribuées à une personne par le droit."

--- Exemple réel 2 (UF Droit et législation, Aide-Soignant 1ère année) ---
Question posée : "Citez les 3 sanctions de la règle de droit ?"
Corrigé : "Les sanctions pénales (crimes, délits, contraventions) ; les sanctions administratives
(blâme, avertissement, abaissement d'échelon, radiation du tableau d'avancement)."

--- Exemple réel 3 (UF Soins d'hygiène et confort en Gériatrie, Aide-Soignant 1ère année) ---
Question posée : "Les troubles fonctionnels liés aux problèmes auditifs chez la personne âgée ?"
Corrigé : "La presbyacousie (surdité de sénescence, biologique), les acouphènes (sensations
auditives anormales : bourdonnement, sifflement), le bouchon de cérumen (accumulation de cire
dans le conduit auditif)."
""".strip()


def _client() -> ChatOpenAI:
    return ChatOpenAI(model=MODEL, base_url=BASE_URL, api_key=API_KEY, temperature=0.6)


def _extract_json_array(text: str) -> list:
    # Models sometimes wrap the array in ```json ... ``` despite instructions not to.
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON array found in model output")
    return json.loads(match.group(0))


def generate_mcq_questions(course_title: str, topic: str | None, num_questions: int) -> list[dict]:
    """Generate `num_questions` QCM items (question + 4 options + correct_index)
    for the given course, grounded in real IPAIS exam examples so the style,
    vocabulary and difficulty match this institution's actual exams rather
    than generic textbook questions."""
    num_questions = max(1, min(num_questions, 15))
    topic_line = f"Sujet précis demandé : {topic}\n" if topic else ""

    system = (
        "Tu es un formateur expérimenté dans un institut de formation paramédicale privé au Maroc "
        "(filières Aide-Soignant, Infirmier Auxiliaire, Infirmier Polyvalent), qui rédige des questions "
        "d'examen QCM (questionnaire à choix multiples).\n\n"
        "Voici des exemples RÉELS tirés des archives d'examens de cet institut, pour calibrer le "
        "niveau, le vocabulaire et la rigueur attendus (ce ne sont pas des QCM, mais ils montrent le "
        "registre à respecter) :\n\n"
        f"{FEW_SHOT_REFERENCE}\n\n"
        "Génère des questions à choix multiples ORIGINALES (jamais une copie des exemples ci-dessus) "
        "pour le cours suivant, dans ce même registre professionnel et pédagogique.\n\n"
        "RÈGLES STRICTES :\n"
        "- Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant/après, sans balises markdown.\n"
        "- Chaque élément : {\"question\": str, \"options\": [4 chaînes], \"correct_index\": int (0-3)}.\n"
        "- Une seule bonne réponse par question, les 3 autres options doivent être plausibles (pas absurdes).\n"
        "- Français clair, adapté à des stagiaires en formation paramédicale.\n"
    )
    user = (
        f"Cours : {course_title}\n"
        f"{topic_line}"
        f"Nombre de questions à générer : {num_questions}"
    )

    resp = _client().invoke([SystemMessage(content=system), HumanMessage(content=user)])
    raw = resp.content if isinstance(resp.content, str) else str(resp.content)

    try:
        items = _extract_json_array(raw)
    except Exception as e:
        log.error("Exam question generation: failed to parse model output: %s\nRaw: %s", e, raw)
        raise ValueError("La génération IA a échoué (réponse invalide). Réessayez.")

    cleaned = []
    for it in items[:num_questions]:
        options = it.get("options") or []
        if not isinstance(options, list) or len(options) != 4:
            continue
        idx = it.get("correct_index")
        if not isinstance(idx, int) or not (0 <= idx <= 3):
            continue
        if not it.get("question"):
            continue
        cleaned.append({"question": str(it["question"]), "options": [str(o) for o in options], "correct_index": idx})

    if not cleaned:
        raise ValueError("La génération IA n'a produit aucune question valide. Réessayez.")
    return cleaned
