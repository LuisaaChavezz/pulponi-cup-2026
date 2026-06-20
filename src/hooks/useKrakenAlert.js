import { useCallback, useEffect, useState } from 'react';
import { EL_ELEGIDO_BADGE_ID } from '../data/achievements';
import {
  markKrakenAlertShownForMode,
  pickKrakenMessage,
  shouldShowKrakenAlertForMode,
} from '../lib/krakenAlertStorage';
import { getKrakenMessagesForMode, resolveKrakenMode } from '../lib/krakenMessages';
import { supabase } from '../lib/supabase';

export function useKrakenAlert(userId) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!userId) {
      setOpen(false);
      setMessage(null);
      setMode(null);
      return undefined;
    }

    let cancelled = false;

    async function load() {
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

      const { data: topProfiles, error: rankErr } = await supabase
        .from('profiles')
        .select('id, points')
        .order('points', { ascending: false })
        .limit(2);

      if (cancelled) return;

      if (rankErr) {
        console.warn('[useKrakenAlert] ranking', rankErr.message ?? rankErr);
        return;
      }

      const top1 = topProfiles?.[0];
      const top2 = topProfiles?.[1];
      const alertMode = resolveKrakenMode(top1?.points, top2?.points);

      if (!shouldShowKrakenAlertForMode(alertMode)) {
        return;
      }

      const messages = getKrakenMessagesForMode(alertMode);
      const picked = pickKrakenMessage(messages, alertMode);

      setMode(alertMode);
      setMessage(picked);
      setOpen(true);
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
    setOpen(false);
  }, [mode]);

  return { open, message, dismiss };
}
