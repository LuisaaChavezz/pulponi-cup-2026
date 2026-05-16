import { useEffect } from 'react';
import { displayTeamName } from '../lib/matchUtils';

function iconForVariant(v) {
  switch (String(v ?? '').toLowerCase()) {
    case 'goal':
      return '⚽';
    case 'penalty':
      return '🥅';
    case 'yellow':
      return '🟨';
    case 'red':
      return '🟥';
    case 'var':
      return '📺';
    case 'sub':
      return '🔁';
    case 'foul':
      return '⚠️';
    default:
      return '◆';
  }
}

function formatMinute(ev) {
  const m = ev.minute;
  if (m == null || m === '' || Number.isNaN(Number(m))) return '—';
  const extra = Number(ev.minuteExtra);
  return extra > 0 ? `${m}'+${extra}'` : `${m}'`;
}

export default function HighlightsModal({
  open,
  onClose,
  match,
  highlights,
  loading,
  isUpcomingOnly,
  headlineEmptyCopy,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open || !match) return null;

  const ht = displayTeamName(match.home_team);
  const at = displayTeamName(match.away_team);

  return (
    <div
      className="highlights-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="highlights-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="highlights-panel">
        <header className="highlights-panel-head">
          <div>
            <p className="highlights-panel-eyebrow">Pulponi Cup</p>
            <h2 id="highlights-title" className="highlights-panel-title">
              Highlights del partido
            </h2>
          </div>
          <button type="button" className="highlights-close" onClick={() => onClose?.()} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <p className="highlights-matchline">
          {ht ?? 'Local'} <span className="highlights-vs">VS</span> {at ?? 'Visitante'}
        </p>

        {isUpcomingOnly ? (
          <div className="highlights-banner highlights-banner--upcoming">
            Los highlights aparecerán cuando el partido esté en vivo.
          </div>
        ) : null}

        <div className="highlights-timeline-shell">
          {loading ? (
            <p className="highlights-muted">Cargando eventos…</p>
          ) : highlights?.length ? (
            <ul className="highlights-timeline">
              {highlights.map((ev, i) => (
                <li
                  key={ev.id ?? `hl-${i}`}
                  className={`highlight-row highlight-row--${ev.variant ?? 'other'}`}
                >
                  <span className="highlight-minute">{formatMinute(ev)}</span>
                  <span className="highlight-icon" aria-hidden>
                    {iconForVariant(ev.variant)}
                  </span>
                  <div className="highlight-body">
                    <p className="highlight-desc">{ev.description ?? '—'}</p>
                    <div className="highlight-meta">
                      {ev.team ? <span className="highlight-team">{ev.team}</span> : null}
                      {ev.player ? <span className="highlight-player">{ev.player}</span> : null}
                      {ev.apiType ? (
                        <span className="highlight-type-muted">{ev.apiType}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : headlineEmptyCopy ? (
            <p className="highlights-empty">{headlineEmptyCopy}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
