import { Send } from 'lucide-react';
import ChatMessage from './ChatMessage';

export default function MatchChat({
  messages,
  chatInput,
  setChatInput,
  onSend,
  currentUserId,
  reactionRowsByMessage,
  onToggleReaction,
  messagesListClassName = '',
  inputAreaClassName = '',
}) {
  const listClassName = ['chat-list', messagesListClassName].filter(Boolean).join(' ');
  const inputClassName = ['message-box', inputAreaClassName].filter(Boolean).join(' ');

  return (
    <>
      <div className={listClassName}>
        {messages.map((m, i) => (
          <ChatMessage
            key={m.id ?? `demo-${i}`}
            message={m}
            reactionRows={m.id ? reactionRowsByMessage[m.id] ?? [] : []}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
          />
        ))}
      </div>
      <div className={inputClassName}>
        <input
          placeholder="Escribe un mensaje..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
        />
        <button type="button" onClick={onSend} aria-label="Enviar">
          <Send size={18} />
        </button>
      </div>
    </>
  );
}
