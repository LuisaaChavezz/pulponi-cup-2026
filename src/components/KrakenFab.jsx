export default function KrakenFab({ visible, onOpen }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      className="kraken-fab"
      onClick={() => onOpen?.()}
      aria-label="Ver aviso del Trono Kraken"
      title="Trono Kraken"
    >
      <span className="kraken-fab__emoji" aria-hidden>
        🦑
      </span>
      <span className="kraken-fab__dot" aria-hidden />
    </button>
  );
}
