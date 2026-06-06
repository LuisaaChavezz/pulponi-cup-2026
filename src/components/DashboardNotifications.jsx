import { useMemo, useState, useEffect } from 'react';
import UserAvatar from './UserAvatar';
import CommunityMatchInsights from './CommunityMatchInsights';
import { collectMatchPickScores, listMatchesForCommunityTrends } from '../lib/communityPicks';
import { resolvePredictionCloseCountdown } from '../lib/matchUtils';
import { useKickoffClock } from '../hooks/useKickoffClock';
import {
  buildAllMatchesExportGroups,
  buildMatchDownloadRows,
  formatExportTime,
  formatMatchVersusLabel,
  listMatchesWithPicks,
  resolvePredictionExportContext,
} from '../lib/predictionActivity';
import {
  downloadCSV,
  downloadMatchPredictionsPdf,
  mapExportRowsToCsv,
} from '../lib/exportPredictions';

const PREDICTION_FEED_RECENT_COUNT = 5;

function PredictionActivityItem({ item }) {
  return (
    <li className="dash-notifications__pred-item">
      <UserAvatar avatarUrl={item.avatarUrl} className="avatar-frame--xs" alt="" />
      <div className="dash-notifications__pred-copy">
        <p>{item?.text ?? 'Sin información todavía'}</p>
        {item.at ? (
          <time dateTime={item.at.toISOString()}>{formatExportTime(item.at)}</time>
        ) : null}
      </div>
    </li>
  );
}

