import UserAvatar from './UserAvatar';
import CommentReactions from './CommentReactions';

export default function ChatMessage({ message, currentUserId, onSelectUser }) {
  const isKraken = Boolean(message?.isKraken);
  const canReact = Boolean(message?.id && currentUserId && !isKraken);

  return (
    <div className={`chat-message${isKraken ? ' chat-message--kraken' : ''}`}>
      <div className="chat-message-head">
        {isKraken ? (
          <span className="chat-message-kraken-avatar" aria-hidden>
            🦑
          </span>
        ) : message.profileId && onSelectUser ? (
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
          {isKraken ? (
            <strong className="chat-message-kraken-user">{message.user}</strong>
          ) : message.profileId && onSelectUser ? (
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
      <p className={`chat-message-body${isKraken ? ' chat-message-body--kraken' : ''}`}>{message.body}</p>

      {canReact ? <CommentReactions commentId={message.id} userId={currentUserId} /> : null}
    </div>
  );
}
