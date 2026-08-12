import io
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from utils import institution

def fmt_mad(value) -> str:
    try:
        val = float(value or 0)
        return f"{val:,.2f} MAD".replace(",", " ").replace(".", ",")
    except Exception:
        return "0,00 MAD"

def draw_header(c, title: str):
    width, height = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(20 * mm, height - 25 * mm, institution.SHORT_NAME)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, height - 30 * mm, institution.NAME)
    c.drawString(20 * mm, height - 34 * mm, institution.CITY + " — MAROC")

    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - 20 * mm, height - 25 * mm, title)
    
    # Horizontal line
    c.setLineWidth(0.5)
    c.setStrokeColorRGB(0.7, 0.7, 0.7)
    c.line(20 * mm, height - 40 * mm, width - 20 * mm, height - 40 * mm)

def draw_footer(c, page_num: int = 1):
    width, height = A4
    c.setLineWidth(0.5)
    c.setStrokeColorRGB(0.7, 0.7, 0.7)
    c.line(20 * mm, 20 * mm, width - 20 * mm, 20 * mm)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(20 * mm, 15 * mm, f"Document généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}")
    c.drawRightString(width - 20 * mm, 15 * mm, f"Page {page_num}")

def render_purchase_order_pdf(purchase: dict, supplier: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    
    draw_header(c, "BON DE COMMANDE")
    
    # Metadata block
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, height - 50 * mm, "Informations Commande :")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, height - 56 * mm, f"N° Commande : {purchase.get('purchase_number', 'N/A')}")
    c.drawString(20 * mm, height - 61 * mm, f"Date d'émission : {purchase.get('purchase_date', 'N/A')}")
    c.drawString(20 * mm, height - 66 * mm, f"Statut Paiement : {purchase.get('payment_status', 'N/A').upper()}")

    # Supplier block
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - 20 * mm, height - 50 * mm, "Fournisseur :")
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 20 * mm, height - 56 * mm, f"{supplier.get('company_name', 'N/A')}")
    c.drawRightString(width - 20 * mm, height - 61 * mm, f"Contact : {supplier.get('contact_person', 'N/A') or '—'}")
    c.drawRightString(width - 20 * mm, height - 66 * mm, f"Email : {supplier.get('email', 'N/A') or '—'}")
    c.drawRightString(width - 20 * mm, height - 71 * mm, f"ICE : {supplier.get('tax_number', 'N/A') or '—'}")

    # Section Table
    y = height - 85 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Détail de la commande :")
    
    y -= 8 * mm
    # Table Header
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Description")
    c.drawString(100 * mm, y, "Quantité")
    c.drawString(125 * mm, y, "Prix Unitaire")
    c.drawRightString(width - 20 * mm, y, "Total HT")
    
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, width - 20 * mm, y - 2 * mm)
    
    # Table Row
    y -= 10 * mm
    c.setFont("Helvetica", 9)
    # Wrap text for title
    title = purchase.get("title", "")
    if len(title) > 40:
        title = title[:37] + "..."
    c.drawString(20 * mm, y, title)
    qty = float(purchase.get("quantity") or 0)
    up = float(purchase.get("unit_price") or 0)
    c.drawString(100 * mm, y, f"{qty:.2f}")
    c.drawString(125 * mm, y, fmt_mad(up))
    c.drawRightString(width - 20 * mm, y, fmt_mad(qty * up))
    
    # Totals block
    y -= 20 * mm
    c.setLineWidth(0.5)
    c.line(100 * mm, y + 5 * mm, width - 20 * mm, y + 5 * mm)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(100 * mm, y, "Total HT")
    c.drawRightString(width - 20 * mm, y, fmt_mad(qty * up))
    
    y -= 6 * mm
    vat_percent = float(purchase.get("vat_percent") or 0)
    c.setFont("Helvetica", 9)
    c.drawString(100 * mm, y, f"TVA ({vat_percent:.0f} %)")
    c.drawRightString(width - 20 * mm, y, fmt_mad(qty * up * (vat_percent / 100)))
    
    y -= 6 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(100 * mm, y, "Total TTC")
    c.drawRightString(width - 20 * mm, y, fmt_mad(purchase.get("total_incl_vat", qty * up * (1 + vat_percent / 100))))
    
    # Signatures
    y -= 30 * mm
    c.setLineWidth(0.5)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Signature Responsable")
    c.drawRightString(width - 20 * mm, y, "Signature Comptable")
    
    c.setFont("Helvetica", 8)
    val_resp = purchase.get("valide_responsable_at")
    val_comp = purchase.get("valide_comptable_at")
    if val_resp:
        c.drawString(20 * mm, y - 5 * mm, f"Validé le {datetime.fromisoformat(val_resp).strftime('%d/%m/%Y')}")
    else:
        c.drawString(20 * mm, y - 5 * mm, "En attente de validation")
        
    if val_comp:
        c.drawRightString(width - 20 * mm, y - 5 * mm, f"Validé le {datetime.fromisoformat(val_comp).strftime('%d/%m/%Y')}")
    else:
        c.drawRightString(width - 20 * mm, y - 5 * mm, "En attente de validation")
        
    c.rect(20 * mm, y - 30 * mm, 50 * mm, 22 * mm)
    c.rect(width - 70 * mm, y - 30 * mm, 50 * mm, 22 * mm)

    draw_footer(c)
    c.showPage()
    c.save()
    return buf.getvalue()

