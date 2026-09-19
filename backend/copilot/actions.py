"""
Registry of Comptabilité actions the copilot can PROPOSE and, once the user
explicitly confirms, EXECUTE for real.

Design constraints (all deliberate):
  - Every action here calls the exact same router function the frontend UI
    hits for that operation — imported directly, never reimplemented. Any
    validation, permission check (CurrentUser.can_*), audit log entry, or
    notification that function already does happens automatically. Nothing
    here duplicates business logic.
  - The copilot NEVER executes a mutating action itself. propose_action()
    only validates + stores a pending row (backend/copilot/knowledge.py's
    sibling table copilot_pending_actions, migration L70). execute_action()
    is only ever called from POST /copilot/actions/{id}/confirm, driven by
    an explicit user click — never from inside the LLM turn.
  - Execution always runs as the SAME CurrentUser who is chatting, using the
    SAME `db` client — so a cashier's confirmed action is still checked by
    the exact can_access_accounting_full()/is_admin()/etc. logic the real
    endpoint already enforces. This registry does not grant any permission
    the user didn't already have through the UI.
"""

from dataclasses import dataclass, field
from typing import Annotated, Any, Callable, Optional, Type
from fastapi import HTTPException
from pydantic import BaseModel
from supabase import Client

from deps import CurrentUser
from routers import (
    accounting_categories, accounting_suppliers, accounting_purchases,
    accounting_invoices, accounting_expenses, accounting_revenues,
    accounting_budgets, accounting_purchase_requests, accounting_quotations,
    accounting_receptions, accounting_cash_journal, accounting_cash_notes,
    accounting_mission_notes, accounting_cheques, accounting_inventory,
    accounting_inventory_categories, accounting_locaux,
)
from models import (
    CategoryCreate, CategoryUpdate, CategoryArticleCreate, CategoryArticleUpdate,
    SupplierCreate, SupplierUpdate,
    PurchaseUpdate,
    InvoiceCreate, InvoiceUpdate,
    ExpenseCreate, ExpenseUpdate,
    BudgetCreate, BudgetUpdate,
    RevenueCreate, RevenueUpdate,
    PurchaseRequestCreate, PurchaseRequestUpdate, DecisionInput, QuoteSelectInput,
    CashJournalEntryCreate, CashJournalEntryUpdate,
    CashNoteCreate, CashNoteUpdate, CashNotePay, ApprovalReject,
    MissionNoteCreate, MissionNoteUpdate,
    QuotationCreate, QuotationUpdate,
    PurchaseReceptionCreate, PurchaseReceptionUpdate, PurchaseReceptionValidation,
    InventoryItemCreate, InventoryItemUpdate, InventoryMovementCreate,
    InventoryCategoryCreate, InventoryCategoryUpdate,
    ChequeCreate, ChequeUpdate, ChequeStatusUpdate,
    LocalCreate, LocalUpdate,
)


@dataclass(frozen=True)
class ActionSpec:
    key: str                                   # unique, given to the LLM as the tool name
    func: Callable                              # the real router function — called as-is
    label: str                                  # short human label, e.g. "Créer une dépense"
    model: Optional[Type[BaseModel]] = None     # request body shape, or None if the action takes none
    path_params: tuple[str, ...] = field(default_factory=tuple)  # kwarg names func expects, e.g. ("expense_id",)
    domain: str = "accounting"                  # grouping only, for prompt organisation


