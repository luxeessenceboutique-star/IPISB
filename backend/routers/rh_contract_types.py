from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from deps import get_current_user, get_db, CurrentUser
from models import ContractTypeCreate, ContractTypeUpdate
from utils.audit import log_audit

router = APIRouter(prefix="/rh/contract-types", tags=["rh"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


@router.get("")
async def list_contract_types(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    res = db.from_("contract_types").select("*").order("name").execute()
    return res.data or []


@router.post("")
async def create_contract_type(
    body: ContractTypeCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    if not body.name.strip():
        raise HTTPException(400, "name is required")

    res = db.from_("contract_types").insert(body.model_dump(exclude_none=True)).execute()
    if not res.data:
        raise HTTPException(400, "Could not create contract type")

    ct = res.data[0]
    log_audit(db, user.id, "contract_type.create", "contract_type", ct["id"])
    return ct


@router.patch("/{ct_id}")
async def update_contract_type(
    ct_id: str,
    body: ContractTypeUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = db.from_("contract_types").update(updates).eq("id", ct_id).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    log_audit(db, user.id, "contract_type.update", "contract_type", ct_id, updates)
    return res.data[0]


@router.delete("/{ct_id}")
async def delete_contract_type(
    ct_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    _require_admin(user)
    existing = db.from_("contract_types").select("id").eq("id", ct_id).execute().data
    if not existing:
        raise HTTPException(404, "Not found")

    db.from_("contract_types").delete().eq("id", ct_id).execute()
    log_audit(db, user.id, "contract_type.delete", "contract_type", ct_id)
    return {"ok": True}
