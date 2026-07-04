"""
generate_pulponi_final.py
Pulponi Cup 2026 — Generador de PDFs de Resultados
- Colores dinámicos según equipo ganador (48 equipos Mundial 2026)
- Exacto (3pts): nombre en negrita verde, número verde
- Ganador (1pt): nombre en negrita azul, número azul
- Sin puntos (0): nombre normal oscuro, número gris
- Marco 3pt color del equipo ganador
- Marco tabla 0.5pt gris
- "Lugar" en una sola línea
"""
import io, base64
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color

PAGE_W, PAGE_H = letter
PAGE_LEFT  = 54.0
PAGE_RIGHT = 558.0
ROW_H      = 26.0

def rgb(r, g, b): return Color(r, g, b)

C_YELLOW      = rgb(0.9882, 0.8196, 0.0863)
C_WHITE       = rgb(1.0,    1.0,    1.0)
C_DARK        = rgb(0.1020, 0.1020, 0.1020)
C_GRAY_FOOTER = rgb(0.5020, 0.5020, 0.5020)
C_GRAY_BORDER = rgb(0.8667, 0.8667, 0.8667)

# Puntos
C_PTS_3  = rgb(0.0,    0.4078, 0.2784)   # verde oscuro
C_PTS_1  = rgb(0.0,    0.2039, 0.4706)   # azul marino
C_PTS_0  = rgb(0.6667, 0.6667, 0.6667)   # gris

# Nombre
C_NAME_3 = rgb(0.0,    0.4078, 0.2784)   # verde (exacto)
C_NAME_1 = rgb(0.0,    0.2039, 0.4706)   # azul  (ganador)
C_NAME_0 = rgb(0.1020, 0.1020, 0.1020)   # oscuro (sin pts)

# Leyenda
C_LEY_3  = rgb(1.0,    0.9725, 0.8627)
C_LEY_1  = rgb(0.9412, 1.0,    0.9412)
C_LEY_0  = rgb(1.0,    0.9216, 0.9333)
C_LEY_3B = rgb(0.9608, 0.7725, 0.0941)
C_LEY_1B = rgb(0.2980, 0.6863, 0.3137)
C_LEY_0B = rgb(0.8,    0.8,    0.8)

# Fondos de fila
C_ROW_3  = rgb(0.9098, 0.9608, 0.9137)
C_ROW_1  = rgb(0.9333, 0.9569, 1.0)
C_ROW_0  = rgb(0.9765, 0.9765, 0.9765)

