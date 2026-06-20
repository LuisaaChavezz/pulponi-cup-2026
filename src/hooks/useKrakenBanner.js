import { useCallback, useEffect, useRef, useState } from 'react';
import { BANNER_MODE, buildBannerText } from '../lib/krakenBannerMessages';
import {
  markKrakenBannerDangerDay,
  markKrakenBannerSeenToday,
  shouldShowDangerKrakenBanner,
  wasKrakenBannerSeenToday,
} from '../lib/krakenBannerStorage';
import { syncKrakenBannerChatMessage } from '../lib/krakenChatPost';
import { krakenProfileFirstName } from '../lib/krakenProfileNames';
import {
  detectThroneChange,
  fetchKrakenThroneDispute,
  fetchProfileById,
  fetchUserProfile,
  setLastElegidoId,
} from '../lib/krakenThroneState';

const FADE_MS = 500;

export function useKrakenBanner(userId) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(null);
  const [fading, setFading] = useState(false);
  const [disputeActive, setDisputeActive] = useState(false);

  const bannerStateRef = useRef(null);
  const dismissedRef = useRef(false);
  const fadeTimerRef = useRef(null);

  const showBanner = useCallback((message, state) => {
    dismissedRef.current = false;
    bannerStateRef.current = state;
    setText(message);
    setFading(false);
    setVisible(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [profileRow, dispute] = await Promise.all([
        fetchUserProfile(userId),
        fetchKrakenThroneDispute(),
      ]);

      if (cancelled) return;

      const miNombre = krakenProfileFirstName(profileRow, 'Pulpo');
      const currentElegido = dispute?.currentElegido;
      const change = detectThroneChange(currentElegido?.id, userId);

      const elegido = krakenProfileFirstName(dispute?.elegidoProfile, 'El elegido');
      const retador = krakenProfileFirstName(dispute?.retadorProfile, 'El retador');
      const diferencia = dispute?.diferencia ?? null;

      if (change.seed && currentElegido?.id) {
        setLastElegidoId(currentElegido.id);
      }

      if (change.changed) {
        const anteriorProfile = change.previousId ? await fetchProfileById(change.previousId) : null;
        if (cancelled) return;

        const nuevo = krakenProfileFirstName(currentElegido?.profile, 'El nuevo');
        const anterior = krakenProfileFirstName(anteriorProfile, 'El anterior');
        const vars = { elegido, retador, miNombre, nuevo, anterior };
        const message = buildBannerText(BANNER_MODE.THRONE_CHANGE, vars);
        const state = { mode: BANNER_MODE.THRONE_CHANGE, vars };

        setLastElegidoId(change.currentId);
        setDisputeActive(Boolean(dispute && diferencia <= 2));
        void syncKrakenBannerChatMessage({
          mode: BANNER_MODE.THRONE_CHANGE,
          content: message,
          currentElegidoId: change.currentId,
        });
        showBanner(message, state);
        return;
      }

      if (!dispute || diferencia == null || diferencia > 2) {
        if (currentElegido?.id) setLastElegidoId(currentElegido.id);
        setDisputeActive(false);
        return;
      }

      const bannerMode = diferencia === 0 ? BANNER_MODE.TIED : BANNER_MODE.DANGER;
      const vars = { elegido, retador, miNombre };
      const state = { mode: bannerMode, vars };
      const message = buildBannerText(bannerMode, vars);

      bannerStateRef.current = state;
      setDisputeActive(true);

      if (currentElegido?.id) setLastElegidoId(currentElegido.id);

      void syncKrakenBannerChatMessage({
        mode: bannerMode,
        content: message,
        currentElegidoId: currentElegido?.id,
      });

      if (wasKrakenBannerSeenToday()) return;
      if (bannerMode === BANNER_MODE.DANGER && !shouldShowDangerKrakenBanner()) return;

      showBanner(message, state);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, showBanner]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    const state = bannerStateRef.current;
    if (state?.mode !== BANNER_MODE.THRONE_CHANGE) {
      markKrakenBannerSeenToday();
      if (state?.mode === BANNER_MODE.DANGER) {
        markKrakenBannerDangerDay();
      }
    }

    setFading(true);
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      setVisible(false);
      setFading(false);
    }, FADE_MS);
  }, []);

  const reopen = useCallback(() => {
    if (visible && !fading) {
      document.querySelector('.kraken-banner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    const state = bannerStateRef.current;
    if (!state) return;

    showBanner(buildBannerText(state.mode, state.vars), state);
  }, [showBanner, visible, fading]);

  const showFab = disputeActive && !visible;

  return { visible, text, fading, dismiss, reopen, showFab };
}
