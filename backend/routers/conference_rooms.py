"""Salle de conférence — salles de visioconférence permanentes et réunions
instantanées pour le personnel, sur 8x8 JaaS (Jitsi authentifié).

Pas de table : les salles permanentes sont une liste fixe, et une réunion
instantanée n'est qu'un code aléatoire partagé par lien. Le jeton JaaS signé
par le serveur reste la seule clé d'entrée — un code ne suffit pas sans
compte du personnel.
"""
import re
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from deps import get_current_user, get_db, CurrentUser
from utils.jaas import generate_jaas_token, jaas_app_id, JaasNotConfigured

router = APIRouter(prefix="/conference-rooms", tags=["conference-rooms"])

STAFF_ROLES = {"admin", "professor", "rh", "assistant_rh", "comptabilite", "cashier", "accountant"}

# Salles permanentes. `roles` vide = tout le personnel.
ROOMS: list[dict] = [
    {
        "key": "principale",
        "name": "Salle principale",
        "description": "Réunions générales, conférences et événements de l'institut.",
        "roles": [],
    },
    {
        "key": "direction",
        "name": "Salle de direction",
        "description": "Comités de direction et instances de gouvernance.",
        "roles": ["admin"],
    },
    {
        "key": "pedagogie",
        "name": "Salle pédagogique",
        "description": "Conseils pédagogiques et coordination des formateurs.",
        "roles": ["admin", "professor"],
    },
    {
        "key": "administration",
        "name": "Salle administration",
        "description": "Points RH, comptabilité et services administratifs.",
        "roles": ["admin", "rh", "assistant_rh", "comptabilite", "cashier", "accountant"],
    },
]

# Code d'une réunion instantanée : 3 groupes de 4 caractères (ex. k7p2-9xqa-m4tz).
CODE_RE = re.compile(r"^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$")
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # sans 0/o/1/l/i, faciles à confondre


def _require_staff(user: CurrentUser) -> None:
    if not STAFF_ROLES.intersection(user.roles):
        raise HTTPException(403, "Réservé au personnel de l'institut")


def _can_enter(user: CurrentUser, room: dict) -> bool:
    return not room["roles"] or bool(set(room["roles"]).intersection(user.roles))


def _token_for(user: CurrentUser, db: Client, room_id: str, moderator: bool) -> dict:
    profile = db.from_("profiles").select("full_name").eq("id", user.id).execute().data or []
    name = (profile[0]["full_name"] if profile else None) or user.email or "Participant"
    try:
        token = generate_jaas_token(
            room=room_id, user_id=user.id, name=name, email=user.email, moderator=moderator,
            # Tout participant peut activer les sous-titres : le Copilote de
            # réunion s'en sert pour suivre la conversation.
            transcription=True,
        )
        app_id = jaas_app_id()
    except JaasNotConfigured as e:
        raise HTTPException(503, f"La visioconférence n'est pas configurée : {e}")
    return {"token": token, "app_id": app_id, "room": room_id, "display_name": name}


@router.get("")
async def list_rooms(user: Annotated[CurrentUser, Depends(get_current_user)]):
    _require_staff(user)
    return [
        {k: r[k] for k in ("key", "name", "description")} | {"restricted": bool(r["roles"])}
        for r in ROOMS if _can_enter(user, r)
    ]


@router.get("/instant/new")
async def new_instant_code(user: Annotated[CurrentUser, Depends(get_current_user)]):
    _require_staff(user)
    code = "-".join("".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(3))
    return {"code": code}


@router.get("/instant/{code}/token")
async def instant_token(
    code: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_staff(user)
    code = code.strip().lower()
    if not CODE_RE.match(code):
        raise HTTPException(400, "Code de réunion invalide (format : xxxx-xxxx-xxxx)")
    # Dans une réunion instantanée, tout le personnel présent est modérateur :
    # il n'y a pas d'organisateur enregistré côté serveur.
    return _token_for(user, db, f"ipisb-instant-{code}", moderator=True)


@router.get("/{key}/token")
async def room_token(
    key: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_staff(user)
    room = next((r for r in ROOMS if r["key"] == key), None)
    if not room:
        raise HTTPException(404, "Salle introuvable")
    if not _can_enter(user, room):
        raise HTTPException(403, "Accès à cette salle non autorisé")
    return _token_for(user, db, f"ipisb-salle-{room['key']}", moderator=user.is_admin())
