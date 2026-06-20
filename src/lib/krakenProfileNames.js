export function firstName(name) {
  return name?.split(' ')[0] || name;
}

/** Primer nombre para mensajes Kraken: full_name → name → username. */
export function krakenProfileFirstName(row, fallback) {
  const raw = row?.full_name || row?.name || row?.username || fallback;
  return firstName(raw) || fallback;
}
