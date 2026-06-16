import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadUserBadgeRows } from '../lib/achievementSync';

/**
 * Filas de user_badges de un perfil concreto (consulta con .eq('profile_id')).
 * Fuente de verdad para desbloqueo en perfil y reglas del usuario actual.
 */
export function useProfileUserBadges(profileId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(profileId));

  const reload = useCallback(async () => {
    if (!profileId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await loadUserBadgeRows(supabase, profileId);
      setRows(data);
    } catch (e) {
      console.warn('[useProfileUserBadges]', e?.message ?? e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!profileId) return undefined;

    let channel;
    try {
      channel = supabase
        .channel(`profile-user-badges-${profileId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_badges' }, () => {
          void reload();
        })
        .subscribe();
    } catch (e) {
      console.warn('[useProfileUserBadges] realtime', e?.message ?? e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [profileId, reload]);

  return { rows, loading, reload };
}
