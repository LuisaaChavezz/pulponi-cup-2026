import UserAvatar from './UserAvatar';

function formatUsername(row) {
  const raw = row?.username ?? row?.name ?? 'jugador';
  return String(raw).replace(/^@+/, '').trim() || 'jugador';
}

export default function RankingLeaderboard({ rows = [], currentUserId, onSelectUser }) {
  const list = rows ?? [];

  return (
    <div className="ranking-leaderboard ranking-table">
      <div className="ranking-leaderboard__head rank-head">
        <span>#</span>
        <span>Usuario</span>
        <span>Puntos</span>
        <span>Exactos</span>
        <span>Racha</span>
      </div>

      <div className="ranking-leaderboard__list">
        {list.length === 0 ? (
          <div className="empty-state ranking-leaderboard__empty">Aún no hay jugadores en el ranking</div>
        ) : (
          list.map((r, i) => {
            const username = formatUsername(r);
            const points = Number(r.points ?? 0);
            const exacts = Number(r.exacts ?? 0);
            const streak = Number(r.streak ?? 0);
            const isMe = currentUserId && r.id === currentUserId;

            return (
              <button
                key={r.id}
                type="button"
                className={`rank-row rank-row--link${isMe ? ' rank-row--me' : ''}`}
                onClick={() => onSelectUser?.(r.id)}
                aria-label={`Ver perfil de ${username}, puesto ${i + 1}`}
              >
                <span className="rank-row__pos">#{i + 1}</span>
                <div className="rank-row__user">
                  <UserAvatar photoUrl={r.photo_url} className="rank-row__avatar" alt="" />
                  <span className="rank-row__name">{username}</span>
                </div>
                <span className="rank-row__stat rank-row__stat--pts">{points}</span>
                <span className="rank-row__stat rank-row__stat--ex">{exacts}</span>
                <span className="rank-row__stat rank-row__stat--streak">{streak}</span>
                <p className="rank-row__meta">
                  {points} PTS • {exacts} exactos • Racha {streak}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
