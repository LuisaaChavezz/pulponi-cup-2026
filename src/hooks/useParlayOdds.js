import { useEffect, useMemo, useState } from 'react';
import { isPickLocked } from '../lib/matchUtils';
import { resolveParlayOddsForMatches, isAuthorizedOddsApiConfigured } from '../lib/parlayOdds';

export function useParlayOdds(matches, communityProfiles = []) {
  const openMatches = useMemo(
    () => (matches ?? []).filter((m) => m && !isPickLocked(m)),
    [matches]
  );

  const communityKey = useMemo(
    () => (communityProfiles ?? []).map((p) => `${p.id}:${Object.keys(p.picks ?? {}).length}`).join('|'),
    [communityProfiles]
  );

  const [state, setState] = useState({
    loading: true,
    byMatchId: {},
    mode: 'simulated',
    authorizedCount: 0,
    simulatedCount: 0,
    authorizedError: null,
    provider: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState((prev) => ({ ...prev, loading: true }));
      const result = await resolveParlayOddsForMatches(openMatches, { communityProfiles });
      if (cancelled) return;
      setState({
        loading: false,
        byMatchId: result.byMatchId,
        mode: result.mode,
        authorizedCount: result.authorizedCount,
        simulatedCount: result.simulatedCount,
        authorizedError: result.authorizedError,
        provider: result.provider,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [openMatches, communityKey, communityProfiles]);

  return {
    ...state,
    openMatches,
    apiConfigured: isAuthorizedOddsApiConfigured(),
  };
}
