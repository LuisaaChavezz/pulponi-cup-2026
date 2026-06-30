"""
generate_user_summary.py
Pulponi Cup 2026 — Resumen personal del usuario (PDF compacto).
- 1 página siempre que sea posible: tabla densa a 2 columnas, fuente 7-8pt.
- Header con nombre + puntos totales.
- Una fila por partido jugado: Partido | Final | Predicción | Puntos.
- Footer con totales: exactos, ganadores, fallos y puntos totales.
"""
import io
import base64
import math

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color

PAGE_W, PAGE_H = letter  # 612 x 792
MARGIN_L = 30.0
MARGIN_R = 30.0
COL_GAP = 16.0
ROW_H = 10.6
FONT = 7.6

COL_W = (PAGE_W - MARGIN_L - MARGIN_R - COL_GAP) / 2.0
TABLE_TOP = PAGE_H - 86.0       # y del header de columna
ROWS_TOP = TABLE_TOP - 15.0     # y de la primera fila
BOTTOM_LIMIT = 64.0             # piso para las filas (deja espacio al footer)


def rgb(r, g, b):
    return Color(r, g, b)


C_PURPLE = rgb(0.176, 0.039, 0.361)
C_YELLOW = rgb(0.976, 0.788, 0.027)
C_WHITE = rgb(1.0, 1.0, 1.0)
C_DARK = rgb(0.102, 0.102, 0.102)
C_GRAY = rgb(0.502, 0.502, 0.502)
C_BORDER = rgb(0.851, 0.851, 0.851)
C_ROW_ALT = rgb(0.961, 0.961, 0.980)

C_PTS_3 = rgb(0.0, 0.408, 0.278)   # verde
C_PTS_1 = rgb(0.0, 0.204, 0.471)   # azul
C_PTS_0 = rgb(0.6, 0.6, 0.6)       # gris


def _pts_color(pts):
    if pts <= 0:
        return C_PTS_0
    if pts >= 3:
        return C_PTS_3
    return C_PTS_1


def _truncate(c, text, max_w, font, size):
    s = str(text or "")
    if c.stringWidth(s, font, size) <= max_w:
        return s
    ell = "…"
    while s and c.stringWidth(s + ell, font, size) > max_w:
        s = s[:-1]
    return (s + ell) if s else ""


def _rows_per_col():
    return max(1, int((ROWS_TOP - BOTTOM_LIMIT) // ROW_H))


def _draw_page_background(c):
    """Fondo blanco explícito. Sin esto el PDF queda 'transparente' y algunos
    visores (modo oscuro / móvil) lo pintan negro, dejándolo ilegible."""
    c.setFillColor(C_WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def _draw_page_header(c, user_name, total_points):
    c.setFillColor(C_PURPLE)
    c.rect(0, PAGE_H - 70, PAGE_W, 70, fill=1, stroke=0)
    c.setStrokeColor(C_YELLOW)
    c.setLineWidth(2.0)
    c.line(0, PAGE_H - 70, PAGE_W, PAGE_H - 70)

    c.setFillColor(C_WHITE)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN_L, PAGE_H - 26, "PULPONI CUP 2026")
    c.setFillColor(C_YELLOW)
    c.setFont("Helvetica", 8.5)
    c.drawString(MARGIN_L, PAGE_H - 39, "Resumen personal de predicciones")
    c.setFillColor(C_WHITE)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGIN_L, PAGE_H - 58, _truncate(c, user_name, 360, "Helvetica-Bold", 13))

    c.setFillColor(C_YELLOW)
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 36, str(total_points))
    c.setFillColor(C_WHITE)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 50, "puntos totales")


def _draw_col_header(c, col_x):
    c.setFillColor(C_PURPLE)
    c.rect(col_x, TABLE_TOP - 2.5, COL_W, 13.0, fill=1, stroke=0)
    c.setFillColor(C_WHITE)
    c.setFont("Helvetica-Bold", 7.0)
    c.drawString(col_x + 3, TABLE_TOP + 1.0, "Partido")
    c.drawCentredString(col_x + COL_W - 92, TABLE_TOP + 1.0, "Final")
    c.drawCentredString(col_x + COL_W - 52, TABLE_TOP + 1.0, "Pred")
    c.drawCentredString(col_x + COL_W - 16, TABLE_TOP + 1.0, "Pts")


