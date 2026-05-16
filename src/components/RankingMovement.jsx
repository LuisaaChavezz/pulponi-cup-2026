import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import UserAvatar from './UserAvatar';

const TOP_EMOJIS = ['🐙🏆', '🧠', '👑', '🔥', '⚡'];

function selectName(p) {
  const u = p.username?.trim();
  if (u) return `@${u}`;
  const n = p.name?.trim();
  if (n) return n;
  return 'Jugador';
}

async function fetchLeaderboard() {
  return supabase
    .from('profiles')
    .select('id, username, name, photo_url, points, exacts, streak')
    .order('points', { ascending: false });
}

function enrichWithMovement(rawList, prevMap) {
  const list = rawList ?? [];
  const enriched = list.map((r) => {
    const pts = Number(r.points ?? 0);
    const old = prevMap.get(r.id);
    let delta = null;
    if (old != null && pts > old) delta = pts - old;
    return {
      ...r,
      points: pts,
      exacts: Number(r.exacts ?? 0),
      streak: Number(r.streak ?? 0),
      delta,
      gained: delta != null && delta > 0,
    };
  });
  enriched.forEach((r) => prevMap.set(r.id, r.points));
  return enriched;
}

export default function RankingMovement({ session, className = '' }) {
  const userId = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const prevPointsRef = useRef(new Map());

  const applyList = useCallback((raw) => {
    setRows(enrichWithMovement(raw, prevPointsRef.current));
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error } = await fetchLeaderboard();
      if (cancelled) return;
      if (error) {
        console.error('[RankingMovement]', error);
        setRows([]);
        setLoading(false);
        return;
      }
      prevPointsRef.current = new Map();
      (data ?? []).forEach((r) => prevPointsRef.current.set(r.id, Number(r.points ?? 0)));
      applyList(data);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`profiles-ranking-movement-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        async () => {
          const { data, error } = await fetchLeaderboard();
          if (error || !data) return;
          applyList(data);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, applyList]);

  const top5 = useMemo(() => rows.slice(0, 5), [rows]);
  const rest = useMemo(() => rows.slice(5), [rows]);
  const maxTop5 = useMemo(() => {
    const m = Math.max(1, ...top5.map((r) => r.points));
    return m;
  }, [top5]);

  const isEmpty = !loading && rows.length === 0;

  return (
    <article
      className={['phone', 'phone--rank-movement', className].filter(Boolean).join(' ')}
      aria-labelledby="ranking-movimiento-title"
    >
      <div className="phone-header phone-header--center phone-header--rank-mov">
        <span id="ranking-movimiento-title">Ranking en movimiento</span>
      </div>

      {loading ? (
        <div className="rm-loading">
          <span className="rm-loading-pulse" />
          <p className="rm-muted">Sincronizando quiniela…</p>
        </div>
      ) : isEmpty ? (
        <div className="rm-empty">
          <p>El ranking todavía está vacío.</p>
        </div>
      ) : (
        <>
          <div className="rm-top5-graph" role="list">
            {top5.map((r, i) => {
              const rank = i + 1;
              const barPct = Math.min(100, (r.points / maxTop5) * 100);
              return (
                <div
                  key={r.id}
                  role="listitem"
                  className={`rm-top-card rm-top-card--${rank} ${r.gained ? 'rm-top-card--gained' : ''}`}
                >
                  <div className="rm-top-card-inner">
                    <div className="rm-top-row">
                      <span className="rm-pos-emoji" aria-label={`Puesto ${rank}`}>
                        {TOP_EMOJIS[i] ?? '◆'}
                      </span>
                      <UserAvatar photoUrl={r.photo_url} className="rm-avatar avatar-frame--sm" alt="" />
                      <div className="rm-top-meta">
                        <span className="rm-username">{selectName(r)}</span>
                        <div className="rm-points-line">
                          <strong>{r.points}</strong>
                          <span className="rm-pts-label">pts</span>
                          {r.delta != null && r.delta > 0 ? (
                            <span className="rm-delta rm-delta--inline">+{r.delta}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="rm-bar-wrap" aria-hidden>
                      <div className="rm-bar-track">
                        <div className="rm-bar-fill" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 ? (
            <div className="rm-rest">
              <p className="rm-rest-head">Resto del ranking</p>
              <ol className="rm-rest-list">
                {rest.map((r, j) => {
                  const pos = j + 6;
                  return (
                    <li
                      key={r.id}
                      className={`rm-rest-row ${r.gained ? 'rm-rest-row--gained' : ''}`}
                    >
                      <span className="rm-rest-pos">{pos}</span>
                      <UserAvatar photoUrl={r.photo_url} className="rm-rest-avatar avatar-frame--xs" alt="" />
                      <div className="rm-rest-main">
                        <span className="rm-rest-name">{selectName(r)}</span>
                        <div className="rm-rest-sub">
                          <span>{r.points} pts</span>
                          <span className="rm-rest-dot">·</span>
                          <span>{r.exacts} exactos</span>
                          <span className="rm-rest-dot">·</span>
                          <span>Racha {r.streak}</span>
                          {r.delta != null && r.delta > 0 ? (
                            <span className="rm-delta rm-delta--rest">+{r.delta}</span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
