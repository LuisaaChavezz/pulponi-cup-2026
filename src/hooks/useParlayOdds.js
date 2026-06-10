import { useEffect, useMemo, useState } from 'react';
import { isPickLocked } from '../lib/matchUtils';
import { withTimeout } from '../lib/bootstrapPerf';
import { resolveParlayOddsForMatches, isAuthorizedOddsApiConfigured } from '../lib/parlayOdds';

const PARLAY_ODDS_TIMEOUT_MS = 10_000;

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
      const result = await withTimeout(
        resolveParlayOddsForMatches(openMatches, { communityProfiles }),
        PARLAY_ODDS_TIMEOUT_MS,
        'parlay:odds',
        {
          byMatchId: {},
          mode: 'simulated',
          authorizedCount: 0,
          simulatedCount: openMatches.length,
          authorizedError: 'timeout',
          provider: null,
        }
      );
      if (cancelled) return;
      setState({
        loading: false,
        byMatchId: result?.byMatchId ?? {},
        mode: result?.mode ?? 'simulated',
        authorizedCount: result?.authorizedCount ?? 0,
        simulatedCount: result?.simulatedCount ?? openMatches.length,
        authorizedError: result?.authorizedError ?? null,
        provider: result?.provider ?? null,
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
