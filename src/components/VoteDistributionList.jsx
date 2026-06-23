export default function VoteDistributionList({ items, title = 'Distribución de votos' }) {
  if (!items?.length) return null;

  return (
    <div className="community-insights__block">
      <p className="community-insights__section-label">{title}</p>
      <ul className="community-insights__list community-insights__list--votes">
        {items.map((item) => (
          <li key={item.prediction}>
            <span className="community-insights__pct-label">{item.prediction}</span>
            <span className="community-insights__pct-value">
              {item.count} ({item.percentage}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
