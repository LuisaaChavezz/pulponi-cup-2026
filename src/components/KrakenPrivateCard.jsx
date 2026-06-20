export default function KrakenPrivateCard({ message, onDismiss }) {
  if (!message?.title && !message?.body) return null;

  return (
    <article className="kraken-private-card" aria-label="Mensaje privado del Kraken">
      <div className="kraken-private-card__head">
        <span className="kraken-private-card__avatar" aria-hidden>
          🦑
        </span>
        <div>
          <p className="kraken-private-card__kicker">Solo para ti · Trono Kraken</p>
          <h3 className="kraken-private-card__title">{message.title}</h3>
        </div>
      </div>
      {message.body ? <p className="kraken-private-card__body">{message.body}</p> : null}
      <button type="button" className="kraken-private-card__close" onClick={() => onDismiss?.(message.id)}>
        Entendido 🦑
      </button>
    </article>
  );
}
