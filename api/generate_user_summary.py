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

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color

PAGE_W, PAGE_H = letter  # 612 x 792
MARGIN_L = 30.0
MARGIN_R = 30.0
FONT = 8.0

PAGE_LEFT = MARGIN_L
PAGE_RIGHT = PAGE_W - MARGIN_R
CONTENT_W = PAGE_RIGHT - PAGE_LEFT

COLHDR_H = 13.0                 # alto del encabezado de columnas
BANNER_H = 16.0                 # alto del mini-banner por etapa
ROW_H = 12.0                    # alto de fila de partido
PEN_H = 9.5                     # alto de la línea extra de penales
BOTTOM_LIMIT = 64.0            # piso (deja espacio al footer de totales)
HEADER_BOTTOM = PAGE_H - 70.0  # borde inferior del header morado

# Posiciones de columnas (layout de una sola columna a lo ancho)
PTS_X = PAGE_RIGHT - 16
PRED_X = PAGE_RIGHT - 78
FINAL_X = PAGE_RIGHT - 146
MATCH_X = PAGE_LEFT + 6
MATCH_MAXW = (FINAL_X - 40) - MATCH_X


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


def _draw_col_header(c, y):
    """Encabezado de columnas a lo ancho. Devuelve la y para el contenido."""
    c.setFillColor(C_PURPLE)
    c.rect(PAGE_LEFT, y - COLHDR_H, CONTENT_W, COLHDR_H, fill=1, stroke=0)
    base = y - COLHDR_H + 4.0
    c.setFillColor(C_WHITE)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(MATCH_X, base, "Partido")
    c.drawCentredString(FINAL_X, base, "Final")
    c.drawCentredString(PRED_X, base, "Pred")
    c.drawCentredString(PTS_X, base, "Pts")
    return y - COLHDR_H - 3.0


def _draw_stage_banner(c, y, stage_name, count=None):
    """Mini-banner de sección por etapa del Mundial. Devuelve la nueva y."""
    c.setFillColor(C_PURPLE)
    c.rect(PAGE_LEFT, y - BANNER_H, CONTENT_W, BANNER_H, fill=1, stroke=0)
    c.setFillColor(C_YELLOW)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(PAGE_LEFT + 8, y - BANNER_H + 5.0, str(stage_name).upper())
    if count is not None:
        c.setFillColor(C_WHITE)
        c.setFont("Helvetica", 7.0)
        c.drawRightString(PAGE_RIGHT - 8, y - BANNER_H + 5.0, f"{count} partidos")
    return y - BANNER_H - 2.0


def _draw_row(c, y, row, alt):
    """Dibuja una fila de partido. Devuelve la nueva y."""
    if alt:
        c.setFillColor(C_ROW_ALT)
        c.rect(PAGE_LEFT, y - ROW_H, CONTENT_W, ROW_H, fill=1, stroke=0)

    pts = int(row.get("points", 0) or 0)
    base = y - ROW_H + 3.5

    c.setFillColor(C_DARK)
    c.setFont("Helvetica", FONT)
    label = _truncate(c, row.get("match", ""), MATCH_MAXW, "Helvetica", FONT)
    c.drawString(MATCH_X, base, label)
    c.drawCentredString(FINAL_X, base, str(row.get("final") or "—"))
    c.drawCentredString(PRED_X, base, str(row.get("prediction") or "—"))

    c.setFillColor(_pts_color(pts))
    c.setFont("Helvetica-Bold", FONT)
    c.drawCentredString(PTS_X, base, str(pts))
    return y - ROW_H


def _draw_penalty_line(c, y, row):
    """Línea extra con la predicción de penales del usuario. Devuelve la nueva y."""
    base = y - PEN_H + 2.5
    c.setFillColor(C_GRAY)
    c.setFont("Helvetica-Oblique", 6.9)
    prefix = "Penales: "
    c.drawString(MATCH_X + 10, base, prefix)
    px = MATCH_X + 10 + c.stringWidth(prefix, "Helvetica-Oblique", 6.9)
    pick = str(row.get("penalty_pred") or "—")
    c.setFillColor(C_DARK)
    c.setFont("Helvetica-BoldOblique", 6.9)
    c.drawString(px, base, pick)
    pen_pts = int(row.get("penalty_points", 0) or 0)
    if pen_pts > 0:
        px2 = px + c.stringWidth(pick, "Helvetica-BoldOblique", 6.9) + 6
        c.setFillColor(C_PTS_3)
        c.setFont("Helvetica-Bold", 6.9)
        c.drawString(px2, base, f"(+{pen_pts} pen.)")
    return y - PEN_H


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


def _group_by_stage(rows):
    """Agrupa filas por etapa (round_name) preservando el orden cronológico
    con el que llegan (las filas ya vienen ordenadas por kickoff)."""
    order = []
    buckets = {}
    for r in rows:
        rn = r.get("round_name") or ("Eliminatoria" if r.get("is_knockout") else "Fase de Grupos")
        if rn not in buckets:
            buckets[rn] = []
            order.append(rn)
        buckets[rn].append(r)
    return [(rn, buckets[rn]) for rn in order]


def _start_page(c, user_name, total_points):
    _draw_page_background(c)
    _draw_page_header(c, user_name, total_points)
    y = HEADER_BOTTOM - 8.0
    return _draw_col_header(c, y)


def render_user_summary(c, user_name, total_points, rows, summary):
    """Dibuja el resumen de UN usuario en el canvas (una o varias páginas),
    a una sola columna, con mini-banners por etapa del Mundial y una línea
    extra de penales en partidos de eliminatoria. Termina cada página con
    showPage(); NO llama c.save() para poder encadenar varios usuarios."""
    rows = rows or []
    groups = _group_by_stage(rows)

    y = _start_page(c, user_name, total_points)

    for stage_name, items in groups:
        # El banner necesita espacio para sí mismo + al menos una fila.
        if y - (BANNER_H + ROW_H) < BOTTOM_LIMIT:
            c.showPage()
            y = _start_page(c, user_name, total_points)
        y = _draw_stage_banner(c, y, stage_name, count=len(items))

        for idx, row in enumerate(items):
            has_pen = bool(row.get("is_knockout")) and bool(row.get("penalty_pred"))
            need = ROW_H + (PEN_H if has_pen else 0)
            if y - need < BOTTOM_LIMIT:
                c.showPage()
                y = _start_page(c, user_name, total_points)
                y = _draw_stage_banner(c, y, f"{stage_name} (cont.)")
            y = _draw_row(c, y, row, alt=(idx % 2 == 1))
            if has_pen:
                y = _draw_penalty_line(c, y, row)

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
