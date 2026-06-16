import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  dismissNotification,
  elegidoTransferNotificationKey,
  isNotificationDismissed,
} from '../lib/dismissedNotifications';
import { loadRecentElegidoTransfers, normalizeElegidoTransfer } from '../lib/elegidoHistory';

const TOAST_MS = 7000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function transferKey(row) {
  return row?.id ?? row?.key ?? row?.transferredAt ?? null;
}

function isWithinLast24Hours(transferredAt) {
  if (!transferredAt) return false;
  const at = new Date(transferredAt).getTime();
  if (Number.isNaN(at)) return false;
  return Date.now() - at <= TWENTY_FOUR_HOURS_MS;
}

function shouldShowTransfer(row) {
  if (!row) return false;
  if (!isWithinLast24Hours(row.transferredAt)) return false;
  return !isNotificationDismissed(elegidoTransferNotificationKey(row));
}

export function useElegidoTransferAlerts({ enabled = false, isAdmin = false } = {}) {
  const [toast, setToast] = useState(null);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  const queueRef = useRef([]);
  const dismissTimerRef = useRef(null);
  const seenKeysRef = useRef(new Set());

  const showNextToast = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      setToast(null);
      return;
    }

    setToast(next);
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      const key = elegidoTransferNotificationKey(next);
      if (key) dismissNotification(key);
      showNextToast();
    }, TOAST_MS);
  }, []);

  const enqueueToast = useCallback(
    (row) => {
      if (!row || !shouldShowTransfer(row)) return;
      const key = transferKey(row);
      if (key && seenKeysRef.current.has(key)) return;
      if (key) seenKeysRef.current.add(key);

      queueRef.current.push(row);
      if (!toast && queueRef.current.length === 1) {
        showNextToast();
      }
    },
    [showNextToast, toast]
  );

  const dismissToast = useCallback(() => {
    setToast((current) => {
      if (current) {
        const key = elegidoTransferNotificationKey(current);
        if (key) dismissNotification(key);
      }
      return null;
    });

    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (queueRef.current.length) {
      window.setTimeout(() => showNextToast(), 0);
    }
  }, [showNextToast]);

  const prependTransfer = useCallback((row) => {
    if (!row) return;
    setRecentTransfers((prev) => {
      const key = transferKey(row);
      if (key && prev.some((item) => transferKey(item) === key)) return prev;
      return [row, ...prev].slice(0, 8);
    });
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) {
      setRecentTransfers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const limit = isAdmin ? 8 : 1;
      const rows = await loadRecentElegidoTransfers(supabase, { limit });
      if (isAdmin) {
        setRecentTransfers(rows);
      }

      const latest = rows[0] ?? null;
      if (latest && shouldShowTransfer(latest)) {
        enqueueToast(latest);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, isAdmin, enqueueToast]);

  useEffect(() => {
    if (!enabled) {
      queueRef.current = [];
      seenKeysRef.current = new Set();
      setToast(null);
      setRecentTransfers([]);
      setLoading(false);
      return undefined;
    }

    void reload();

    let channel;
    try {
      channel = supabase
        .channel('elegido-history-all')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'elegido_history' },
          (payload) => {
            const row = normalizeElegidoTransfer(payload.new);
            if (!row) return;

            if (isAdmin) prependTransfer(row);
            enqueueToast(row);
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[useElegidoTransferAlerts] realtime channel error');
          }
        });
    } catch (e) {
      console.warn('[useElegidoTransferAlerts] subscribe', e?.message ?? e);
    }

    return () => {
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, isAdmin, reload, enqueueToast, prependTransfer]);

  return {
    toast,
    dismissToast,
    recentTransfers,
    loading,
    reload,
  };
}
