export const KRAKEN_MATCH_MODE = {
  BEFORE: 'before',
  AFTER: 'after',
};

export const MESSAGES_BEFORE = [
  '🦑 En menos de una hora: {local} vs {visitante}. El Kraken ya sabe quién va a fallar. ¿Eres tú?',
  '⚡ {local} vs {visitante} está por comenzar. El Kraken observa tus predicciones. No lo decepciones.',
  '🦑 ¿Ya pusiste tu predicción para {local} vs {visitante}? El Kraken no acepta excusas.',
  '👀 El Kraken advierte: {local} vs {visitante} empieza pronto. Última oportunidad para cambiar tu pick.',
  '🦑 {local} vs {visitante}. El Kraken ya eligió a sus favoritos. ¿Coincide con tu predicción?',
  '⚡ Atención pulpos: {local} vs {visitante} en menos de una hora. El trono podría cambiar hoy.',
  '🦑 El Kraken siente que {local} vs {visitante} será épico. ¿Estás listo para lo que viene?',
  '👀 {local} vs {visitante} está por arrancar. El Kraken recuerda quién acertó el último partido. ¿Seguirás la racha?',
  '🦑 Último aviso antes de {local} vs {visitante}. El Kraken no perdona a los indecisos.',
  '⚡ Se viene {local} vs {visitante}. El Kraken tiene sus favoritos. ¿Tienes los tuyos?',
  '🦑 ¿{local} o {visitante}? El Kraken ya lo sabe. En menos de una hora verás si coinciden.',
  '👀 El Kraken convoca a todos los pulpos: {local} vs {visitante} está a punto de comenzar.',
  '🦑 {local} vs {visitante}. El Kraken dice: este partido no es tan fácil como parece. Piénsalo bien.',
  '⚡ Antes de que empiece {local} vs {visitante}, el Kraken quiere recordarte que {elegido} sigue en el trono. Por ahora.',
  '🦑 El Kraken huele emoción. {local} vs {visitante} en minutos. Las profundidades se agitan.',
];

export const MESSAGES_AFTER = [
  '🦑 {ganador} ganó {marcador}. El Kraken ya actualizó los puntos. ¿Subiste o bajaste?',
  '👀 {marcador} fue el resultado final. Solo {exactos} pulpos lo adivinaron exacto. ¿Fuiste uno de ellos?',
  '🦑 {ganador} se llevó los tres puntos. El Kraken registró todo. Nadie escapa a las profundidades.',
  '⚡ Resultado: {marcador}. El Kraken observa cómo cambia el marcador de la quiniela. ¿Cómo quedaste?',
  '🦑 {exactos} aciertos exactos en {local} vs {visitante}. El Kraken está... impresionado. O decepcionado. Tú decides.',
  '👀 El partido terminó {marcador}. {elegido} sigue en el trono... ¿o ya no? Revisa el leaderboard.',
  '🦑 {ganador} ganó y el Kraken sonríe. Algunos pulpos lo vieron venir. Otros... no tanto.',
  '⚡ {marcador}. Así terminó. El Kraken actualizó el Trono. ¿Sigue siendo de {elegido}?',
  '🦑 Final: {marcador}. Si acertaste exacto, el Kraken te saluda. Si no... el Kraken también te saluda, pero diferente.',
  '👀 {local} vs {visitante} terminó. {exactos} pulpos adivinaron el marcador exacto. El Kraken está tomando nota.',
  '🦑 El Kraken registró el {marcador} de {local} vs {visitante}. Los puntos ya están actualizados. Ve a verlos.',
  '⚡ ¿Acertaste? El marcador fue {marcador}. Solo {exactos} lo vieron venir. El Kraken sabe quiénes son.',
  '🦑 {ganador} ganó hoy. El Kraken pregunta: ¿quién se acerca al trono de {elegido}? Revisa el leaderboard.',
  '👀 Final de {local} vs {visitante}: {marcador}. El Kraken ya actualizó todo. El trono podría haber cambiado.',
  '🦑 {marcador} y el Kraken está satisfecho. Algunos pulpos lo sabían. Otros aprenderán para el próximo partido.',
];

export function resolveMatchMessage(msg, vars = {}) {
  return String(msg ?? '')
    .replace(/{local}/g, vars.local ?? '')
    .replace(/{visitante}/g, vars.visitante ?? '')
    .replace(/{ganador}/g, vars.ganador ?? '')
    .replace(/{marcador}/g, vars.marcador ?? '')
    .replace(/{exactos}/g, vars.exactos ?? '0')
    .replace(/{elegido}/g, vars.elegido ?? '')
    .replace(/{retador}/g, vars.retador ?? '');
}

export function pickRandomKrakenMatchMessage(messages) {
  if (!messages?.length) return '';
  return messages[Math.floor(Math.random() * messages.length)];
}

export function splitKrakenMatchEmoji(text) {
  const raw = String(text ?? '').trim();
  const match = raw.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*(.*)$/u);
  if (!match) {
    return { emoji: '🦑', body: raw };
  }
  return {
    emoji: match[1] || '🦑',
    body: match[2] || raw,
  };
}