# ── Colores 48 equipos Mundial 2026 ──────────────────────────────────────────
# (header_bg_r, header_bg_g, header_bg_b,  accent_r, accent_g, accent_b)
TEAM_COLORS = {
    # Grupo A
    "México":                (0.0,   0.529, 0.212,  0.8,   0.0,   0.0  ),
    "Ecuador":               (0.984, 0.8,   0.0,    0.0,   0.0,   0.502),
    "Suiza":                 (0.8,   0.0,   0.0,    0.8,   0.0,   0.0  ),
    "Bolivia":               (0.0,   0.345, 0.655,  0.863, 0.118, 0.118),
    # Grupo B
    "Argentina":             (0.396, 0.714, 0.969,  0.396, 0.714, 0.969),
    "Marruecos":             (0.8,   0.0,   0.141,  0.0,   0.439, 0.153),
    "Polonia":               (0.8,   0.0,   0.106,  0.8,   0.0,   0.106),
    "Arabia Saudita":        (0.0,   0.518, 0.255,  0.0,   0.518, 0.255),
    # Grupo C
    "USA":                   (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Ghana":                 (0.0,   0.420, 0.247,  0.808, 0.067, 0.149),
    "Panamá":                (0.8,   0.0,   0.0,    0.8,   0.0,   0.0  ),
    "Uruguay":               (0.0,   0.337, 0.627,  0.0,   0.337, 0.627),
    # Grupo D
    "Francia":               (0.0,   0.145, 0.588,  0.737, 0.133, 0.176),
    "Japón":                 (0.737, 0.133, 0.176,  0.737, 0.133, 0.176),
    "Tanzania":              (0.0,   0.4,   0.2,    0.973, 0.737, 0.0  ),
    "China":                 (0.8,   0.0,   0.0,    0.976, 0.8,   0.0  ),
    # Grupo E
    "Alemania":              (0.1,   0.1,   0.1,    0.9,   0.7,   0.0  ),
    "Australia":             (0.0,   0.169, 0.427,  0.973, 0.737, 0.0  ),
    "Portugal":              (0.8,   0.0,   0.0,    0.0,   0.502, 0.224),
    "Colombia":              (0.973, 0.737, 0.0,    0.737, 0.133, 0.176),
    # Grupo F
    "España":                (0.784, 0.0,   0.0,    0.973, 0.737, 0.0  ),
    "Brasil":                (0.0,   0.502, 0.149,  0.984, 0.8,   0.0  ),
    "Camerún":               (0.0,   0.502, 0.224,  0.737, 0.133, 0.176),
    "Bélgica":               (0.0,   0.0,   0.0,    0.737, 0.133, 0.176),
    # Grupo G
    "Inglaterra":            (0.004, 0.129, 0.412,  0.8,   0.0,   0.0  ),
    "Países Bajos":          (1.0,   0.4,   0.0,    1.0,   0.4,   0.0  ),
    "Egipto":                (0.737, 0.133, 0.176,  0.0,   0.502, 0.224),
    "Argelia":               (0.0,   0.518, 0.255,  0.737, 0.133, 0.176),
    # Grupo H
    "Senegal":               (0.0,   0.518, 0.255,  0.984, 0.8,   0.0  ),
    "Nigeria":               (0.0,   0.502, 0.224,  0.0,   0.502, 0.224),
    "Perú":                  (0.8,   0.0,   0.0,    0.8,   0.0,   0.0  ),
    # Grupo I
    "Corea del Sur":         (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Irán":                  (0.0,   0.427, 0.271,  0.737, 0.133, 0.176),
    "Honduras":              (0.004, 0.129, 0.412,  0.004, 0.129, 0.412),
    # Grupo J
    "Austria":               (0.929, 0.161, 0.224,  0.929, 0.161, 0.224),
    "Chile":                 (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Irak":                  (0.0,   0.518, 0.255,  0.0,   0.518, 0.255),
    "República Dominicana":  (0.004, 0.129, 0.412,  0.737, 0.133, 0.176),
    # Grupo K
    "Nueva Zelanda":         (0.0,   0.0,   0.4,    0.737, 0.133, 0.176),
    "Costa de Marfil":       (1.0,   0.620, 0.0,    0.0,   0.502, 0.2  ),
    "Dinamarca":             (0.737, 0.133, 0.176,  0.737, 0.133, 0.176),
    "Serbia":                (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    # Grupo L
    "Croacia":               (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Turquía":               (0.886, 0.102, 0.122,  0.886, 0.102, 0.122),
    "Canadá":                (0.8,   0.0,   0.0,    0.8,   0.0,   0.0  ),
    "Rumania":               (0.0,   0.502, 0.224,  0.004, 0.129, 0.412),
    # Extra (partidos ya puntuados en Pulponi)
    "Qatar":                 (0.518, 0.082, 0.271,  0.518, 0.082, 0.271),
    "Suecia":                (0.0,   0.220, 0.659,  0.984, 0.710, 0.0  ),
    "Túnez":                 (0.8,   0.0,   0.0,    0.8,   0.0,   0.0  ),
    "Escocia":               (0.0,   0.2,   0.6,    0.0,   0.2,   0.6  ),
    "Haití":                 (0.0,   0.071, 0.541,  0.0,   0.071, 0.541),
    "Bosnia":                (0.004, 0.129, 0.412,  0.004, 0.129, 0.412),
    "Paraguay":              (0.737, 0.133, 0.176,  0.0,   0.4,   0.153),
    "Curaçao":               (0.0,   0.4,   0.678,  0.0,   0.4,   0.678),
    "Noruega":               (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Jordania":              (0.0,   0.420, 0.247,  0.0,   0.420, 0.247),
    "Cabo Verde":            (0.0,   0.243, 0.525,  0.996, 0.784, 0.0  ),
    "Chequia":               (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Costa Rica":            (0.737, 0.133, 0.176,  0.004, 0.129, 0.412),
    "Jamaica":               (0.973, 0.737, 0.0,    0.0,   0.420, 0.247),
    "Venezuela":             (0.737, 0.133, 0.176,  0.0,   0.420, 0.247),
    "Nueva Zelanda":         (0.0,   0.0,   0.4,    0.737, 0.133, 0.176),
    # Empate / equipo desconocido
    "_empate":               (0.4,   0.4,   0.4,    0.5,   0.5,   0.5  ),
}

def get_colors(winner):
    t = TEAM_COLORS.get(winner, TEAM_COLORS["_empate"])
    return rgb(t[0],t[1],t[2]), rgb(t[3],t[4],t[5])


def sf(c, color): c.setFillColor(color)
def ss(c, color): c.setStrokeColor(color)


def draw_header_block(c, home_team, away_team, match_date,
                      home_score, away_score, winner_label,
                      exact_score, team_color, team_accent, penalty_line=None):
    sf(c, team_color)
    c.rect(PAGE_LEFT, PAGE_H-189, PAGE_RIGHT-PAGE_LEFT, 129, fill=1, stroke=0)
    ss(c, team_accent); c.setLineWidth(3.0)
    c.rect(PAGE_LEFT, PAGE_H-189, PAGE_RIGHT-PAGE_LEFT, 129, fill=0, stroke=1)

    sf(c, C_WHITE); c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(PAGE_W/2, PAGE_H-95, "PULPONI — RESULTADOS OFICIALES")
    sf(c, C_YELLOW); c.setFont("Helvetica", 11)
    c.drawCentredString(PAGE_W/2, PAGE_H-116, f"{home_team} vs {away_team} | {match_date}")
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(PAGE_W/2, PAGE_H-143, f"{home_score} — {away_score}")
    sf(c, C_WHITE); c.setFont("Helvetica", 10)
    c.drawCentredString(PAGE_W/2, PAGE_H-172, winner_label)
    if penalty_line:
        sf(c, C_YELLOW); c.setFont("Helvetica-Bold", 9.5)
        c.drawCentredString(PAGE_W/2, PAGE_H-185, penalty_line)

    third = (PAGE_RIGHT - PAGE_LEFT) / 3
    sections = [
        (PAGE_LEFT,         C_LEY_3, C_LEY_3B, "3 PUNTOS", f"— Marcador exacto ({exact_score})"),
        (PAGE_LEFT+third,   C_LEY_1, C_LEY_1B, "1 PUNTO",  "— Ganador correcto"),
        (PAGE_LEFT+2*third, C_LEY_0, C_LEY_0B, "0 PUNTOS", "— Empate o perdedor"),
    ]
    ley_y0 = PAGE_H-228.5; ley_h = 27.5; ley_ty = PAGE_H-222.5
    for x, bg, brd, bold_t, reg_t in sections:
        sf(c, bg);  c.rect(x, ley_y0, third, ley_h, fill=1, stroke=0)
        ss(c, brd); c.setLineWidth(1.0)
        c.rect(x, ley_y0, third, ley_h, fill=0, stroke=1)
        sf(c, C_DARK); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(x+6, ley_ty, bold_t)
        bw = c.stringWidth(bold_t, "Helvetica-Bold", 9.5)
        c.setFont("Helvetica", 9.5)
        c.drawString(x+6+bw+4, ley_ty, reg_t)


def _pts_tier(pts):
    """Nivel de color/peso. Con bono de penales los puntos pueden ser 0-5."""
    if pts <= 0:
        return 0
    if pts >= 3:
        return 3
    return 1


def _db_bool(value):
    """Normaliza exact_hit/winner_hit de pick_scores (bool, 't'/'f', 1/0)."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "t", "1", "yes", "y"):
            return True
        if normalized in ("false", "f", "0", "no", "n", ""):
            return False
    if isinstance(value, (int, float)):
        return int(value) == 1
    return bool(value)


def _participant_score_flags(participant):
    exact_hit = _db_bool(participant.get("exact_hit"))
    winner_hit = _db_bool(participant.get("winner_hit"))
    return exact_hit, winner_hit


def _pts_90_label(participant, no_pick=False):
    """Pts del marcador normal según flags de pick_scores (no recalcular)."""
    exact_hit, winner_hit = _participant_score_flags(participant)
    if no_pick:
        return "0"
    if exact_hit:
        return "+3"
    if winner_hit:
        return "+1"
    return "0"


def _resultado_90_label(participant, home_score, away_score, no_pick=False):
    exact_hit, winner_hit = _participant_score_flags(participant)
    if no_pick:
        return "Fallo"
    if exact_hit:
        return "Exacto"
    if winner_hit:
        if int(home_score) == int(away_score):
            return "Empate"
        return "Ganador"
    return "Fallo"


def _penalty_pts_label(participant, went_to_penalties, match_penalty_winner, match_penalty_home, match_penalty_away):
    if not went_to_penalties:
        return "N/A"

    pts_pen = 0
    detalle = []
    pen_winner = participant.get("penalty_winner_pick", participant.get("penalty_winner", "")) or ""
    pen_home = participant.get("penalty_home_pick")
    pen_away = participant.get("penalty_away_pick")

    if pen_winner and str(pen_winner).lower() == str(match_penalty_winner or "").lower():
        pts_pen += 1
        detalle.append("Gan.✓")

    try:
        if int(pen_home) == int(match_penalty_home) and int(pen_away) == int(match_penalty_away):
            pts_pen += 1
            detalle.append("Marc.✓")
    except (TypeError, ValueError):
        pass

    if detalle:
        return f"+{pts_pen} ({', '.join(detalle)})"
    return "0"


def _penalty_breakdown(
    participant,
    went_to_penalties=False,
    home_score=0,
    away_score=0,
    match_penalty_winner=None,
    match_penalty_home=None,
    match_penalty_away=None,
):
    """Total partido = points_awarded. Pts partido/resultado desde flags de pick_scores."""
    total_pts = int(participant.get("points", 0) or 0)
    no_pick = bool(participant.get("no_pick"))
    exact_hit, winner_hit = _participant_score_flags(participant)

    pts_90_label = _pts_90_label(participant, no_pick)
    if exact_hit:
        pts_90_val = 3
    elif winner_hit:
        pts_90_val = 1
    else:
        pts_90_val = 0

    pred_pen = participant.get("penalty_prediction") or "—"
    pts_pen_label = _penalty_pts_label(
        participant,
        went_to_penalties,
        match_penalty_winner,
        match_penalty_home,
        match_penalty_away,
    )

    return {
        "total": total_pts,
        "pts_90": pts_90_val,
        "pts_90_label": pts_90_label,
        "resultado_90": _resultado_90_label(participant, home_score, away_score, no_pick),
        "pred_pen": pred_pen if went_to_penalties else "—",
        "pts_pen_label": pts_pen_label,
    }


def _draw_centered(c, x_center, y, text, font="Helvetica", size=9):
    sf(c, C_DARK)
    c.setFont(font, size)
    w = c.stringWidth(str(text), font, size)
    c.drawString(x_center - w / 2, y, str(text))


def draw_table_header(c, team_color, top_y, show_penalty_column=False, show_breakdown=False):
    th_h = 48.0 if show_breakdown else 40.0
    sf(c, team_color)
    c.rect(PAGE_LEFT, top_y-th_h, PAGE_RIGHT-PAGE_LEFT, th_h, fill=1, stroke=0)
    sf(c, C_WHITE); c.setFont("Helvetica-Bold", 10)
    if show_breakdown:
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(54.0,  top_y-22, "Lugar")
        c.drawString(74.0,  top_y-22, "Participante")
        c.drawString(148.0, top_y-22, "Tu predicción")
        c.drawString(196.0, top_y-22, "Resultado")
        c.drawString(268.0, top_y-22, "Pts partido")
        c.drawString(302.0, top_y-22, "Pred. penales")
        c.drawString(392.0, top_y-22, "Pts penales")
        c.drawString(478.0, top_y-22, "Total")
    elif show_penalty_column:
        c.drawString(57.0,  top_y-24, "Lugar")
        c.drawString(96.4,  top_y-24, "Participante")
        c.drawString(232.0, top_y-24, "Pred. 90'")
        c.drawString(296.0, top_y-24, "Pred. penales")
        c.drawString(432.0, top_y-24, "Puntos")
        c.drawString(492.0, top_y-24, "Total")
    else:
        c.drawString(57.0,  top_y-24, "Lugar")
        c.drawString(145.6, top_y-24, "Participante")
        c.drawString(263.9, top_y-24, "Predicción")
        c.drawString(335.5, top_y-24, "Puntos")
        c.drawString(405.7, top_y-24, "Resultado")
        c.drawString(488.7, top_y-24, "Total Acum.")
    return top_y - th_h


def draw_row(
    c,
    y_bottom,
    participant,
    show_penalty_column=False,
    show_breakdown=False,
    went_to_penalties=False,
    home_score=0,
    away_score=0,
    penalty_winner=None,
    penalty_home=None,
    penalty_away=None,
):
    pts     = participant["points"]
    no_pick = participant.get("no_pick", False)
    tier    = _pts_tier(pts)

    bg = C_ROW_3 if tier==3 else (C_ROW_1 if tier==1 else C_ROW_0)
    sf(c, bg); c.rect(PAGE_LEFT, y_bottom, PAGE_RIGHT-PAGE_LEFT, ROW_H, fill=1, stroke=0)

    ty = y_bottom + 8

    # Lugar
    sf(c, C_DARK); c.setFont("Helvetica", 9)
    c.drawString(57.0, ty, participant["place"])

    # Nombre — color y peso según puntos
    if tier == 3:
        sf(c, C_NAME_3); name_font_name = "Helvetica-Bold"
    elif tier == 1:
        sf(c, C_NAME_1); name_font_name = "Helvetica-Bold"
    else:
        sf(c, C_NAME_0); name_font_name = "Helvetica"
    name_x = 74.0 if show_breakdown else 96.4
    name_font_size = 8 if show_breakdown else 9
    display_name = participant["name"]
    if show_breakdown and len(display_name) > 14:
        display_name = display_name[:13] + "…"
    c.setFont(name_font_name, name_font_size)
    c.drawString(name_x, ty, display_name)

    # Puntos (negrita por nivel)
    pts_str = str(pts)
    if tier == 3:
        sf(c, C_PTS_3); c.setFont("Helvetica-Bold", 10)
    elif tier == 1:
        sf(c, C_PTS_1); c.setFont("Helvetica-Bold", 10)
    else:
        sf(c, C_PTS_0); c.setFont("Helvetica", 10)

    if show_breakdown:
        bd = _penalty_breakdown(
            participant,
            went_to_penalties,
            home_score,
            away_score,
            penalty_winner,
            penalty_home,
            penalty_away,
        )
        pts_str = str(bd["total"])
        # Tu predicción
        sf(c, C_DARK); c.setFont("Helvetica", 8)
        pred90 = "—" if no_pick else (participant.get("prediction") or "—")
        c.drawString(148.0, ty, pred90[:8])
        # Resultado
        c.drawString(196.0, ty, bd["resultado_90"])
        # Pts partido
        pts90 = bd["pts_90_label"]
        exact_hit, winner_hit = _participant_score_flags(participant)
        if exact_hit:
            sf(c, C_PTS_3); c.setFont("Helvetica-Bold", 9)
        elif winner_hit:
            sf(c, C_PTS_1); c.setFont("Helvetica-Bold", 9)
        else:
            sf(c, C_PTS_0); c.setFont("Helvetica", 9)
        _draw_centered(c, 281.0, ty + 0.3, pts90, c._fontname, 9)
        # Pred. penales
        sf(c, C_DARK); c.setFont("Helvetica", 7.5)
        pred_pen = bd["pred_pen"]
        if len(pred_pen) > 16:
            pred_pen = pred_pen[:15] + "…"
        c.drawString(302.0, ty, pred_pen)
        # Pts penales
        pen_lbl = bd["pts_pen_label"]
        if pen_lbl.startswith("+"):
            sf(c, C_PTS_3); c.setFont("Helvetica-Bold", 8)
        else:
            sf(c, C_PTS_0); c.setFont("Helvetica", 8)
        c.drawString(392.0, ty + 0.3, pen_lbl)
        # Total (= points_awarded)
        sf(c, C_DARK); c.setFont("Helvetica-Bold", 10)
        _draw_centered(c, 518.0, ty + 0.3, pts_str, "Helvetica-Bold", 10)
        return

    if show_penalty_column:
        # Predicción 90'
        sf(c, C_DARK); c.setFont("Helvetica", 9)
        pred = "—" if no_pick else participant.get("prediction", "—")
        c.drawString(232.0, ty, pred)
        # Predicción de penales
        sf(c, C_DARK); c.setFont("Helvetica", 9)
        pen = participant.get("penalty_prediction") or "—"
        c.drawString(296.0, ty, pen)
        # Puntos
        if tier == 3:   sf(c, C_PTS_3); c.setFont("Helvetica-Bold", 10)
        elif tier == 1: sf(c, C_PTS_1); c.setFont("Helvetica-Bold", 10)
        else:           sf(c, C_PTS_0); c.setFont("Helvetica", 10)
        pw = c.stringWidth(pts_str, c._fontname, 10)
        c.drawString(446.0+(14-pw)/2, ty+0.3, pts_str)
        # Total
        sf(c, C_DARK); c.setFont("Helvetica-Bold", 10)
        ts = str(participant.get("total",""))
        tw = c.stringWidth(ts, "Helvetica-Bold", 10)
        c.drawString(503.0+(14-tw)/2, ty+0.3, ts)
        return

    # Predicción
    sf(c, C_DARK); c.setFont("Helvetica", 9)
    pred = "—" if no_pick else participant.get("prediction", "—")
    c.drawString(282.9, ty, pred)

    # Puntos
    if tier == 3:   sf(c, C_PTS_3); c.setFont("Helvetica-Bold", 10)
    elif tier == 1: sf(c, C_PTS_1); c.setFont("Helvetica-Bold", 10)
    else:           sf(c, C_PTS_0); c.setFont("Helvetica", 10)
    pw = c.stringWidth(pts_str, c._fontname, 10)
    c.drawString(349.7+(14-pw)/2, ty+0.3, pts_str)

    # Resultado
    sf(c, C_DARK); c.setFont("Helvetica", 9)
    if no_pick:    c.drawString(401.6, ty, "Sin predicción")
    elif tier==3:  c.drawString(413.3, ty, "¡Exacto!")
    elif tier==1:  c.drawString(394.8, ty, "Ganador correcto")
    else:          c.drawString(408.6, ty, "Sin puntos")

    # Total
    sf(c, C_DARK); c.setFont("Helvetica-Bold", 10)
    ts = str(participant.get("total",""))
    tw = c.stringWidth(ts, "Helvetica-Bold", 10)
    c.drawString(511.8+(14-tw)/2, ty+0.3, ts)


def draw_table_border(c, top_y, bottom_y):
    ss(c, C_GRAY_BORDER); c.setLineWidth(0.5)
    c.rect(PAGE_LEFT, bottom_y, PAGE_RIGHT-PAGE_LEFT, top_y-bottom_y, fill=0, stroke=1)


def draw_totals_footer(c, bottom_y, total_p, exact_c, winner_c, zero_c, match_date):
    ly = bottom_y - 34; ny = bottom_y - 48
    cols = [
        (72.5,  "Total participantes", str(total_p)),
        (210.2, "Exacto (3 pts)",      str(exact_c)),
        (334.8, "Ganador (1 pt)",       str(winner_c)),
        (469.2, "Sin puntos",           str(zero_c)),
    ]
    sf(c, C_DARK)
    for x, label, val in cols:
        c.setFont("Helvetica-Bold", 10); c.drawString(x, ly, label)
        c.setFont("Helvetica", 10);      c.drawString(x+18, ny, val)
    sf(c, C_GRAY_FOOTER); c.setFont("Helvetica", 8)
    c.drawCentredString(PAGE_W/2, bottom_y-74, f"Generado por Pulponi · {match_date}")


def _build_pdf(cv, home_team, away_team, home_score, away_score,
               match_date, participants,
               is_knockout=False, went_to_penalties=False,
               penalty_home=None, penalty_away=None, penalty_winner=None):
    # La columna "Penales" se muestra en cualquier partido de eliminatoria.
    show_penalty_column = bool(is_knockout)
    # La línea de penales en el header solo si el partido SÍ fue a penales.
    went = bool(is_knockout) and bool(went_to_penalties) and bool(penalty_winner)
    # El desglose de puntos (Pts Marcador / Pts Penales / Total) solo si fue a penales.
    show_breakdown = went

    penalty_line = None
    if went:
        ph = penalty_home if penalty_home is not None else "?"
        pa = penalty_away if penalty_away is not None else "?"
        penalty_line = f"Penales: {ph}-{pa} ({penalty_winner} avanza)"
        winner = penalty_winner
        winner_label = "Empate en los 90' · Definido en penales"
    elif home_score > away_score:
        winner = home_team
        winner_label = f"{home_team} gana · Resultado final"
    elif away_score > home_score:
        winner = away_team
        winner_label = f"{away_team} gana · Resultado final"
    else:
        winner = "_empate"
        winner_label = "Empate · Resultado final"

    exact_score = f"{home_score}-{away_score}"
    team_color, team_accent = get_colors(winner)

    draw_header_block(cv, home_team, away_team, match_date,
                      home_score, away_score, winner_label,
                      exact_score, team_color, team_accent, penalty_line)

    table_top = PAGE_H - 228.5
    row_y     = draw_table_header(cv, team_color, table_top, show_penalty_column, show_breakdown)
    rows_top  = table_top

    for p in participants:
        if row_y - ROW_H < 80:
            draw_table_border(cv, rows_top, row_y)
            cv.showPage()
            table_top = PAGE_H - 60
            row_y     = draw_table_header(cv, team_color, table_top, show_penalty_column, show_breakdown)
            rows_top  = table_top
        row_y -= ROW_H
        draw_row(
            cv, row_y, p, show_penalty_column, show_breakdown, went,
            home_score, away_score, penalty_winner, penalty_home, penalty_away,
        )

    draw_table_border(cv, rows_top, row_y)
    total_p  = len(participants)
    exact_c  = sum(1 for p in participants if p["points"] >= 3)
    winner_c = sum(1 for p in participants if 0 < p["points"] < 3)
    zero_c   = sum(1 for p in participants if p["points"] <= 0)
    draw_totals_footer(cv, row_y, total_p, exact_c, winner_c, zero_c, match_date)
    cv.save()


def generate_results_pdf(home_team, away_team, home_score, away_score,
                          match_date, participants, output_path=None,
                          is_knockout=False, went_to_penalties=False,
                          penalty_home=None, penalty_away=None, penalty_winner=None):
    """Guarda el PDF en disco. Para pruebas locales."""
    if not output_path:
        safe = f"{home_team.lower().replace(' ','_')}_vs_{away_team.lower().replace(' ','_')}.pdf"
        output_path = f"./{safe}"
    cv = canvas.Canvas(output_path, pagesize=letter)
    _build_pdf(cv, home_team, away_team, home_score, away_score, match_date, participants,
               is_knockout, went_to_penalties, penalty_home, penalty_away, penalty_winner)
    return output_path


def generate_results_pdf_bytes(home_team, away_team, home_score, away_score,
                                match_date, participants,
                                is_knockout=False, went_to_penalties=False,
                                penalty_home=None, penalty_away=None, penalty_winner=None):
    """Regresa el PDF como base64. Usada por el serverless de Vercel."""
    buf = io.BytesIO()
    cv = canvas.Canvas(buf, pagesize=letter)
    _build_pdf(cv, home_team, away_team, home_score, away_score, match_date, participants,
               is_knockout, went_to_penalties, penalty_home, penalty_away, penalty_winner)
    buf.seek(0)
    return base64.b64encode(buf.getvalue()).decode()
