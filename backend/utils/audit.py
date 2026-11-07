import logging
from typing import Any
from supabase import Client

log = logging.getLogger(__name__)


def log_audit(
    db: Client,
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Best-effort audit trail write — must never break the calling operation."""
    try:
        db.from_("audit_log").insert({
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "meta": meta,
        }).execute()
    except Exception:
        # Ne casse jamais l'opération appelante, mais une trace d'audit perdue doit se voir.
        log.exception("audit write failed: %s %s %s", action, entity_type, entity_id)
