import { useMemo } from 'react';
import { computePulpoDerivedStats, formatPulpoIndexLine } from '../lib/pulpoIndex';

export default function PulpoIndexCard({ profile, picks, matches, communityPickProfiles, userId }) {
  const stats = useMemo(
    () =>
      computePulpoDerivedStats({
        profile,
        picks,
        matches,
        communityPickProfiles,
        userId,
      }),
    [profile, picks, matches, communityPickProfiles, userId]
  );

  const levelSlug = stats.level.slug;

  return (
    <div className={`pulpo-index pulpo-index--${levelSlug}`} aria-label={formatPulpoIndexLine(stats)}>
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
