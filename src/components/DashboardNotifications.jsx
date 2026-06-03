import { useMemo, useRef, useState, useEffect } from 'react';
import UserAvatar from './UserAvatar';
import CommunityMatchInsights from './CommunityMatchInsights';
import { collectMatchPickScores } from '../lib/communityPicks';
import { areCommunityTrendsRevealed } from '../lib/matchUtils';
import { useKickoffClock } from '../hooks/useKickoffClock';
import {
  buildMatchExportTitle,
  formatExportKickoffLine,
  formatExportLine,
  formatExportTime,
} from '../lib/predictionActivity';
import {
  downloadMatchPredictionsPdf,
  downloadPredictionsRaster,
  downloadTextFile,
  predictionsToCsvRows,
} from '../lib/exportPredictions';

export default function DashboardNotifications({
  importantAlerts = [],
  predictionActivityFeed = [],
  matchExportBundle = { match: null, rows: [] },
  matches = [],
  communityPickProfiles = [],
  isAdmin = false,
  onCreateImportantAlert,
}) {
  const now = useKickoffClock();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const captureRef = useRef(null);
  const exportWrapRef = useRef(null);

  const safeBundle =
    matchExportBundle && typeof matchExportBundle === 'object'
      ? matchExportBundle
      : { match: null, rows: [] };
  const exportMatch = safeBundle.match ?? null;
  const exportRows = Array.isArray(safeBundle.rows) ? safeBundle.rows : [];
  const safeFeed = useMemo(() => {
    const list = Array.isArray(predictionActivityFeed) ? predictionActivityFeed : [];
    return [...list]
      .sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0))
      .slice(0, 5);
  }, [predictionActivityFeed]);
  const exportTitle = buildMatchExportTitle(exportMatch);
  const exportKickoff = formatExportKickoffLine(exportMatch);
  const matchLabel = exportMatch
    ? `${exportMatch?.home_team ?? 'Local'} vs ${exportMatch?.away_team ?? 'Visitante'}`
    : '';

  useEffect(() => {
    if (!exportOpen) return;
    function onDoc(ev) {
      if (!exportWrapRef.current?.contains(ev.target)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  const revealedCommunityMatches = useMemo(() => {
    const list = (matches ?? []).filter((m) => areCommunityTrendsRevealed(m, now));
    return list.sort((a, b) => {
      const ta = a?.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b?.kickoff ? new Date(b.kickoff).getTime() : 0;
      return tb - ta;
    });
  }, [matches, now]);

  async function handleSubmitAnnouncement(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await onCreateImportantAlert({
        title: title.trim(),
        description: description.trim() || null,
        event_date: eventDate ? new Date(eventDate).toISOString() : new Date().toISOString(),
      });
      if (res?.error) {
        window.alert(res.error.message ?? 'No se pudo publicar');
      } else {
        setTitle('');
        setDescription('');
        setEventDate('');
      }
    } finally {
      setSaving(false);
    }
  }

  async function runExport(kind) {
    const rows = exportRows;
    setExportOpen(false);
    if (!exportMatch?.id) {
      window.alert('No hay partido activo para exportar.');
      return;
    }
    if (kind === 'csv') {
      downloadTextFile(`pulponi-predicciones-${Date.now()}.csv`, predictionsToCsvRows(rows, matchLabel));
      return;
    }
    if (kind === 'pdf') {
      downloadMatchPredictionsPdf(exportMatch, rows);
      return;
    }
    if (kind === 'png' || kind === 'jpeg') {
      const el = captureRef.current;
      if (!el) return;
      await downloadPredictionsRaster(el, kind);
    }
  }

  return (
    <div className="dash-notifications">
      <div className="dash-notifications__hub">
        <h3 className="dash-notifications__title">Mensajes importantes</h3>
        <p className="dash-notifications__hint">
          Centro de información de la comunidad: tendencias al cierre de partidos, predicciones
          colectivas, anuncios de Pulponi Cup y avisos del sistema.
        </p>
      </div>

      <div className="dash-notifications__section dash-notifications__section--community">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Tendencias de la comunidad</h3>
          <p className="dash-notifications__hint">
            Tras el kickoff: predicción de la comunidad, marcador más elegido y pick más arriesgado.
          </p>
        </div>

        {!revealedCommunityMatches.length ? (
          <p className="dash-notifications__empty">
            Las tendencias aparecerán aquí cuando cierre cada partido.
          </p>
        ) : (
          <div className="dash-notifications__community-list">
            {revealedCommunityMatches.map((m) => {
              const scores = collectMatchPickScores(communityPickProfiles, m.id);
              return <CommunityMatchInsights key={m.id} match={m} scores={scores} compact />;
            })}
          </div>
        )}
      </div>

      <div className="dash-notifications__section dash-notifications__section--announcements">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Anuncios Pulponi Cup y mensajes del sistema</h3>
          <p className="dash-notifications__hint">
            Avisos oficiales: calendario, premios, cierres de predicciones y novedades del torneo.
            {isAdmin ? ' Solo administración puede publicar.' : ''}
          </p>
        </div>

        {isAdmin ? (
          <form className="dash-notifications__admin-form" onSubmit={handleSubmitAnnouncement}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del anuncio"
              required
            />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle" rows={2} />
            <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Publicando…' : 'Publicar mensaje'}
            </button>
          </form>
        ) : null}

        <div className="dash-notifications__alerts">
          {!importantAlerts?.length ? (
            <p className="dash-notifications__empty">No hay anuncios ni mensajes del sistema por ahora.</p>
          ) : (
            importantAlerts.map((ev) => (
              <article key={ev.id} className="dash-notifications__card">
                <strong>{ev.title}</strong>
                <time dateTime={ev.event_date ?? ''}>
                  {ev.event_date ? new Date(ev.event_date).toLocaleString('es-MX') : 'Sin fecha'}
                </time>
                {ev.description ? <p>{ev.description}</p> : null}
              </article>
            ))
          )}
        </div>
      </div>

      <div className="dash-notifications__section dash-notifications__section--predictions">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Últimas predicciones enviadas</h3>
          <p className="dash-notifications__hint">
            Últimas 5 actualizaciones sin revelar marcadores. La descarga incluye todas las predicciones
            del partido activo con marcadores solo en el archivo exportado.
          </p>
          {exportMatch ? (
            <p className="dash-notifications__export-match">
              Exportar: <strong>{matchLabel}</strong>
              {exportKickoff ? <span className="dash-notifications__muted"> · {exportKickoff}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="dash-notifications__export-bar">
          <div className="dash-notifications__export-wrap" ref={exportWrapRef}>
            <button
              type="button"
              className="dash-notifications__export-toggle"
              onClick={() => setExportOpen((o) => !o)}
              disabled={!exportMatch}
            >
              Descargar predicciones del partido
            </button>
            {exportOpen ? (
              <div className="dash-notifications__export-menu" role="menu">
                <button type="button" onClick={() => runExport('pdf')}>
                  PDF
                </button>
                <button type="button" onClick={() => runExport('png')}>
                  PNG
                </button>
                <button type="button" onClick={() => runExport('jpeg')}>
                  JPEG
                </button>
                <button type="button" onClick={() => runExport('csv')}>
                  CSV
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {!safeFeed.length ? (
          <p className="dash-notifications__empty">Aún no hay predicciones recientes.</p>
        ) : (
          <ul className="dash-notifications__pred-feed">
            {safeFeed.map((item) => (
              <li key={item.id} className="dash-notifications__pred-item">
                <UserAvatar avatarUrl={item.avatarUrl} className="avatar-frame--xs" alt="" />
                <div className="dash-notifications__pred-copy">
                  <p>{item?.text ?? 'Sin información todavía'}</p>
                  {item.at ? (
                    <time dateTime={item.at.toISOString()}>{formatExportTime(item.at)}</time>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="prediction-export-capture" aria-hidden="true">
        <div ref={captureRef} className="prediction-export-capture__inner">
          <p className="prediction-export-capture__brand">Pulponi Cup</p>
          <p className="prediction-export-capture__title">{exportTitle}</p>
          {exportKickoff ? <p className="prediction-export-capture__kickoff">{exportKickoff}</p> : null}
          <ul className="prediction-export-capture__list">
            {(exportRows ?? []).map((r) => (
              <li key={r.profile_id}>{formatExportLine(r)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
