import { splitKrakenMatchEmoji } from '../lib/krakenMatchMessages';
import { useKrakenMatchMessage } from '../hooks/useKrakenMatchMessage';

export default function KrakenMatchMessage() {
  const { message } = useKrakenMatchMessage();

  if (!message) return null;

  const { emoji, body } = splitKrakenMatchEmoji(message);

  return (
    <article className="kraken-match-message pulponi-card" role="status" aria-live="polite">
      <p className="kraken-match-message__emoji" aria-hidden>
        {emoji}
      </p>
      <p className="kraken-match-message__text">{body}</p>
    </article>
  );
}
