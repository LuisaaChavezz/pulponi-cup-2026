/** Pulponi Cup — cálculo transparente de parlay virtual (sin dinero real). */

export const PARLAY_MIN_SELECTIONS = 5;
export const PARLAY_MAX_SELECTIONS = 25;
export const PULPONI_GAIN_FACTOR = 0.7;
export const PULPONI_COMMISSION_RATE = 1 - PULPONI_GAIN_FACTOR;

export function formatDecimalOdds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toFixed(2);
}

export function decimalToAmerican(decimalOdd) {
  const n = Number(decimalOdd);
  if (!n || n <= 1) return null;

  if (n < 2) {
    return Math.round(-100 / (n - 1));
  }

  return Math.round((n - 1) * 100);
}

export function formatAmericanOdd(decimalOdd) {
  const american = decimalToAmerican(decimalOdd);
  if (american === null) return 'N/A';
  return american > 0 ? `+${american}` : `${american}`;
}

/** Momio total = producto de selecciones (formato decimal). */
export function multiplySelectionOdds(selections) {
  if (!selections?.length) return 1;
  return selections.reduce((acc, sel) => {
    const odd = Number(sel?.decimalOdds);
    if (!Number.isFinite(odd) || odd <= 0) return acc;
    return acc * odd;
  }, 1);
}

/**
 * Ganancia / retorno estimado.
 * - estimatedReturn: estilo casa (monto × momio total)
 * - pulponiReturn: stake + ganancia con factor interno Pulponi
 */
export function calculateVirtualParlayPayout(stake, totalOdds, gainFactor = PULPONI_GAIN_FACTOR) {
  const safeStake = Math.max(0, Number(stake) || 0);
  const safeOdds = Math.max(1, Number(totalOdds) || 1);
  const estimatedReturn = safeStake * safeOdds;
  const grossReturn = estimatedReturn;
  const grossGain = Math.max(0, grossReturn - safeStake);
  const commissionRate = 1 - gainFactor;
  const pulponiGain = grossGain * gainFactor;
  const pulponiReturn = safeStake + pulponiGain;

  return {
    stake: safeStake,
    totalOdds: safeOdds,
    estimatedReturn,
    grossReturn,
    grossGain,
    commissionRate,
    pulponiGainFactor: gainFactor,
    pulponiGain,
    pulponiReturn,
  };
}

export function parlaySelectionCountLabel(count) {
  if (count < PARLAY_MIN_SELECTIONS) {
    return `Faltan ${PARLAY_MIN_SELECTIONS - count} selección${PARLAY_MIN_SELECTIONS - count === 1 ? '' : 'es'}`;
  }
  if (count > PARLAY_MAX_SELECTIONS) {
    return `Máximo ${PARLAY_MAX_SELECTIONS} selecciones`;
  }
  return `${count} selección${count === 1 ? '' : 'es'}`;
}
