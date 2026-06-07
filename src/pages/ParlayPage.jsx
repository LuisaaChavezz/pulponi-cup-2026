export default function ParlayPage() {
  return (
    <div className="parlay-page">
      <div className="section-title parlay-page__head">
        <div>
          <span className="eyebrow">Combinadas</span>
          <h2>PARLAY</h2>
          <p className="section-lead muted">
            Crea combinaciones de predicciones y compite por el mejor porcentaje de aciertos.
          </p>
        </div>
      </div>

      <article className="parlay-page__placeholder pulponi-card">
        <span className="parlay-page__placeholder-icon" aria-hidden>
          🚧
        </span>
        <h3 className="parlay-page__placeholder-title">Próximamente</h3>
        <p className="parlay-page__placeholder-copy">
          Estamos preparando los Parlays de Pulponi Cup.
        </p>
      </article>
    </div>
  );
}
