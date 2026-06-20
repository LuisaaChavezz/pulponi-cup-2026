export function firstName(name) {
  return name?.split(' ')[0] || name;
}

/** Primer nombre: full_name → name → username. */
export function krakenProfileFirstName(row, fallback) {
  const raw = row?.full_name || row?.name || row?.username || fallback;
  return firstName(raw) || fallback;
}

export function resolveKrakenMessageText(text, vars = {}) {
  return String(text ?? '')
    .replace(/\{elegido\}/g, vars.elegido ?? '')
    .replace(/\{retador\}/g, vars.retador ?? '')
    .replace(/\{miNombre\}/g, vars.miNombre ?? '')
    .replace(/\{nuevo\}/g, vars.nuevo ?? '')
    .replace(/\{anterior\}/g, vars.anterior ?? '');
}
