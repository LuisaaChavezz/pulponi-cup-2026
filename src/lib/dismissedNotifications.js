const STORAGE_KEY = 'pulponi_dismissed_notifications';

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[dismissedNotifications] write failed', e?.message ?? e);
  }
}

/** Clave estable para una notificación (tipo + id). */
export function notificationKey(type, id) {
  return `${type}:${String(id)}`;
}

export function isNotificationDismissed(key) {
  if (!key) return false;
  return Boolean(readStore()[key]);
}

export function dismissNotification(key) {
  if (!key) return;
  const store = readStore();
  store[key] = Date.now();
  writeStore(store);
}

export function badgeUnlockNotificationKey(userId, badgeId) {
  return notificationKey('badge-unlock', `${userId}:${badgeId}`);
}

export function elegidoTransferNotificationKey(transfer) {
  const id = transfer?.id ?? transfer?.key ?? transfer?.transferredAt;
  return notificationKey('elegido-transfer', id);
}
