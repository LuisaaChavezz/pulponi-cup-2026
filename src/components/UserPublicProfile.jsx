import Profile from './Profile';
import { selectDisplayName } from '../lib/rankingHistory';
import { resolveAvatarUrl } from '../lib/avatars';
import { countAchievementsTotal } from '../data/achievements';
import {
  ProfilePageCard,
  ProfileStatsGrid,
  ProfileBadgesList,
  ProfileActivityList,
  ProfilePickHistory,
  SHOW_PROFILE_ACTIVITY,
} from './ProfilePageSections';

export default function UserPublicProfile({
  data,
  loading,
  error,
  isOwnProfile,
  onEditProfile,
  onBack,
  achievementsTotal,
}) {
  if (loading) {
    return (
      <div className="profile-page profile-page--loading">
        <p className="profile-page__muted">Cargando perfil…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="profile-page profile-page--empty">
        <p className="profile-page__muted">{error ?? 'Perfil no disponible'}</p>
        {onBack ? (
          <button type="button" className="profile-page__back" onClick={onBack}>
            Volver
          </button>
        ) : null}
      </div>
    );
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
    currentStreak: 0,
    predicted: 0,
    correctResults: 0,
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
        streak={safeStats.currentStreak}
      />

      <div className="profile-page__cards profile-page__cards--public">
        <ProfilePageCard title="Estadísticas">
          <ProfileStatsGrid stats={safeStats} />
        </ProfilePageCard>

        <ProfilePageCard
          title="Historial de predicciones"
          className="profile-page-card--predictions-history"
        >
          <ProfilePickHistory rows={pickHistory} />
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
