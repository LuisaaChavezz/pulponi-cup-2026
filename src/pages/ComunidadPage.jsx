import MatchChat from '../components/MatchChat';
import DashboardNotifications from '../components/DashboardNotifications';

export default function ComunidadPage({
  ranking = [],
  chatMessages = [],
  chatInput = '',
  setChatInput,
  onSendMessage,
  sessionUserId,
  reactionRowsByMessage = {},
  onToggleReaction,
  onSelectUser,
  events = [],
  predictionActivityFeed = [],
  predictionActivityLog = [],
  matches = [],
  communityPickProfiles = [],
  isAdmin = false,
  currentUsername = null,
  onCreateImportantAlert,
}) {
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">Comunidad</span>
          <h2>Comunidad Pulponi</h2>
        </div>
      </div>
      <div className="community-content">
        <article className="important-messages-panel pulponi-card">
          <div className="important-messages-panel__scroll chat-list chat-list--notifications">
            <DashboardNotifications
              importantAlerts={events}
              predictionActivityFeed={predictionActivityFeed}
              predictionActivityLog={predictionActivityLog}
              matches={matches}
              communityPickProfiles={communityPickProfiles}
              isAdmin={isAdmin}
              currentUsername={currentUsername}
              onCreateImportantAlert={onCreateImportantAlert}
              onSelectUser={onSelectUser}
            />
          </div>
        </article>
        <article className="chat-panel pulponi-card">
          <header className="phone-header chat-panel__header">
            <span>CHAT DEL PARTIDO</span>
            <small>{ranking.length} miembros</small>
          </header>
          <MatchChat
            messages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={onSendMessage}
            currentUserId={sessionUserId}
            reactionRowsByMessage={reactionRowsByMessage}
            onToggleReaction={onToggleReaction}
            onSelectUser={onSelectUser}
            messagesListClassName="chat-messages-list"
            inputAreaClassName="chat-input-area"
          />
        </article>
      </div>
    </>
  );
}
