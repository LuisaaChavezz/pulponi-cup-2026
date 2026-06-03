import { useState } from 'react';

export default function AchievementCard({ achievement, unlocked, personal = false }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={`achievement-card${unlocked ? ' achievement-card--unlocked' : ' achievement-card--locked'}`}
    >
      <div className="achievement-icon" aria-hidden="true">
        {achievement.icon}
      </div>
      <h3 className="achievement-name">{achievement.name}</h3>
      <p className="achievement-description">{achievement.description}</p>
      <button
        type="button"
        className="achievement-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        ¿Cómo desbloquear?
        <span className={`achievement-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={`achievement-requirement${open ? ' is-open' : ''}`}>
        <div className="achievement-requirement-inner">
          <p>{achievement.requirement}</p>
        </div>
      </div>
      <p className="achievement-status">
        {unlocked ? (
          <>
            <span className="achievement-check" aria-hidden="true">
              ✅
            </span>{' '}
            Desbloqueado
          </>
        ) : personal ? (
          achievement.active === false ? 'Próximamente' : 'Aún no desbloqueado'
        ) : (
          'Sin ganador todavía'
        )}
      </p>
    </article>
  );
}
