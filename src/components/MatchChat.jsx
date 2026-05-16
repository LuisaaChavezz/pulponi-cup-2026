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
}) {
  return (
    <>
      <div className="chat-list">
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
      <div className="message-box">
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