# Chaque entrée mappe 1:1 à un endpoint réel (voir les routers importés
# ci-dessus) — mêmes noms de paramètres que la signature de la fonction.
ACTIONS: dict[str, ActionSpec] = {
    # ── Référentiels ──────────────────────────────────────────────────────
    "category.create": ActionSpec("category.create", accounting_categories.create_category, "Créer une catégorie", CategoryCreate),
    "category.update": ActionSpec("category.update", accounting_categories.update_category, "Modifier une catégorie", CategoryUpdate, ("category_id",)),
    "category.delete": ActionSpec("category.delete", accounting_categories.delete_category, "Supprimer une catégorie", None, ("category_id",)),
    "category_article.create": ActionSpec("category_article.create", accounting_categories.create_category_article, "Ajouter un article à une catégorie", CategoryArticleCreate, ("category_id",)),
    "category_article.update": ActionSpec("category_article.update", accounting_categories.update_category_article, "Modifier un article de catégorie", CategoryArticleUpdate, ("category_id", "article_id")),
    "category_article.delete": ActionSpec("category_article.delete", accounting_categories.delete_category_article, "Supprimer un article de catégorie", None, ("category_id", "article_id")),
    "supplier.create": ActionSpec("supplier.create", accounting_suppliers.create_supplier, "Créer un fournisseur", SupplierCreate),
    "supplier.update": ActionSpec("supplier.update", accounting_suppliers.update_supplier, "Modifier un fournisseur", SupplierUpdate, ("supplier_id",)),
    "supplier.delete": ActionSpec("supplier.delete", accounting_suppliers.delete_supplier, "Supprimer un fournisseur", None, ("supplier_id",)),
    "budget.create": ActionSpec("budget.create", accounting_budgets.create_budget, "Créer un budget", BudgetCreate),
    "budget.update": ActionSpec("budget.update", accounting_budgets.update_budget, "Modifier un budget", BudgetUpdate, ("budget_id",)),
    "budget.delete": ActionSpec("budget.delete", accounting_budgets.delete_budget, "Supprimer un budget", None, ("budget_id",)),
    "inventory_category.create": ActionSpec("inventory_category.create", accounting_inventory_categories.create_category, "Créer une catégorie d'inventaire", InventoryCategoryCreate),
    "inventory_category.update": ActionSpec("inventory_category.update", accounting_inventory_categories.update_category, "Modifier une catégorie d'inventaire", InventoryCategoryUpdate, ("cat_id",)),
    "inventory_category.delete": ActionSpec("inventory_category.delete", accounting_inventory_categories.delete_category, "Supprimer une catégorie d'inventaire", None, ("cat_id",)),
    "local.create": ActionSpec("local.create", accounting_locaux.create_local, "Créer un local (salle/installation)", LocalCreate),
    "local.update": ActionSpec("local.update", accounting_locaux.update_local, "Modifier un local", LocalUpdate, ("local_id",)),
    "local.delete": ActionSpec("local.delete", accounting_locaux.delete_local, "Supprimer un local", None, ("local_id",)),

    # ── Achats ────────────────────────────────────────────────────────────
    "purchase_request.create": ActionSpec("purchase_request.create", accounting_purchase_requests.create_request, "Créer une demande d'achat", PurchaseRequestCreate),
    "purchase_request.update": ActionSpec("purchase_request.update", accounting_purchase_requests.update_request, "Modifier une demande d'achat", PurchaseRequestUpdate, ("pr_id",)),
    "purchase_request.delete": ActionSpec("purchase_request.delete", accounting_purchase_requests.delete_request, "Supprimer une demande d'achat", None, ("pr_id",)),
    "purchase_request.need_decision": ActionSpec("purchase_request.need_decision", accounting_purchase_requests.need_decision, "Décider du besoin exprimé (valider/retourner/annuler)", DecisionInput, ("pr_id",)),
    "purchase_request.quote_decision": ActionSpec("purchase_request.quote_decision", accounting_purchase_requests.quote_decision, "Décider du devis retenu", QuoteSelectInput, ("pr_id",)),
    "purchase_request.revert": ActionSpec("purchase_request.revert", accounting_purchase_requests.revert_request, "Annuler la décision et revenir en attente", None, ("pr_id",)),
    "purchase_request.create_order": ActionSpec("purchase_request.create_order", accounting_purchase_requests.create_order, "Créer la commande à partir du devis retenu", None, ("pr_id",)),
    "quotation.create": ActionSpec("quotation.create", accounting_quotations.create_quotation, "Créer un devis pour une demande d'achat", QuotationCreate),
    "quotation.update": ActionSpec("quotation.update", accounting_quotations.update_quotation, "Modifier un devis", QuotationUpdate, ("quotation_id",)),
    "quotation.delete": ActionSpec("quotation.delete", accounting_quotations.delete_quotation, "Supprimer un devis", None, ("quotation_id",)),
    "purchase.update": ActionSpec("purchase.update", accounting_purchases.update_purchase, "Modifier une commande", PurchaseUpdate, ("purchase_id",)),
    "purchase.delete": ActionSpec("purchase.delete", accounting_purchases.delete_purchase, "Supprimer une commande", None, ("purchase_id",)),
    "purchase.validate_order": ActionSpec("purchase.validate_order", accounting_purchases.validate_order, "Valider une commande", None, ("purchase_id",)),
    "reception.create": ActionSpec("reception.create", accounting_receptions.create_reception, "Réceptionner une livraison", PurchaseReceptionCreate),
    "reception.update": ActionSpec("reception.update", accounting_receptions.update_reception, "Modifier une réception (contrôle qualité)", PurchaseReceptionUpdate, ("reception_id",)),
    "reception.delete": ActionSpec("reception.delete", accounting_receptions.delete_reception, "Supprimer une réception", None, ("reception_id",)),
    "reception.validate": ActionSpec("reception.validate", accounting_receptions.validate_reception, "Valider une anomalie qualité de réception (accepter/rejeter)", PurchaseReceptionValidation, ("reception_id",)),

    # ── Dépenses / Revenus / Factures ────────────────────────────────────
    "expense.create": ActionSpec("expense.create", accounting_expenses.create_expense, "Créer une dépense", ExpenseCreate),
    "expense.update": ActionSpec("expense.update", accounting_expenses.update_expense, "Modifier une dépense", ExpenseUpdate, ("expense_id",)),
    "expense.delete": ActionSpec("expense.delete", accounting_expenses.delete_expense, "Supprimer une dépense", None, ("expense_id",)),
    "revenue.create": ActionSpec("revenue.create", accounting_revenues.create_revenue, "Créer une recette", RevenueCreate),
    "revenue.update": ActionSpec("revenue.update", accounting_revenues.update_revenue, "Modifier une recette", RevenueUpdate, ("revenue_id",)),
    "revenue.delete": ActionSpec("revenue.delete", accounting_revenues.delete_revenue, "Supprimer une recette", None, ("revenue_id",)),
    "invoice.create": ActionSpec("invoice.create", accounting_invoices.create_invoice, "Créer une facture", InvoiceCreate),
    "invoice.update": ActionSpec("invoice.update", accounting_invoices.update_invoice, "Modifier une facture", InvoiceUpdate, ("invoice_id",)),
    "invoice.delete": ActionSpec("invoice.delete", accounting_invoices.delete_invoice, "Supprimer une facture", None, ("invoice_id",)),

    # ── Trésorerie ────────────────────────────────────────────────────────
    "cash_journal.create": ActionSpec("cash_journal.create", accounting_cash_journal.create_entry, "Créer une ligne de journal de caisse", CashJournalEntryCreate),
    "cash_journal.update": ActionSpec("cash_journal.update", accounting_cash_journal.update_entry, "Modifier une ligne de journal de caisse", CashJournalEntryUpdate, ("entry_id",)),
    "cash_journal.delete": ActionSpec("cash_journal.delete", accounting_cash_journal.delete_entry, "Supprimer une ligne de journal de caisse", None, ("entry_id",)),
    "cash_note.create": ActionSpec("cash_note.create", accounting_cash_notes.create_note, "Créer une note de caisse (avance)", CashNoteCreate),
    "cash_note.update": ActionSpec("cash_note.update", accounting_cash_notes.update_note, "Modifier une note de caisse", CashNoteUpdate, ("note_id",)),
    "cash_note.delete": ActionSpec("cash_note.delete", accounting_cash_notes.delete_note, "Supprimer une note de caisse", None, ("note_id",)),
    "cash_note.approve": ActionSpec("cash_note.approve", accounting_cash_notes.approve_note, "Approuver une note de caisse", None, ("note_id",)),
    "cash_note.reject": ActionSpec("cash_note.reject", accounting_cash_notes.reject_note, "Rejeter une note de caisse (motif obligatoire)", ApprovalReject, ("note_id",)),
    "cash_note.pay": ActionSpec("cash_note.pay", accounting_cash_notes.pay_note, "Marquer une note de caisse comme payée", CashNotePay, ("note_id",)),
    "mission_note.create": ActionSpec("mission_note.create", accounting_mission_notes.create_note, "Créer une note de frais de mission", MissionNoteCreate),
    "mission_note.update": ActionSpec("mission_note.update", accounting_mission_notes.update_note, "Modifier une note de frais de mission", MissionNoteUpdate, ("note_id",)),
    "mission_note.delete": ActionSpec("mission_note.delete", accounting_mission_notes.delete_note, "Supprimer une note de frais de mission", None, ("note_id",)),
    "mission_note.approve": ActionSpec("mission_note.approve", accounting_mission_notes.approve_note, "Approuver une note de frais de mission", None, ("note_id",)),
    "mission_note.reject": ActionSpec("mission_note.reject", accounting_mission_notes.reject_note, "Rejeter une note de frais de mission (motif obligatoire)", ApprovalReject, ("note_id",)),
    "mission_note.pay": ActionSpec("mission_note.pay", accounting_mission_notes.pay_note, "Marquer une note de frais de mission comme payée", CashNotePay, ("note_id",)),
    "cheque.create": ActionSpec("cheque.create", accounting_cheques.create_cheque, "Créer une entrée de chèque/virement", ChequeCreate),
    "cheque.update": ActionSpec("cheque.update", accounting_cheques.update_cheque, "Modifier une entrée de chèque/virement", ChequeUpdate, ("cheque_id",)),
    "cheque.delete": ActionSpec("cheque.delete", accounting_cheques.delete_cheque, "Supprimer une entrée de chèque/virement", None, ("cheque_id",)),
    "cheque.set_status": ActionSpec("cheque.set_status", accounting_cheques.set_cheque_status, "Changer le statut d'un chèque/virement", ChequeStatusUpdate, ("cheque_id",)),

    # ── Inventaire ────────────────────────────────────────────────────────
    "inventory_item.create": ActionSpec("inventory_item.create", accounting_inventory.create_inventory_item, "Créer un article d'inventaire", InventoryItemCreate),
    "inventory_item.update": ActionSpec("inventory_item.update", accounting_inventory.update_inventory_item, "Modifier un article d'inventaire", InventoryItemUpdate, ("item_id",)),
    "inventory_item.delete": ActionSpec("inventory_item.delete", accounting_inventory.delete_inventory_item, "Supprimer un article d'inventaire", None, ("item_id",)),
    "inventory_movement.create": ActionSpec("inventory_movement.create", accounting_inventory.create_movement, "Créer un mouvement de stock", InventoryMovementCreate, ("item_id",)),
}


