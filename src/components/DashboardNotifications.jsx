import { useMemo, useRef, useState, useEffect } from 'react';
import UserAvatar from './UserAvatar';
import CommunityMatchInsights from './CommunityMatchInsights';
import { collectMatchPickScores } from '../lib/communityPicks';
import { areCommunityTrendsRevealed } from '../lib/matchUtils';
import { useKickoffClock } from '../hooks/useKickoffClock';
import {
  buildAllMatchesExportGroups,
  buildMatchExportRows,
  buildMatchExportTitle,
  formatExportLine,
  formatExportTime,
  formatMatchSectionHeading,
  formatMatchVersusLabel,
  getPredictionExportButtonLabel,
  isMatchPredictionsExportable,
  listExportableMatches,
  resolvePredictionExportContext,
} from '../lib/predictionActivity';
import {
  downloadAllPredictionsPdf,
  downloadMatchPredictionsPdf,
  downloadPredictionsRaster,
  downloadTextFile,
  predictionsAllMatchesToCsv,
  predictionsToCsvRows,
} from '../lib/exportPredictions';

const PREDICTION_FEED_RECENT_COUNT = 5;
const EXPORT_MSG_OK = 'Predicciones descargadas correctamente.';
const EXPORT_MSG_ERR = 'No se pudo generar la descarga.';

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
  const now = useKickoffClock();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [exportNotice, setExportNotice] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const captureRef = useRef(null);
  const captureAllRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const profiles = Array.isArray(communityPickProfiles) ? communityPickProfiles : [];
  const activityLog = Array.isArray(predictionActivityLog) ? predictionActivityLog : [];

  const exportableMatches = useMemo(
    () => listExportableMatches(matches, now),
    [matches, now]
  );

  const exportContext = useMemo(
    () => resolvePredictionExportContext(matches, now),
    [matches, now]
  );

  useEffect(() => {
    const preferredId =
      exportContext.exportMatch?.id ?? exportContext.displayMatch?.id ?? '';
    const nextId = preferredId != null ? String(preferredId) : '';
    setSelectedMatchId((prev) => {
      if (prev && exportableMatches.some((m) => String(m.id) === prev)) return prev;
      return nextId;
    });
  }, [exportContext.exportMatch?.id, exportContext.displayMatch?.id, exportableMatches]);

  const exportTargetMatch = useMemo(() => {
    if (selectedMatchId) {
      const picked = exportableMatches.find((m) => String(m.id) === selectedMatchId);
      if (picked) return picked;
    }
    return exportContext.exportMatch;
  }, [selectedMatchId, exportableMatches, exportContext.exportMatch]);

  const displayMatch = useMemo(() => {
    if (selectedMatchId) {
      const fromList = (matches ?? []).find((m) => String(m.id) === selectedMatchId);
      if (fromList) return fromList;
    }
    return exportContext.displayMatch;
  }, [selectedMatchId, matches, exportContext.displayMatch]);

  const exportRows = useMemo(() => {
    if (!exportTargetMatch?.id || !isMatchPredictionsExportable(exportTargetMatch, now)) return [];
    return buildMatchExportRows(profiles, exportTargetMatch.id, activityLog);
  }, [exportTargetMatch, profiles, activityLog, now]);

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

  const exportTitle = buildMatchExportTitle(exportTargetMatch);
  const matchLabel = formatMatchVersusLabel(displayMatch);
  const exportButtonLabel = getPredictionExportButtonLabel(displayMatch, matches, now);
  const canExportMatch = Boolean(
    exportTargetMatch?.id && isMatchPredictionsExportable(exportTargetMatch, now)
  );
  const canExportAll = allExportGroups.length > 0;

  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    []
  );

  function showExportResult(ok) {
    setExportNotice(ok ? 'ok' : 'err');
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setExportNotice(null), 5000);
  }

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
    if (exportBusy) return;
    if (!canExportMatch || !exportTargetMatch) {
      showExportResult(false);
      return;
    }
    setExportBusy(true);
    try {
      let ok = false;
      const label = formatMatchVersusLabel(exportTargetMatch);
      if (kind === 'csv') {
        ok = downloadTextFile(
          `pulponi-predicciones-${Date.now()}.csv`,
          predictionsToCsvRows(exportRows, label)
        );
      } else if (kind === 'pdf') {
        ok = downloadMatchPredictionsPdf(exportTargetMatch, exportRows);
      } else if (kind === 'png' || kind === 'jpeg') {
        await new Promise((r) => requestAnimationFrame(r));
        const el = captureRef.current;
        ok = await downloadPredictionsRaster(el, kind);
      }
      showExportResult(Boolean(ok));
    } catch {
      showExportResult(false);
    } finally {
      setExportBusy(false);
    }
  }

  async function runExportAll(kind) {
    if (exportBusy) return;
    if (!canExportAll) {
      showExportResult(false);
      return;
    }
    setExportBusy(true);
    try {
      let ok = false;
      if (kind === 'csv') {
        ok = downloadTextFile(
          `pulponi-todas-predicciones-${Date.now()}.csv`,
          predictionsAllMatchesToCsv(allExportGroups)
        );
      } else if (kind === 'pdf') {
        ok = downloadAllPredictionsPdf(allExportGroups);
      } else if (kind === 'png' || kind === 'jpeg') {
        await new Promise((r) => requestAnimationFrame(r));
        const el = captureAllRef.current;
        ok = await downloadPredictionsRaster(el, kind);
      }
      showExportResult(Boolean(ok));
    } catch {
      showExportResult(false);
    } finally {
      setExportBusy(false);
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
            Actividad pública sin marcadores, porcentajes ni picks. Tras el cierre de cada partido,
            cualquier usuario registrado puede descargar las predicciones con marcador en PDF, imagen o CSV.
          </p>
        </div>

        <div className="dash-notifications__export-panel">
          {displayMatch ? (
            <p className="dash-notifications__export-match-name">{matchLabel}</p>
          ) : (
            <p className="dash-notifications__empty dash-notifications__export-wait">
              La descarga estará disponible cuando cierre el primer partido con predicciones.
            </p>
          )}

          {exportableMatches.length > 1 ? (
            <label className="dash-notifications__export-select-label">
              Otro partido cerrado
              <select
                className="dash-notifications__export-select"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
              >
                {exportableMatches.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {formatMatchVersusLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="dash-notifications__export-block">
            <button
              type="button"
              className="dash-notifications__export-toggle"
              onClick={() => runExport('pdf')}
              disabled={!canExportMatch || exportBusy}
            >
              {exportBusy ? 'Generando…' : exportButtonLabel}
            </button>
            <div className="dash-notifications__export-formats">
              <button
                type="button"
                className="dash-notifications__export-format"
                onClick={() => runExport('pdf')}
                disabled={!canExportMatch || exportBusy}
              >
                PDF
              </button>
              <button
                type="button"
                className="dash-notifications__export-format"
                onClick={() => runExport('png')}
                disabled={!canExportMatch || exportBusy}
              >
                PNG
              </button>
            </div>
          </div>

          <div className="dash-notifications__export-block">
            <button
              type="button"
              className="dash-notifications__export-toggle dash-notifications__export-toggle--secondary"
              onClick={() => runExportAll('pdf')}
              disabled={!canExportAll || exportBusy}
            >
              Descargar todas las predicciones
            </button>
            <div className="dash-notifications__export-formats">
              <button
                type="button"
                className="dash-notifications__export-format"
                onClick={() => runExportAll('pdf')}
                disabled={!canExportAll || exportBusy}
              >
                PDF
              </button>
              <button
                type="button"
                className="dash-notifications__export-format"
                onClick={() => runExportAll('png')}
                disabled={!canExportAll || exportBusy}
              >
                PNG
              </button>
            </div>
          </div>

          {exportNotice === 'ok' ? (
            <p className="dash-notifications__export-feedback dash-notifications__export-feedback--ok" role="status">
              {EXPORT_MSG_OK}
            </p>
          ) : null}
          {exportNotice === 'err' ? (
            <p className="dash-notifications__export-feedback dash-notifications__export-feedback--err" role="alert">
              {EXPORT_MSG_ERR}
            </p>
          ) : null}
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

      <div className="prediction-export-capture" aria-hidden="true">
        <div ref={captureRef} className="prediction-export-capture__inner">
          <p className="prediction-export-capture__brand">Pulponi Cup</p>
          <p className="prediction-export-capture__title">{exportTitle}</p>
          <ul className="prediction-export-capture__list">
            {(exportRows.length ? exportRows : [{ profile_id: 'empty', displayName: '—', scoreLabel: '—', actionLabel: '—', at: null }]).map(
              (r) => (
                <li key={r.profile_id}>{formatExportLine(r)}</li>
              )
            )}
          </ul>
        </div>
      </div>
      <div className="prediction-export-capture prediction-export-capture--all" aria-hidden="true">
        <div ref={captureAllRef} className="prediction-export-capture__inner">
          <p className="prediction-export-capture__brand">Pulponi Cup</p>
          <p className="prediction-export-capture__title">Todas las predicciones</p>
          {allExportGroups.map((g) => (
            <section key={g.match?.id} className="prediction-export-capture__section">
              <h4 className="prediction-export-capture__section-title">{formatMatchSectionHeading(g.match)}</h4>
              <ul className="prediction-export-capture__list">
                {(g.rows ?? []).map((r) => (
                  <li key={`${g.match?.id}-${r.profile_id}`}>{formatExportLine(r)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
