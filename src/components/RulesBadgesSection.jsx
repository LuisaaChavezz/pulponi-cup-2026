import { ACHIEVEMENT_CATALOG } from '../data/achievements';

const ACTIVE_BADGES = ACHIEVEMENT_CATALOG.filter((badge) => badge.active);

export default function RulesBadgesSection() {
  return (
    <section className="rules-badges" aria-labelledby="rules-badges-title">
      <h3 id="rules-badges-title" className="rules-badges__title">
        Badges y logros
      </h3>
      <p className="rules-badges__lead">
        Se desbloquean automáticamente según tus exactos, racha, ranking e Índice Pulpo.
      </p>
      <ul className="rules-badges__grid">
        {ACTIVE_BADGES.map((badge) => (
          <li key={badge.id} className="rules-badges__card pulponi-card">
            <span className="rules-badges__icon" aria-hidden="true">
              {badge.icon}
            </span>
            <strong className="rules-badges__name">{badge.name}</strong>
            <p className="rules-badges__desc">{badge.requirement}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
