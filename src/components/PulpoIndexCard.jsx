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
      picks,
      matches,
      communityPickProfiles,
      userId,
      performanceStats: perf?.predicted != null ? perf : null,
    });
  }, [profile, picks, matches, communityPickProfiles, userId, pickScoreRows, performanceStats]);

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
          <span>Puntos</span>
          <span>{stats.points} ×2</span>
        </li>
        <li>
          <span>Exactos</span>
          <span>{stats.exacts} ×5</span>
        </li>
        <li>
          <span>Racha</span>
          <span>{stats.streak} ×3</span>
        </li>
        <li>
          <span>Riesgosos acertados</span>
          <span>{stats.riskyHits} ×8</span>
        </li>
        <li>
          <span>Consistencia</span>
          <span>
            {stats.gradedPicks > 0 ? `${stats.consistencyPct}%` : '—'}
            {stats.consistencyBonus > 0 ? ` (+${stats.consistencyBonus})` : ''}
          </span>
        </li>
      </ul>
    </div>
  );
}
