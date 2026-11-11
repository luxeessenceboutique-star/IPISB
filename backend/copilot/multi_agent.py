"""Copilote multi-agents (LangGraph + LangChain + Deep Agents).

Graphe orchestrateur :

    START → superviseur ─┬─ plateforme   (guide d'utilisation, sans données)
                         ├─ rh           (agent ReAct + outils RH en lecture)
                         ├─ comptabilite (agent ReAct + outils compta en lecture)
                         ├─ analyste     (Deep Agent : planification, sous-agents
                         │                RH / finances, synthèse)
                         └─ actions      (propose une action à confirmer)
                                         → END

- Le superviseur choisit UN agent selon la demande ET les droits réels de
  l'utilisateur (un agent métier n'est jamais choisi pour un rôle qui n'y a
  pas accès).
- Les outils de données sont en lecture seule et appellent les mêmes
  fonctions de routeur que l'interface (copilot/tools.py) : un rôle ne voit
  jamais plus que dans l'UI.
- Aucune écriture : l'agent « actions » ne fait que proposer ; l'exécution
  passe toujours par la confirmation explicite (/copilot/actions/{id}/confirm).
- Les nœuds publient leur progression via le flux « custom » de LangGraph :
  {"agent": …}, {"step": …}, {"todos": […]}, {"text": …}, {"action_proposal": …}.
"""
import json
import logging
from datetime import date
from typing import Any, Optional, TypedDict

from fastapi import HTTPException
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from openai import AsyncOpenAI
from supabase import Client

from deps import CurrentUser
from .agent import API_KEY, BASE_URL, CHAT_MODEL, FAST_MODEL, LANG_SYSTEM
from .actions import ACTIONS, build_tool_schemas, split_arguments, summarize_action, validate_body
from .knowledge import render_sections, role_label_for, sections_for_role
from .tools import FINANCE_TOOLS, RH_TOOLS, build_read_tools

log = logging.getLogger(__name__)

AGENTS: dict[str, dict[str, str]] = {
    "plateforme":   {"label": "Guide plateforme", "desc": "comment utiliser la plateforme, où trouver un écran, ce que fait un module, un problème d'utilisation, salutations"},
    "rh":           {"label": "Agent RH", "desc": "questions sur les DONNÉES RH : employés, congés, absences, effectifs, échéances RH"},
    "comptabilite": {"label": "Agent Comptabilité", "desc": "questions sur les DONNÉES comptables : dépenses, recettes, budgets, factures, demandes d'achat (DI/DA)"},
    "analyste":     {"label": "Analyste (Deep Agent)", "desc": "analyse approfondie en plusieurs étapes, bilan, rapport, comparaison ou synthèse croisant plusieurs domaines"},
    "actions":      {"label": "Agent Actions", "desc": "l'utilisateur demande d'EFFECTUER une action réelle : créer, modifier, supprimer, approuver, rejeter, payer"},
}

RH_ROLES = {"admin", "rh", "assistant_rh"}
FINANCE_ROLES = {"admin", "comptabilite", "cashier", "accountant"}


def allowed_agents(roles: list[str]) -> list[str]:
    r = set(roles)
    out = ["plateforme"]
    if r & RH_ROLES:
        out.append("rh")
    if r & FINANCE_ROLES:
        out += ["comptabilite", "actions"]
    if r & (RH_ROLES | FINANCE_ROLES):
        out.append("analyste")
    return out


class CopilotState(TypedDict, total=False):
    history: list[dict]          # [{role, content}] — conversation courante uniquement
    roles: list[str]
    language: str
    memory: str                  # mémoire à long terme rendue
    summary: str                 # résumé glissant de cette conversation
    force_agent: Optional[str]   # ex. « analyste » quand l'utilisateur active l'analyse approfondie
    agent: str
    answer: str
    meta: dict


def _llm(model: str = CHAT_MODEL, temperature: float = 0.3, max_tokens: int = 900, streaming: bool = True) -> ChatOpenAI:
    return ChatOpenAI(model=model, base_url=BASE_URL, api_key=API_KEY, temperature=temperature,
                      max_tokens=max_tokens, streaming=streaming)


def _context_block(state: CopilotState) -> str:
    roles = state.get("roles") or []
    parts = [
        LANG_SYSTEM.get(state.get("language", "fr"), LANG_SYSTEM["fr"]),
        f"Date du jour : {date.today().isoformat()}. Utilisateur : rôle **{role_label_for(roles)}**.",
    ]
    if state.get("memory"):
        parts.append(state["memory"])
    if state.get("summary"):
        parts.append("RÉSUMÉ DES ÉCHANGES PRÉCÉDENTS DE CETTE CONVERSATION :\n" + state["summary"])
    return "\n\n".join(parts)


