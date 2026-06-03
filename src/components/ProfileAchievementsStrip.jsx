import {
  ACHIEVEMENT_CATALOG,
  countAchievementsTotal,
  countAchievementsUnlocked,
  isAchievementUnlockedById,
} from '../data/achievements';

export default function ProfileAchievementsStrip({ unlockedIds, catalog = ACHIEVEMENT_CATALOG, onViewAll }) {
  const unlockedSet = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds ?? []);
  const unlockedList = catalog.filter((a) => isAchievementUnlockedById(unlockedSet, a.id));
  const display = unlockedList.slice(0, 8);
  const total = countAchievementsTotal(catalog);
  const count = countAchievementsUnlocked(unlockedSet, catalog);

  return (
    <div className="profile-achievements">
      <div className="profile-achievements__head">
        <p className="profile-achievements__counter">
          Logros desbloqueados:{' '}
          <strong>
            {count} / {total}
          </strong>
        </p>
        {onViewAll ? (
          <button type="button" className="profile-achievements__link" onClick={onViewAll}>
            Mis logros
          </button>
        ) : null}
      </div>

      {display.length ? (
        <div className="profile-achievements__row badges-row" aria-label="Logros desbloqueados">
          {display.map((a) => (
            <span key={a.id} className="profile-achievements__badge" title={a.name}>
              {a.icon}
            </span>
          ))}
        </div>
      ) : (
        <p className="profile-achievements__empty">Aún no has desbloqueado logros. ¡Sigue prediciendo!</p>
      )}
    </div>
  );
}
