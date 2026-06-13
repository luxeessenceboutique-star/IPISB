import os
from functools import lru_cache
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

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

    def can_create(self) -> bool:
        return self.is_admin() or self.is_prof()

    def can_create_role(self) -> str | None:
        if self.is_admin():
            return "professor"
        if self.is_prof():
            return "student"
        return None


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
    return CurrentUser(id=uid, email=resp.user.email or "", roles=roles)
