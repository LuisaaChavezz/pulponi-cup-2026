import {
  ACHIEVEMENT_CATALOG,
  buildUnlockedBadgesForProfile,
  countAchievementsTotal,
} from '../data/achievements';
import BadgeIcon from './BadgeIcon';

export default function ProfileAchievementsStrip({
  catalog = ACHIEVEMENT_CATALOG,
  userBadgeRows = [],
  profileId = null,
  onViewAll,
}) {
  const unlockedBadges = buildUnlockedBadgesForProfile(userBadgeRows, profileId, catalog);
  const display = unlockedBadges.slice(0, 8);
  const total = countAchievementsTotal(catalog);
  const count = unlockedBadges.length;

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
              <BadgeIcon badgeId={a.id} icon={a.icon} iconSrc={a.iconSrc} alt="" />
            </span>
          ))}
        </div>
      ) : (
        <p className="profile-achievements__empty">Aún no has desbloqueado logros. ¡Sigue prediciendo!</p>
      )}
    </div>
  );
}
