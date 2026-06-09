/** Valor vacío del input (0 es válido y no cuenta como vacío). */
export function isPickScoreInputEmpty(raw) {
  return raw === '' || raw == null;
}

/** Normaliza entrada de marcador a entero ≥ 0 (acepta coma decimal). */
export function parsePickScoreInput(raw) {
  if (raw === 0 || raw === '0') return 0;
  if (isPickScoreInputEmpty(raw)) return null;

  const normalized = String(raw).trim().replace(',', '.');
  if (normalized === '' || normalized === '-') return null;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** Valor mostrado en el input controlado (preserva 0). */
export function formatPickScoreInputValue(value) {
  if (isPickScoreInputEmpty(value)) return '';
  if (value === 0 || value === '0') return '0';

  const parsed = parsePickScoreInput(value);
  if (parsed == null) {
    return typeof value === 'string' ? value : '';
  }
  return String(parsed);
}

/** Sanitiza valor visible del input (redondea decimales al escribir). */
export function sanitizePickScoreDraft(raw) {
  if (raw === 0 || raw === '0') return '0';
  if (isPickScoreInputEmpty(raw)) return '';

  const parsed = parsePickScoreInput(raw);
  return parsed == null ? '' : String(parsed);
}

export function validatePickScores(homeRaw, awayRaw) {
  if (isPickScoreInputEmpty(homeRaw) || isPickScoreInputEmpty(awayRaw)) {
    return { ok: false, error: 'Ingresa marcadores válidos (goles enteros).' };
  }

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
