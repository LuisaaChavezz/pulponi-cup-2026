import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CHAT_REACTION_EMOJIS, normalizeReactionEmoji } from '../constants/chatReactions';

/**
 * Reacciones a un comentario: carga propia, toggle directo insert/delete, realtime.
 * @param {string} commentId - UUID del comentario
 * @param {string|null} userId - auth.uid() / profile_id del usuario actual
 */
export default function CommentReactions({ commentId, userId }) {
  const [counts, setCounts] = useState({});
  const [userReactions, setUserReactions] = useState([]);
  const [busyEmoji, setBusyEmoji] = useState(null);

  const applyRows = useCallback(
    (rows) => {
      const nextCounts = {};
      const nextUser = [];
      for (const emoji of CHAT_REACTION_EMOJIS) nextCounts[emoji] = 0;

      for (const row of rows ?? []) {
        const emoji = normalizeReactionEmoji(row.emoji);
        if (!CHAT_REACTION_EMOJIS.includes(emoji)) continue;
        nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1;
        if (userId && row.profile_id === userId) nextUser.push(emoji);
      }
      setCounts(nextCounts);
      setUserReactions(nextUser);
    },
    [userId]
  );

  const loadReactions = useCallback(async () => {
    if (!commentId) return;
    const { data, error } = await supabase
      .from('reactions')
      .select('emoji, profile_id')
      .eq('comment_id', commentId);

    if (error) {
      console.error('[CommentReactions] load', error);
      return;
    }
    applyRows(data);
  }, [commentId, applyRows]);

  useEffect(() => {
    void loadReactions();
  }, [loadReactions]);

  useEffect(() => {
    if (!commentId) return undefined;

    const channel = supabase
      .channel(`reactions-${commentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
          filter: `comment_id=eq.${commentId}`,
        },
        () => {
          void loadReactions();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [commentId, loadReactions]);

  const handleReaction = async (emoji) => {
    if (!commentId || !userId || busyEmoji) return;

    const hasReacted = userReactions.includes(emoji);

    // Optimista: feedback inmediato al click
    setCounts((prev) => {
      const n = Math.max(0, (prev[emoji] ?? 0) + (hasReacted ? -1 : 1));
      return { ...prev, [emoji]: n };
    });
    setUserReactions((prev) =>
      hasReacted ? prev.filter((e) => e !== emoji) : [...prev, emoji]
    );

    setBusyEmoji(emoji);
    try {
      if (hasReacted) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('profile_id', userId)
          .eq('emoji', emoji);
        if (error) console.error('[CommentReactions] delete', error);
      } else {
        const { error } = await supabase.from('reactions').insert({
          comment_id: commentId,
          profile_id: userId,
          emoji,
        });
        if (error) console.error('[CommentReactions] insert', error);
      }
      await loadReactions();
    } catch (err) {
      console.error('[CommentReactions] toggle', err);
      await loadReactions();
    } finally {
      setBusyEmoji(null);
    }
  };

  if (!commentId || !userId) return null;

  return (
    <div className="comment-reactions" aria-label="Reacciones">
      {CHAT_REACTION_EMOJIS.map((emoji) => {
        const count = counts[emoji] ?? 0;
        const mine = userReactions.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={['comment-reactions__btn', mine ? 'comment-reactions__btn--mine' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              void handleReaction(emoji);
            }}
            disabled={busyEmoji === emoji}
            aria-pressed={mine ? 'true' : 'false'}
            aria-label={`Reaccionar con ${emoji}${count > 0 ? `, ${count} personas` : ''}`}
          >
            <span className="comment-reactions__emoji" aria-hidden>
              {emoji}
            </span>
            {count > 0 ? <span className="comment-reactions__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
