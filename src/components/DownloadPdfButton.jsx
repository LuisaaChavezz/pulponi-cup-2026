import { useMatchPdf } from '../hooks/useMatchPdf';
import { isMatchFinished } from '../lib/matchUtils';

export default function DownloadPdfButton({ match }) {
  const { downloadMatchPdf, loading, error } = useMatchPdf();

  // El botón depende ÚNICAMENTE de que el partido esté terminado (status/api
  // = finished/FT). Sin condiciones ocultas (no exige pick_scores ni marcador
  // no-nulo), así aparece en todos los partidos jugados de forma consistente.
  if (!match || !isMatchFinished(match)) return null;

  return (
    <div className="community-insights__pdf">
      <button
        type="button"
        className="dash-notifications__export-toggle community-insights__pdf-btn"
        onClick={() => downloadMatchPdf(match)}
        disabled={loading}
      >
        {loading ? 'Generando PDF…' : 'Descargar resultados PDF'}
      </button>
      {error ? <p className="community-insights__pdf-error">{error}</p> : null}
    </div>
  );
}
