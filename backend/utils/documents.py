import io
import secrets
from datetime import datetime, timezone

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

DOCUMENT_LABELS = {
    "attestation_scolarite": "Attestation de Scolarité",
    "certificat": "Certificat",
    "convocation": "Convocation",
}


def new_verification_code() -> str:
    return secrets.token_hex(8)  # 16 hex chars — short enough for a URL, unguessable


def render_document_pdf(
    *,
    doc_type: str,
    student_name: str,
    verification_code: str,
    verify_url: str,
) -> bytes:
    """Render a one-page attestation/certificate PDF with an embedded QR code
    that links to the public /verify/{code} authenticity page."""
    label = DOCUMENT_LABELS.get(doc_type, doc_type.replace("_", " ").title())
    issued_at = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    qr_img = qrcode.make(verify_url)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 40 * mm, "IPISB")
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, height - 48 * mm, "Institut Privé d'Innovation en Santé et Bien-être")

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 70 * mm, label)

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 90 * mm, f"Délivré à : {student_name}")
    c.drawCentredString(width / 2, height - 100 * mm, f"Date d'émission : {issued_at}")
    c.drawCentredString(width / 2, height - 108 * mm, f"Code de vérification : {verification_code}")

    qr_size = 35 * mm
    c.drawImage(
        ImageReader(qr_buf),
        width / 2 - qr_size / 2,
        40 * mm,
        width=qr_size,
        height=qr_size,
    )
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(width / 2, 35 * mm, "Scannez ce code pour vérifier l'authenticité de ce document")

    c.showPage()
    c.save()
    return buf.getvalue()
