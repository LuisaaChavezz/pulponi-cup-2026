import { useMemo } from 'react';
import { groupRankedRowsByPosition } from '../lib/rankingGroups';
import { RankingGroupList } from './RankingGroupBubble';

export default function RankingLeaderboard({
  rows = [],
  currentUserId,
  onSelectUser,
  maxRows = null,
  compact = false,
}) {
  const list = rows ?? [];
  const visible = maxRows != null && maxRows > 0 ? list.slice(0, maxRows) : list;
  const groups = useMemo(() => groupRankedRowsByPosition(visible), [visible]);

  return (
    <div
      className={[
        'ranking-leaderboard',
        'ranking-groups-panel',
        compact ? 'ranking-leaderboard--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {groups.length === 0 ? (
        <div className="empty-state ranking-leaderboard__empty">Aún no hay jugadores en el ranking</div>
      ) : (
        <RankingGroupList
          groups={groups}
          featuredCount={groups.length}
          showMovement={false}
          showBars={false}
          showRestHead={false}
          onSelectUser={onSelectUser}
          currentUserId={currentUserId}
          listClassName="ranking-leaderboard__groups"
        />
      )}
    </div>
  );
}
