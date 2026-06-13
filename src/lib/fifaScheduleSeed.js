import {
  OFFICIAL_WORLD_CUP_SCHEDULE,
  getAllOfficialScheduleEntries,
  officialIdToFixtureKey,
} from '../data/officialWorldCupSchedule.js';
import { flagEmojiForTeam, flagLogoUrlForTeam } from './teamFlags.js';

/** Verifica que el módulo de calendario FIFA cargó correctamente. */
export function verifyOfficialScheduleModule() {
  return getAllOfficialScheduleEntries().length;
}

const INVALID_AWAY = /^(por definir|tbd|tba|a definir|por confirmar)$/i;

export function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function isValidTeamName(name) {
  const team = cleanText(name);
  if (!team) return false;
  if (INVALID_AWAY.test(team)) return false;
  return true;
}

export function isBrokenMatchRow(row) {
  if (!row) return true;
  if (!isValidTeamName(row.home_team)) return true;
  if (!isValidTeamName(row.away_team)) return true;
  if (!cleanText(row.venue)) return true;
  if (!row.kickoff) return true;
  return false;
}

/** Construye fila Supabase; null si equipos inválidos. */
export function buildOfficialMatchRow(match) {
  const home_team = cleanText(match.home_team);
  const away_team = cleanText(match.away_team);

  if (!isValidTeamName(home_team) || !isValidTeamName(away_team)) {
    return null;
  }

  const home_flag = cleanText(match.home_flag) ?? flagEmojiForTeam(home_team);
  const away_flag = cleanText(match.away_flag) ?? flagEmojiForTeam(away_team);
  const home_logo = cleanText(match.home_logo) ?? flagLogoUrlForTeam(home_team) ?? null;
  const away_logo = cleanText(match.away_logo) ?? flagLogoUrlForTeam(away_team) ?? null;

  const official_id = cleanText(match.official_id);
  if (!official_id) return null;

  return {
    official_id,
    api_fixture_id: officialIdToFixtureKey(official_id),
    home_team,
    away_team,
    home_logo,
    away_logo,
    home_flag,
    away_flag,
    kickoff: match.kickoff ?? null,
    venue: cleanText(match.venue),
    venue_city: cleanText(match.venue_city),
    group_name: cleanText(match.group_name) ?? 'Mundial 2026',
    is_knockout: Boolean(match.is_knockout),
    status: cleanText(match.status) ?? 'scheduled',
    api_status: 'NS',
    provisional: true,
    is_demo: false,
    home_score: 0,
    away_score: 0,
    minute: null,
    events: [],
    goals: [],
    cards: [],
    penalties: null,
    winner: null,
  };
}

/** Fila sin equipos definidos (no borra por venue u otros criterios). */
export function isMissingTeamsRow(row) {
  if (!row) return true;
  const h = cleanText(row.home_team);
  const a = cleanText(row.away_team);
  return !h || !a;
}

/** Elimina solo partidos sin home_team o away_team (no toca picks en otras filas). */
export async function deleteMatchesMissingTeams(client) {
  const { data, error } = await client.from('matches').select('id, home_team, away_team');
  if (error) {
    console.warn('[FIFA SCHEDULE] listar matches para limpieza:', error.message);
    return 0;
  }
  const ids = (data ?? []).filter(isMissingTeamsRow).map((r) => r.id);
  if (!ids.length) return 0;
  const { error: delError } = await client.from('matches').delete().in('id', ids);
  if (delError) {
    console.warn('[FIFA SCHEDULE] eliminar sin equipos:', delError.message);
    return 0;
  }
  console.info(`[FIFA SCHEDULE] Eliminados ${ids.length} partidos sin equipos`);
  return ids.length;
}

export async function deleteBrokenMatches(client) {
  const { data, error } = await client.from('matches').select('*');
  if (error) {
    console.error('[FIFA SCHEDULE] Error listando matches:', error);
    throw error;
  }

  const brokenIds = (data ?? []).filter(isBrokenMatchRow).map((r) => r.id);
  if (!brokenIds.length) return 0;

  const { error: delError } = await client.from('matches').delete().in('id', brokenIds);
  if (delError) {
    console.error('[FIFA SCHEDULE] Error eliminando matches rotos:', delError);
    throw delError;
  }

  console.info(`[FIFA SCHEDULE] Eliminados ${brokenIds.length} partidos rotos/vacíos`);
  return brokenIds.length;
}

export async function deleteProvisionalMatches(client) {
  const { data, error } = await client
    .from('matches')
    .select('id')
    .eq('provisional', true);

  if (error) {
    console.error('[FIFA SCHEDULE] Error listando provisionales:', error);
    throw error;
  }

  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return 0;

  const { error: delError } = await client.from('matches').delete().in('id', ids);
  if (delError) {
    console.error('[FIFA SCHEDULE] Error eliminando provisionales:', delError);
    throw delError;
  }

  console.info(`[FIFA SCHEDULE] Eliminados ${ids.length} partidos provisionales previos`);
  return ids.length;
}

