import { useRef, useState, useEffect } from 'react';
import UserAvatar from './UserAvatar';
import {
  downloadPredictionsPdf,
  downloadPredictionsRaster,
  downloadTextFile,
  predictionsToCsvRows,
} from '../lib/exportPredictions';

export default function DashboardNotifications({
  importantAlerts,
  latestPredictions,
  isAdmin,
  onCreateImportantAlert,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const captureRef = useRef(null);
  const exportWrapRef = useRef(null);

  useEffect(() => {
    if (!exportOpen) return;
    function onDoc(ev) {
      if (!exportWrapRef.current?.contains(ev.target)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

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
    const rows = latestPredictions ?? [];
    setExportOpen(false);
    if (kind === 'csv') {
      downloadTextFile(`pulponi-predicciones-${Date.now()}.csv`, predictionsToCsvRows(rows));
      return;
    }
    if (kind === 'pdf') {
      downloadPredictionsPdf(rows);
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
      <div className="dash-notifications__section">
        <div className="dash-notifications__head">
          <h3 className="dash-notifications__title">Notificaciones importantes</h3>
          <p className="dash-notifications__hint">
            Avisos oficiales (cierre de predicciones, calendario, premios…). Solo administración.
          </p>
        </div>

        {isAdmin ? (
          <form className="dash-notifications__admin-form" onSubmit={handleSubmitAnnouncement}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del aviso"
              required
            />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle" rows={2} />
            <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Publicando…' : 'Publicar aviso'}
            </button>
          </form>
        ) : null}

        <div className="dash-notifications__alerts">
          {!importantAlerts?.length ? (
            <p className="dash-notifications__empty">No hay notificaciones importantes por ahora.</p>
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
            Registro de la última quiniela guardada por cada perfil (visible para la comunidad).
          </p>
        </div>

        <div className="dash-notifications__export-bar">
          <div className="dash-notifications__export-wrap" ref={exportWrapRef}>
            <button type="button" className="dash-notifications__export-toggle" onClick={() => setExportOpen((o) => !o)}>
              Descargar últimas predicciones
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

        {!latestPredictions?.length ? (
          <p className="dash-notifications__empty">Aún no hay predicciones registradas en el historial.</p>
        ) : (
          <div className="dash-notifications__table-wrap">
            <table className="dash-notifications__table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Partido</th>
                  <th>Marcador</th>
                  <th>Avanza</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {latestPredictions.map((r) => (
                  <tr key={r.profile_id}>
                    <td>
                      <div className="dash-notifications__usercell">
                        <UserAvatar photoUrl={r.photoUrl} avatarUrl={r.avatarUrl} className="avatar-frame--xs" alt="" />
                        <span>{r.username ? `@${r.username}` : '—'}</span>
                      </div>
                    </td>
                    <td>{r.matchLabel}</td>
                    <td className="dash-notifications__mono">{r.scoreLabel}</td>
                    <td>{r.advances_team ?? '—'}</td>
                    <td className="dash-notifications__muted">
                      {r.at instanceof Date ? r.at.toLocaleString('es-MX') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="prediction-export-capture" aria-hidden="true">
        <div ref={captureRef} className="prediction-export-capture__inner">
          <p className="prediction-export-capture__brand">Pulponi Cup · Últimas predicciones</p>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Partido</th>
                <th>Marcador</th>
                <th>Avanza</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(latestPredictions ?? []).map((r) => (
                <tr key={r.profile_id}>
                  <td>{r.username ? `@${r.username}` : '—'}</td>
                  <td>{r.matchLabel}</td>
                  <td>{r.scoreLabel}</td>
                  <td>{r.advances_team ?? '—'}</td>
                  <td>{r.at instanceof Date ? r.at.toLocaleString('es-MX') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