def render_purchase_request_pdf(pr: dict, quotes: list) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    
    draw_header(c, "DEMANDE D'ACHAT")
    
    # Request Info
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, height - 50 * mm, "Informations de la demande :")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, height - 56 * mm, f"N° DA : {pr.get('request_number', 'N/A')}")
    c.drawString(20 * mm, height - 61 * mm, f"Statut : {pr.get('status', 'N/A').replace('_', ' ').upper()}")
    c.drawString(20 * mm, height - 66 * mm, f"Demandeur : {pr.get('requester_name', 'N/A') or '—'}")
    c.drawString(20 * mm, height - 71 * mm, f"Service : {pr.get('service', 'N/A') or '—'}")

    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - 20 * mm, height - 50 * mm, "Détail Budget :")
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 20 * mm, height - 56 * mm, f"Type : {pr.get('request_type', 'N/A').replace('_', ' ').title()}")
    c.drawRightString(width - 20 * mm, height - 61 * mm, f"Catégorie : {pr.get('asset_category', 'N/A').title()}")
    c.drawRightString(width - 20 * mm, height - 66 * mm, f"Est. Budgétaire : {fmt_mad(pr.get('budget_estimate', 0))}")

    # Justification
    y = height - 85 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Justification du besoin :")
    c.setFont("Helvetica", 9)
    just = pr.get("justification", "—")
    # Wrap text simple
    lines = [just[i:i+80] for i in range(0, len(just), 80)]
    for line in lines[:3]:
        y -= 5 * mm
        c.drawString(20 * mm, y, line)

    # Devis comparatifs
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Synthèse des devis comparatifs :")
    
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Rang")
    c.drawString(35 * mm, y, "Fournisseur")
    c.drawString(95 * mm, y, "N° Devis")
    c.drawString(135 * mm, y, "Montant")
    c.drawRightString(width - 20 * mm, y, "Retenu ?")
    
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, width - 20 * mm, y - 2 * mm)
    
    c.setFont("Helvetica", 9)
    for q_item in quotes[:5]:
        y -= 7 * mm
        c.drawString(20 * mm, y, f"Devis {q_item.get('rank', 1)}")
        c.drawString(35 * mm, y, q_item.get("supplier_name", "—") or "—")
        c.drawString(95 * mm, y, q_item.get("quote_number", "—"))
        c.drawString(135 * mm, y, fmt_mad(q_item.get("amount", 0)))
        c.drawRightString(width - 20 * mm, y, "OUI" if q_item.get("retenu") else "Non")

    # Décisions
    y -= 20 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Décision Expression de besoin :")
    c.setFont("Helvetica", 9)
    dec = pr.get("need_decision", "En attente")
    comment = pr.get("need_decision_comment", "")
    c.drawString(20 * mm, y - 6 * mm, f"Décision : {dec.upper()} {f'({comment})' if comment else ''}")

    draw_footer(c)
    c.showPage()
    c.save()
    return buf.getvalue()

