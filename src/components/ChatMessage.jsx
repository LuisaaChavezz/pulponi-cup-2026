import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CHAT_REACTION_EMOJIS } from '../constants/chatReactions';
import UserAvatar from './UserAvatar';

function groupReactions(reactionRows, currentUserId) {
  const byEmoji = new Map();
  for (const r of reactionRows) {
    if (!CHAT_REACTION_EMOJIS.includes(r.emoji)) continue;
    if (!byEmoji.has(r.emoji)) {
      byEmoji.set(r.emoji, { count: 0, me: false, users: [], seenProfileIds: new Set() });
    }
    const g = byEmoji.get(r.emoji);
    if (!r.profile_id || g.seenProfileIds.has(r.profile_id)) continue;
    g.seenProfileIds.add(r.profile_id);
    g.count += 1;
    if (currentUserId && r.profile_id === currentUserId) g.me = true;
    const uname = typeof r.username === 'string' && r.username.trim() ? r.username.trim() : null;
    g.users.push({
      profile_id: r.profile_id,
      username: uname,
      handle: uname ? `@${uname}` : '@anon',
      displayName: typeof r.displayName === 'string' && r.displayName.trim() ? r.displayName.trim() : null,
      photoUrl: r.photoUrl ?? null,
      avatarUrl: r.avatarUrl ?? null,
    });
  }
  for (const g of byEmoji.values()) {
    delete g.seenProfileIds;
    g.users.sort((a, b) => (a.username || '').localeCompare(b.username || '', 'es', { sensitivity: 'base' }));
  }
  return byEmoji;
}

function uniqueReactionHandles(reactionRows) {
  const seenProfiles = new Set();
  const out = [];
  for (const r of reactionRows) {
    if (r.profile_id) {
      if (seenProfiles.has(r.profile_id)) continue;
      seenProfiles.add(r.profile_id);
    }
    const uname = typeof r.username === 'string' && r.username.trim() ? r.username.trim() : null;
    out.push(uname ? `@${uname}` : '@anon');
  }
  return out;
}

