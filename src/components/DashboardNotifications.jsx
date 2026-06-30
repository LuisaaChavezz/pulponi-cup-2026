import { useMemo, useState, useEffect } from 'react';
import UserAvatar from './UserAvatar';
import CommunityMatchInsights from './CommunityMatchInsights';
import { collectMatchPickScores, listMatchesForCommunityTrends } from '../lib/communityPicks';
import { useKickoffClock } from '../hooks/useKickoffClock';
import {
  buildAllMatchesExportGroups,
  buildMatchDownloadRows,
  canAdminExportPredictions,
  formatExportTime,
  formatKickoff,
  formatMatchVersusLabel,
  listMatchesWithPicks,
} from '../lib/predictionActivity';
import { pickDefaultFocusedMatch, sortMatchesForFocusedDropdown, kickoffInstantMs } from '../lib/matchUtils';
import {
  downloadAllPredictionsPdf,
  downloadMatchPredictionsPdf,
} from '../lib/exportPredictions';
import AdminMatchResultPanel from './AdminMatchResultPanel';
import AdminMatchPredictionsPanel from './AdminMatchPredictionsPanel';
import ElegidoAdminHistory from './ElegidoAdminHistory';
import { useUserSummaryPdf } from '../hooks/useUserSummaryPdf';
import { resolveAvatarUrl } from '../lib/avatars';
import BadgeIcon from './BadgeIcon';
import { ACTIVITY_TYPE_BADGE } from '../lib/recentActivityFeed';

const PDF_ERROR_MSG = 'No se pudo generar el PDF.';

const PREDICTION_FEED_RECENT_COUNT = 5;

function PredictionActivityItem({ item, onSelectUser }) {
  const profileId = item?.profile_id ?? item?.profileId ?? null;
  const isBadge = item?.type === ACTIVITY_TYPE_BADGE;
  const content = (
    <>
      {isBadge ? (
        <span className="dash-notifications__pred-badge-icon" aria-hidden>
          <BadgeIcon
            badgeId={item.badgeId}
            icon={item.badgeIcon}
            iconSrc={item.badgeIconSrc}
            alt=""
          />
        </span>
      ) : (
        <UserAvatar avatarUrl={item.avatarUrl} variant="chat" alt="" />
      )}
      <div className="dash-notifications__pred-copy">
        {isBadge ? (
          <p>
            <strong>{item.username}</strong> desbloqueó <strong>{item.badgeName}</strong>
          </p>
        ) : (
          <p>{item?.text ?? 'Sin información todavía'}</p>
        )}
        {item.at ? (
          <time dateTime={item.at.toISOString()}>{formatExportTime(item.at)}</time>
        ) : null}
      </div>
    </>
  );

  if (profileId && onSelectUser) {
    return (
      <li>
        <button
          type="button"
          className="dash-notifications__pred-item profile-link-btn"
          onClick={() => onSelectUser(profileId)}
          aria-label="Ver perfil del usuario"
        >
          {content}
        </button>
      </li>
    );
  }

  return <li className="dash-notifications__pred-item">{content}</li>;
}

