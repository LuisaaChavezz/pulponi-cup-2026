import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadPublicProfile } from '../lib/userProfileData';

export function usePublicProfile(profileId, { matches, communityPickProfiles, achievementCatalog } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [error, setError] = useState(null);

  const loadGenRef = useRef(0);
  const reloadTimerRef = useRef(null);
  const matchesLenRef = useRef(0);
  const ctxRef = useRef({
    matches: [],
    communityPickProfiles: [],
    achievementCatalog: [],
  });

  ctxRef.current = {
    matches: matches ?? [],
    communityPickProfiles: communityPickProfiles ?? [],
    achievementCatalog: achievementCatalog ?? [],
  };

  const reload = useCallback(async () => {
    if (!profileId) {
      loadGenRef.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const gen = ++loadGenRef.current;
    setData(null);
    setLoading(true);
    setError(null);

    try {
      const ctx = ctxRef.current;
      const result = await loadPublicProfile(supabase, profileId, {
        matches: ctx.matches,
        communityProfiles: ctx.communityPickProfiles,
        achievementCatalog: ctx.achievementCatalog,
      });

      if (gen !== loadGenRef.current) return;

      if (!result) {
        setData(null);
        setError('Perfil no disponible');
        return;
      }

      setData(result);
      setError(null);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      console.warn('[usePublicProfile]', e?.message ?? e);
      setError(e?.message ?? 'Error al cargar perfil');
      setData(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [profileId]);

  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      void reload();
    }, 500);
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    matchesLenRef.current = 0;
  }, [profileId]);

  // Re-fetch when the match catalog grows (bootstrap), not on every live score tick.
  useEffect(() => {
    if (!profileId || loading) return undefined;

    const len = ctxRef.current.matches?.length ?? 0;
    if (len <= matchesLenRef.current) return undefined;

    matchesLenRef.current = len;
    const timer = window.setTimeout(() => void reload(), 300);
    return () => window.clearTimeout(timer);
  }, [profileId, matches?.length, loading, reload]);

  useEffect(() => {
    if (!profileId) return undefined;

    let channel;
    try {
      channel = supabase
        .channel(`public-profile-${profileId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_badges' }, scheduleReload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pick_scores' }, scheduleReload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, scheduleReload)
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[usePublicProfile] realtime channel error');
          }
        });
    } catch (e) {
      console.warn('[usePublicProfile] realtime subscribe', e?.message ?? e);
    }

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [profileId, scheduleReload]);

  return { data, loading, error, reload };
}
