export function PulponiSkeleton({ className = '', style }) {
  return <div className={`pulponi-skeleton ${className}`.trim()} style={style} aria-hidden />;
}

export function HomeDashboardSkeleton() {
  return (
    <div className="home-dash-skeleton">
      <PulponiSkeleton className="home-dash-skeleton__hero" />
      <div className="home-dash-skeleton__row">
        <PulponiSkeleton className="home-dash-skeleton__card" />
        <PulponiSkeleton className="home-dash-skeleton__card" />
      </div>
      <PulponiSkeleton className="home-dash-skeleton__chat" />
    </div>
  );
}

export function MatchesGridSkeleton({ rows = 4 }) {
  return (
    <div className="matches-grid-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <PulponiSkeleton key={i} className="matches-grid-skeleton__card" />
      ))}
    </div>
  );
}
