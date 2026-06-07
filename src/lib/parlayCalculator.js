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
 * Ganancia estimada con factor Pulponi sobre la utilidad (no sobre el stake).
 * grossGain = stake * (totalOdds - 1)
 * pulponiGain = grossGain * 0.70
 */
export function calculateVirtualParlayPayout(stake, totalOdds, gainFactor = PULPONI_GAIN_FACTOR) {
  const safeStake = Math.max(0, Number(stake) || 0);
  const safeOdds = Math.max(1, Number(totalOdds) || 1);
  const grossReturn = safeStake * safeOdds;
  const grossGain = Math.max(0, grossReturn - safeStake);
  const commissionRate = 1 - gainFactor;
  const pulponiGain = grossGain * gainFactor;
  const pulponiReturn = safeStake + pulponiGain;

  return {
    stake: safeStake,
    totalOdds: safeOdds,
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
