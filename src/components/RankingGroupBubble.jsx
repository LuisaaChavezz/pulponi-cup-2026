import { selectDisplayName } from '../lib/rankingHistory';
import UserAvatar from './UserAvatar';

const TOP_EMOJIS = ['🐙🏆', '🧠', '👑', '🔥', '⚡'];

function movementBadgeLabel(movement) {
  if (!movement) return '';
  const n = movement.delta ?? 0;
  const posWord = n === 1 ? 'posición' : 'posiciones';
  switch (movement.direction) {
    case 'new':
      return '↑ Nuevo en el ranking';
    case 'up':
      return `↑ Subió ${n} ${posWord}`;
    case 'down':
      return `↓ Bajó ${n} ${posWord}`;
    case 'same':
      return '→ Se mantiene';
    default:
      return movement.lineLabel ?? '';
  }
}

export function MovementBadge({ movement }) {
  if (!movement || movement.direction === 'none') return null;
  const dir = movement.direction;
  const label = movementBadgeLabel(movement);
  const cls = [
    'rm-movement',
    dir === 'up' ? 'rm-movement--up' : '',
    dir === 'down' ? 'rm-movement--down' : '',
    dir === 'same' ? 'rm-movement--same' : '',
    dir === 'new' ? 'rm-movement--new' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} title={label}>
      {label}
    </span>
  );
}

export function RankingGroupBubble({
  group,
  variant = 'rest',
  groupIndex = 0,
  showMovement = false,
  showBar = false,
  maxBarPoints = 1,
  onSelectUser,
  currentUserId,
}) {
  if (!group?.members?.length) return null;

  const rank = group.rank_position;
  const points = Number(group.points ?? 0);
  const barPct = showBar ? Math.min(100, (points / Math.max(1, maxBarPoints)) * 100) : 0;
  const movement = group.movement;
  const rankClass = rank <= 5 ? `rg-bubble--rank-${rank}` : 'rg-bubble--rank-rest';
  const movementDir = showMovement && movement?.direction !== 'none' ? movement.direction : null;

  return (
    <article
      className={[
        'rg-bubble',
        `rg-bubble--${variant}`,
        rankClass,
        movementDir ? `rg-bubble--${movementDir}` : '',
        variant === 'featured' ? `rm-top-card rm-top-card--${Math.min(rank, 5)}` : '',
        movementDir === 'up' ? 'rm-top-card--up' : '',
        movementDir === 'down' ? 'rm-top-card--down' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="listitem"
    >
      <div className={variant === 'featured' ? 'rm-top-card-inner rg-bubble__inner' : 'rg-bubble__inner'}>
        <header className="rg-bubble__head">
          <div className="rg-bubble__head-main">
            {variant === 'featured' ? (
              <span className="rm-pos-emoji rg-bubble__emoji" aria-hidden>
                {TOP_EMOJIS[groupIndex] ?? '◆'}
              </span>
            ) : null}
            <span className="rg-bubble__rank rm-rank-num">#{rank}</span>
            <span className="rg-bubble__pts">{points} pts</span>
            {group.members.length > 1 ? (
              <span className="rg-bubble__tie-count" aria-label={`${group.members.length} empatados`}>
                · {group.members.length} empatados
              </span>
            ) : null}
          </div>
          {showMovement ? <MovementBadge movement={movement} /> : null}
        </header>

        <div className="rg-bubble__members" role="list">
          {group.members.map((member) => {
            const isMe = currentUserId && member.id === currentUserId;
            return (
              <button
                key={member.id}
                type="button"
                role="listitem"
                className={[
                  'rg-bubble__member',
                  'profile-link-btn',
                  isMe ? 'rg-bubble__member--me' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectUser?.(member.id)}
                disabled={!member.id || !onSelectUser}
                aria-label={`Ver perfil de ${selectDisplayName(member)}`}
              >
                <UserAvatar
                  photoUrl={member.photo_url}
                  variant="ranking"
                  className="rg-bubble__avatar"
                  alt=""
                />
                <span className="rg-bubble__name rm-rank-name">{selectDisplayName(member)}</span>
              </button>
            );
          })}
        </div>

        {showBar ? (
          <div className="rm-bar-wrap rg-bubble__bar" aria-hidden>
            <div className="rm-bar-track">
              <div className="rm-bar-fill" style={{ width: `${barPct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RankingGroupList({
  groups = [],
  variant = 'movement',
  featuredCount = 5,
  restLimit = null,
  showMovement = false,
  showBars = false,
  onSelectUser,
  currentUserId,
  listClassName = '',
  restHeadLabel = 'Resto del ranking',
  showRestHead = true,
}) {
  const featured = groups.slice(0, featuredCount);
  const rest = restLimit != null && restLimit >= 0 ? groups.slice(featuredCount, featuredCount + restLimit) : groups.slice(featuredCount);
  const maxBarPoints = Math.max(1, ...featured.map((g) => g.points));

  if (!groups.length) return null;

  return (
    <div className={['rg-group-list', listClassName].filter(Boolean).join(' ')}>
      {featured.length > 0 ? (
        <div className="rg-group-list__featured rm-top5-graph" role="list">
          {featured.map((group, i) => (
            <RankingGroupBubble
              key={group.rank_position}
              group={group}
              variant="featured"
              groupIndex={i}
              showMovement={showMovement}
              showBar={showBars}
              maxBarPoints={maxBarPoints}
              onSelectUser={onSelectUser}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="rm-rest rg-group-list__rest">
          {showRestHead ? <p className="rm-rest-head">{restHeadLabel}</p> : null}
          <div className="rg-group-list__rest-items" role="list">
            {rest.map((group) => (
              <RankingGroupBubble
                key={group.rank_position}
                group={group}
                variant="rest"
                showMovement={showMovement}
                onSelectUser={onSelectUser}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { movementBadgeLabel };
