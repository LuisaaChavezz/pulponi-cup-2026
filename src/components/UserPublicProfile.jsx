import Profile from './Profile';
import ProfileStatsPanel from './ProfileStatsPanel';
import { selectDisplayName } from '../lib/rankingHistory';
import { resolveAvatarUrl } from '../lib/avatars';
import { countAchievementsTotal } from '../data/achievements';
import {
  ProfilePageCard,
  ProfileBadgesList,
  ProfileActivityList,
  SHOW_PROFILE_ACTIVITY,
} from './ProfilePageSections';

function ProfileLoadingState() {
  return (
    <div className="profile-page profile-page--loading" role="status" aria-live="polite">
      <span className="profile-page__spinner" aria-hidden />
      <p className="profile-page__muted">Cargando perfil…</p>
    </div>
  );
}

function ProfileErrorState({ error, onBack, onRetry }) {
  return (
    <div className="profile-page profile-page--empty" role="alert">
      <p className="profile-page__error-title">No se pudo cargar el perfil</p>
      <p className="profile-page__muted">{error ?? 'Perfil no disponible'}</p>
      <div className="profile-page__error-actions">
        {onRetry ? (
          <button type="button" className="profile-page__retry" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
        {onBack ? (
          <button type="button" className="profile-page__back" onClick={onBack}>
            Volver
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function UserPublicProfile({
  data,
  loading,
  error,
  isOwnProfile,
  isAdmin = false,
  onEditProfile,
  onBack,
  onRetry,
  achievementsTotal,
}) {
  if (loading) {
    return <ProfileLoadingState />;
  }

  if (error || !data) {
    return <ProfileErrorState error={error} onBack={onBack} onRetry={onRetry} />;
  }

  const {
    profile,
    rankingSummary = {},
    stats = {},
    pickHistory = [],
    badges = [],
    pulpoStats,
  } = data;
  const safeStats = {
    points: 0,
    exacts: 0,
    pulpoIndex: 0,
    accumulatedStreak: 0,
    predicted: 0,
    playedMatches: 0,
    effectiveness: 0,
    riskyHits: 0,
    bestStreak: 0,
    bestRank: null,
    ...stats,
  };
  const displayName = selectDisplayName(profile ?? {});
  const username = profile?.username ?? 'jugador';
  const avatarUrl = resolveAvatarUrl(profile?.photo_url);
  const totalBadges = achievementsTotal ?? countAchievementsTotal();
  const unlockedBadges = (badges ?? []).length;

  return (
    <div className="profile-page">
      <div className="profile-page__toolbar">
        {onBack ? (
          <button type="button" className="profile-page__back" onClick={onBack}>
            ← Volver
          </button>
        ) : null}
        {isOwnProfile && onEditProfile ? (
          <button type="button" className="profile-page__edit" onClick={onEditProfile}>
            Editar perfil
          </button>
        ) : null}
      </div>

      <Profile
        avatarUrl={avatarUrl}
        username={username}
        displayName={displayName}
        rank={rankingSummary?.currentRank}
        points={safeStats.points}
        exacts={safeStats.exacts}
        pulpoIndex={safeStats.pulpoIndex}
        showPulpoIndex
        streak={safeStats.accumulatedStreak}
      />

      <div className="profile-page__cards profile-page__cards--public">
        <ProfilePageCard
          title={isOwnProfile ? 'Mis Estadísticas' : `Estadísticas de @${username}`}
          className="profile-page-card--my-stats"
        >
          <ProfileStatsPanel
            stats={safeStats}
            pickHistory={pickHistory}
            currentStreak={profile?.streak ?? safeStats.accumulatedStreak ?? 0}
            badgesCount={unlockedBadges}
            userId={profile?.id}
            isOwnProfile={isOwnProfile}
            targetUsername={displayName || username}
            canDownload={isOwnProfile || isAdmin}
          />
        </ProfilePageCard>

        <ProfilePageCard title="Badges desbloqueados" meta={`${unlockedBadges} / ${totalBadges}`}>
          <ProfileBadgesList badges={badges} />
        </ProfilePageCard>

        {SHOW_PROFILE_ACTIVITY ? (
          <ProfilePageCard title="Actividad reciente">
            <ProfileActivityList items={data.activity ?? []} />
          </ProfilePageCard>
        ) : null}

        {pulpoStats?.level?.title ? (
          <p className="profile-page__pulpo-tier profile-page__muted">
            Nivel Pulpo: <strong>{pulpoStats.level.title}</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
}
