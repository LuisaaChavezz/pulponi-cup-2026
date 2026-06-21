import { useCallback, useEffect, useState } from 'react';
import { EL_ELEGIDO_BADGE_ID } from '../data/achievements';
import { isMissingKrakenColumnError } from '../lib/commentsLoad';
import {
  BANNER_DANGER,
  BANNER_THRONE_CHANGE,
  BANNER_TIED,
  formatPrivateContent,
  getPrivateMessagesForMode,
  KRAKEN_MODE,
  KRAKEN_SLIDE,
  MESSAGES_AFTER,
  MESSAGES_BEFORE,
  parsePrivateContent,
  resolveKrakenMode,
  resolveMessage,
} from '../lib/krakenMessageCatalog';
import {
  KRAKEN_MSG_KEYS,
  pickStablePrivateMessage,
  pickStableTemplate,
} from '../lib/krakenMessagePickStorage';
import {
  afterMatchKey,
  beforeMatchKey,
  getWeekOfYearKey,
  lostThroneKey,
  markKrakenSent,
  markPrivateDangerSent,
  markPublicDangerSent,
  newKingKey,
  privateTiedKey,
  safeKey,
  throneChangeKey,
  tiedKey,
  wasKrakenSent,
  wasPrivateDangerSentInLast2Days,
  wasPublicDangerSentInLast2Days,
} from '../lib/krakenMessageStorage';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import { KRAKEN_PROFILE_ID } from '../lib/krakenProfile';
import {
  detectThroneChange,
  fetchKrakenThroneDispute,
  fetchProfileById,
  fetchUserProfile,
  setLastElegidoId,
} from '../lib/krakenThroneState';
import { displayTeamName } from '../lib/matchUtils';
import {
  hasUnreadKrakenMessages,
  markKrakenMessagesSeen,
  setKrakenLatestMessageId,
} from '../lib/krakenChatUnreadStorage';
import { supabase } from '../lib/supabase';

const BEFORE_MS = 60 * 60 * 1000;
const AFTER_MS = 3 * 60 * 60 * 1000;
const MATCH_SELECT =
  'id, home_team, away_team, home_score, away_score, kickoff, status, updated_at';

async function insertPublicKrakenMessage(body) {
  const text = String(body ?? '').trim();
  if (!text) return false;

  const row = {
    profile_id: KRAKEN_PROFILE_ID,
    match_id: 'general',
    body: text,
    is_kraken: true,
    created_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from('comments')
    .insert(row)
    .select('id')
    .single();

  if (error && isMissingKrakenColumnError(error)) {
    const { is_kraken, ...withoutFlag } = row;
    ({ data, error } = await supabase.from('comments').insert(withoutFlag).select('id').single());
  }

  if (error) {
    console.warn('[useKrakenMessages] public insert failed', error.message ?? error);
    return null;
  }

  if (data?.id) {
    setKrakenLatestMessageId(data.id);
  }

  return data?.id ?? null;
}

async function insertPrivateKrakenMessage(profileId, content) {
  const text = String(content ?? '').trim();
  if (!profileId || !text) return false;

  const { data, error } = await supabase
    .from('kraken_private_messages')
    .insert({
      profile_id: profileId,
      content: text,
      seen: false,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[useKrakenMessages] private insert failed', error.message ?? error);
    return null;
  }

  if (data?.id) {
    setKrakenLatestMessageId(data.id);
  }

  return data?.id ?? null;
}

async function maybeSendPublic(body, storageKey) {
  if (!body || !storageKey || wasKrakenSent(storageKey)) return false;
  const insertedId = await insertPublicKrakenMessage(body);
  if (insertedId) markKrakenSent(storageKey);
  return Boolean(insertedId);
}

async function maybeSendPrivate(profileId, picked, storageKey) {
  if (!profileId || !picked || !storageKey || wasKrakenSent(storageKey)) return false;
  const content = formatPrivateContent({
    title: resolveMessage(picked.title, picked.vars),
    body: resolveMessage(picked.body, picked.vars),
  });
  const insertedId = await insertPrivateKrakenMessage(profileId, content);
  if (insertedId) markKrakenSent(storageKey);
  return Boolean(insertedId);
}

async function fetchUnseenPrivateMessages(profileId) {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from('kraken_private_messages')
    .select('id, content, created_at')
    .eq('profile_id', profileId)
    .eq('seen', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[useKrakenMessages] private fetch failed', error.message ?? error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    ...parsePrivateContent(row.content),
  }));
}

async function fetchNextMatch(now) {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .neq('status', 'finished')
    .gte('kickoff', now.toISOString())
    .order('kickoff', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[useKrakenMessages] next match', error.message ?? error);
    return null;
  }

  return data;
}

async function fetchLastScoredMatch() {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('status', 'finished')
    .order('kickoff', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[useKrakenMessages] last scored', error.message ?? error);
    return null;
  }

  return data;
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
    console.warn('[useKrakenMessages] scored_at', error.message ?? error);
    return null;
  }

  return data?.scored_at ? new Date(data.scored_at) : null;
}

