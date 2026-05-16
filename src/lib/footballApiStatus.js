const FINISHED_API = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD', 'CANC']);
const LIVE_API = new Set(['LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'INT', 'P']);
const SCHEDULED_API = new Set(['NS', 'TBD', 'PST', 'SCHEDULED']);

export function normalizeApiStatus(shortStatus) {
  const raw = String(shortStatus ?? 'NS').toUpperCase();
  if (FINISHED_API.has(raw)) return 'finished';
  if (LIVE_API.has(raw)) return 'live';
  if (SCHEDULED_API.has(raw)) return 'scheduled';
  return 'scheduled';
}

export { FINISHED_API, LIVE_API, SCHEDULED_API };
