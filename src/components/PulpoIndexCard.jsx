import { useMemo } from 'react';
import { computePulpoDerivedStats, formatPulpoIndexLine } from '../lib/pulpoIndex';
import { getPerformanceStatsForProfile } from '../lib/pickScoreStats';

export default function PulpoIndexCard({
  profile,
  picks,
  matches,
  communityPickProfiles,
  userId,
  pickScoreRows = null,
  performanceStats = null,
}) {
  const stats = useMemo(() => {
    const perf =
      performanceStats ??
      (pickScoreRows?.length && profile?.id
        ? getPerformanceStatsForProfile(profile.id, pickScoreRows, matches)
        : null);

    return computePulpoDerivedStats({
      profile,
      performanceStats: perf?.predicted != null ? perf : null,
    });
  }, [profile, pickScoreRows, matches, performanceStats]);

  const levelSlug = stats.level.slug;

  return (
    <div className={`pulpo-index pulpo-index--${levelSlug}`} aria-label={formatPulpoIndexLine(stats)}>
      <div className="pulpo-index__main">
        <div className="pulpo-index__head">
          <span className="pulpo-index__emoji" aria-hidden>
            🐙
          </span>
          <div className="pulpo-index__titles">
            <p className="pulpo-index__label">Índice Pulpo</p>
            <p className="pulpo-index__value">{stats.index}%</p>
          </div>
        </div>

        <p className="pulpo-index__tier">
          {profile?.pulpo_stats?.title ?? stats.level.title}
        </p>

        <div
          className="pulpo-index__meter"
          role="meter"
          aria-valuenow={stats.index}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Índice Pulpo ${stats.index} por ciento`}
        >
          <div className="pulpo-index__meter-fill" style={{ width: `${stats.index}%` }} />
        </div>
      </div>

      <ul className="pulpo-index__breakdown">
        <li>
          <span>Exactos</span>
          <span>
            {stats.totalPicks > 0
              ? `${Math.round((stats.exacts / stats.totalPicks) * 100)}% ×0.5 (+${stats.exactTerm})`
              : '—'}
          </span>
        </li>
        <li>
          <span>Ganadores</span>
          <span>
            {stats.totalPicks > 0
              ? `${Math.round((stats.winners / stats.totalPicks) * 100)}% ×0.3 (+${stats.winnerTerm})`
              : '—'}
          </span>
        </li>
        <li>
          <span>Racha actual</span>
          <span>
            {stats.streak > 0 ? `${stats.streak} ×5 (máx 20 → +${stats.streakTerm})` : `+${stats.streakTerm}`}
          </span>
        </li>
        <li>
          <span>Picks puntuados</span>
          <span>{stats.totalPicks || '—'}</span>
        </li>
      </ul>
    </div>
  );
}
