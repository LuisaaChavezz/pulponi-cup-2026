export default function VoteDistributionList({
  items,
  title = 'Distribución de votos',
  emptyText = 'Aún no hay predicciones para este partido.',
}) {
  return (
    <div className="community-insights__block vote-distribution">
      <p className="community-insights__section-label">{title}</p>
      {!items?.length ? (
        <p className="community-insights__empty vote-distribution__empty">{emptyText}</p>
      ) : (
        <ul className="vote-distribution__list" aria-label={title}>
          {items.map((item) => {
            const usersLabel = item.count === 1 ? 'usuario' : 'usuarios';
            return (
              <li key={item.prediction} className="vote-distribution__row">
                <span className="vote-distribution__score">{item.prediction}</span>
                <div className="vote-distribution__bar-track" aria-hidden>
                  <div
                    className="vote-distribution__bar-fill"
                    style={{ width: `${Math.max(item.percentage, 2)}%` }}
                  />
                </div>
                <span className="vote-distribution__meta">
                  {item.percentage}% ({item.count} {usersLabel})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