def build_tool_schemas() -> list[dict]:
    """Format OpenAI function-calling `tools` — un outil par action, dont les
    paramètres sont le schéma JSON du modèle Pydantic réel (path_params en
    plus, toujours des chaînes)."""
    tools = []
    for spec in ACTIONS.values():
        props: dict[str, Any] = {}
        required: list[str] = []
        for p in spec.path_params:
            props[p] = {"type": "string", "description": f"Identifiant ({p})"}
            required.append(p)
        if spec.model is not None:
            schema = spec.model.model_json_schema()
            for name, sub in (schema.get("properties") or {}).items():
                props[name] = {k: v for k, v in sub.items() if k in ("type", "description", "enum")} or {"type": "string"}
            required += [f for f in (schema.get("required") or []) if f not in required]
        tools.append({
            "type": "function",
            "function": {
                "name": spec.key,
                "description": spec.label,
                "parameters": {"type": "object", "properties": props, "required": required},
            },
        })
    return tools


def split_arguments(spec: ActionSpec, arguments: dict) -> tuple[dict, dict]:
    """Sépare les arguments reçus du LLM en (path_params, body_fields)."""
    path_params = {k: arguments[k] for k in spec.path_params if k in arguments}
    body_fields = {k: v for k, v in arguments.items() if k not in spec.path_params}
    return path_params, body_fields


