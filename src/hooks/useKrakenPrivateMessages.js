import { useCallback, useEffect, useState } from 'react';
import {
  fetchUnseenKrakenPrivateMessages,
  markKrakenPrivateMessageSeen,
  parseKrakenPrivateContent,
} from '../lib/krakenPrivateMessages';

export function useKrakenPrivateMessages(userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    const { data } = await fetchUnseenKrakenPrivateMessages(userId);
    setMessages(
      (data ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        ...parseKrakenPrivateContent(row.content),
      }))
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = useCallback(
    async (messageId) => {
      if (!messageId) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await markKrakenPrivateMessageSeen(messageId);
    },
    []
  );

  return { messages, loading, dismiss, reload: load };
}
