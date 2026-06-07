/** Normaliza entrada de marcador a entero ≥ 0 (acepta coma decimal). */
export function parsePickScoreInput(raw) {
  if (raw === '' || raw == null) return null;
  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '' || normalized === '-') return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** Sanitiza valor visible del input (redondea decimales al escribir). */
export function sanitizePickScoreDraft(raw) {
  if (raw === '' || raw == null) return '';
  const parsed = parsePickScoreInput(raw);
  return parsed == null ? '' : String(parsed);
}

export function validatePickScores(homeRaw, awayRaw) {
  const home = parsePickScoreInput(homeRaw);
  const away = parsePickScoreInput(awayRaw);

  if (home == null || away == null) {
    return { ok: false, error: 'Ingresa marcadores válidos (goles enteros).' };
  }

  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return { ok: false, error: 'Solo se permiten goles enteros (0, 1, 2…).' };
  }

  return { ok: true, home, away };
}
