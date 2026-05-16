export const DEFAULT_AVATAR = '/avatars/pulponi-neon.png';

export const PRESET_AVATARS = [
  {
    id: 'oracle',
    label: 'Pulpo místico Pulponi',
    src: '/avatars/pulponi-oracle.png',
  },
  {
    id: 'shark',
    label: 'Tiburón futbolero',
    src: '/avatars/shark-goalie.png',
  },
  {
    id: 'neon',
    label: 'Logo Pulponi neon',
    src: '/avatars/pulponi-neon.png',
  },
  {
    id: 'crab',
    label: 'Cangrejo futbol',
    src: '/avatars/crab-football.png',
  },
  {
    id: 'fish',
    label: 'Pez Tiburones Veracruz',
    src: '/avatars/fish-veracruz.png',
  },
  {
    id: 'benito',
    label: 'Estampilla Benito Peritonito',
    src: '/avatars/benito-stamp.png',
  },
];

export function resolveAvatarUrl(photoUrl) {
  if (!photoUrl || !String(photoUrl).trim()) return DEFAULT_AVATAR;
  return photoUrl;
}

export function isLogoAvatar(url) {
  if (!url) return true;
  const normalized = String(url).split('?')[0];
  return normalized.includes('pulponi-neon');
}

export function isPresetAvatar(photoUrl, presetSrc) {
  if (!photoUrl) return presetSrc === DEFAULT_AVATAR;
  const normalized = photoUrl.split('?')[0];
  return normalized.endsWith(presetSrc) || normalized.includes(presetSrc);
}
