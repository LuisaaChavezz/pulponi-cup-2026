import { useEffect, useState } from 'react';
import { BANNER_MODE, buildBannerText } from '../lib/krakenBannerMessages';
import { syncKrakenBannerChatMessage, syncKrakenMatchChatMessage } from '../lib/krakenChatPost';
import {
  MESSAGES_AFTER,
  MESSAGES_BEFORE,
  pickRandomKrakenMatchMessage,
  resolveMatchMessage,
} from '../lib/krakenMatchMessages';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import {
  detectThroneChange,
  fetchKrakenThroneDispute,
  fetchProfileById,
  fetchUserProfile,
  setLastElegidoId,
} from '../lib/krakenThroneState';
import { displayTeamName } from '../lib/matchUtils';
import { supabase } from '../lib/supabase';

const BEFORE_MS = 60 * 60 * 1000;
const AFTER_MS = 3 * 60 * 60 * 1000;

const MATCH_SELECT =
  'id, home_team, away_team, home_score, away_score, kickoff, status, updated_at';

export const KRAKEN_SLIDE = {
  THRONE_CHANGE: 'throne_change',
  MATCH_BEFORE: 'match_before',
  MATCH_AFTER: 'match_after',
  DISPUTE: 'dispute',
};

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
    console.warn('[useKrakenCarousel] next match', error.message ?? error);
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
    console.warn('[useKrakenCarousel] last scored', scoredErr.message ?? scoredErr);
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
    console.warn('[useKrakenCarousel] last finished', finishedErr.message ?? finishedErr);
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
    console.warn('[useKrakenCarousel] scored_at', error.message ?? error);
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
    console.warn('[useKrakenCarousel] exact count', error.message ?? error);
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

export function useKrakenCarousel(userId) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const [profileRow, dispute, nextMatch, lastScored] = await Promise.all([
        fetchUserProfile(userId),
        fetchKrakenThroneDispute(),
        fetchNextMatch(now),
        fetchLastScoredMatch(),
      ]);

      if (cancelled) return;

      const miNombre = krakenProfileFirstName(profileRow, 'Pulpo');
      const currentElegido = dispute?.currentElegido;
      const change = detectThroneChange(currentElegido?.id, userId);
      const elegido = krakenProfileFirstName(dispute?.elegidoProfile, 'El elegido');
      const retador = krakenProfileFirstName(dispute?.retadorProfile, 'El retador');
      const diferencia = dispute?.diferencia ?? null;
      const throneVars = { elegido, retador, miNombre };
      const slides = [];

      if (change.seed && currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (change.changed) {
        const anteriorProfile = change.previousId ? await fetchProfileById(change.previousId) : null;
        if (cancelled) return;

        const nuevo = krakenProfileFirstName(currentElegido?.profile, 'El nuevo');
        const anterior = krakenProfileFirstName(anteriorProfile, 'El anterior');
        const vars = { elegido, retador, miNombre, nuevo, anterior };
        const text = buildBannerText(BANNER_MODE.THRONE_CHANGE, vars);

        slides.push({ id: KRAKEN_SLIDE.THRONE_CHANGE, text });
        setLastElegidoId(change.currentId);
        void syncKrakenBannerChatMessage({
          mode: BANNER_MODE.THRONE_CHANGE,
          content: text,
          currentElegidoId: change.currentId,
        });
      } else if (currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (nextMatch?.kickoff && isWithinBeforeWindow(nextMatch.kickoff, now)) {
        const template = pickRandomKrakenMatchMessage(MESSAGES_BEFORE);
        const vars = buildMatchVars(nextMatch, throneVars);
        const text = resolveMatchMessage(template, vars);
        slides.push({ id: KRAKEN_SLIDE.MATCH_BEFORE, text });
        void syncKrakenMatchChatMessage({
          phase: 'before',
          matchId: nextMatch.id,
          content: text,
        });
      }

      if (lastScored?.id) {
        const pickScoreAt = await fetchMatchScoredAt(lastScored.id);
        if (cancelled) return;

        const scoredAt = resolveMatchScoredAt(lastScored, pickScoreAt);
        if (isWithinAfterWindow(scoredAt, now)) {
          const exactos = await countExactHits(lastScored.id);
          if (cancelled) return;

          const template = pickRandomKrakenMatchMessage(MESSAGES_AFTER);
          const vars = buildMatchVars(lastScored, { ...throneVars, exactos });
          const text = resolveMatchMessage(template, vars);
          slides.push({ id: KRAKEN_SLIDE.MATCH_AFTER, text });
          void syncKrakenMatchChatMessage({
            phase: 'after',
            matchId: lastScored.id,
            content: text,
          });
        }
      }

      if (dispute && diferencia != null && diferencia <= 2) {
        const bannerMode = diferencia === 0 ? BANNER_MODE.TIED : BANNER_MODE.DANGER;
        const vars = { elegido, retador, miNombre };
        const text = buildBannerText(bannerMode, vars);
        slides.push({ id: KRAKEN_SLIDE.DISPUTE, text });
        void syncKrakenBannerChatMessage({
          mode: bannerMode,
          content: text,
          currentElegidoId: currentElegido?.id,
        });
      }

      setMessages(slides);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    messages,
    showFab: messages.length > 0,
  };
}
