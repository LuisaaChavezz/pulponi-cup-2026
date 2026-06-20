export default function KrakenFab({ visible, onOpen, showDot = false }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      className="kraken-fab"
      onClick={() => onOpen?.()}
      aria-label="Ver mensajes del Kraken en comunidad"
      title="Trono Kraken"
    >
      <span className="kraken-fab__emoji" aria-hidden>
        🦑
      </span>
      {showDot ? <span className="kraken-fab__dot" aria-hidden /> : null}
    </button>
  );
}
