import { useCallback, useEffect, useRef } from 'react';
import { EL_ELEGIDO_BADGE_ID } from '../data/achievements';
import {
  markKrakenAlertShownForMode,
  pickKrakenMessage,
  shouldShowKrakenAlertForMode,
} from '../lib/krakenAlertStorage';
import {
  getKrakenMessagesForMode,
  KRAKEN_MODE,
  resolveKrakenMode,
} from '../lib/krakenMessages';
import {
  formatKrakenPrivateContent,
  insertKrakenPrivateMessage,
} from '../lib/krakenPrivateMessages';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import {
  detectThroneChange,
  fetchCurrentElegidoProfile,
  fetchTopTwoProfiles,
  setLastElegidoId,
} from '../lib/krakenThroneState';
import { supabase } from '../lib/supabase';

/** Sincroniza mensajes privados del Kraken en BD (sin modal). */
export function useKrakenAlert(userId, { onInserted } = {}) {
  const pendingElegidoIdRef = useRef(null);
  const onInsertedRef = useRef(onInserted);
  onInsertedRef.current = onInserted;

  const commitPendingElegido = useCallback(() => {
    if (pendingElegidoIdRef.current) {
      setLastElegidoId(pendingElegidoIdRef.current);
      pendingElegidoIdRef.current = null;
    }
  }, []);

  const queuePrivateMessage = useCallback(
    async (alertMode, pickedMessage) => {
      const content = formatKrakenPrivateContent(pickedMessage);
      const { data, error } = await insertKrakenPrivateMessage(userId, content);

      if (error) return false;

      markKrakenAlertShownForMode(alertMode);
      commitPendingElegido();
      if (data?.id) onInsertedRef.current?.();
      return true;
    },
    [userId, commitPendingElegido]
  );

  useEffect(() => {
    if (!userId) {
      pendingElegidoIdRef.current = null;
      return undefined;
    }

    let cancelled = false;

    async function load() {
      const [topData, currentElegido] = await Promise.all([
        fetchTopTwoProfiles(),
        fetchCurrentElegidoProfile(),
      ]);

      if (cancelled) return;

      const change = detectThroneChange(currentElegido?.id, userId);

      if (change.seed && currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (change.changed && change.type === 'new_king') {
        pendingElegidoIdRef.current = change.currentId;
        if (shouldShowKrakenAlertForMode(KRAKEN_MODE.NEW_KING)) {
          const messages = getKrakenMessagesForMode(KRAKEN_MODE.NEW_KING);
          await queuePrivateMessage(
            KRAKEN_MODE.NEW_KING,
            pickKrakenMessage(messages, KRAKEN_MODE.NEW_KING)
          );
        } else {
          commitPendingElegido();
        }
        return;
      }

      if (change.changed && change.type === 'lost_throne') {
        pendingElegidoIdRef.current = change.currentId;
        if (shouldShowKrakenAlertForMode(KRAKEN_MODE.LOST_THRONE)) {
          const messages = getKrakenMessagesForMode(KRAKEN_MODE.LOST_THRONE);
          await queuePrivateMessage(
            KRAKEN_MODE.LOST_THRONE,
            pickKrakenMessage(messages, KRAKEN_MODE.LOST_THRONE)
          );
        } else {
          commitPendingElegido();
        }
        return;
      }

      if (change.changed && change.type === 'transfer' && change.currentId) {
        setLastElegidoId(change.currentId);
      }

      const { data: badgeRow, error: badgeErr } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('profile_id', userId)
        .eq('badge_id', EL_ELEGIDO_BADGE_ID)
        .maybeSingle();

      if (cancelled) return;

      if (badgeErr) {
        console.warn('[useKrakenAlert] badge', badgeErr.message ?? badgeErr);
        return;
      }

      if (badgeRow?.badge_id !== EL_ELEGIDO_BADGE_ID) {
        return;
      }

      if (!topData?.top1 || !topData?.top2) return;

      const alertMode = resolveKrakenMode(topData.top1.points, topData.top2.points);
      if (!shouldShowKrakenAlertForMode(alertMode)) return;

      const elegido = krakenProfileFirstName(topData.top1, 'El elegido');
      const retador = krakenProfileFirstName(topData.top2, 'El retador');
      const messages = getKrakenMessagesForMode(alertMode);
      const picked = pickKrakenMessage(messages, alertMode);
      const personalized = {
        ...picked,
        title: String(picked.title).replace(/\{elegido\}/g, elegido).replace(/\{retador\}/g, retador),
        body: String(picked.body).replace(/\{elegido\}/g, elegido).replace(/\{retador\}/g, retador),
      };

      await queuePrivateMessage(alertMode, personalized);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, queuePrivateMessage, commitPendingElegido]);

  return {};
}
