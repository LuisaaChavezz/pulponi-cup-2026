import { getPickThermometer } from '../lib/communityPicks';

export default function PulponiThermometer({ scores, homePick, awayPick }) {
  const h = homePick === '' || homePick == null ? NaN : Number(homePick);
  const a = awayPick === '' || awayPick == null ? NaN : Number(awayPick);

  if (!Number.isFinite(h) || !Number.isFinite(a)) {
    return null;
  }

  const stats = getPickThermometer(scores, h, a);

  if (!stats.sufficient) {
    if (!stats.message) return null;
    return (
      <div className="pulponi-social pulponi-social--thermo" role="status">
        <p className="pulponi-social__title">Termómetro Pulponi</p>
        <p className="pulponi-social__empty">{stats.message}</p>
      </div>
    );
  }

  const kindClass =
    stats.kind === 'popular'
      ? 'pulponi-social--thermo-popular'
      : stats.kind === 'uncommon'
        ? 'pulponi-social--thermo-uncommon'
        : stats.kind === 'risky'
          ? 'pulponi-social--thermo-risky'
          : 'pulponi-social--thermo-neutral';

  return (
    <div className={`pulponi-social pulponi-social--thermo ${kindClass}`} role="status">
      <p className="pulponi-social__title">Termómetro Pulponi</p>
      <p className="pulponi-social__thermo-line">
        <span className="pulponi-social__thermo-emoji" aria-hidden>
          {stats.emoji}
        </span>
        <span>
          <strong>{stats.label}</strong>
          <span className="pulponi-social__thermo-detail"> — {stats.detail}</span>
        </span>
      </p>
    </div>
  );
}
