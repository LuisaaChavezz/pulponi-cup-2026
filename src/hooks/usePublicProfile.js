import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadPublicProfile } from '../lib/userProfileData';

export function usePublicProfile(profileId, { matches, communityPickProfiles, achievementCatalog } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!profileId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await loadPublicProfile(supabase, profileId, {
        matches: matches ?? [],
        communityProfiles: communityPickProfiles ?? [],
        achievementCatalog: achievementCatalog ?? [],
      });
      setData(result);
      if (!result) setError('Perfil no disponible');
    } catch (e) {
      console.warn('[usePublicProfile]', e?.message ?? e);
      setError(e?.message ?? 'Error al cargar perfil');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [profileId, matches, communityPickProfiles, achievementCatalog]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!profileId) return undefined;

    let channel;
    try {
      channel = supabase
        .channel(`public-profile-${profileId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void reload())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_badges' }, () => void reload())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_scores' }, () => void reload())
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[usePublicProfile] realtime channel error');
          }
        });
    } catch (e) {
      console.warn('[usePublicProfile] realtime subscribe', e?.message ?? e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [profileId, reload]);

  return { data, loading, error, reload };
}
