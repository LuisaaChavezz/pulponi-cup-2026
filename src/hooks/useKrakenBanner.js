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
  shouldShowDangerKrakenBanner,
  wasKrakenBannerSeenToday,
} from '../lib/krakenBannerStorage';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import { supabase } from '../lib/supabase';

const FADE_MS = 500;

function buildBannerMessage(mode, elegido, retador) {
  const templates = mode === 'tied' ? BANNER_TIED : BANNER_DANGER;
  const template = pickRandomBannerMessage(templates);
  return formatKrakenBannerMessage(template, elegido, retador);
}

async function fetchKrakenDispute() {
  const { data: top2, error } = await supabase
    .from('profiles')
    .select('username, name, points')
    .order('points', { ascending: false })
    .limit(2);

  if (error) {
    console.warn('[useKrakenBanner]', error.message ?? error);
    return null;
  }

  if (!top2?.[0] || !top2?.[1]) return null;

  const diferencia = Number(top2[0].points ?? 0) - Number(top2[1].points ?? 0);
  if (diferencia > 2) return null;

  const mode = diferencia === 0 ? 'tied' : 'danger';
  const elegido = krakenProfileFirstName(top2[0], 'El elegido');
  const retador = krakenProfileFirstName(top2[1], 'El retador');

  return { mode, elegido, retador, diferencia };
}

export function useKrakenBanner() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(null);
  const [fading, setFading] = useState(false);
  const [disputeActive, setDisputeActive] = useState(false);

  const disputeRef = useRef(null);
  const dismissedRef = useRef(false);
  const fadeTimerRef = useRef(null);

  const showBanner = useCallback((message) => {
    dismissedRef.current = false;
    setText(message);
    setFading(false);
    setVisible(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const dispute = await fetchKrakenDispute();
      if (cancelled || !dispute) return;

      disputeRef.current = dispute;
      setDisputeActive(true);

      if (wasKrakenBannerSeenToday()) return;
      if (dispute.mode === 'danger' && !shouldShowDangerKrakenBanner()) return;

      showBanner(buildBannerMessage(dispute.mode, dispute.elegido, dispute.retador));
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [showBanner]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    markKrakenBannerSeenToday();
    if (disputeRef.current?.mode === 'danger') {
      markKrakenBannerDangerDay();
    }

    setFading(true);
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      setVisible(false);
      setFading(false);
    }, FADE_MS);
  }, []);

  const reopen = useCallback(() => {
    const dispute = disputeRef.current;
    if (!dispute) return;

    showBanner(buildBannerMessage(dispute.mode, dispute.elegido, dispute.retador));
  }, [showBanner]);

  const showFab = disputeActive && !visible && !fading;

  return { visible, text, fading, dismiss, reopen, showFab };
}
