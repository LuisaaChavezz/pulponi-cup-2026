import { useMatchPdf } from '../hooks/useMatchPdf';
import { matchHasFinalScore } from '../lib/matchUtils';

export default function DownloadPdfButton({ match }) {
  const { downloadMatchPdf, loading, error } = useMatchPdf();

  if (!match || !matchHasFinalScore(match)) return null;

  const label = `${match.home_team ?? 'Local'} vs ${match.away_team ?? 'Visitante'}`;

  return (
    <div className="community-insights__pdf">
      <button
        type="button"
        className="dash-notifications__export-toggle community-insights__pdf-btn"
        onClick={() => downloadMatchPdf(match.id, label)}
        disabled={loading}
      >
        {loading ? 'Generando PDF…' : 'Descargar resultados PDF'}
      </button>
      {error ? <p className="community-insights__pdf-error">{error}</p> : null}
    </div>
  );
}