def validate_body(spec: ActionSpec, body_fields: dict) -> Optional[BaseModel]:
    """Construit et valide le modèle Pydantic réel — lève une erreur claire
    (jamais silencieuse) si le LLM a fourni un champ invalide ou manquant."""
    if spec.model is None:
        return None
    try:
        return spec.model(**body_fields)
    except Exception as e:
        raise HTTPException(400, f"Paramètres invalides pour « {spec.label} » : {e}")


def summarize_action(spec: ActionSpec, path_params: dict, body_fields: dict) -> str:
    """Résumé lisible affiché à l'utilisateur AVANT toute exécution —
    entièrement déterministe (pas de second appel LLM), donc fidèle à ce qui
    sera réellement envoyé si l'utilisateur confirme."""
    lines = [f"**{spec.label}**"]
    for k, v in path_params.items():
        lines.append(f"- {k} : {v}")
    for k, v in body_fields.items():
        if v is None or v == "":
            continue
        lines.append(f"- {k} : {v}")
    return "\n".join(lines)


async def execute_action(
    spec: ActionSpec,
    path_params: dict,
    body_fields: dict,
    user: CurrentUser,
    db: Client,
) -> Any:
    """Exécute réellement l'action — appelle directement la fonction du
    routeur, EXACTEMENT comme le ferait l'endpoint HTTP correspondant, avec
    les mêmes vérifications de permission et le même utilisateur."""
    kwargs: dict[str, Any] = dict(path_params)
    body = validate_body(spec, body_fields)
    if body is not None:
        kwargs["body"] = body
    kwargs["user"] = user
    kwargs["db"] = db
    return await spec.func(**kwargs)
