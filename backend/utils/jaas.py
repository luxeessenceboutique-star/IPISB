import os
import time
from pathlib import Path
import jwt
from dotenv import load_dotenv

load_dotenv()

JAAS_APP_ID: str = os.environ["JAAS_APP_ID"]
JAAS_API_KEY_ID: str = os.environ["JAAS_API_KEY_ID"]

_default_key_path = Path(__file__).resolve().parent.parent / "secrets" / "jaas_private_key.pem"
JAAS_PRIVATE_KEY: str = Path(
    os.environ.get("JAAS_PRIVATE_KEY_PATH", str(_default_key_path))
).read_text()


def generate_jaas_token(
    room: str,
    user_id: str,
    name: str,
    email: str,
    moderator: bool,
    ttl_seconds: int = 3 * 60 * 60,
) -> str:
    """Build a signed JaaS JWT so the room is authenticated from the start,
    which removes meet.jit.si's 5-minute limit on anonymous group calls."""
    now = int(time.time())
    payload = {
        "aud": "jitsi",
        "iss": "chat",
        "sub": JAAS_APP_ID,
        "room": room,
        "iat": now,
        "nbf": now - 10,
        "exp": now + ttl_seconds,
        "context": {
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "moderator": moderator,
            },
            "features": {
                "livestreaming": moderator,
                "recording": moderator,
                "transcription": moderator,
                "outbound-call": False,
            },
        },
    }
    return jwt.encode(
        payload,
        JAAS_PRIVATE_KEY,
        algorithm="RS256",
        headers={"kid": JAAS_API_KEY_ID},
    )