def render_accounting_report_pdf(summary: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    
    draw_header(c, "SYNTHÈSE COMPTABLE & FINANCIÈRE")
    
    y = height - 55 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "Indicateurs Clés (KPIs)")
    
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Trésorerie nette :")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(65 * mm, y, fmt_mad(summary.get("net_treasury", 0)))
    
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Recettes encaissées :")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(65 * mm, y, fmt_mad(summary.get("total_revenues_received", 0)))
    
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Total sorties (Achats + Dépenses) :")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(65 * mm, y, fmt_mad(summary.get("total_outflow", 0)))
    
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "Factures clients impayées :")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(65 * mm, y, fmt_mad(summary.get("unpaid_invoices", 0)))

    # Outflow by category
    y -= 18 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "Répartition des Sorties par Catégorie")
    
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Catégorie")
    c.drawRightString(width - 20 * mm, y, "Montant")
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, width - 20 * mm, y - 2 * mm)
    
    c.setFont("Helvetica", 9)
    for cat in (summary.get("expenses_by_category") or [])[:8]:
        y -= 6 * mm
        c.drawString(20 * mm, y, cat.get("name", "—"))
        c.drawRightString(width - 20 * mm, y, fmt_mad(cat.get("value", 0)))

    draw_footer(c)
    c.showPage()
    c.save()
    return buf.getvalue()


MONTH_NAMES_FR = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]


def compute_moroccan_payroll(base: float, bonuses: float = 0, deductions: float = 0) -> dict:
    """Approximate Moroccan CNSS + IR (progressive income tax) monthly calculation."""
    gross = base + bonuses

    # CNSS employee part ~= 4.48%, capped at a 6 000 MAD/month contribution base
    cnss_base = min(gross, 6000)
    cnss = round(cnss_base * 0.0448, 2)

    # Taxable income = gross - CNSS - professional deduction (20%, capped at 2 500)
    prof_deduction = min(gross * 0.20, 2500)
    taxable = gross - cnss - prof_deduction

    # 2024 Moroccan IR brackets (monthly)
    if taxable <= 2500:
        ir = 0.0
    elif taxable <= 4166:
        ir = taxable * 0.10 - 250
    elif taxable <= 5000:
        ir = taxable * 0.20 - 666.67
    elif taxable <= 6666:
        ir = taxable * 0.30 - 1166.67
    elif taxable <= 15000:
        ir = taxable * 0.34 - 1433.33
    else:
        ir = taxable * 0.38 - 2033.33
    ir = max(round(ir, 2), 0.0)

    net_salary = round(gross - cnss - ir - deductions, 2)
    return {"cnss": cnss, "ir": ir, "gross_salary": round(gross, 2), "net_salary": net_salary}


