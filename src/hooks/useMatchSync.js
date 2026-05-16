import { useEffect, useRef } from 'react';
import { ensureFootballDataSynced, hasAnyLiveMatch, isFootballApiConfigured } from '../lib/footballApi';

const LIVE_INTERVAL_MS = 30_000;
const IDLE_INTERVAL_MS = 5 * 60_000;

/** Actualización periódica vía API-Football (el seed inicial lo hace useAppData). */
export function useMatchSync(session, matches, onSynced) {
  const syncingRef = useRef(false);
  const hasLive = hasAnyLiveMatch(matches);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (!session || !isFootballApiConfigured()) return;

    let cancelled = false;

    async function runSync() {
      if (syncingRef.current || cancelled) return;
      syncingRef.current = true;
      try {
        const result = await ensureFootballDataSynced();
        if (!cancelled) onSyncedRef.current?.(result);
      } catch (err) {
        console.warn('[useMatchSync]', err?.message ?? err, err);
        if (!cancelled) onSyncedRef.current?.();
      } finally {
        syncingRef.current = false;
      }
    }

    const intervalMs = hasLive ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    const timer = window.setInterval(runSync, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, hasLive]);
}
