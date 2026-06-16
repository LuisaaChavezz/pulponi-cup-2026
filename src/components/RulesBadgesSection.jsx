import { ACHIEVEMENT_CATALOG, isAchievementUnlockedById, userHasBadge } from '../data/achievements';

const ACTIVE_BADGES = ACHIEVEMENT_CATALOG.filter((badge) => badge.active);

export default function RulesBadgesSection({
  unlockedAchievementIds = null,
  userBadgeRows = [],
  profileId = null,
} = {}) {
  const unlockedSet =
    unlockedAchievementIds == null
      ? null
      : unlockedAchievementIds instanceof Set
        ? unlockedAchievementIds
        : new Set(unlockedAchievementIds);

  return (
    <section className="rules-badges" aria-labelledby="rules-badges-title">
      <h3 id="rules-badges-title" className="rules-badges__title">
        Badges y logros
      </h3>
      <p className="rules-badges__lead">
        Los logros automáticos se desbloquean según tus exactos, racha, ranking e Índice Pulpo. Algunos
        badges especiales solo se otorgan manualmente.
      </p>
      <ul className="rules-badges__grid">
        {ACTIVE_BADGES.map((badge) => {
          const unlocked = profileId
            ? userHasBadge(userBadgeRows, profileId, badge.id)
            : unlockedSet == null
              ? null
              : isAchievementUnlockedById(unlockedSet, badge.id);

          return (
            <li
              key={badge.id}
              className={[
                'rules-badges__card',
                'pulponi-card',
                unlocked === true ? 'rules-badges__card--unlocked' : '',
                unlocked === false ? 'rules-badges__card--locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="rules-badges__icon" aria-hidden="true">
                {badge.icon}
              </span>
              <strong className="rules-badges__name">{badge.name}</strong>
              <p className="rules-badges__desc">{badge.requirement}</p>
              {badge.manualGrant ? (
                <p className="rules-badges__meta">Otorgado manualmente por el pulpo</p>
              ) : null}
              {unlocked === true ? (
                <p className="rules-badges__status rules-badges__status--unlocked">Desbloqueado</p>
              ) : unlocked === false ? (
                <p className="rules-badges__status rules-badges__status--locked">Bloqueado</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
