import os
from functools import lru_cache
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

from utils.login_approval import enforce_login_gate
from permissions import Channel, ENTITY_CHANNELS, channel_for

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]
FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:5178")


@lru_cache(maxsize=1)
def _client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_db() -> Client:
    return _client()


_bearer = HTTPBearer(auto_error=True)


class CurrentUser:
    def __init__(self, id: str, email: str, roles: list[str]):
        self.id = id
        self.email = email
        self.roles = roles

    def is_admin(self) -> bool:
        return "admin" in self.roles

    def is_prof(self) -> bool:
        return "professor" in self.roles

    def is_cashier(self) -> bool:
        return "cashier" in self.roles

    def is_accountant(self) -> bool:
        return "accountant" in self.roles

    def is_rh(self) -> bool:
        return "rh" in self.roles

    def is_assistant_rh(self) -> bool:
        return "assistant_rh" in self.roles

    def is_comptabilite(self) -> bool:
        return "comptabilite" in self.roles

    def can_create(self) -> bool:
        return self.is_admin() or self.is_prof()

    def can_read_accounting(self) -> bool:
        """Admin/comptabilité (plein accès), comptable (lecture seule), caissier (saisie→validation)."""
        return self.is_admin() or self.is_comptabilite() or self.is_accountant() or self.is_cashier()

    def can_access_rh(self) -> bool:
        """Toute la plateforme RH (Employés, Congés, Recrutement…) — sauf Paie."""
        return self.is_admin() or self.is_rh() or self.is_assistant_rh()

    def can_access_rh_payroll(self) -> bool:
        """Paie / salaires — assistant_rh en est exclu (accès RH restreint)."""
        return self.is_admin() or self.is_rh()

    def can_access_accounting_full(self) -> bool:
        """Plein accès Comptabilité (équivalent admin) — hors RH/Cours."""
        return self.is_admin() or self.is_comptabilite()

    ADMIN_ASSIGNABLE_ROLES = ["professor", "rh", "assistant_rh", "comptabilite"]

    def assignable_roles(self) -> list[str]:
        """Rôles que cet utilisateur peut attribuer en créant un nouveau compte."""
        if self.is_admin():
            return list(self.ADMIN_ASSIGNABLE_ROLES)
        if self.is_prof():
            return ["student"]
        return []

    # ── Canaux de validation V1/V2 (permissions.py) ─────────────────────
    def has_v1_role(self, entity: str) -> bool:
        """V1 = le(s) rôle(s) métier qui exécute·nt normalement `entity`."""
        _, v1_roles = ENTITY_CHANNELS[entity]
        return any(r in self.roles for r in v1_roles)

    def can_act(self, entity: str, action: str, amount: float | None = None) -> bool:
        """Autorise `action` sur `entity` selon son canal (permissions.py).

        action ∈ {"create", "view", "edit", "export", "import",
        "validate_v1", "validate_v2", "cancel", "delete"}. V2 = admin,
        toujours. Si `entity` a un barème par montant
        (permissions.AMOUNT_TIERED_ENTITIES) et que `amount` est fourni, le
        canal effectif en dépend (ex. Demandes d'achat : ≤500 MAD → canal 1,
        500–10 000 → canal 2, >10 000 → canal 3) ; sinon le canal fixe du
        registre s'applique. Lève KeyError si `entity` n'est pas encore
        enregistrée — un router ne doit appeler ceci qu'une fois son entité
        déclarée dans permissions.py.
        """
        channel = channel_for(entity, amount)
        is_v1 = self.has_v1_role(entity)
        is_v2 = self.is_admin()

        if channel == Channel.SELF_VALIDATED:
            # V1 s'auto-valide entièrement ; V2 garde un accès de supervision
            # sur tout (Voir/Exporter/Annuler/Supprimer comme sur le reste).
            return is_v1 or is_v2

        if channel == Channel.V1_THEN_V2:
            if action in ("cancel", "delete", "validate_v2"):
                return is_v2
            if action == "validate_v1":
                return is_v1
            return is_v1 or is_v2  # create/view/export/import/edit partagés

        if channel == Channel.V2_ONLY:
            return is_v2

        return False


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: Annotated[Client, Depends(get_db)],
) -> CurrentUser:
    token = credentials.credentials
    try:
        resp = db.auth.get_user(token)
        if resp.user is None:
            raise ValueError("no user")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    uid = str(resp.user.id)
    roles_data = db.from_("user_roles").select("role").eq("user_id", uid).execute().data or []
    roles = [r["role"] for r in roles_data]
    enforce_login_gate(db, uid, resp.user.email or "", roles)
    return CurrentUser(id=uid, email=resp.user.email or "", roles=roles)
