"""Briques de sécurité partagées : CORS strict, en-têtes, limitation de débit,
assainissement des filtres PostgREST et des cellules Excel.

Aucune dépendance externe : le limiteur de débit est en mémoire (par process).
Derrière un proxy (Railway), lancer uvicorn avec --proxy-headers pour que
request.client.host soit l'IP réelle du visiteur (voir Procfile).
"""
import os
import re
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import HTTPException, Request

ENV = os.environ.get("ENV", "development").lower()
IS_PRODUCTION = ENV == "production"


# ── CORS ────────────────────────────────────────────────────────────────
def build_allowed_origins(frontend_url: str) -> list[str]:
    """URL du frontend + (hors production seulement) les ports de dev locaux.
    EXTRA_ALLOWED_ORIGINS : liste séparée par des virgules, pour des URLs exactes
    supplémentaires (ex. un domaine de préproduction)."""
    origins = [frontend_url.rstrip("/")]
    origins += [o.strip().rstrip("/") for o in os.environ.get("EXTRA_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not IS_PRODUCTION:
        for host in ("localhost", "127.0.0.1"):
            for port in (3000, *range(5173, 5183)):
                origins.append(f"http://{host}:{port}")
    return origins


# ── En-têtes de sécurité ────────────────────────────────────────────────
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
}
if IS_PRODUCTION:
    SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"


# ── Limitation de débit (fenêtre glissante, en mémoire) ─────────────────
_hits: dict[str, deque] = defaultdict(deque)
_last_gc = 0.0


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(max_calls: int, per_seconds: int, scope: str) -> Callable:
    """Dépendance FastAPI : `dependencies=[Depends(rate_limit(5, 3600, "apply"))]`.
    Renvoie 429 au-delà de `max_calls` appels par IP sur `per_seconds`."""

    async def _dep(request: Request) -> None:
        global _last_gc
        now = time.monotonic()
        key = f"{scope}:{_client_ip(request)}"
        q = _hits[key]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= max_calls:
            raise HTTPException(429, "Trop de requêtes, réessayez plus tard.")
        q.append(now)
        # nettoyage périodique des clés inactives (évite la croissance mémoire)
        if now - _last_gc > 300:
            _last_gc = now
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)

    return _dep


# ── Assainissement ──────────────────────────────────────────────────────
_POSTGREST_UNSAFE = re.compile(r'[,()"\'\\*%]')


def sanitize_filter_term(term: str, max_len: int = 80) -> str:
    """Retire tout ce qui peut casser/injecter une clause PostgREST `.or_(...)`
    (virgules, parenthèses, guillemets, antislash, jokers * et %). Les points
    restent autorisés (adresses e-mail). À utiliser sur toute valeur utilisateur
    interpolée dans un filtre construit en texte."""
    return _POSTGREST_UNSAFE.sub("", (term or "").strip())[:max_len]


def validate_chat_messages(messages: list, max_items: int = 40, max_chars: int = 8000) -> list[dict]:
    """Historique de chat envoyé par le client : on n'accepte que les rôles
    user/assistant (jamais system/tool, qui permettraient de réécrire les
    consignes du modèle), du texte, et des tailles bornées. Ne garde que
    {role, content}. Lève ValueError (-> 422 via Pydantic) sinon."""
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages requis")
    if len(messages) > max_items:
        raise ValueError(f"trop de messages (max {max_items})")
    clean: list[dict] = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            raise ValueError("rôle de message invalide")
        content = m.get("content")
        if not isinstance(content, str) or len(content) > max_chars:
            raise ValueError(f"contenu invalide (texte de {max_chars} caractères maximum)")
        clean.append({"role": m["role"], "content": content})
    return clean


def neutralize_formula(value: str) -> str:
    """Empêche l'injection de formule Excel/CSV : une cellule texte commençant
    par = + - @ (ou tab/CR) est préfixée d'une apostrophe."""
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value
