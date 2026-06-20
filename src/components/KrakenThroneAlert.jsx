import { useEffect } from 'react';

export default function KrakenThroneAlert({ open, onDismiss }) {
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
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="kraken-throne-alert-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kraken-throne-alert-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div className="kraken-throne-alert">
        <p className="kraken-throne-alert__kicker">Trono Kraken</p>
        <h2 id="kraken-throne-alert-title" className="kraken-throne-alert__title">
          🦑 El Trono Kraken es tuyo... por ahora.
        </h2>
        <p className="kraken-throne-alert__body">
          Sigues en la cima, pero el Kraken solo obedece al más fuerte.
        </p>
        <p className="kraken-throne-alert__body kraken-throne-alert__body--emphasis">
          Alguien está acechando tu trono. No bajes la guardia.
        </p>
        <button type="button" className="kraken-throne-alert__close" onClick={() => onDismiss?.()}>
          Entendido
        </button>
      </div>
    </div>
  );
}