def _draw_row(c, col_x, y, row, alt):
    if alt:
        c.setFillColor(C_ROW_ALT)
        c.rect(col_x, y - 2.6, COL_W, ROW_H, fill=1, stroke=0)

    pts = int(row.get("points", 0) or 0)

    c.setFillColor(C_DARK)
    c.setFont("Helvetica", FONT)
    label = _truncate(c, row.get("match", ""), COL_W - 106, "Helvetica", FONT)
    c.drawString(col_x + 3, y, label)

    c.setFillColor(C_DARK)
    c.setFont("Helvetica", FONT)
    c.drawCentredString(col_x + COL_W - 92, y, str(row.get("final") or "—"))
    c.drawCentredString(col_x + COL_W - 52, y, str(row.get("prediction") or "—"))

    c.setFillColor(_pts_color(pts))
    c.setFont("Helvetica-Bold", FONT)
    c.drawCentredString(col_x + COL_W - 16, y, str(pts))


def _draw_summary(c, summary):
    items = [
        ("Exactos", summary.get("exactos", 0)),
        ("Ganadores", summary.get("ganadores", 0)),
        ("Fallos", summary.get("fallos", 0)),
        ("Puntos totales", summary.get("total", 0)),
    ]
    c.setStrokeColor(C_BORDER)
    c.setLineWidth(0.6)
    c.line(MARGIN_L, 56, PAGE_W - MARGIN_R, 56)

    seg = (PAGE_W - MARGIN_L - MARGIN_R) / len(items)
    for i, (label, val) in enumerate(items):
        x = MARGIN_L + i * seg + seg / 2
        c.setFillColor(C_PURPLE)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(x, 38, str(val))
        c.setFillColor(C_GRAY)
        c.setFont("Helvetica", 7.5)
        c.drawCentredString(x, 27, label)

    c.setFillColor(C_GRAY)
    c.setFont("Helvetica", 7)
    c.drawCentredString(PAGE_W / 2, 14, "Generado por Pulponi · pulponicup.com.mx")


def render_user_summary(c, user_name, total_points, rows, summary):
    """Dibuja el resumen de UN usuario en el canvas (una o varias páginas),
    terminando cada página con showPage(). NO llama c.save(), para poder
    encadenar varios usuarios en un mismo PDF."""
    rows = rows or []
    rpc = _rows_per_col()
    per_page = rpc * 2
    total = len(rows)
    pages = max(1, math.ceil(total / per_page)) if total else 1

    for page in range(pages):
        _draw_page_background(c)
        _draw_page_header(c, user_name, total_points)
        page_rows = rows[page * per_page:(page + 1) * per_page]
        for col in range(2):
            col_x = MARGIN_L + col * (COL_W + COL_GAP)
            _draw_col_header(c, col_x)
            col_rows = page_rows[col * rpc:(col + 1) * rpc]
            y = ROWS_TOP
            for i, row in enumerate(col_rows):
                _draw_row(c, col_x, y, row, alt=(i % 2 == 1))
                y -= ROW_H

        if page == pages - 1:
            _draw_summary(c, summary or {})
        c.showPage()


def _build(c, user_name, total_points, rows, summary):
    render_user_summary(c, user_name, total_points, rows, summary)
    c.save()


def generate_user_summary_pdf_bytes(user_name, total_points, rows, summary):
    """Regresa el PDF como base64. Usada por el serverless de Vercel."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    _build(c, user_name, total_points, rows, summary)
    buf.seek(0)
    return base64.b64encode(buf.getvalue()).decode()


def generate_user_summary_pdf(user_name, total_points, rows, summary, output_path=None):
    """Guarda el PDF en disco. Para pruebas locales."""
    if not output_path:
        safe = str(user_name or "jugador").lower().replace(" ", "_")
        output_path = f"./resumen_{safe}.pdf"
    c = canvas.Canvas(output_path, pagesize=letter)
    _build(c, user_name, total_points, rows, summary)
    return output_path