def _knowledge(state: CopilotState) -> str:
    return render_sections(sections_for_role(state.get("roles") or []))


def _lc_history(state: CopilotState) -> list:
    msgs = []
    for m in state.get("history") or []:
        msgs.append(HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
    return msgs


def _last_user(state: CopilotState) -> str:
    return next((m["content"] for m in reversed(state.get("history") or []) if m["role"] == "user"), "")


# ── Superviseur ──────────────────────────────────────────────────────────────

async def supervisor_node(state: CopilotState) -> dict:
    writer = get_stream_writer()
    allowed = allowed_agents(state.get("roles") or [])
    forced = state.get("force_agent")
    if forced in allowed:
        choice = forced
    else:
        menu = "\n".join(f"- {k} : {AGENTS[k]['desc']}" for k in allowed)
        recent = "\n".join(f"{m['role']}: {m['content'][:400]}" for m in (state.get("history") or [])[-6:])
        try:
            resp = await _llm(FAST_MODEL, temperature=0, max_tokens=40, streaming=False).ainvoke([
                SystemMessage(
                    "Tu es le superviseur d'une équipe d'agents du Copilote IPISB (plateforme administrative). "
                    "Choisis l'agent le plus adapté au DERNIER message de l'utilisateur, en tenant compte de "
                    "la conversation. Agents disponibles pour cet utilisateur :\n" + menu +
                    '\n\nRéponds en JSON : {"agent": "<clé>"}'
                ),
                HumanMessage(recent),
            ], response_format={"type": "json_object"})
            choice = json.loads(resp.content or "{}").get("agent", "plateforme")
        except Exception as e:
            log.warning("Copilot supervisor failed: %s", e)
            choice = "plateforme"
        if choice not in allowed:
            choice = "plateforme"
    writer({"agent": {"key": choice, "label": AGENTS[choice]["label"]}})
    return {"agent": choice}


# ── Exécution d'un agent LangChain avec diffusion de la progression ──────────

TOOL_LABEL = {
    "agenda_echeances": "Consulte l'agenda de gestion",
    "synthese_comptable": "Consulte la synthèse comptable",
    "demandes_achat": "Consulte les demandes d'achat",
    "liste_employes": "Consulte la liste des employés",
    "demandes_conges": "Consulte les demandes de congé",
    "write_todos": "Planifie l'analyse",
    "task": "Délègue à un sous-agent",
}


def _unwrap(value: Any) -> Any:
    """Certaines mises à jour d'état arrivent enveloppées (Overwrite)."""
    if value is None or isinstance(value, (list, dict, str)):
        return value
    return getattr(value, "value", None)


async def _run_agent(agent, messages: list, writer, deep: bool = False) -> str:
    """Diffuse la réponse finale token par token (niveau racine uniquement —
    les sous-agents du Deep Agent travaillent en coulisse) et publie les
    étapes : outils consultés, plan (todos), délégations aux sous-agents."""
    answer = ""
    seen_calls: set[str] = set()
    root_depth: Optional[int] = None
    async for ns_raw, mode, chunk in agent.astream(
        {"messages": messages}, stream_mode=["messages", "updates"], subgraphs=True,
        config={"recursion_limit": 60 if deep else 25},
    ):
        # Lancé depuis un nœud du graphe parent, l'agent hérite de son espace de
        # noms : le niveau « racine » est la profondeur du premier événement,
        # tout ce qui est plus profond vient d'un sous-agent.
        if root_depth is None:
            root_depth = len(ns_raw)
        ns = len(ns_raw) > root_depth
        if mode == "messages":
            msg, meta = chunk
            if ns or not isinstance(msg, AIMessageChunk):
                continue
            text = msg.content if isinstance(msg.content, str) else "".join(
                p.get("text", "") for p in msg.content if isinstance(p, dict))
            if text:
                answer += text
                writer({"text": text})
        elif mode == "updates":
            for node_update in (chunk or {}).values():
                if not isinstance(node_update, dict):
                    continue
                todos = _unwrap(node_update.get("todos"))
                if todos and not ns:
                    writer({"todos": [{"content": t.get("content", ""), "status": t.get("status", "pending")} for t in todos]})
                for m in _unwrap(node_update.get("messages")) or []:
                    if isinstance(m, AIMessage) and m.tool_calls:
                        # Un tour avec appel d'outil n'est pas la réponse finale.
                        if not ns and answer:
                            writer({"reset": True})
                            answer = ""
                        for call in m.tool_calls:
                            if call["id"] in seen_calls:
                                continue
                            seen_calls.add(call["id"])
                            label = TOOL_LABEL.get(call["name"], call["name"])
                            if call["name"] == "task":
                                sub = (call.get("args") or {}).get("subagent_type", "")
                                label = f"Délègue à « {sub} »" if sub else label
                            if call["name"] != "write_todos":
                                writer({"step": {"label": label, "sub": bool(ns)}})
    return answer


# ── Agents ───────────────────────────────────────────────────────────────────

async def plateforme_node(state: CopilotState) -> dict:
    writer = get_stream_writer()
    system = (
        _context_block(state) + "\n\n"
        "Tu es le Guide de la plateforme IPISB Connect (plateforme ADMINISTRATIVE de l'institut). "
        "Tu aides à l'utiliser : navigation, fonctionnalités, où trouver quoi.\n\n"
        "MODULES ACCESSIBLES À CET UTILISATEUR (ne mentionne jamais un autre module) :\n\n"
        + _knowledge(state) + "\n\n"
        "RÈGLES : n'invente aucun bouton/onglet/champ absent de la liste ; pour un « comment faire », "
        "donne des étapes numérotées avec le chemin exact (ex. « Gestion → Ressources humaines → "
        "Congés ») ; pour un module hors de ses droits, dis-le et oriente vers un administrateur ; "
        "si tu ne sais pas, dis-le. Les comptes stagiaires sont gérés dans la plateforme pédagogique."
    )
    answer = ""
    async for chunk in _llm().astream([SystemMessage(system)] + _lc_history(state)):
        if chunk.content:
            answer += chunk.content
            writer({"text": chunk.content})
    return {"answer": answer}


def _specialist_prompt(state: CopilotState, domain: str) -> str:
    return (
        _context_block(state) + "\n\n"
        f"Tu es l'{AGENTS[domain]['label']} du Copilote IPISB. Tu réponds à partir des DONNÉES RÉELLES "
        "de la plateforme, obtenues avec tes outils (lecture seule). Appelle les outils nécessaires "
        "avant de répondre ; ne jamais inventer un chiffre, un nom ou une date. Si un outil répond "
        "« ACCÈS REFUSÉ », dis-le simplement. Réponse claire et structurée (listes, chiffres clés "
        "en **gras**), puis indique où voir le détail dans la plateforme. Tu ne modifies rien : pour "
        "une modification, propose à l'utilisateur de la demander explicitement."
    )


def _make_specialist(domain: str, tool_names: tuple[str, ...]):
    async def node(state: CopilotState, config) -> dict:
        writer = get_stream_writer()
        tools = config["configurable"]["read_tools"]
        agent = create_agent(_llm(), [tools[n] for n in tool_names], system_prompt=_specialist_prompt(state, domain))
        answer = await _run_agent(agent, _lc_history(state), writer)
        return {"answer": answer}
    return node


async def analyste_node(state: CopilotState, config) -> dict:
    """Deep Agent : planifie (todos), délègue aux sous-agents RH / finances,
    puis rédige une synthèse. Système de fichiers virtuel (état), aucun accès
    disque ni exécution de commande."""
    from deepagents import create_deep_agent

    writer = get_stream_writer()
    tools = config["configurable"]["read_tools"]
    roles = set(state.get("roles") or [])
    subagents = []
    if roles & RH_ROLES:
        subagents.append({
            "name": "analyste-rh",
            "description": "Analyse les données RH (employés, congés, échéances RH) et rend un compte rendu chiffré.",
            "system_prompt": "Tu es analyste RH. Utilise tes outils (lecture seule), n'invente rien, rends un compte rendu factuel et chiffré en français.",
            "tools": [tools[n] for n in RH_TOOLS],
        })
    if roles & FINANCE_ROLES:
        subagents.append({
            "name": "analyste-finances",
            "description": "Analyse les données comptables (synthèse, demandes d'achat, échéances) et rend un compte rendu chiffré.",
            "system_prompt": "Tu es analyste financier. Utilise tes outils (lecture seule), n'invente rien, rends un compte rendu factuel et chiffré en français.",
            "tools": [tools[n] for n in FINANCE_TOOLS],
        })
    own_tools = [tools["agenda_echeances"]]
    agent = create_deep_agent(
        model=_llm(max_tokens=1600),
        tools=own_tools,
        subagents=subagents,
        system_prompt=(
            _context_block(state) + "\n\n"
            "Tu es l'Analyste du Copilote IPISB, un agent d'analyse approfondie. Pour une demande "
            "complexe : 1) établis un plan court avec write_todos, 2) délègue la collecte aux "
            "sous-agents spécialisés (outil task), 3) rédige une synthèse finale structurée : "
            "constats chiffrés, points d'attention, recommandations concrètes. Lecture seule : tu ne "
            "modifies aucune donnée. N'invente aucun chiffre."
        ),
    )
    answer = await _run_agent(agent, _lc_history(state), writer, deep=True)
    return {"answer": answer}


async def actions_node(state: CopilotState, config) -> dict:
    """Propose UNE action (jamais exécutée ici) ou pose une question."""
    writer = get_stream_writer()
    cfg = config["configurable"]
    user: CurrentUser = cfg["user"]
    db: Client = cfg["db"]
    system = (
        _context_block(state) + "\n\nMODULES ACCESSIBLES :\n\n" + _knowledge(state) + "\n\n"
        "L'utilisateur souhaite EFFECTUER une action réelle. Un outil est fourni pour chaque action "
        "possible. Appelle-le seulement si tu as toutes les informations obligatoires — n'invente "
        "jamais une valeur (montant, identifiant, catégorie) ; sinon pose une question courte. "
        "L'action ne sera exécutée qu'après confirmation explicite de l'utilisateur : ne dis jamais "
        "qu'elle est déjà faite."
    )
    client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
    resp = await client.chat.completions.create(
        model=CHAT_MODEL, temperature=0.2, max_tokens=500,
        messages=[{"role": "system", "content": system}] + (state.get("history") or []),
        tools=build_tool_schemas(), tool_choice="auto",
    )
    choice = resp.choices[0]
    calls = choice.message.tool_calls or []
    if not calls:
        text = choice.message.content or "Pouvez-vous préciser l'action souhaitée ?"
        writer({"text": text})
        return {"answer": text}
    call = calls[0]
    spec = ACTIONS.get(call.function.name)
    if spec is None:
        text = "Action inconnue — reformulez votre demande."
        writer({"text": text})
        return {"answer": text}
    try:
        arguments: dict[str, Any] = json.loads(call.function.arguments or "{}")
        path_params, body_fields = split_arguments(spec, arguments)
        validated = validate_body(spec, body_fields)
    except (json.JSONDecodeError, HTTPException) as e:
        text = getattr(e, "detail", None) or "Je n'ai pas pu interpréter les paramètres — reformulez."
        writer({"text": str(text)})
        return {"answer": str(text)}
    missing = [p for p in spec.path_params if not path_params.get(p)]
    if missing:
        text = f"Il me manque : {', '.join(missing)}. Pouvez-vous préciser ?"
        writer({"text": text})
        return {"answer": text}
    clean_body = validated.model_dump(mode="json") if validated is not None else {}
    summary = summarize_action(spec, path_params, clean_body)
    pending = db.from_("copilot_pending_actions").insert({
        "user_id": user.id, "action_key": spec.key, "path_params": path_params,
        "payload": clean_body, "summary": summary,
    }).execute().data[0]
    proposal = {"id": pending["id"], "label": spec.label, "summary": summary}
    writer({"action_proposal": proposal})
    return {"answer": "", "meta": {"action": proposal}}


def build_graph():
    g = StateGraph(CopilotState)
    g.add_node("superviseur", supervisor_node)
    g.add_node("plateforme", plateforme_node)
    g.add_node("rh", _make_specialist("rh", RH_TOOLS))
    g.add_node("comptabilite", _make_specialist("comptabilite", FINANCE_TOOLS))
    g.add_node("analyste", analyste_node)
    g.add_node("actions", actions_node)
    g.add_edge(START, "superviseur")
    g.add_conditional_edges("superviseur", lambda s: s["agent"], {k: k for k in AGENTS})
    for k in AGENTS:
        g.add_edge(k, END)
    return g.compile()


copilot_team = build_graph()


async def stream_team(state: CopilotState, user: CurrentUser, db: Client):
    """Itère les événements « custom » publiés par les nœuds du graphe."""
    config = {"configurable": {"user": user, "db": db, "read_tools": build_read_tools(user, db)}}
    async for event in copilot_team.astream(state, config=config, stream_mode="custom"):
        yield event
