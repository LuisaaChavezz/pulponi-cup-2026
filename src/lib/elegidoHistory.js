export function normalizeElegidoTransfer(row) {
  if (!row) return null;

  const transferredAtRaw = row.transferred_at ?? row.transferredAt ?? null;
  const transferredAt = transferredAtRaw ? new Date(transferredAtRaw).toISOString() : null;

  return {
    id: row.id ?? null,
    previousUsername: row.previous_username ?? row.previousUsername ?? null,
    newUsername: row.new_username ?? row.newUsername ?? null,
    transferredAt,
    key: row.id ?? transferredAt ?? `${row.previous_username}-${row.new_username}-${Date.now()}`,
  };
}

export function formatElegidoUsername(username) {
  if (!username) return '—';
  const value = String(username).trim();
  if (!value) return '—';
  return value.startsWith('@') ? value : `@${value}`;
}

export async function loadRecentElegidoTransfers(client, { limit = 8 } = {}) {
  if (!client) return [];

  const { data, error } = await client
    .from('elegido_history')
    .select('id, previous_username, new_username, transferred_at')
    .order('transferred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[elegidoHistory] loadRecentElegidoTransfers', error.message);
    return [];
  }

  return (data ?? []).map(normalizeElegidoTransfer).filter(Boolean);
}
