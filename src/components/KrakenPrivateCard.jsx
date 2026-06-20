export default function KrakenPrivateCard({ message, onDismiss }) {
  if (!message?.title && !message?.body) return null;

  return (
    <article className="kraken-private-card" aria-label="Mensaje privado del Kraken">
      <div className="kraken-private-card__head">
        <span className="kraken-private-card__avatar" aria-hidden>
          🦑
        </span>
        <div className="kraken-private-card__meta">
          <p className="kraken-private-card__kicker">Solo para ti · Trono Kraken</p>
          <h3 className="kraken-private-card__title">{message.title}</h3>
        </div>
        <button
          type="button"
          className="kraken-private-card__dismiss"
          onClick={() => onDismiss?.(message.id)}
          aria-label="Cerrar mensaje del Kraken"
        >
          ×
        </button>
      </div>
      {message.body ? <p className="kraken-private-card__body">{message.body}</p> : null}
    </article>
  );
}