export default function DashboardNotifications({
  importantAlerts = [],
  predictionActivityFeed = [],
  predictionActivityLog = [],
  matches = [],
  communityPickProfiles = [],
  isAdmin = false,
  onCreateImportantAlert,
}) {
  const now = useKickoffClock(1000);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const profiles = Array.isArray(communityPickProfiles) ? communityPickProfiles : [];
  const activityLog = Array.isArray(predictionActivityLog) ? predictionActivityLog : [];

  const matchesWithPicks = useMemo(
    () => listMatchesWithPicks(profiles, matches),
    [profiles, matches]
  );

  const exportContext = useMemo(
    () => resolvePredictionExportContext(matches, now),
    [matches, now]
  );

  useEffect(() => {
    if (!matchesWithPicks.length) {
      setSelectedMatchId('');
      return;
    }
    setSelectedMatchId((prev) => {
      if (prev && matchesWithPicks.some((m) => String(m.id) === prev)) return prev;
      const pref = exportContext.displayMatch?.id ?? exportContext.exportMatch?.id;
      if (pref && matchesWithPicks.some((m) => String(m.id) === String(pref))) return String(pref);
      return String(matchesWithPicks[0].id);
    });
  }, [exportContext.displayMatch?.id, exportContext.exportMatch?.id, matchesWithPicks]);

  const downloadMatch = useMemo(() => {
    if (selectedMatchId) {
      const picked = matchesWithPicks.find((m) => String(m.id) === selectedMatchId);
      if (picked) return picked;
      return (matches ?? []).find((m) => String(m.id) === selectedMatchId) ?? null;
    }
    return matchesWithPicks[0] ?? exportContext.displayMatch ?? exportContext.exportMatch ?? null;
  }, [selectedMatchId, matchesWithPicks, matches, exportContext]);

  const exportRows = useMemo(() => {
    if (!downloadMatch?.id) return [];
    return buildMatchDownloadRows(profiles, downloadMatch.id, activityLog, downloadMatch, now);
  }, [downloadMatch, profiles, activityLog, now]);

  const allExportGroups = useMemo(
    () => buildAllMatchesExportGroups(profiles, matches, activityLog, now),
    [profiles, matches, activityLog, now]
  );

  const sortedFeed = useMemo(() => {
    const list = Array.isArray(predictionActivityFeed) ? predictionActivityFeed : [];
    return [...list].sort((a, b) => (b.at?.getTime?.() ?? 0) - (a.at?.getTime?.() ?? 0));
  }, [predictionActivityFeed]);
  const recentFeed = useMemo(
    () => sortedFeed.slice(0, PREDICTION_FEED_RECENT_COUNT),
    [sortedFeed]
  );
  const historyFeed = useMemo(
    () => sortedFeed.slice(PREDICTION_FEED_RECENT_COUNT),
    [sortedFeed]
  );

  const matchLabel = formatMatchVersusLabel(downloadMatch);

  const communityTrendMatches = useMemo(() => {
    const list = listMatchesForCommunityTrends(communityPickProfiles, matches);
    return list.sort((a, b) => {
      const ta = a?.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b?.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });
  }, [matches, communityPickProfiles]);

  const predictionClose = useMemo(
    () => resolvePredictionCloseCountdown(matches, now),
    [matches, now]
  );

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

  function handleDownloadCsv() {
    if (exportBusy) return;
    const partido = matchLabel || 'Partido';
    const data = mapExportRowsToCsv(exportRows, partido);
    console.log('[EXPORT DATA]', data);
    if (!data.length) {
      window.alert('No hay predicciones para descargar.');
      return;
    }
    setExportBusy(true);
    try {
      console.log('[EXPORT CSV START]');
      downloadCSV(`pulponi-predicciones-${Date.now()}.csv`, data);
    } catch (error) {
      console.log('[EXPORT ERROR]', error);
      window.alert('No se pudo generar la descarga.');
    } finally {
      setExportBusy(false);
    }
  }

  function handleDownloadPdf() {
    if (exportBusy) return;
    console.log('[EXPORT DATA]', exportRows);
    if (!exportRows.length) {
      window.alert('No hay predicciones para descargar.');
      return;
    }
    setExportBusy(true);
    try {
      console.log('[EXPORT PDF START]');
      downloadMatchPredictionsPdf(downloadMatch, exportRows);
    } catch (error) {
      console.log('[EXPORT ERROR]', error);
      window.alert('No se pudo generar la descarga.');
    } finally {
      setExportBusy(false);
    }
  }

  function handleDownloadAllCsv() {
    if (exportBusy) return;
    const flat = [];
    for (const g of allExportGroups) {
      const partido = formatMatchVersusLabel(g.match);
      flat.push(...mapExportRowsToCsv(g.rows, partido));
    }
    console.log('[EXPORT DATA]', flat);
    if (!flat.length) {
      window.alert('No hay predicciones para descargar.');
      return;
    }
    setExportBusy(true);
    try {
      console.log('[EXPORT CSV START]');
      downloadCSV(`pulponi-todas-predicciones-${Date.now()}.csv`, flat);
    } catch (error) {
      console.log('[EXPORT ERROR]', error);
      window.alert('No se pudo generar la descarga.');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="dash-notifications">
      <div className="dash-notifications__hub">
        <h3 className="dash-notifications__title">Mensajes importantes</h3>
      </div>

      <div className="dash-notifications__section dash-notifications__section--community">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Tendencias de la comunidad</h3>
        </div>

        {!communityTrendMatches.length ? (
          <p className="dash-notifications__empty">
            Las tendencias aparecerán cuando haya suficientes predicciones en un partido.
          </p>
        ) : (
          <div className="dash-notifications__community-list">
            {communityTrendMatches.map((m) => {
              const scores = collectMatchPickScores(communityPickProfiles, m.id);
              return <CommunityMatchInsights key={m.id} match={m} scores={scores} compact />;
            })}
          </div>
        )}
      </div>

      <div className="dash-notifications__section dash-notifications__section--announcements">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Anuncios Pulponi Cup y mensajes del sistema</h3>
        </div>

        <div className="dash-notifications__close-countdown" role="status" aria-live="polite">
          <p className="dash-notifications__close-countdown-label">Próximo cierre de predicciones</p>
          {predictionClose.status === 'countdown' ? (
            <>
              <p className="dash-notifications__close-countdown-match">{predictionClose.matchLabel}</p>
              <p className="dash-notifications__close-countdown-time">
                Cierra en: <strong>{predictionClose.countdown}</strong>
              </p>
            </>
          ) : predictionClose.status === 'closed' ? (
            <>
              <p className="dash-notifications__close-countdown-match">{predictionClose.matchLabel}</p>
              <p className="dash-notifications__close-countdown-time dash-notifications__close-countdown-time--closed">
                Predicciones cerradas para este partido.
              </p>
            </>
          ) : (
            <p className="dash-notifications__close-countdown-time">No hay cierres próximos.</p>
          )}
        </div>

        {isAdmin ? (
          <>
            <p className="dash-notifications__admin-note">Solo administración puede publicar anuncios.</p>
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
          </>
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
            Actividad pública sin marcadores, porcentajes ni picks. Tras el cierre de cada partido,
            cualquier usuario registrado puede descargar CSV o PDF (marcador visible tras el cierre).
          </p>
        </div>

        <div className="dash-notifications__export-panel">
          {downloadMatch ? (
            <p className="dash-notifications__export-match-name">{matchLabel}</p>
          ) : (
            <p className="dash-notifications__empty dash-notifications__export-wait">
              Aún no hay partidos con predicciones para descargar.
            </p>
          )}

          {matchesWithPicks.length > 1 ? (
            <label className="dash-notifications__export-select-label">
              Partido
              <select
                className="dash-notifications__export-select"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
              >
                {matchesWithPicks.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {formatMatchVersusLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="dash-notifications__export-actions">
            <button
              type="button"
              className="dash-notifications__export-toggle"
              onClick={handleDownloadCsv}
              disabled={exportBusy}
            >
              {exportBusy ? 'Generando…' : 'Descargar CSV'}
            </button>
            <button
              type="button"
              className="dash-notifications__export-toggle"
              onClick={handleDownloadPdf}
              disabled={exportBusy}
            >
              Descargar PDF
            </button>
            <button
              type="button"
              className="dash-notifications__export-toggle dash-notifications__export-toggle--secondary"
              onClick={handleDownloadAllCsv}
              disabled={exportBusy}
            >
              Descargar todas las predicciones
            </button>
          </div>
        </div>

        {!sortedFeed.length ? (
          <p className="dash-notifications__empty">Aún no hay predicciones recientes.</p>
        ) : (
          <>
            <ul className="dash-notifications__pred-feed dash-notifications__pred-feed--recent">
              {recentFeed.map((item) => (
                <PredictionActivityItem key={item.id} item={item} />
              ))}
            </ul>
            {historyFeed.length > 0 ? (
              <div className="dash-notifications__pred-history">
                <h4 className="dash-notifications__pred-history-title">Historial anterior</h4>
                <ul className="dash-notifications__pred-feed dash-notifications__pred-history-scroll">
                  {historyFeed.map((item) => (
                    <PredictionActivityItem key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

    </div>
  );
}
