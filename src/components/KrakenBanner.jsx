export default function KrakenBanner({ visible, text, fading, onDismiss }) {
  if (!visible || !text) return null;

  return (
    <div
      className={`kraken-banner${fading ? ' kraken-banner--fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Aviso del Trono Kraken"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 'auto',
        width: '100%',
        height: 'auto',
        maxHeight: '5.5rem',
        margin: 0,
        padding: 0,
        background: 'transparent',
        pointerEvents: 'none',
        zIndex: 1300,
      }}
    >
      <div className="kraken-banner__inner">
        <p className="kraken-banner__text">{text}</p>
        <button type="button" className="kraken-banner__close" onClick={() => onDismiss?.()} aria-label="Cerrar">
          ✕
        </button>
      </div>
    </div>
  );
}
