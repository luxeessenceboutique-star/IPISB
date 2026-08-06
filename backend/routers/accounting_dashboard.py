from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from supabase import Client
from deps import get_current_user, get_db, CurrentUser

router = APIRouter(prefix="/accounting/dashboard", tags=["accounting"])


def _require_admin(user: CurrentUser) -> None:
    if not user.is_admin():
        raise HTTPException(403, "Admin only")


def _require_read(user: CurrentUser) -> None:
    """Lecture des tableaux de bord : admin, comptable (lecture seule) ou caissier."""
    if not user.can_read_accounting():
        raise HTTPException(403, "Accès comptabilité requis")


def _num(v) -> float:
    return float(v or 0)


@router.get("/summary")
async def dashboard_summary(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
):
    """Aggregated accounting dashboard across purchases, expenses, revenues,
    invoices and budgets. Data volumes for a single school are small enough to
    aggregate in-process rather than with SQL views."""
    _require_read(user)

    purchases = db.from_("purchases").select("category_id, total_incl_vat, purchase_date, payment_status").execute().data or []
    expenses = db.from_("expenses").select("category_id, amount, expense_date").execute().data or []
    revenues = db.from_("revenues").select("total_incl_vat, status, revenue_date").execute().data or []
    invoices = db.from_("invoices").select("total_incl_vat, payment_status").execute().data or []
    budgets = db.from_("budgets").select("category_id, year, amount").execute().data or []
    categories = db.from_("accounting_categories").select("id, name").execute().data or []
    supplier_count = len(db.from_("suppliers").select("id").execute().data or [])

    cat_name = {c["id"]: c["name"] for c in categories}
    NO_CAT = "Sans catégorie"

    now = datetime.now(timezone.utc)
    year = now.year
    month_prefix = now.strftime("%Y-%m")

    # ── KPIs ────────────────────────────────────────────────────────────────
    total_purchases_amount = sum(_num(p["total_incl_vat"]) for p in purchases)
    total_expenses_amount = sum(_num(e["amount"]) for e in expenses)
    total_outflow = total_purchases_amount + total_expenses_amount

    total_revenues_received = sum(_num(r["total_incl_vat"]) for r in revenues if r["status"] == "received")
    total_revenues_expected = sum(_num(r["total_incl_vat"]) for r in revenues if r["status"] == "expected")

    net_treasury = total_revenues_received - total_outflow

    unpaid_invoices = sum(
        _num(i["total_incl_vat"]) for i in invoices if i["payment_status"] in ("pending", "partially_paid")
    )

    monthly_outflow = (
        sum(_num(p["total_incl_vat"]) for p in purchases if (p["purchase_date"] or "").startswith(month_prefix))
        + sum(_num(e["amount"]) for e in expenses if (e["expense_date"] or "").startswith(month_prefix))
    )
    monthly_revenues = sum(
        _num(r["total_incl_vat"]) for r in revenues
        if r["status"] == "received" and (r["revenue_date"] or "").startswith(month_prefix)
    )

    # ── Chart: outflow by category (purchases + expenses) ────────────────────
    by_cat: dict[str, float] = {}
    for p in purchases:
        key = cat_name.get(p["category_id"], NO_CAT) if p["category_id"] else NO_CAT
        by_cat[key] = by_cat.get(key, 0.0) + _num(p["total_incl_vat"])
    for e in expenses:
        key = cat_name.get(e["category_id"], NO_CAT) if e["category_id"] else NO_CAT
        by_cat[key] = by_cat.get(key, 0.0) + _num(e["amount"])
    expenses_by_category = sorted(
        [{"name": k, "value": round(v, 2)} for k, v in by_cat.items() if v > 0],
        key=lambda x: x["value"], reverse=True,
    )

    # ── Chart: budget vs actual (current year, per category) ─────────────────
    budget_by_cat: dict[str, float] = {}
    for b in budgets:
        if b["year"] != year:
            continue
        key = cat_name.get(b["category_id"], NO_CAT) if b["category_id"] else NO_CAT
        budget_by_cat[key] = budget_by_cat.get(key, 0.0) + _num(b["amount"])

    actual_by_cat: dict[str, float] = {}
    for p in purchases:
        if not (p["purchase_date"] or "").startswith(str(year)):
            continue
        key = cat_name.get(p["category_id"], NO_CAT) if p["category_id"] else NO_CAT
        actual_by_cat[key] = actual_by_cat.get(key, 0.0) + _num(p["total_incl_vat"])
    for e in expenses:
        if not (e["expense_date"] or "").startswith(str(year)):
            continue
        key = cat_name.get(e["category_id"], NO_CAT) if e["category_id"] else NO_CAT
        actual_by_cat[key] = actual_by_cat.get(key, 0.0) + _num(e["amount"])

    budget_vs_actual = [
        {"category": k, "budget": round(budget_by_cat.get(k, 0.0), 2), "actual": round(actual_by_cat.get(k, 0.0), 2)}
        for k in sorted(set(budget_by_cat) | set(actual_by_cat))
    ]

    # ── Chart: treasury over last 6 months ───────────────────────────────────
    months: list[tuple[int, int]] = []
    y, m = now.year, now.month
    for _ in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    months.reverse()

    treasury_series = []
    for (yy, mm) in months:
        prefix = f"{yy:04d}-{mm:02d}"
        rev = sum(
            _num(r["total_incl_vat"]) for r in revenues
            if r["status"] == "received" and (r["revenue_date"] or "").startswith(prefix)
        )
        out = (
            sum(_num(p["total_incl_vat"]) for p in purchases if (p["purchase_date"] or "").startswith(prefix))
            + sum(_num(e["amount"]) for e in expenses if (e["expense_date"] or "").startswith(prefix))
        )
        treasury_series.append({
            "month": prefix,
            "revenues": round(rev, 2),
            "expenses": round(out, 2),
            "net": round(rev - out, 2),
        })

    # ── Chart: purchase payment status breakdown ──────────────────────────────
    status_counts: dict[str, int] = {"paid": 0, "pending": 0, "partially_paid": 0, "cancelled": 0}
    for p in purchases:
        st = p.get("payment_status") or "pending"
        if st in status_counts:
            status_counts[st] += 1
        else:
            status_counts["pending"] += 1
    purchase_status_breakdown = [
        {"name": "Payé", "value": status_counts["paid"]},
        {"name": "En attente", "value": status_counts["pending"]},
        {"name": "Partiel", "value": status_counts["partially_paid"]},
        {"name": "Annulé", "value": status_counts["cancelled"]},
    ]

    # ── Revenue collection rate ──────────────────────────────────────────────
    total_rev_all = total_revenues_received + total_revenues_expected
    revenue_rate = round((total_revenues_received / total_rev_all * 100) if total_rev_all > 0 else 0.0, 1)

    # ── Outflow composition ──────────────────────────────────────────────────
    outflow_composition = [
        {"name": "Achats", "value": round(total_purchases_amount, 2)},
        {"name": "Dépenses", "value": round(total_expenses_amount, 2)},
    ]

    return {
        # KPIs
        "net_treasury": round(net_treasury, 2),
        "total_revenues_received": round(total_revenues_received, 2),
        "total_revenues_expected": round(total_revenues_expected, 2),
        "total_outflow": round(total_outflow, 2),
        "total_purchases_amount": round(total_purchases_amount, 2),
        "total_expenses_amount": round(total_expenses_amount, 2),
        "unpaid_invoices": round(unpaid_invoices, 2),
        "monthly_outflow": round(monthly_outflow, 2),
        "monthly_revenues": round(monthly_revenues, 2),
        "supplier_count": supplier_count,
        "revenue_rate": revenue_rate,
        "counts": {
            "purchases": len(purchases),
            "expenses": len(expenses),
            "revenues": len(revenues),
            "invoices": len(invoices),
        },
        # Charts
        "expenses_by_category": expenses_by_category,
        "budget_vs_actual": budget_vs_actual,
        "treasury_series": treasury_series,
        "purchase_status_breakdown": purchase_status_breakdown,
        "outflow_composition": outflow_composition,
    }


@router.get("/journal")
async def journal(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Client, Depends(get_db)],
    limit: int = 50,
):
    """Journal comptable = vue chronologique sur audit_log (acteur enrichi)."""
    _require_read(user)
    limit = max(1, min(200, limit))
    rows = (
        db.from_("audit_log")
        .select("id, user_id, action, entity_type, entity_id, meta, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data or []
    )
    actor_ids = list({r["user_id"] for r in rows if r.get("user_id")})
    names: dict[str, str] = {}
    if actor_ids:
        profs = db.from_("profiles").select("id, full_name, email").in_("id", actor_ids).execute().data or []
        names = {p["id"]: (p.get("full_name") or p.get("email") or "—") for p in profs}
    return [{**r, "actor_name": names.get(r.get("user_id"))} for r in rows]
