import { useCallback, useEffect, useRef, useState } from 'react';
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
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import {
  detectThroneChange,
  fetchCurrentElegidoProfile,
  fetchTopTwoProfiles,
  setLastElegidoId,
} from '../lib/krakenThroneState';
import { supabase } from '../lib/supabase';

export function useKrakenAlert(userId) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [mode, setMode] = useState(null);
  const pendingElegidoIdRef = useRef(null);

  useEffect(() => {
    if (!userId) {
      setOpen(false);
      setMessage(null);
      setMode(null);
      pendingElegidoIdRef.current = null;
      return undefined;
    }

    let cancelled = false;

    async function showAlert(alertMode, pickedMessage) {
      setMode(alertMode);
      setMessage(pickedMessage);
      setOpen(true);
    }

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
          await showAlert(KRAKEN_MODE.NEW_KING, pickKrakenMessage(messages, KRAKEN_MODE.NEW_KING));
        } else {
          setLastElegidoId(change.currentId);
        }
        return;
      }

      if (change.changed && change.type === 'lost_throne') {
        pendingElegidoIdRef.current = change.currentId;
        if (shouldShowKrakenAlertForMode(KRAKEN_MODE.LOST_THRONE)) {
          const messages = getKrakenMessagesForMode(KRAKEN_MODE.LOST_THRONE);
          await showAlert(KRAKEN_MODE.LOST_THRONE, pickKrakenMessage(messages, KRAKEN_MODE.LOST_THRONE));
        } else {
          setLastElegidoId(change.currentId);
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

      await showAlert(alertMode, personalized);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    if (mode) {
      markKrakenAlertShownForMode(mode);
    }
    if (pendingElegidoIdRef.current) {
      setLastElegidoId(pendingElegidoIdRef.current);
      pendingElegidoIdRef.current = null;
    }
    setOpen(false);
  }, [mode]);

  return { open, message, mode, dismiss };
}
