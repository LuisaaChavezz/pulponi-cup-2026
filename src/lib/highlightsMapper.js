/**
 * Normaliza eventos API-Sports /fixtures/events → timeline “Highlights” (JSONB matches.events).
 */

function eventDescription(e, variant) {
  const typeStr = String(e.type ?? '');
  const player = e.player?.name?.trim() || null;
  const team = e.team?.name?.trim() || null;
  const assist = e.assist?.name?.trim() || null;
  const detail = String(e.detail ?? '').trim();

  if (typeStr === 'Goal') {
    let s = player ? `Gol · ${player}` : 'Gol';
    if (assist) s += ` (asist. ${assist})`;
    if (detail && !/^normal goal$/i.test(detail)) s += ` — ${detail}`;
    return s;
  }
  if (typeStr === 'Card') {
    const base = detail || 'Tarjeta';
    return player ? `${base} · ${player}` : base;
  }
  if (typeStr === 'subst') {
    const inP = e.player?.name;
    const outP = e.assist?.name;
    if (inP && outP) return `Cambio · entra ${inP} / sale ${outP}`;
    if (inP) return `Cambio · entra ${inP}`;
    return 'Cambio de jugador';
  }
  if (typeStr === 'Var') {
    return detail ? `VAR · ${detail}` : 'Revisión VAR';
  }
  if (typeStr === 'Penalty') {
    return player ? `Penal · ${player}` : 'Penal';
  }
  const bits = [typeStr || 'Evento', detail, player, team].filter(Boolean);
  return bits.slice(0, 4).join(' · ');
}

function resolveVariant(e) {
  const typeStr = String(e.type ?? '');
  const detail = String(e.detail ?? '');

  if (typeStr === 'Var') return 'var';
  if (typeStr === 'subst') return 'sub';
  if (typeStr === 'Penalty') return 'penalty';
  if (typeStr === 'Goal') {
    if (/penalt/i.test(detail)) return 'penalty';
    return 'goal';
  }
  if (typeStr === 'Card') {
    if (/red|roja|second yellow|segunda/i.test(detail)) return 'red';
    return 'yellow';
  }
  if (/foul|falta|injury|lesion/i.test(typeStr) || /foul|falta/i.test(detail)) return 'foul';
  return 'other';
}

/**
 * @param {Array} events respuesta cruda API-Football /fixtures/events
 */
export function mapApiEventsToHighlights(events) {
  if (!Array.isArray(events) || events.length === 0) return [];

  const rows = events.map((e, i) => {
    const variant = resolveVariant(e);
    const minute = e.time?.elapsed ?? null;
    const minuteExtra = e.time?.extra ?? null;
    const typeStr = String(e.type ?? '');
    const team = e.team?.name ?? null;
    const player = e.player?.name ?? null;
    const assist = e.assist?.name ?? null;
    const description = eventDescription(e, variant);

    return {
      id: `${minute ?? 'x'}-${typeStr}-${i}-${player ?? team ?? ''}`.replace(/\s+/g, '-'),
      minute,
      minuteExtra,
      variant,
      apiType: typeStr,
      detail: e.detail ?? null,
      team,
      player,
      assist,
      description,
    };
  });

  return rows.sort((a, b) => {
    const ma = a.minute ?? 999;
    const mb = b.minute ?? 999;
    if (ma !== mb) return ma - mb;
    const xa = a.minuteExtra ?? 0;
    const xb = b.minuteExtra ?? 0;
    return xa - xb;
  });
}

/** Compat filas antiguas (mapTimelineEvents legacy). */
export function normalizeStoredHighlight(ev, i) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.description && ev.variant) return ev;

  const minuteRaw = ev.minute;
  const minute = minuteRaw === '—' || minuteRaw === '' || minuteRaw == null ? null : Number(minuteRaw);
  const type = String(ev.type ?? '').toLowerCase();
  let variant = ev.variant;
  if (!variant) {
    if (type === 'goal') variant = 'goal';
    else if (type === 'card') {
      variant = String(ev.detail ?? '').toLowerCase().includes('red') ? 'red' : 'yellow';
    } else if (type === 'var') variant = 'var';
    else variant = 'other';
  }
  const description =
    ev.description ||
    ev.label ||
    [ev.detail, ev.player, ev.team].filter(Boolean).join(' · ') ||
    'Evento';

  return {
    id: ev.id ?? `legacy-${i}`,
    minute: Number.isNaN(minute) ? null : minute,
    minuteExtra: ev.minuteExtra ?? null,
    variant,
    apiType: ev.apiType ?? type,
    detail: ev.detail ?? null,
    team: ev.team ?? null,
    player: ev.player ?? null,
    assist: ev.assist ?? null,
    description,
  };
}

export function normalizeStoredHighlightList(events) {
  if (!Array.isArray(events)) return [];
  return events.map((e, i) => normalizeStoredHighlight(e, i)).filter(Boolean);
}
