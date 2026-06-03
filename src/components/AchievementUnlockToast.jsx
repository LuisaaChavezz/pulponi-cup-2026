import { useEffect } from 'react';
import { getAchievementById } from '../data/achievements';

export default function AchievementUnlockToast({ unlock, onDismiss }) {
  const achievement = unlock?.badgeId ? getAchievementById(unlock.badgeId) : null;

  useEffect(() => {
    if (!achievement) return undefined;
    const id = window.setTimeout(() => onDismiss?.(), 4500);
    return () => window.clearTimeout(id);
  }, [achievement, onDismiss]);

  if (!achievement) return null;

  return (
    <div className="achievement-unlock-toast" role="status" aria-live="polite">
      <div className="achievement-unlock-toast__burst" aria-hidden />
      <p className="achievement-unlock-toast__kicker">🏆 Nuevo logro desbloqueado</p>
      <p className="achievement-unlock-toast__icon" aria-hidden>
        {achievement.icon}
      </p>
      <p className="achievement-unlock-toast__name">{achievement.name}</p>
      <button type="button" className="achievement-unlock-toast__close" onClick={() => onDismiss?.()}>
        Cerrar
      </button>
    </div>
  );
}
