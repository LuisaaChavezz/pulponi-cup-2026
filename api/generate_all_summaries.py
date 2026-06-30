"""
generate_all_summaries.py
Pulponi Cup 2026 — Resúmenes de TODOS los participantes en un solo PDF.
Reutiliza el render por usuario de generate_user_summary (una sección/página por
usuario, con showPage() entre cada uno).
"""
import io
import base64

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

from generate_user_summary import render_user_summary


def _build_all(c, users):
    users = users or []
    if not users:
        # PDF de una página indicando que no hay participantes.
        render_user_summary(c, "Sin participantes", 0, [], {})
        c.save()
        return

    for u in users:
        render_user_summary(
            c,
            u.get("user_name") or "Jugador",
            int(u.get("total_points") or 0),
            u.get("rows") or [],
            u.get("summary") or {},
        )
    c.save()


def generate_all_summaries_pdf_bytes(users):
    """Regresa el PDF (todos los usuarios) como base64."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    _build_all(c, users)
    buf.seek(0)
    return base64.b64encode(buf.getvalue()).decode()


def generate_all_summaries_pdf(users, output_path="./resumenes_todos.pdf"):
    """Guarda el PDF en disco. Para pruebas locales."""
    c = canvas.Canvas(output_path, pagesize=letter)
    _build_all(c, users)
    return output_path
