import { supabase } from './supabase';
import { fetchFixtureEvents, isFootballApiConfigured } from './footballApi';
import { mapApiEventsToHighlights, normalizeStoredHighlightList } from './highlightsMapper';

/**
 * Descarga GET /fixtures/events?fixture=id, guarda timeline en matches.events (JSONB) y devuelve filas UI.
 */
export async function pullAndPersistHighlightEvents(matchRow) {
  const id = matchRow?.id;
  const fid = matchRow?.api_fixture_id;

  if (!id) {
    return { highlights: [], error: null, persisted: false, source: 'none' };
  }

  if (!fid || fid < 1 || !isFootballApiConfigured()) {
    return {
      highlights: normalizeStoredHighlightList(matchRow?.events),
      error: null,
      persisted: false,
      source: 'cache',
    };
  }

  try {
    const raw = await fetchFixtureEvents(fid);
    const highlights = mapApiEventsToHighlights(raw ?? []);

    const { error } = await supabase
      .from('matches')
      .update({
        events: highlights,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[highlights-sync] Supabase', error);
      return {
        highlights: normalizeStoredHighlightList(matchRow?.events),
        error,
        persisted: false,
        source: 'api',
      };
    }

    return { highlights, error: null, persisted: true, source: 'api' };
  } catch (e) {
    console.error('[highlights-sync]', e);
    return {
      highlights: normalizeStoredHighlightList(matchRow?.events),
      error: e,
      persisted: false,
      source: 'api',
    };
  }
}
