import UserAvatar from './UserAvatar';

export function formatParticipantUsername(row) {
  const raw = row?.username ?? row?.name ?? 'jugador';
  return String(raw).replace(/^@+/, '').trim() || 'jugador';
}

export default function RankingParticipantsList({
  participants = [],
  className = '',
  listClassName = 'rm-participants__list',
  rowClassName = 'rm-participants__row',
  avatarVariant = 'chat',
  intro = 'El ranking comenzará cuando se registren los primeros puntos.',
}) {
  return (
    <div className={['rm-participants', className].filter(Boolean).join(' ')}>
      {intro ? <p className="rm-participants__intro">{intro}</p> : null}
      <ul className={listClassName} role="list">
        {participants.map((p) => (
          <li key={p.id} className={rowClassName}>
            <UserAvatar
              photoUrl={p.photo_url}
              variant={avatarVariant}
              className="rm-participants__avatar"
              alt=""
            />
            <span className="rm-participants__name">{formatParticipantUsername(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
