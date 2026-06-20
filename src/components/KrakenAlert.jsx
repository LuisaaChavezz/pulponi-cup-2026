import { useEffect } from 'react';

export default function KrakenAlert({ open, message, onDismiss }) {
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

  if (!open || !message) return null;

  return (
    <div
      className="kraken-throne-alert-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kraken-alert-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div className="kraken-throne-alert">
        <p className="kraken-throne-alert__kicker">Trono Kraken</p>
        <h2 id="kraken-alert-title" className="kraken-throne-alert__title">
          {message.title}
        </h2>
        <p className="kraken-throne-alert__body kraken-throne-alert__body--emphasis">{message.body}</p>
        <button type="button" className="kraken-throne-alert__close" onClick={() => onDismiss?.()}>
          Entendido
        </button>
      </div>
    </div>
  );
}
