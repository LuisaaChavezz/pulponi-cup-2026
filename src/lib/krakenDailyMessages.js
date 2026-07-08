import { MATCH_DISPLAY_TIMEZONE } from './matchUtils';
import { KRAKEN_MSG_KEYS, pickStableTemplate } from './krakenMessagePickStorage';

export const KRAKEN_MESSAGES_GENERAL = [
  'Un partido. Todo cambia. El Kraken observa. 👀',
  'El torneo no espera. Pon tu predicción. 🦑',
  'Pulpos, ...¿Y si sí?',
];

export function getMessageForMatch(home, away) {
  const teams = [home, away];

  if (teams.includes('Argentina')) {
    return [
      'Argentina juega hoy. Infantino ya calentó. El Kraken observa desde las profundidades. 🌊',
      'Argentina vs quien sea. Infantino ya sabe cómo termina. El Kraken también. 🤐',
      'No es conspiración si el Kraken lo confirma. #Argenfifa 🦑',
    ];
  }

  if (teams.includes('Francia')) {
    return [
      'Francia juega hoy. Mbappé corre, el Kraken vuela. 🦑',
      '¿Alguien puede parar a Francia? El Kraken dice: probablemente no. 👀',
    ];
  }

  if (teams.includes('Brasil')) {
    return [
      'Brasil juega hoy. Samba, Vinicius y el Kraken desde las profundidades. 🌊',
      'El jogo bonito vs el Kraken. Spoiler: el Kraken no baila. 🦑',
    ];
  }

  if (teams.includes('España')) {
    return [
      'España juega hoy. Tiki-taka o no, el Kraken ya predijo. 🦑',
      'El toque corto de España no engaña al Kraken. 👀',
    ];
  }

  if (teams.includes('Canadá')) {
    return [
      'Canadá sigue sorprendiendo. El Kraken los vio venir. 🦑',
      '¿Quién dijo que Canadá no podía? El Kraken lo sabía desde el principio. 🍁',
    ];
  }

  if (teams.includes('Marruecos')) {
    return [
      'Marruecos sigue haciendo historia. El Kraken los respeta. 🦑',
      'África tiene un campeón. El Kraken lo vio en las profundidades. 🌊',
    ];
  }

  if (teams.includes('Paraguay')) {
    return [
      'Paraguay eliminó a Alemania. El Kraken no se sorprendió. 🦑',
      'La sorpresa del torneo juega hoy. ¿Puede seguir? El Kraken lo sabe. 👀',
    ];
  }

  return [
    `${home} vs ${away}. El Kraken ya predijo. ¿Y tú? 🦑`,
    'Un partido. Todo cambia. El Kraken observa. 👀',
    'El torneo no espera. Pon tu predicción. 🦑',
  ];
}

function todayIsoDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: MATCH_DISPLAY_TIMEZONE });
}

export function filterTodayScheduledMatches(matches = [], now = new Date()) {
  const today = todayIsoDate(now);
  return matches
    .filter((m) => {
      if (String(m?.status ?? '').toLowerCase() !== 'scheduled') return false;
      if (!m?.kickoff) return false;
      const day = new Date(m.kickoff).toLocaleDateString('en-CA', {
        timeZone: MATCH_DISPLAY_TIMEZONE,
      });
      return day === today;
    })
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

export async function fetchTodayScheduledMatches(supabase) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('matches')
    .select('home_team, away_team, kickoff')
    .gte('kickoff', `${today}T00:00:00`)
    .lte('kickoff', `${today}T23:59:59`)
    .eq('status', 'scheduled')
    .order('kickoff', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function resolveMessagesForToday(todayMatches = []) {
  if (todayMatches.length > 0) {
    const match = todayMatches[0];
    return getMessageForMatch(match.home_team, match.away_team);
  }
  return KRAKEN_MESSAGES_GENERAL;
}

export function pickKrakenDailyMessage(todayMatches = [], now = new Date()) {
  const messages = resolveMessagesForToday(todayMatches);
  const today = now.toDateString();
  const matchKey =
    todayMatches.length > 0
      ? `${todayMatches[0].home_team}_vs_${todayMatches[0].away_team}`
      : 'general';
  const storageKey = KRAKEN_MSG_KEYS.daily(today, matchKey);
  return pickStableTemplate(storageKey, messages);
}