export default function DashboardNotifications({
  importantAlerts = [],
  predictionActivityFeed = [],
  predictionActivityLog = [],
  matches = [],
  communityPickProfiles = [],
  isAdmin = false,
  currentUsername = null,
  onApplyFinalResult,
  onCreateImportantAlert,
  onSelectUser,
  elegidoTransfers = [],
  elegidoTransfersLoading = false,
}) {
  const now = useKickoffClock(1000);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [downloadingParticipantId, setDownloadingParticipantId] = useState(null);
  const {
    downloadAllSummariesPdf,
    loading: allSummariesLoading,
    error: allSummariesError,
  } = useUserSummaryPdf();
  const { downloadUserSummaryPdf, error: participantSummaryError } = useUserSummaryPdf();

  const profiles = Array.isArray(communityPickProfiles) ? communityPickProfiles : [];
  const activityLog = Array.isArray(predictionActivityLog) ? predictionActivityLog : [];
  const adminToolsAllowed = isAdmin || canAdminExportPredictions(currentUsername);

  const matchesWithPicks = useMemo(
    () => listMatchesWithPicks(profiles, matches),
    [profiles, matches]
  );

  const participantList = useMemo(() => {
    const base = profiles.filter((p) => String(p?.username || '').toLowerCase() !== 'el-kraken');
    const sorted = [...base].sort((a, b) =>
      String(a?.name || a?.username || '').localeCompare(
        String(b?.name || b?.username || ''),
        'es',
        { sensitivity: 'base' }
      )
    );
    const q = participantSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        String(p?.name || '').toLowerCase().includes(q) ||
        String(p?.username || '').toLowerCase().includes(q)
    );
  }, [profiles, participantSearch]);

  const adminMatchOptions = useMemo(
    () => sortMatchesForFocusedDropdown(matches ?? [], now),
    [matches, now]
  );

  const predictionMatchOptions = adminToolsAllowed ? adminMatchOptions : matchesWithPicks;

  const sortedPredictionMatches = useMemo(
    () => sortMatchesForFocusedDropdown(predictionMatchOptions, now),
    [predictionMatchOptions, now]
  );

  useEffect(() => {
    if (!sortedPredictionMatches.length) {
      setSelectedMatchId('');
      return;
    }
    setSelectedMatchId((prev) => {
      if (prev && sortedPredictionMatches.some((m) => String(m.id) === prev)) return prev;
      const focused = pickDefaultFocusedMatch(sortedPredictionMatches, now);
      if (focused) return String(focused.id);
      return String(sortedPredictionMatches[0].id);
    });
  }, [sortedPredictionMatches, now]);

  const downloadMatch = useMemo(() => {
    if (selectedMatchId) {
      const picked = sortedPredictionMatches.find((m) => String(m.id) === selectedMatchId);
      if (picked) return picked;
      return (matches ?? []).find((m) => String(m.id) === selectedMatchId) ?? null;
    }
    return (
      pickDefaultFocusedMatch(sortedPredictionMatches, now) ?? sortedPredictionMatches[0] ?? null
    );
  }, [selectedMatchId, sortedPredictionMatches, matches, now]);

  const exportRows = useMemo(() => {
    if (!downloadMatch?.id) return [];
    return buildMatchDownloadRows(
      profiles,
      downloadMatch.id,
      activityLog,
      downloadMatch,
      now,
      currentUsername
    );
  }, [downloadMatch, profiles, activityLog, now, currentUsername]);

  const allExportGroups = useMemo(
    () => buildAllMatchesExportGroups(profiles, matches, activityLog, now, currentUsername),
    [profiles, matches, activityLog, now, currentUsername]
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

  const communityTrendMatches = useMemo(() => {
    const list = listMatchesForCommunityTrends(communityPickProfiles, matches, { minPicks: 1 });
    return list.sort((a, b) => {
      const ta = a?.kickoff ? kickoffInstantMs(a.kickoff) ?? 0 : 0;
      const tb = b?.kickoff ? kickoffInstantMs(b.kickoff) ?? 0 : 0;
      return ta - tb;
    });
  }, [matches, communityPickProfiles]);

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

  function handleDownloadMatchPdf() {
    if (exportBusy) return;
    console.log('[EXPORT DATA]', exportRows);
    if (!exportRows.length) {
      window.alert('No hay predicciones para descargar.');
      return;
    }
    setExportBusy(true);
    try {
      downloadMatchPredictionsPdf(downloadMatch, exportRows);
    } catch (error) {
      console.log('[EXPORT ERROR]', error);
      window.alert(PDF_ERROR_MSG);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDownloadParticipantSummary(profileId) {
    if (!profileId || downloadingParticipantId) return;
    setDownloadingParticipantId(profileId);
    try {
      await downloadUserSummaryPdf(profileId);
    } finally {
      setDownloadingParticipantId(null);
    }
  }

  function handleDownloadAllPdf() {
    if (exportBusy) return;
    console.log('[EXPORT DATA]', allExportGroups);
    if (!allExportGroups.length) {
      window.alert('No hay predicciones para descargar.');
      return;
    }
    setExportBusy(true);
    try {
      downloadAllPredictionsPdf(allExportGroups);
    } catch (error) {
      console.log('[EXPORT ERROR]', error);
      window.alert(PDF_ERROR_MSG);
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="dash-notifications">
      <div className="dash-notifications__hub dash-notifications-community-mobile-hide">
        <h3 className="dash-notifications__title">Mensajes importantes</h3>
      </div>

      <AdminMatchResultPanel
        matches={matches}
        currentUsername={currentUsername}
        isAdmin={isAdmin}
        onApplyFinalResult={onApplyFinalResult}
      />

      <div className="dash-notifications__section dash-notifications__section--predictions">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle dash-notifications-community-mobile-hide">
            Últimas predicciones enviadas
          </h3>
          <h3 className="dash-notifications__subtitle dash-notifications-community-mobile-only">
            Descargar predicciones
          </h3>
          <p className="dash-notifications__hint dash-notifications-community-mobile-hide">
            Actividad pública sin marcadores, porcentajes ni picks. Tras el cierre de cada partido,
            cualquier usuario registrado puede descargar PDF (marcador visible tras el cierre).
          </p>
        </div>

        <div className="dash-notifications__export-panel dash-notifications__export-panel--standalone">
          {downloadMatch ? (
            <>
              <p className="dash-notifications__export-match-name">
                {formatMatchVersusLabel(downloadMatch)}
              </p>
              {formatKickoff(downloadMatch.kickoff) ? (
                <p className="dash-notifications__export-kickoff">
                  {formatKickoff(downloadMatch.kickoff)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="dash-notifications__empty dash-notifications__export-wait">
              Aún no hay partidos con predicciones para descargar.
            </p>
          )}

          {sortedPredictionMatches.length > 1 ? (
            <label className="dash-notifications__export-select-label">
              Partido
              <select
                className="dash-notifications__export-select"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
              >
                {sortedPredictionMatches.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {formatMatchVersusLabel(m, { withKickoff: adminToolsAllowed })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="dash-notifications__export-actions">
            <button
              type="button"
              className="dash-notifications__export-toggle"
              onClick={handleDownloadMatchPdf}
              disabled={exportBusy}
            >
              {exportBusy ? 'Generando…' : 'Descargar predicciones del partido'}
            </button>
            <button
              type="button"
              className="dash-notifications__export-toggle dash-notifications__export-toggle--secondary"
              onClick={handleDownloadAllPdf}
              disabled={exportBusy}
            >
              {exportBusy ? 'Generando…' : 'Descargar todas las predicciones'}
            </button>
            {adminToolsAllowed ? (
              <button
                type="button"
                className="dash-notifications__export-toggle dash-notifications__export-toggle--secondary"
                onClick={downloadAllSummariesPdf}
                disabled={allSummariesLoading}
              >
                {allSummariesLoading
                  ? 'Generando…'
                  : '📄 Descargar resúmenes de todos los participantes'}
              </button>
            ) : null}
          </div>
          {adminToolsAllowed && allSummariesError ? (
            <p className="dash-notifications__admin-note">{allSummariesError}</p>
          ) : null}
        </div>

        {adminToolsAllowed ? (
          <AdminMatchPredictionsPanel
            matches={matches}
            isAdmin={isAdmin}
            currentUsername={currentUsername}
            selectedMatchId={selectedMatchId}
          />
        ) : null}

        {!sortedFeed.length ? (
          <p className="dash-notifications__empty dash-notifications-community-mobile-hide">
            Aún no hay predicciones recientes.
          </p>
        ) : (
          <>
            <ul className="dash-notifications__pred-feed dash-notifications__pred-feed--recent dash-notifications-community-mobile-hide">
              {recentFeed.map((item) => (
                <PredictionActivityItem key={item.id} item={item} onSelectUser={onSelectUser} />
              ))}
            </ul>
            {historyFeed.length > 0 ? (
              <div className="dash-notifications__pred-history dash-notifications-community-mobile-hide">
                <h4 className="dash-notifications__pred-history-title">Historial anterior</h4>
                <ul className="dash-notifications__pred-feed dash-notifications__pred-history-scroll">
                  {historyFeed.map((item) => (
                    <PredictionActivityItem key={item.id} item={item} onSelectUser={onSelectUser} />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {adminToolsAllowed ? (
        <div className="dash-notifications__section dash-notifications__section--participants">
          <div className="dash-notifications__head">
            <h3 className="dash-notifications__subtitle">Participantes</h3>
            <p className="dash-notifications__hint">
              Ver el perfil de cualquier participante (solo lectura) y descargar su resumen en PDF.
            </p>
          </div>

          <input
            type="search"
            className="dash-notifications__participant-search"
            placeholder="Buscar participante…"
            value={participantSearch}
            onChange={(e) => setParticipantSearch(e.target.value)}
          />

          {participantList.length === 0 ? (
            <p className="dash-notifications__empty">No hay participantes que coincidan.</p>
          ) : (
            <ul className="dash-notifications__participants">
              {participantList.map((p) => (
                <li key={p.id} className="dash-notifications__participant">
                  <button
                    type="button"
                    className="dash-notifications__participant-main profile-link-btn"
                    onClick={() => onSelectUser?.(p.id)}
                    aria-label={`Ver perfil de ${p.name || p.username || 'jugador'}`}
                  >
                    <UserAvatar avatarUrl={resolveAvatarUrl(p.photo_url)} variant="chat" alt="" />
                    <span className="dash-notifications__participant-id">
                      <strong>{p.name || p.username || 'Jugador'}</strong>
                      {p.username ? <small>@{p.username}</small> : null}
                    </span>
                  </button>
                  <div className="dash-notifications__participant-actions">
                    <button
                      type="button"
                      className="dash-notifications__participant-btn"
                      onClick={() => onSelectUser?.(p.id)}
                    >
                      Ver perfil
                    </button>
                    <button
                      type="button"
                      className="dash-notifications__participant-btn dash-notifications__participant-btn--primary"
                      onClick={() => handleDownloadParticipantSummary(p.id)}
                      disabled={downloadingParticipantId === p.id}
                    >
                      {downloadingParticipantId === p.id ? 'Generando…' : 'Descargar resumen'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {participantSummaryError ? (
            <p className="dash-notifications__admin-note">{participantSummaryError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="dash-notifications__section dash-notifications__section--community dash-notifications__section--community-trends">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Tendencias de la comunidad</h3>
        </div>

        {!communityTrendMatches.length ? (
          <p className="dash-notifications__empty">
            Aún no hay predicciones en ningún partido.
          </p>
        ) : (
          <div className="dash-notifications__community-list">
            {communityTrendMatches.map((m) => {
              const scores = collectMatchPickScores(communityPickProfiles, m.id, m);
              return (
                <CommunityMatchInsights
                  key={m.id}
                  match={m}
                  scores={scores}
                  compact
                />
              );
            })}
          </div>
        )}
      </div>

      {isAdmin ? (
        <ElegidoAdminHistory transfers={elegidoTransfers} loading={elegidoTransfersLoading} />
      ) : null}

      <div className="dash-notifications__section dash-notifications__section--announcements dash-notifications-community-mobile-hide">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__subtitle">Anuncios Pulponi Cup y mensajes del sistema</h3>
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

    </div>
  );
}
