import { useEffect } from 'react';

export default function KrakenBanner({ visible, text, fading, onDismiss, autoDismissMs = 7000 }) {
  useEffect(() => {
    if (!visible || !text) return undefined;
    const timer = window.setTimeout(() => onDismiss?.(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [visible, text, onDismiss, autoDismissMs]);

  if (!visible || !text) return null;

  return (
    <div
      className={`kraken-banner${fading ? ' kraken-banner--fade-out' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="kraken-banner__text">{text}</p>
      <button type="button" className="kraken-banner__close" onClick={() => onDismiss?.()} aria-label="Cerrar">
        ✕
      </button>
    </div>
  );
}
