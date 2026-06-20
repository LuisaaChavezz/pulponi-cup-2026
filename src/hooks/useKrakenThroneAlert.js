import { useCallback, useEffect, useState } from 'react';
import { EL_ELEGIDO_BADGE_ID } from '../data/achievements';
import { markKrakenAlertSeenToday, wasKrakenAlertSeenToday } from '../lib/krakenAlertStorage';
import { supabase } from '../lib/supabase';

export function useKrakenThroneAlert(userId) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) {
      setOpen(false);
      return undefined;
    }

    if (wasKrakenAlertSeenToday()) {
      setOpen(false);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('profile_id', userId)
        .eq('badge_id', EL_ELEGIDO_BADGE_ID)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('[useKrakenThroneAlert]', error.message ?? error);
        return;
      }

      if (data?.badge_id === EL_ELEGIDO_BADGE_ID) {
        setOpen(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    markKrakenAlertSeenToday();
    setOpen(false);
  }, []);

  return { open, dismiss };
}
