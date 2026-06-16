import { formatElegidoUsername } from '../lib/elegidoHistory';

export default function ElegidoAdminHistory({ transfers = [], loading = false }) {
  return (
    <section className="dash-notifications__section dash-notifications__section--elegido-admin">
      <div className="dash-notifications__head">
        <h3 className="dash-notifications__subtitle">Admin — Trono Kraken</h3>
        <p className="dash-notifications__hint">
          Transferencias del trono 👑 registradas en <code>elegido_history</code>.
        </p>
      </div>

      {loading ? (
        <p className="dash-notifications__empty">Cargando historial…</p>
      ) : !transfers.length ? (
        <p className="dash-notifications__empty">Aún no hay transferencias registradas.</p>
      ) : (
        <ul className="elegido-admin-history">
          {transfers.map((row) => {
            const previous = formatElegidoUsername(row.previousUsername);
            const next = formatElegidoUsername(row.newUsername);
            const when = row.transferredAt
              ? new Date(row.transferredAt).toLocaleString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—';

            return (
              <li key={row.key} className="elegido-admin-history__item">
                <span className="elegido-admin-history__icon" aria-hidden>
                  👑
                </span>
                <div className="elegido-admin-history__copy">
                  <p>
                    {row.previousUsername ? (
                      <>
                        <strong>{previous}</strong> → <strong>{next}</strong>
                      </>
                    ) : (
                      <>
                        Primer trono: <strong>{next}</strong>
                      </>
                    )}
                  </p>
                  <time dateTime={row.transferredAt ?? undefined}>{when}</time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
