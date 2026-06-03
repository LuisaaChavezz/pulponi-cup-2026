import { useEffect, useState } from 'react';

/** Actualiza la hora cada 30s para revelar tendencias al llegar el kickoff. */
export function useKickoffClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