def render_payslip_pdf(record: dict, employee: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    month_label = MONTH_NAMES_FR[record.get("month") or 0] or str(record.get("month"))
    draw_header(c, f"BULLETIN DE PAIE — {month_label} {record.get('year', '')}")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, height - 50 * mm, "Employé :")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, height - 56 * mm, f"Nom : {employee.get('full_name', 'N/A')}")
    c.drawString(20 * mm, height - 61 * mm, f"Poste : {employee.get('position', 'N/A') or '—'}")
    c.drawString(20 * mm, height - 66 * mm, f"Département : {employee.get('department', 'N/A') or '—'}")
    c.drawString(20 * mm, height - 71 * mm, f"N° CNSS : {employee.get('cnss_number', 'N/A') or '—'}")

    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - 20 * mm, height - 50 * mm, "Statut :")
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 20 * mm, height - 56 * mm, (record.get("status") or "draft").upper())

    y = height - 85 * mm
    rows = [
        ("Salaire de base", record.get("base_salary", 0), None),
        ("Primes", record.get("bonuses", 0), None),
        ("Salaire brut", record.get("gross_salary", 0), None),
        ("Cotisation CNSS", None, record.get("cnss", 0)),
        ("Impôt sur le revenu (IR)", None, record.get("ir", 0)),
        ("Autres retenues", None, record.get("deductions", 0)),
    ]

    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Désignation")
    c.drawRightString(120 * mm, y, "Gains")
    c.drawRightString(width - 20 * mm, y, "Retenues")
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, width - 20 * mm, y - 2 * mm)

    c.setFont("Helvetica", 9)
    for label, gain, deduction in rows:
        y -= 8 * mm
        c.drawString(20 * mm, y, label)
        if gain is not None:
            c.drawRightString(120 * mm, y, fmt_mad(gain))
        if deduction is not None:
            c.drawRightString(width - 20 * mm, y, fmt_mad(deduction))

    y -= 14 * mm
    c.setLineWidth(0.8)
    c.line(20 * mm, y + 5 * mm, width - 20 * mm, y + 5 * mm)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "NET À PAYER")
    c.drawRightString(width - 20 * mm, y, fmt_mad(record.get("net_salary", 0)))

    y -= 30 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Signature Employeur")
    c.drawRightString(width - 20 * mm, y, "Signature Employé")

    draw_footer(c)
    c.showPage()
    c.save()
    return buf.getvalue()


def _mention(grade: float) -> str:
    if grade >= 16:
        return "Excellent"
    if grade >= 14:
        return "Bien"
    if grade >= 12:
        return "Assez bien"
    if grade >= 10:
        return "Passable"
    return "Insuffisant"


def render_transcript_pdf(student: dict, courses: list[dict], period_label: str = "") -> bytes:
    """Relevé de notes — one row per course (contrôle continu grade /20 +
    mention), with a credit-weighted overall average at the bottom."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    draw_header(c, "RELEVÉ DE NOTES")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, height - 50 * mm, f"Étudiant : {student.get('full_name', 'N/A')}")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, height - 56 * mm, f"Classe : {student.get('class_name', 'N/A') or '—'}")
    if period_label:
        c.drawRightString(width - 20 * mm, height - 50 * mm, period_label)

    y = height - 70 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Cours")
    c.drawString(120 * mm, y, "Coeff.")
    c.drawString(140 * mm, y, "Note / 20")
    c.drawRightString(width - 20 * mm, y, "Mention")
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, width - 20 * mm, y - 2 * mm)

    c.setFont("Helvetica", 9)
    total_weighted, total_credits = 0.0, 0
    for course in courses:
        y -= 8 * mm
        title = course.get("title", "—")
        if len(title) > 45:
            title = title[:42] + "..."
        c.drawString(20 * mm, y, title)
        credits = course.get("credits") or 1
        c.drawString(120 * mm, y, str(credits))
        grade = course.get("grade")
        if grade is None:
            c.drawString(140 * mm, y, "—")
            c.drawRightString(width - 20 * mm, y, "Non évalué")
        else:
            c.drawString(140 * mm, y, f"{grade:.2f}")
            c.drawRightString(width - 20 * mm, y, _mention(grade))
            total_weighted += grade * credits
            total_credits += credits

    y -= 14 * mm
    c.setLineWidth(0.8)
    c.line(20 * mm, y + 5 * mm, width - 20 * mm, y + 5 * mm)
    overall = round(total_weighted / total_credits, 2) if total_credits else None
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "MOYENNE GÉNÉRALE")
    c.drawRightString(width - 20 * mm, y, f"{overall:.2f} / 20" if overall is not None else "—")

    y -= 30 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Signature Direction")
    c.drawRightString(width - 20 * mm, y, "Cachet de l'établissement")

    draw_footer(c)
    c.showPage()
    c.save()
    return buf.getvalue()