export default function ChatMessage({
  message,
  reactionRows = [],
  currentUserId,
  onToggleReaction,
  onSelectUser,
}) {
  const grouped = useMemo(() => groupReactions(reactionRows, currentUserId), [reactionRows, currentUserId]);
  const [poppingEmoji, setPoppingEmoji] = useState(null);
  const [popover, setPopover] = useState(null);
  const popTimerRef = useRef(null);
  const popoverElRef = useRef(null);

  useEffect(() => {
    return () => {
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!popover) return;
    function onDocMouseDown(ev) {
      const el = popoverElRef.current;
      if (el && !el.contains(ev.target) && !ev.target.closest?.('.chat-reaction-pill')) {
        setPopover(null);
      }
    }
    function onScroll() {
      setPopover(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [popover]);

  const canReact = Boolean(message?.id && currentUserId);

  const handlePickerEmoji = useCallback(
    (emoji) => {
      if (!canReact) return;
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
      setPoppingEmoji(emoji);
      popTimerRef.current = window.setTimeout(() => {
        setPoppingEmoji((cur) => (cur === emoji ? null : cur));
        popTimerRef.current = null;
      }, 420);
      setPopover(null);
      onToggleReaction(message.id, emoji);
    },
    [canReact, message?.id, onToggleReaction]
  );

  const reactionSummary = useMemo(() => {
    const handles = uniqueReactionHandles(reactionRows);
    if (!handles.length) return null;
    const max = 10;
    const shown = handles.slice(0, max);
    const more = handles.length > max ? ` +${handles.length - max}` : '';
    return `Reaccionaron: ${shown.join(', ')}${more}`;
  }, [reactionRows]);

  function toggleReactionPopover(emoji, pillButton) {
    if (popover?.emoji === emoji) {
      setPopover(null);
      return;
    }
    const r = pillButton.getBoundingClientRect();
    const w = 260;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPopover({ emoji, top: r.bottom + 6, left, width: w });
  }

  /** Emoji en la pill = añadir/quitar tu reacción; número = ver quién reaccionó. */
  function handlePillClick(e, emoji, pillButton) {
    if (e.target.closest('.chat-reaction-pill__count')) {
      toggleReactionPopover(emoji, pillButton);
      return;
    }
    handlePickerEmoji(emoji);
  }

  const popoverData = popover ? grouped.get(popover.emoji) : null;
  const popoverUsers = popoverData?.users ?? [];
  const popoverMe = Boolean(popoverData?.me);

  const popoverNode =
    popover && popoverUsers.length > 0 ? (
      <div
        ref={popoverElRef}
        className="chat-reaction-popover chat-reaction-popover--fixed"
        role="dialog"
        aria-label={`Personas con ${popover.emoji}`}
        style={{ top: popover.top, left: popover.left, width: popover.width }}
      >
        <ul className="chat-reaction-popover__list">
          {popoverUsers.map((u) => (
            <li key={`${popover.emoji}-${u.profile_id}`}>
              <button
                type="button"
                className="chat-reaction-popover__row profile-link-btn"
                onClick={() => {
                  setPopover(null);
                  onSelectUser?.(u.profile_id);
                }}
                disabled={!u.profile_id || !onSelectUser}
                aria-label={`Ver perfil de ${u.handle}`}
              >
                <UserAvatar photoUrl={u.photoUrl} avatarUrl={u.avatarUrl} variant="chat" alt="" />
                <div className="chat-reaction-popover__meta">
                  <span className="chat-reaction-popover__handle">{u.handle}</span>
                  {u.displayName ? <span className="chat-reaction-popover__name">{u.displayName}</span> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {popoverMe ? (
          <button
            type="button"
            className="chat-reaction-popover__remove"
            onClick={() => {
              const em = popover.emoji;
              setPopover(null);
              onToggleReaction(message.id, em);
            }}
          >
            Quitar mi {popover.emoji}
          </button>
        ) : (
          <button
            type="button"
            className="chat-reaction-popover__add"
            onClick={() => {
              const em = popover.emoji;
              setPopover(null);
              handlePickerEmoji(em);
            }}
          >
            Reaccionar con {popover.emoji}
          </button>
        )}
      </div>
    ) : null;

  return (
    <div className="chat-message">
      <div className="chat-message-head">
        {message.profileId && onSelectUser ? (
          <button
            type="button"
            className="chat-message-avatar-btn"
            onClick={() => onSelectUser(message.profileId)}
            aria-label={`Ver perfil de ${message.user}`}
          >
            <UserAvatar photoUrl={message.photoUrl} avatarUrl={message.avatarUrl} variant="chat" alt="" />
          </button>
        ) : (
          <UserAvatar photoUrl={message.photoUrl} avatarUrl={message.avatarUrl} variant="chat" alt="" />
        )}
        <div>
          {message.profileId && onSelectUser ? (
            <button
              type="button"
              className="chat-message-user"
              onClick={() => onSelectUser(message.profileId)}
            >
              {message.user}
            </button>
          ) : (
            <strong>{message.user}</strong>
          )}
          <small>{message.time}</small>
        </div>
      </div>
      <p className="chat-message-body">{message.body}</p>

      {canReact ? (
        <div className="chat-message-reactions" aria-label="Reacciones">
          <div className="chat-reaction-bar">
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const group = grouped.get(emoji);
              const count = group?.count ?? 0;
              const me = group?.me ?? false;
              const hasCount = count > 0;

              if (hasCount) {
                return (
                  <div key={emoji} className="chat-reaction-pill-wrap">
                    <button
                      type="button"
                      className={[
                        'chat-reaction-pill',
                        me ? 'chat-reaction-pill--mine' : '',
                        poppingEmoji === emoji ? 'chat-reaction-pill--pop' : '',
                        popover?.emoji === emoji ? 'chat-reaction-pill--open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-expanded={popover?.emoji === emoji}
                      onClick={(e) => handlePillClick(e, emoji, e.currentTarget)}
                    >
                      <span className="chat-reaction-pill__emoji" aria-hidden>
                        {emoji}
                      </span>
                      <span className="chat-reaction-pill__count" title="Ver quién reaccionó">
                        {count}
                      </span>
                      <span className="sr-only">
                        {me
                          ? `Tu reacción con ${emoji}. Pulsa el emoji para quitarla; pulsa el número para ver la lista.`
                          : `${count} ${count === 1 ? 'persona reaccionó' : 'personas reaccionaron'} con ${emoji}. Pulsa el emoji para reaccionar; pulsa el número para ver la lista.`}
                      </span>
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={emoji}
                  type="button"
                  className={[
                    'chat-reaction-picker__btn',
                    me ? 'chat-reaction-picker__btn--mine' : '',
                    poppingEmoji === emoji ? 'chat-reaction-picker__btn--pop' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handlePickerEmoji(emoji)}
                  aria-pressed={me ? 'true' : 'false'}
                >
                  <span className="chat-reaction-picker__emoji">{emoji}</span>
                </button>
              );
            })}
          </div>
          {reactionSummary ? <p className="chat-reaction-summary">{reactionSummary}</p> : null}
        </div>
      ) : null}
      {popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}
