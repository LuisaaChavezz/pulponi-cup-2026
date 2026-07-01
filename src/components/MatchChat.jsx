import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import ChatMessage from './ChatMessage';

export default function MatchChat({
  messages,
  chatInput,
  setChatInput,
  onSend,
  currentUserId,
  onSelectUser,
  messagesListClassName = '',
  inputAreaClassName = '',
}) {
  const listRef = useRef(null);
  const endRef = useRef(null);
  const listClassName = ['chat-list', messagesListClassName].filter(Boolean).join(' ');
  const inputClassName = ['message-box', inputAreaClassName].filter(Boolean).join(' ');

  const scrollToLatestMessage = useCallback(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
    endRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  useLayoutEffect(() => {
    scrollToLatestMessage();
  }, [messages, scrollToLatestMessage]);

  useEffect(() => {
    const frame = requestAnimationFrame(scrollToLatestMessage);
    return () => cancelAnimationFrame(frame);
  }, [messages, scrollToLatestMessage]);

  return (
    <>
      <div ref={listRef} className={listClassName}>
        {messages.map((m, i) => (
          <ChatMessage
            key={m.id ?? `demo-${i}`}
            message={m}
            currentUserId={currentUserId}
            onSelectUser={onSelectUser}
          />
        ))}
        <div ref={endRef} className="chat-list__end" aria-hidden="true" />
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
