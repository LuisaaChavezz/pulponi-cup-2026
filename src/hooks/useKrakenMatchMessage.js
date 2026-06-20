import { useEffect, useState } from 'react';
import {
  KRAKEN_MATCH_MODE,
  MESSAGES_AFTER,
  MESSAGES_BEFORE,
  pickRandomKrakenMatchMessage,
  resolveMatchMessage,
} from '../lib/krakenMatchMessages';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import { fetchKrakenThroneDispute } from '../lib/krakenThroneState';
import { displayTeamName } from '../lib/matchUtils';
import { supabase } from '../lib/supabase';

const BEFORE_MS = 60 * 60 * 1000;
const AFTER_MS = 3 * 60 * 60 * 1000;

const MATCH_SELECT =
  'id, home_team, away_team, home_score, away_score, kickoff, status, updated_at';

async function fetchNextMatch(now) {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .neq('status', 'scored')
    .gte('kickoff', now.toISOString())
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[useKrakenMatchMessage] next match', error.message ?? error);
    return null;
  }

  return data;
}

async function fetchLastScoredMatch() {
  const { data: scored, error: scoredErr } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('status', 'scored')
    .order('kickoff', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (scoredErr) {
    console.warn('[useKrakenMatchMessage] last scored', scoredErr.message ?? scoredErr);
  }

  if (scored) return scored;

  const { data: finished, error: finishedErr } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('status', 'finished')
    .order('kickoff', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (finishedErr) {
    console.warn('[useKrakenMatchMessage] last finished', finishedErr.message ?? finishedErr);
    return null;
  }

  return finished;
}

async function fetchMatchScoredAt(matchId) {
  if (!matchId) return null;

  const { data, error } = await supabase
    .from('pick_scores')
    .select('scored_at')
    .eq('match_id', matchId)
    .order('scored_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[useKrakenMatchMessage] scored_at', error.message ?? error);
    return null;
  }

  if (data?.scored_at) return new Date(data.scored_at);

  return null;
}

async function countExactHits(matchId) {
  if (!matchId) return 0;

  const { count, error } = await supabase
    .from('pick_scores')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('exact_hit', true);

  if (error) {
    console.warn('[useKrakenMatchMessage] exact count', error.message ?? error);
    return 0;
  }

  return count ?? 0;
}

function resolveMatchScoredAt(match, pickScoreAt) {
  if (pickScoreAt instanceof Date && !Number.isNaN(pickScoreAt.getTime())) {
    return pickScoreAt;
  }

  if (match?.updated_at) {
    const updated = new Date(match.updated_at);
    if (!Number.isNaN(updated.getTime())) return updated;
  }

  return null;
}

function isWithinAfterWindow(scoredAt, now) {
  if (!scoredAt || Number.isNaN(scoredAt.getTime())) return false;
  const elapsed = now.getTime() - scoredAt.getTime();
  return elapsed >= 0 && elapsed <= AFTER_MS;
}

function isWithinBeforeWindow(kickoff, now) {
  const kickoffMs = new Date(kickoff).getTime();
  if (Number.isNaN(kickoffMs)) return false;
  const diff = kickoffMs - now.getTime();
  return diff > 0 && diff <= BEFORE_MS;
}

function buildMatchVars(match, extras = {}) {
  const home = Number(match?.home_score);
  const away = Number(match?.away_score);
  const local = displayTeamName(match?.home_team) ?? 'Local';
  const visitante = displayTeamName(match?.away_team) ?? 'Visitante';
  let ganador = 'Empate';

  if (Number.isFinite(home) && Number.isFinite(away)) {
    if (home > away) ganador = local;
    else if (away > home) ganador = visitante;
  }

  const marcador =
    Number.isFinite(home) && Number.isFinite(away) ? `${home}-${away}` : '—';

  return {
    local,
    visitante,
    ganador,
    marcador,
    exactos: String(extras.exactos ?? 0),
    elegido: extras.elegido ?? '',
    retador: extras.retador ?? '',
  };
}

export function useKrakenMatchMessage() {
  const [message, setMessage] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const [nextMatch, lastScored, dispute] = await Promise.all([
        fetchNextMatch(now),
        fetchLastScoredMatch(),
        fetchKrakenThroneDispute(),
      ]);

      if (cancelled) return;

      const elegido = krakenProfileFirstName(dispute?.elegidoProfile, 'El elegido');
      const retador = krakenProfileFirstName(dispute?.retadorProfile, 'El retador');
      const throneVars = { elegido, retador };

      let showBefore = false;
      if (nextMatch?.kickoff) {
        showBefore = isWithinBeforeWindow(nextMatch.kickoff, now);
      }

      let showAfter = false;
      let exactos = 0;
      if (lastScored?.id) {
        const pickScoreAt = await fetchMatchScoredAt(lastScored.id);
        if (cancelled) return;

        const scoredAt = resolveMatchScoredAt(lastScored, pickScoreAt);
        showAfter = isWithinAfterWindow(scoredAt, now);

        if (showAfter) {
          exactos = await countExactHits(lastScored.id);
          if (cancelled) return;
        }
      }

      if (showBefore) {
        const template = pickRandomKrakenMatchMessage(MESSAGES_BEFORE);
        const vars = buildMatchVars(nextMatch, throneVars);
        setMode(KRAKEN_MATCH_MODE.BEFORE);
        setMessage(resolveMatchMessage(template, vars));
        return;
      }

      if (showAfter) {
        const template = pickRandomKrakenMatchMessage(MESSAGES_AFTER);
        const vars = buildMatchVars(lastScored, { ...throneVars, exactos });
        setMode(KRAKEN_MATCH_MODE.AFTER);
        setMessage(resolveMatchMessage(template, vars));
        return;
      }

      setMessage(null);
      setMode(null);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { message, mode };
}
