import { parsePickScoreInput, sanitizePickScoreDraft } from '../lib/pickScoreInput';

export default function PickScoreInput({ value, onChange, disabled = false, ariaLabel = 'Goles' }) {
  function bump(delta) {
    const current = parsePickScoreInput(value) ?? 0;
    onChange(String(Math.max(0, current + delta)));
  }

  function handleChange(e) {
    const next = e.target.value;
    if (next === '') {
      onChange('');
      return;
    }
    onChange(sanitizePickScoreDraft(next));
  }

  function handleBlur(e) {
    onChange(sanitizePickScoreDraft(e.target.value));
  }

  return (
    <div className="pick-score-input">
      <button
        type="button"
        className="pick-score-input__btn"
        disabled={disabled}
        onClick={() => bump(-1)}
        aria-label={`Menos goles ${ariaLabel}`}
      >
        −
      </button>
      <input
        type="number"
        className="pick-score-input__field"
        min="0"
        step="1"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0"
        disabled={disabled}
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="pick-score-input__btn"
        disabled={disabled}
        onClick={() => bump(1)}
        aria-label={`Más goles ${ariaLabel}`}
      >
        +
      </button>
    </div>
  );
}
