import { Settings } from 'lucide-react';
import Profile from '../components/Profile';
import AvatarSelector from '../components/AvatarSelector';
import ProfileRankingSummary from '../components/ProfileRankingSummary';
import ProfileAchievementsStrip from '../components/ProfileAchievementsStrip';
import {
  ProfilePageCard,
  ProfileStatsGrid,
  ProfileBadgesList,
  ProfileActivityList,
  ProfilePickHistory,
  SHOW_PROFILE_ACTIVITY,
} from '../components/ProfilePageSections';

export default function ProfilePage({
  avatarUrl,
  displayUser,
  displayName,
  myCurrentRank,
  profile,
  profileEdit,
  onToggleProfileEdit,
  editName,
  setEditName,
  editUsername,
  setEditUsername,
  onSaveProfile,
  onAvatarUpload,
  sessionUserId,
  myProfileExtras,
  unlockedAchievementIds,
  achievementCatalog,
  achievementsTotal,
  unlockedCount,
  myBadges,
  activityRows,
  onViewAllAchievements,
  onSelectPreset,
}) {
  return (
    <article className="phone dash-perfil dash-profile pulponi-card profile-page">
      <div className="phone-header">
        <span>PERFIL</span>
        <button type="button" onClick={onToggleProfileEdit} aria-label="Ajustes">
          <Settings size={16} />
        </button>
      </div>

      <div className="profile-page__body">
        <Profile
          avatarUrl={avatarUrl}
          username={profile?.username ?? displayUser.replace('@', '')}
          displayName={displayName}
          rank={myCurrentRank}
          points={profile?.points ?? 0}
          exacts={profile?.exacts ?? 0}
          streak={profile?.streak ?? 0}
          verified
          uploadLabel="Subir foto"
          onUpload={onAvatarUpload}
        />

        {profileEdit ? (
          <ProfilePageCard title="Editar perfil" className="profile-page-card--edit">
            <div className="profile-page__edit">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Username"
              />
              <button type="button" className="primary" onClick={onSaveProfile}>
                Guardar cambios
              </button>
            </div>
          </ProfilePageCard>
        ) : null}

        <div className="profile-page__cards profile-page__cards--own">
          <ProfilePageCard title="Tu ranking">
            <ProfileRankingSummary userId={sessionUserId} />
          </ProfilePageCard>

          <ProfilePageCard title="Estadísticas">
            <ProfileStatsGrid stats={myProfileExtras.stats} />
          </ProfilePageCard>

          <ProfilePageCard title="Historial de predicciones" className="profile-page-card--predictions-history">
            <ProfilePickHistory rows={myProfileExtras.pickHistory} />
          </ProfilePageCard>

          <ProfilePageCard title="Badges" meta={`${unlockedCount} / ${achievementsTotal}`}>
            <ProfileAchievementsStrip
              unlockedIds={unlockedAchievementIds}
              catalog={achievementCatalog}
              onViewAll={onViewAllAchievements}
            />
            <ProfileBadgesList badges={myBadges} />
          </ProfilePageCard>

          {SHOW_PROFILE_ACTIVITY ? (
            <ProfilePageCard title="Actividad reciente">
              <ProfileActivityList items={activityRows} />
            </ProfilePageCard>
          ) : null}

          <ProfilePageCard title="Elegir avatar" className="profile-page-card--avatars">
            <AvatarSelector currentPhotoUrl={profile?.photo_url} onSelect={onSelectPreset} />
          </ProfilePageCard>
        </div>
      </div>
    </article>
  );
}
