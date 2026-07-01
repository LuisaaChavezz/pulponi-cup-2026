import { useCallback, useEffect, useRef, useState } from 'react';
import { splitKrakenMatchEmoji } from '../lib/krakenMatchMessages';

const SWIPE_THRESHOLD_PX = 48;

export default function KrakenCarousel({ messages = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [messages.length]);

  const count = messages.length;
  const hasMany = count > 1;
  const safeIndex = count ? Math.min(activeIndex, count - 1) : 0;
  const current = messages[safeIndex];

  const goPrev = useCallback(() => {
    setActiveIndex((idx) => (idx <= 0 ? count - 1 : idx - 1));
  }, [count]);

  const goNext = useCallback(() => {
    setActiveIndex((idx) => (idx >= count - 1 ? 0 : idx + 1));
  }, [count]);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null || !hasMany) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  if (!current?.text) return null;

  const { emoji, body } = splitKrakenMatchEmoji(current.text);

  return (
    <article
      className="kraken-carousel pulponi-card"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Mensajes del Trono Kraken"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="kraken-carousel__slide">
        {emoji ? (
          <p className="kraken-carousel__emoji" aria-hidden>
            {emoji}
          </p>
        ) : null}
        <p className="kraken-carousel__text">{body}</p>
      </div>

      {hasMany ? (
        <div className="kraken-carousel__nav">
          <button
            type="button"
            className="kraken-carousel__arrow"
            onClick={goPrev}
            aria-label="Mensaje anterior del Kraken"
          >
            ‹
          </button>
          <div className="kraken-carousel__dots" role="tablist" aria-label="Mensajes del Kraken">
            {messages.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                className={`kraken-carousel__dot${index === safeIndex ? ' kraken-carousel__dot--active' : ''}`}
                aria-selected={index === safeIndex}
                aria-label={`Mensaje ${index + 1} de ${count}`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
          <button
            type="button"
            className="kraken-carousel__arrow"
            onClick={goNext}
            aria-label="Siguiente mensaje del Kraken"
          >
            ›
          </button>
        </div>
      ) : null}
    </article>
  );
}
