import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BANNER_DANGER,
  BANNER_TIED,
  formatKrakenBannerMessage,
  pickRandomBannerMessage,
} from '../lib/krakenBannerMessages';
import {
  markKrakenBannerDangerDay,
  markKrakenBannerSeenToday,
  profileDisplayName,
  shouldShowDangerKrakenBanner,
  wasKrakenBannerSeenToday,
} from '../lib/krakenBannerStorage';
import { supabase } from '../lib/supabase';

const AUTO_DISMISS_MS = 7000;
const FADE_MS = 500;

export function useKrakenBanner() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(null);
  const [fading, setFading] = useState(false);

  const modeRef = useRef(null);
  const dismissedRef = useRef(false);
  const fadeTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (wasKrakenBannerSeenToday()) return;

      const { data: top2, error } = await supabase
        .from('profiles')
        .select('username, name, points')
        .order('points', { ascending: false })
        .limit(2);

      if (cancelled || error) {
        if (error) console.warn('[useKrakenBanner]', error.message ?? error);
        return;
      }

      if (!top2?.[0] || !top2?.[1]) return;

      const diferencia = Number(top2[0].points ?? 0) - Number(top2[1].points ?? 0);
      if (diferencia > 2) return;

      const mode = diferencia === 0 ? 'tied' : 'danger';
      if (mode === 'danger' && !shouldShowDangerKrakenBanner()) return;

      const elegido = profileDisplayName(top2[0], 'El elegido');
      const retador = profileDisplayName(top2[1], 'El retador');
      const templates = mode === 'tied' ? BANNER_TIED : BANNER_DANGER;
      const template = pickRandomBannerMessage(templates);
      const message = formatKrakenBannerMessage(template, elegido, retador);

      modeRef.current = mode;
      dismissedRef.current = false;
      setText(message);
      setVisible(true);
      setFading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    markKrakenBannerSeenToday();
    if (modeRef.current === 'danger') {
      markKrakenBannerDangerDay();
    }

    setFading(true);
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      setVisible(false);
      setText(null);
      setFading(false);
    }, FADE_MS);
  }, []);

  return { visible, text, fading, dismiss, autoDismissMs: AUTO_DISMISS_MS };
}
