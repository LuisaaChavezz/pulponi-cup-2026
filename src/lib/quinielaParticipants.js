/** Usernames inscritos en la quiniela Pulponi (fuente compartida admin + logros). */
export const QUINIELA_PARTICIPANT_USERNAMES = [
  'adriespinoza',
  'analy',
  'chaveza',
  'chovitz',
  'claudioroca',
  'costalitocampeon',
  'delpegol',
  'ecantu8',
  'gongora',
  'góngora',
  'imanol',
  'itsmariachavez',
  'ivan',
  'jcpe',
  'lizbeth',
  'luisaachavezz',
  'manolo',
  'marceloveloz',
  'mau',
  'michrobertsv',
  'ni',
  'pirata12',
  'piyu',
  'scs',
  'tata',
  'ucg',
  'vv',
];

const QUINIELA_PARTICIPANT_SET = new Set(
  QUINIELA_PARTICIPANT_USERNAMES.map((username) => normalizeQuinielaUsername(username))
);

export function normalizeQuinielaUsername(username) {
  return String(username ?? '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isQuinielaParticipant(username) {
  return QUINIELA_PARTICIPANT_SET.has(normalizeQuinielaUsername(username));
}

/** Participantes elegibles: verificados Pulponi o inscritos en la quiniela. */
export function isEligiblePredictionParticipant(profile) {
  if (!profile?.id) return false;
  if (isQuinielaParticipant(profile.username)) return true;
  if (profile.pulponi_verified === false) return false;
  return profile.pulponi_verified === true || profile.pulponi_verified == null;
}