async function countExactHits(matchId) {
  if (!matchId) return 0;

  const { count, error } = await supabase
    .from('pick_scores')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('exact_hit', true);

  if (error) {
    console.warn('[useKrakenMessages] exact count', error.message ?? error);
    return 0;
  }

  return count ?? 0;
}

function isWithinBeforeWindow(kickoff, now) {
  const kickoffMs = new Date(kickoff).getTime();
  if (Number.isNaN(kickoffMs)) return false;
  const diff = kickoffMs - now.getTime();
  return diff > 0 && diff <= BEFORE_MS;
}

function isWithinAfterWindow(scoredAt, now) {
  if (!scoredAt || Number.isNaN(scoredAt.getTime())) return false;
  const elapsed = now.getTime() - scoredAt.getTime();
  return elapsed >= 0 && elapsed <= AFTER_MS;
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

function buildThroneVars({ profileRow, dispute, change, currentElegido, anteriorProfile }) {
  const miNombre = krakenProfileFirstName(profileRow, 'Pulpo');
  const elegido = krakenProfileFirstName(dispute?.elegidoProfile, 'El elegido');
  const retador = krakenProfileFirstName(dispute?.retadorProfile, 'El retador');
  const nuevo = krakenProfileFirstName(currentElegido?.profile, 'El nuevo');
  const anterior = krakenProfileFirstName(anteriorProfile, 'El anterior');

  return { elegido, retador, miNombre, nuevo, anterior, change };
}

function pickPrivateMessage(mode, vars, storageKey) {
  const template = pickStablePrivateMessage(storageKey, getPrivateMessagesForMode(mode));
  if (!template) return null;
  return { title: template.title, body: template.body, vars };
}

async function userHasElegidoBadge(userId) {
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('profile_id', userId)
    .eq('badge_id', EL_ELEGIDO_BADGE_ID)
    .maybeSingle();

  if (error) {
    console.warn('[useKrakenMessages] badge', error.message ?? error);
    return false;
  }

  return data?.badge_id === EL_ELEGIDO_BADGE_ID;
}

export function useKrakenMessages(userId) {
  const [carouselMessages, setCarouselMessages] = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [hasUnread, setHasUnread] = useState(() => hasUnreadKrakenMessages());

  const refreshUnread = useCallback(() => {
    setHasUnread(hasUnreadKrakenMessages());
  }, []);

  const markKrakenSeen = useCallback(() => {
    markKrakenMessagesSeen();
    setHasUnread(false);
  }, []);

  const loadPrivateMessages = useCallback(async () => {
    if (!userId) {
      setPrivateMessages([]);
      return;
    }
    const rows = await fetchUnseenPrivateMessages(userId);
    setPrivateMessages(rows);
  }, [userId]);

  const dismissPrivate = useCallback(
    async (messageId) => {
      if (!messageId) return;
      setPrivateMessages((prev) => prev.filter((m) => m.id !== messageId));
      const { error } = await supabase
        .from('kraken_private_messages')
        .update({ seen: true })
        .eq('id', messageId);
      if (error) {
        console.warn('[useKrakenMessages] dismiss failed', error.message ?? error);
        void loadPrivateMessages();
      }
    },
    [loadPrivateMessages]
  );

  useEffect(() => {
    if (!userId) {
      setCarouselMessages([]);
      setPrivateMessages([]);
      return undefined;
    }

    let cancelled = false;

    async function syncAll() {
      const now = new Date();
      const dateStr = now.toDateString();
      const weekKey = getWeekOfYearKey(now);

      const [profileRow, dispute, nextMatch, lastScored] = await Promise.all([
        fetchUserProfile(userId),
        fetchKrakenThroneDispute(),
        fetchNextMatch(now),
        fetchLastScoredMatch(),
      ]);

      if (cancelled) return;

      const currentElegido = dispute?.currentElegido;
      const change = detectThroneChange(currentElegido?.id, userId);
      const diferencia = dispute?.diferencia ?? null;
      const vars = buildThroneVars({
        profileRow,
        dispute,
        change,
        currentElegido,
        anteriorProfile: null,
      });
      const slides = [];

      if (change.seed && currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (change.changed) {
        const anteriorProfile = change.previousId
          ? await fetchProfileById(change.previousId)
          : null;
        if (cancelled) return;

        const throneVars = buildThroneVars({
          profileRow,
          dispute,
          change,
          currentElegido,
          anteriorProfile,
        });
        const throneTemplate = pickStableTemplate(
          KRAKEN_MSG_KEYS.throne(change.currentId),
          BANNER_THRONE_CHANGE
        );
        const throneText = resolveMessage(throneTemplate, throneVars);
        slides.push({ id: KRAKEN_SLIDE.THRONE_CHANGE, text: throneText });

        const storageKey = throneChangeKey(change.currentId);
        await maybeSendPublic(throneText, storageKey);

        if (change.type === 'new_king') {
          const picked = pickPrivateMessage(
            KRAKEN_MODE.NEW_KING,
            throneVars,
            KRAKEN_MSG_KEYS.privateNewKing(change.currentId)
          );
          await maybeSendPrivate(userId, picked, newKingKey(change.currentId));
        }

        if (change.type === 'lost_throne') {
          const picked = pickPrivateMessage(
            KRAKEN_MODE.LOST_THRONE,
            throneVars,
            KRAKEN_MSG_KEYS.privateLostThrone(change.previousId)
          );
          await maybeSendPrivate(userId, picked, lostThroneKey(change.previousId));
        }

        setLastElegidoId(change.currentId);
      } else if (currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (nextMatch?.kickoff && isWithinBeforeWindow(nextMatch.kickoff, now)) {
        const matchVars = buildMatchVars(nextMatch, vars);
        const beforeTemplate = pickStableTemplate(
          KRAKEN_MSG_KEYS.before(nextMatch.id),
          MESSAGES_BEFORE
        );
        const beforeText = resolveMessage(beforeTemplate, matchVars);
        slides.push({ id: KRAKEN_SLIDE.MATCH_BEFORE, text: beforeText });
        await maybeSendPublic(beforeText, beforeMatchKey(nextMatch.id));
      }

      if (lastScored?.id) {
        const pickScoreAt = await fetchMatchScoredAt(lastScored.id);
        if (cancelled) return;

        const scoredAt = resolveMatchScoredAt(lastScored, pickScoreAt);
        if (isWithinAfterWindow(scoredAt, now)) {
          const exactos = await countExactHits(lastScored.id);
          if (cancelled) return;

          const matchVars = buildMatchVars(lastScored, { ...vars, exactos });
          const afterTemplate = pickStableTemplate(
            KRAKEN_MSG_KEYS.after(lastScored.id),
            MESSAGES_AFTER
          );
          const afterText = resolveMessage(afterTemplate, matchVars);
          slides.push({ id: KRAKEN_SLIDE.MATCH_AFTER, text: afterText });
          await maybeSendPublic(afterText, afterMatchKey(lastScored.id));
        }
      }

      if (diferencia != null && diferencia === 0) {
        const tiedTemplate = pickStableTemplate(KRAKEN_MSG_KEYS.tied(dateStr), BANNER_TIED);
        const tiedText = resolveMessage(tiedTemplate, vars);
        slides.push({ id: KRAKEN_SLIDE.DISPUTE, text: tiedText });
        await maybeSendPublic(tiedText, tiedKey(dateStr));

        if (await userHasElegidoBadge(userId)) {
          if (!wasKrakenSent(privateTiedKey(dateStr))) {
            const picked = pickPrivateMessage(
              KRAKEN_MODE.TIED,
              vars,
              KRAKEN_MSG_KEYS.privateTied(dateStr)
            );
            await maybeSendPrivate(userId, picked, privateTiedKey(dateStr));
          }
        }
      } else if (diferencia != null && diferencia >= 1 && diferencia <= 2) {
        const dangerTemplate = pickStableTemplate(KRAKEN_MSG_KEYS.danger(dateStr), BANNER_DANGER);
        const dangerText = resolveMessage(dangerTemplate, vars);
        slides.push({ id: KRAKEN_SLIDE.DISPUTE, text: dangerText });

        if (!wasPublicDangerSentInLast2Days(now)) {
          const insertedId = await insertPublicKrakenMessage(dangerText);
          if (insertedId) markPublicDangerSent(now);
        }

        if (await userHasElegidoBadge(userId)) {
          if (!wasPrivateDangerSentInLast2Days(now)) {
            const picked = pickPrivateMessage(
              KRAKEN_MODE.DANGER,
              vars,
              KRAKEN_MSG_KEYS.privateDanger(dateStr)
            );
            if (picked) {
              const content = formatPrivateContent({
                title: resolveMessage(picked.title, picked.vars),
                body: resolveMessage(picked.body, picked.vars),
              });
              const insertedId = await insertPrivateKrakenMessage(userId, content);
              if (insertedId) {
                markPrivateDangerSent(now);
              }
            }
          }
        }
      } else if (diferencia != null && diferencia > 2) {
        if (await userHasElegidoBadge(userId)) {
          const storageKey = safeKey(weekKey);
          if (!wasKrakenSent(storageKey)) {
            const picked = pickPrivateMessage(
              KRAKEN_MODE.SAFE,
              vars,
              KRAKEN_MSG_KEYS.privateSafe(weekKey)
            );
            await maybeSendPrivate(userId, picked, storageKey);
          }
        }
      }

      if (cancelled) return;

      setCarouselMessages(slides);
      await loadPrivateMessages();
      refreshUnread();
    }

    void syncAll();

    return () => {
      cancelled = true;
    };
  }, [userId, loadPrivateMessages, refreshUnread]);

  return {
    carouselMessages,
    privateMessages,
    showFab: carouselMessages.length > 0,
    hasUnread,
    markKrakenSeen,
    refreshUnread,
    dismissPrivate,
  };
}
