import { formatElegidoUsername } from '../lib/elegidoHistory';

export default function ElegidoTransferToast({ transfer, onDismiss, placement = 'fixed' }) {
  if (!transfer) return null;

  const previous = formatElegidoUsername(transfer.previousUsername);
  const next = formatElegidoUsername(transfer.newUsername);
  const headline = transfer.previousUsername
    ? `👑 ¡Cayó el Trono Kraken! ${next} arrebató el trono a ${previous}`
    : `👑 ¡Cayó el Trono Kraken! ${next} tomó el trono`;
  const when = transfer.transferredAt
    ? new Date(transfer.transferredAt).toLocaleString('es-MX', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className={[
        'elegido-transfer-toast',
        placement === 'inline' ? 'elegido-transfer-toast--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <p className="elegido-transfer-toast__headline">{headline}</p>
      {when ? <time dateTime={transfer.transferredAt}>{when}</time> : null}
      <button type="button" className="elegido-transfer-toast__close" onClick={() => onDismiss?.()}>
        Cerrar
      </button>
    </div>
  );
}