/** Elimina provisionales cuyo official_id ya no está en el calendario (conserva filas con picks si tienen official_id válido). */
export async function deleteOrphanProvisionalMatches(client, scheduleOfficialIds) {
  const { data, error } = await client.from('matches').select('id, official_id').eq('provisional', true);
  if (error) {
    console.error('[FIFA SCHEDULE] Error listando provisionales (huérfanos):', error);
    throw error;
  }

  const ids = (data ?? [])
    .filter((r) => {
      const oid = cleanText(r.official_id);
      if (!oid) return true;
      return !scheduleOfficialIds.has(oid);
    })
    .map((r) => r.id);

  if (!ids.length) return 0;

  const { error: delError } = await client.from('matches').delete().in('id', ids);
  if (delError) {
    console.error('[FIFA SCHEDULE] Error eliminando provisionales huérfanos:', delError);
    throw delError;
  }

  console.info(`[FIFA SCHEDULE] Eliminados ${ids.length} partidos provisionales fuera del calendario actual`);
  return ids.length;
}

/**
 * Inserta o actualiza filas por official_id.
 * - insert: fila nueva
 * - update: fila provisional existente (conserva id → picks intactos)
 * - skip: fila no provisional (enriquecida por API) o error
 */
async function upsertOfficialRowsByOfficialId(client, rows) {
  const errors = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { data: existing, error: selErr } = await client
      .from('matches')
      .select('id, provisional')
      .eq('official_id', row.official_id)
      .maybeSingle();

    if (selErr) {
      errors.push(selErr);
      skipped += 1;
      console.warn('[FIFA SCHEDULE] select', row.official_id, selErr.message);
      continue;
    }

    if (existing?.id) {
      if (existing.provisional === false) {
        skipped += 1;
        continue;
      }
      // Conservar kickoff ya guardado (p. ej. corrección manual en Supabase).
      const { kickoff: _omitKickoff, ...rowWithoutKickoff } = row;
      const { error } = await client.from('matches').update(rowWithoutKickoff).eq('id', existing.id);
      if (error) {
        errors.push(error);
        skipped += 1;
        console.warn('[FIFA SCHEDULE] update', row.official_id, error.message);
        continue;
      }
      updated += 1;
    } else {
      const { error } = await client.from('matches').insert(row);
      if (error) {
        errors.push(error);
        skipped += 1;
        console.warn('[FIFA SCHEDULE] insert', row.official_id, error.message);
        continue;
      }
      inserted += 1;
    }
  }

  return { inserted, updated, skipped, errors };
}

/**
 * Sincronizador principal del calendario FIFA → public.matches.
 * Lee officialWorldCupSchedule.js, upsert por official_id, orden cronológico.
 */
export async function syncOfficialWorldCupSchedule(client) {
  const nEntries = verifyOfficialScheduleModule();
  if (!nEntries) {
    throw new Error('Calendario FIFA vacío — revisa officialWorldCupSchedule.js');
  }

  await deleteMatchesMissingTeams(client);

  const schedule = getAllOfficialScheduleEntries().slice().sort((a, b) => {
    return new Date(a.kickoff ?? 0) - new Date(b.kickoff ?? 0);
  });

  const scheduleOfficialIds = new Set(
    schedule.map((m) => cleanText(m.official_id)).filter(Boolean)
  );

  await deleteOrphanProvisionalMatches(client, scheduleOfficialIds);

  const officialIdsList = [...scheduleOfficialIds];
  let lockedRows = [];
  if (officialIdsList.length) {
    const { data, error } = await client
      .from('matches')
      .select('official_id')
      .in('official_id', officialIdsList)
      .eq('provisional', false);

    if (error) {
      console.warn('[FIFA SCHEDULE] No se pudo listar partidos enlazados API:', error.message);
    } else {
      lockedRows = data ?? [];
    }
  }

  const skipOfficialIds = new Set(
    lockedRows.map((r) => cleanText(r.official_id)).filter(Boolean)
  );

  const rows = [];
  for (const match of schedule) {
    const row = buildOfficialMatchRow(match);
    if (!row) continue;
    if (skipOfficialIds.has(row.official_id)) continue;
    rows.push(row);
  }

  if (!rows.length) {
    throw new Error(
      lockedRows.length
        ? 'Calendario FIFA: todos los official_id ya existen como partidos no provisionales (API)'
        : 'Calendario FIFA: ningún partido válido para insertar/actualizar'
    );
  }

  const { inserted, updated, skipped: upsertSkipped, errors: rowErrors } =
    await upsertOfficialRowsByOfficialId(client, rows);

  const skipped = upsertSkipped + skipOfficialIds.size;

  if (inserted === 0 && updated === 0 && rowErrors.length === 0 && skipOfficialIds.size === rows.length) {
    return {
      inserted: 0,
      updated: 0,
      skipped,
      total: nEntries,
      provisional: true,
      source: 'fifa',
      unchanged: true,
    };
  }

  if (inserted === 0 && updated === 0 && rowErrors.length) {
    const first = rowErrors[0];
    throw new Error(
      first ? `Calendario FIFA: ningún upsert exitoso — ${first.message}` : 'Calendario FIFA: upsert vacío'
    );
  }

  if (rowErrors.length) {
    console.warn(`[FIFA SCHEDULE] ${rowErrors.length} filas con error (${rows.length} intentadas)`);
  }

  return {
    inserted,
    updated,
    skipped,
    imported: inserted + updated,
    total: nEntries,
    provisional: true,
    source: 'fifa',
    failed: rowErrors.length,
  };
}

/** @deprecated Usar syncOfficialWorldCupSchedule */
export async function insertOfficialProvisionalFixtures(client) {
  return syncOfficialWorldCupSchedule(client);
}

/** Compatibilidad con imports antiguos. */
export function officialScheduleToMatchRow(match) {
  return buildOfficialMatchRow(match);
}

export { OFFICIAL_WORLD_CUP_SCHEDULE };
