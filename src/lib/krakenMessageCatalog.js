export const KRAKEN_MODE = {
  TIED: 'tied',
  DANGER: 'danger',
  SAFE: 'safe',
  NEW_KING: 'new_king',
  LOST_THRONE: 'lost_throne',
};

export const KRAKEN_SLIDE = {
  THRONE_CHANGE: 'throne_change',
  MATCH_BEFORE: 'match_before',
  MATCH_AFTER: 'match_after',
  DISPUTE: 'dispute',
};

export const KRAKEN_MESSAGES_SAFE = [
  { title: 'El Trono Kraken es tuyo 🦑', body: 'El Kraken obedece. La quiniela tiembla ante tu nombre. Por ahora, el trono es tuyo.' },
  { title: 'El elegido reina 🦑', body: 'Nadie se atreve a desafiarte... todavía. Disfruta el trono, pero nunca bajes la guardia.' },
  { title: 'El Kraken descansa 🦑', body: 'Las aguas están en calma. El trono es tuyo. Pero el Kraken siempre está despierto.' },
  { title: 'Eres el más fuerte 🦑', body: 'El Kraken ha elegido bien. El trono es tuyo y la quiniela lo sabe.' },
  { title: 'El trono te pertenece 🦑', body: 'Por ahora nadie puede contigo. El Kraken observa satisfecho desde las profundidades.' },
  { title: 'El elegido del Kraken 🦑', body: 'No cualquiera lleva este título. Tú lo ganaste. Tú lo defiendes. El Kraken lo recuerda.' },
  { title: 'Reinas en las profundidades 🦑', body: 'El Kraken solo obedece al más fuerte. Hoy ese eres tú. Que así siga.' },
  { title: 'El Kraken vigila tu trono 🦑', body: 'Nadie se acerca por ahora. Pero el Kraken nunca duerme. Y tú tampoco deberías.' },
  { title: 'La quiniela tiene dueño 🦑', body: 'Y ese dueño eres tú. El Trono Kraken brilla con tu nombre grabado en él.' },
  { title: 'Poder absoluto 🦑', body: 'El Kraken te ha elegido y la quiniela lo respeta. Sigue así y el trono será tuyo para siempre.' },
];

export const KRAKEN_MESSAGES_DANGER = [
  { title: 'El Kraken huele sangre 🦑', body: 'Algo se mueve en las profundidades. El trono nunca ha sido tan codiciado.' },
  { title: 'Tu trono cruje 🦑', body: 'El Kraken siente la ambición de otro. ¿Puedes sentirla tú también?' },
  { title: 'Se acerca la tormenta 🦑', body: 'Las aguas se agitan. Alguien viene por lo que es tuyo.' },
  { title: 'El Kraken observa 🦑', body: 'Hay alguien respirándote en la nuca. El Kraken lo sabe. ¿Lo sabes tú?' },
  { title: 'El trono tiembla 🦑', body: 'El retador ya siente el trono como suyo. Demuéstrale que se equivoca.' },
  { title: 'Peligro en el horizonte 🦑', body: 'El Kraken solo obedece al más fuerte. ¿Sigues siendo tú?' },
  { title: 'El mar se agita 🦑', body: 'Alguien viene por ti desde las profundidades. El Trono Kraken podría cambiar de dueño.' },
  { title: 'Cuidado con las sombras 🦑', body: 'El retador acecha. El Kraken lo ha visto. Tú deberías verlo también.' },
  { title: 'El Kraken pone a prueba a su elegido 🦑', body: '¿Puedes mantener el trono? El Kraken pronto tendrá su respuesta.' },
  { title: 'La corona pesa 🦑', body: 'Ser el elegido del Kraken tiene un precio. Alguien está dispuesto a pagarlo. ¿Y tú?' },
  { title: 'Todo puede cambiar 🦑', body: 'El retador está al acecho. El Kraken exige más de ti.' },
  { title: 'El trono está ardiendo 🦑', body: 'Esta noche podría ser la última en el trono. El Kraken no avisa dos veces.' },
  { title: 'El Kraken elige al más fuerte 🦑', body: 'Y ahora mismo, alguien te está desafiando. El trono no se hereda, se gana.' },
  { title: 'El abismo te llama 🦑', body: 'El retador ya puede oler el trono. ¿Lo vas a defender?' },
  { title: 'Máxima alerta 🦑', body: 'El Kraken no tiene favoritos. Solo campeones. ¿Sigues siéndolo?' },
  { title: 'El retador ya casi llega 🦑', body: 'El Trono Kraken nunca ha estado tan amenazado. Actúa.' },
  { title: 'El Kraken no duerme 🦑', body: 'Y tú tampoco deberías. El trono más temido de la quiniela está en juego.' },
  { title: 'La marea sube 🦑', body: 'Las profundidades están a punto de cambiar de dueño. A menos que tú lo impidas.' },
  { title: 'Esto se pone bueno 🦑', body: 'El Kraken ama este momento. ¿Tú lo amarás también cuando lo pierdas?' },
  { title: 'Último aviso 🦑', body: 'El trono puede ser tuyo o de otro. El Kraken ya tomó su decisión. ¿Y tú?' },
];

export const KRAKEN_MESSAGES_TIED = [
  { title: '¡El Kraken exige un duelo! 🦑', body: 'Las aguas están revueltas. El trono es tuyo por ahora, pero el Kraken está furioso. Demuestra por qué lo mereces.' },
  { title: 'El trono tiene dos pretendientes 🦑', body: 'El Kraken solo puede obedecer a uno. El próximo partido podría decidirlo todo.' },
  { title: 'El Kraken está enojado 🦑', body: 'Nadie comparte el trono. Eso no le gusta al Kraken. No lo hagas esperar.' },
  { title: 'Dos reyes, un trono 🦑', body: 'El Kraken no acepta eso. Uno de los dos caerá. Asegúrate de que no seas tú.' },
  { title: 'El Kraken ruge 🦑', body: 'El trono tiembla. El Kraken necesita un campeón. ¿Sigues siendo tú ese campeón?' },
  { title: 'Esto es una guerra 🦑', body: 'El Trono Kraken está en juego con cada predicción. No falles.' },
  { title: 'El elegido está en peligro real 🦑', body: 'El trono se mantiene tuyo por ahora. Pero el Kraken está mirando. Muy de cerca.' },
  { title: 'El Kraken no acepta debilidad 🦑', body: 'Estás empatado y eso no le gusta. Demuestra por qué mereces el trono.' },
  { title: 'La batalla más épica de la quiniela 🦑', body: 'El Kraken observa cada predicción tuya. Un error y el trono cambia de manos.' },
  { title: 'Hoy se define quién manda 🦑', body: 'El Trono Kraken está en juego. El Kraken solo obedece al más fuerte. ¿Eres tú?' },
];

export const KRAKEN_MESSAGES_NEW_KING = [
  { title: '¡El Trono Kraken es tuyo! 🦑', body: 'Lo arrebataste. El Kraken ha hablado. El trono te pertenece... por ahora.' },
  { title: '¡Nuevo rey del Kraken! 🦑', body: 'Lo lograste. El trono cambió de manos y ahora es tuyo. El Kraken obedece.' },
  { title: '¡El Kraken tiene nuevo elegido! 🦑', body: 'Derrocaste al anterior. El trono es tuyo. La quiniela tiembla ante tu nombre.' },
  { title: '¡Tomaste el trono! 🦑', body: 'El Kraken no olvida a los valientes. Luchaste y ganaste. El trono es tuyo.' },
  { title: '¡El elegido eres tú! 🦑', body: 'El Kraken ha elegido. La quiniela tiene nuevo rey. Defiéndelo con todo.' },
];

export const KRAKEN_MESSAGES_LOST_THRONE = [
  { title: 'Te quitaron el Trono Kraken 🦑', body: 'El Kraken ha elegido a otro. El trono ya no es tuyo. ¿Lo vas a recuperar?' },
  { title: 'El trono cambió de manos 🦑', body: 'Alguien fue más fuerte. El Kraken no perdona la debilidad. Vuelve más fuerte.' },
  { title: 'Caíste del trono 🦑', body: 'El Kraken ya no te obedece. Alguien te superó. ¿Qué vas a hacer al respecto?' },
  { title: 'El Kraken tiene nuevo elegido 🦑', body: 'Y no eres tú. El trono fue arrebatado. La revancha es tuya si la buscas.' },
  { title: 'Perdiste el Trono Kraken 🦑', body: 'Duele, ¿verdad? El Kraken solo obedece al más fuerte. Demuestra que ese eres tú.' },
];

export const BANNER_DANGER = [
  '🦑 {retador} está acechando el Trono Kraken de {elegido}. Las profundidades se agitan.',
  '👀 {elegido} sigue en la cima pero {retador} no se rinde. El Trono Kraken tiembla.',
  '🦑 ¿Podrá {elegido} mantener el Trono Kraken? {retador} viene con todo.',
  '⚡ {retador} está pisándole los talones a {elegido}. El Kraken observa con atención.',
  '🦑 El Trono Kraken de {elegido} nunca había estado tan amenazado. {retador} lo sabe.',
  '👀 {retador} huele sangre. {elegido}, el Kraken te está poniendo a prueba.',
  '🦑 La quiniela tiene un nuevo villano: {retador}. {elegido}, cuida tu trono.',
  '⚡ {elegido} reina... por ahora. {retador} tiene otros planes para el Trono Kraken.',
  '🦑 El Kraken siente la ambición de {retador}. {elegido}, no te confíes.',
  '👀 Algo se mueve en las profundidades. {retador} viene por el trono de {elegido}.',
  '🦑 {elegido} tiene el Trono Kraken pero {retador} ya puede olerlo. Esto se pone bueno.',
  '⚡ La batalla entre {elegido} y {retador} tiene al Kraken emocionado. ¿Quién ganará?',
  '🦑 {retador} no duerme. {elegido}, el Trono Kraken está en peligro.',
  '👀 El Kraken advierte a {elegido}: {retador} viene con hambre. Mucha hambre.',
  '🦑 ¿Hasta cuándo aguantará {elegido}? {retador} está que arde. El Kraken espera.',
  '🦑 Pulpo {miNombre}, ¿ya viste lo que está pasando? {retador} viene por el trono de {elegido}.',
  '👀 Pulpo {miNombre}, el Kraken te pregunta: ¿quién crees que ganará? ¿{elegido} o {retador}?',
  '🦑 Atención Pulpo {miNombre}, el Trono Kraken de {elegido} está siendo disputado por {retador}.',
  '👀 Pulpo {miNombre}, las profundidades se agitan. {retador} viene por {elegido}. Esto se pone bueno.',
  '🦑 El Kraken saluda a Pulpo {miNombre} y le avisa: el trono de {elegido} está en peligro. {retador} acecha.',
];

export const BANNER_TIED = [
  '🦑 ¡EMPATE! {elegido} y {retador} están igualados. El Kraken exige un duelo.',
  '💀 {elegido} y {retador} tienen los mismos puntos. El Trono Kraken está en juego ahora mismo.',
  '🦑 El Kraken está furioso. {elegido} y {retador} empatados. Solo uno puede reinar.',
  '⚔️ {retador} alcanzó a {elegido}. El Trono Kraken nunca había estado tan disputado.',
  '🦑 Empate total entre {elegido} y {retador}. El Kraken solo obedece al más fuerte. ¿Quién será?',
  '💀 {elegido} tiene el trono pero {retador} tiene los mismos puntos. Esto es una guerra.',
  '🦑 El Kraken no acepta empates. {elegido} vs {retador}. Solo uno sobrevivirá.',
  '⚔️ ¡Atención pulpos! {elegido} y {retador} están empatados. El Trono Kraken tiembla.',
  '🦑 {retador} igualó a {elegido}. El Trono Kraken está al rojo vivo. El Kraken observa.',
  '💀 Esto es histórico. {elegido} y {retador} empatados por el Trono Kraken. ¿Quién rompe el empate?',
  '🦑 El Kraken ruge. {elegido} y {retador} igualados. La quiniela nunca había vivido algo así.',
  '⚔️ {elegido} sudando frío. {retador} lo alcanzó. El Trono Kraken podría cambiar de manos hoy.',
  '🦑 Nadie comparte el Trono Kraken. {elegido} y {retador} lo saben. El Kraken también.',
  '💀 La batalla más épica de la quiniela: {elegido} vs {retador}. Empatados. El Kraken decide.',
  '🦑 {retador} igualó a {elegido}. El Trono Kraken podría cambiar de manos. El Kraken observa.',
  '🦑 Pulpo {miNombre}, ¡esto está de infarto! {elegido} y {retador} empatados por el Trono Kraken.',
  '👀 Pulpo {miNombre}, el Kraken necesita que estés atento. {elegido} y {retador} igualados. Todo puede cambiar.',
  '🦑 ¡Pulpo {miNombre}! Empate total entre {elegido} y {retador}. El Trono Kraken nunca había estado tan disputado.',
  '👀 El Kraken convoca a Pulpo {miNombre}: {elegido} y {retador} empatados. ¿Quién se lleva el trono?',
  '🦑 Pulpo {miNombre}, prepárate. {elegido} y {retador} están igualados y el Kraken exige un duelo épico.',
];

export const BANNER_THRONE_CHANGE = [
  '🦑 ¡El Trono Kraken cambió de dueño! {nuevo} arrebató el trono a {anterior}. El Kraken ha hablado.',
  '👑 ¡Nuevo rey en la quiniela! {nuevo} derrocó a {anterior} y se lleva el Trono Kraken.',
  '🦑 ¡Atención pulpos! {anterior} perdió el Trono Kraken. {nuevo} es el nuevo elegido.',
  '💀 {anterior} reinó, pero {nuevo} fue más fuerte. El Trono Kraken tiene nuevo dueño.',
  '🦑 El Kraken ha elegido a {nuevo}. {anterior}, el trono ya no es tuyo.',
  '🦑 Pulpo {miNombre}, ¿te enteraste? {nuevo} le arrebató el Trono Kraken a {anterior}. El Kraken ha hablado.',
  '👀 Pulpo {miNombre}, nuevo rey en la quiniela. {nuevo} derrocó a {anterior}. El trono cambió de manos.',
  '🦑 ¡Atención Pulpo {miNombre}! {anterior} perdió el Trono Kraken. {nuevo} es el nuevo elegido del Kraken.',
];

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

export function firstName(name) {
  return name?.split(' ')[0] || name;
}

export function resolveMessage(msg, vars = {}) {
  return String(msg ?? '')
    .replace(/{elegido}/g, vars.elegido || '')
    .replace(/{retador}/g, vars.retador || '')
    .replace(/{miNombre}/g, vars.miNombre || '')
    .replace(/{nuevo}/g, vars.nuevo || '')
    .replace(/{anterior}/g, vars.anterior || '')
    .replace(/{local}/g, vars.local || '')
    .replace(/{visitante}/g, vars.visitante || '')
    .replace(/{ganador}/g, vars.ganador || '')
    .replace(/{marcador}/g, vars.marcador || '')
    .replace(/{exactos}/g, vars.exactos || '0');
}

export function pickRandom(list) {
  if (!list?.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function formatPrivateContent({ title, body }) {
  const t = String(title ?? '').trim();
  const b = String(body ?? '').trim();
  if (t && b) return `${t}\n\n${b}`;
  return t || b;
}

export function parsePrivateContent(content) {
  const raw = String(content ?? '').trim();
  if (!raw) return { title: '', body: '' };
  const split = raw.indexOf('\n\n');
  if (split === -1) return { title: raw, body: '' };
  return {
    title: raw.slice(0, split).trim(),
    body: raw.slice(split + 2).trim(),
  };
}

export function getPrivateMessagesForMode(mode) {
  switch (mode) {
    case KRAKEN_MODE.TIED:
      return KRAKEN_MESSAGES_TIED;
    case KRAKEN_MODE.DANGER:
      return KRAKEN_MESSAGES_DANGER;
    case KRAKEN_MODE.NEW_KING:
      return KRAKEN_MESSAGES_NEW_KING;
    case KRAKEN_MODE.LOST_THRONE:
      return KRAKEN_MESSAGES_LOST_THRONE;
    default:
      return KRAKEN_MESSAGES_SAFE;
  }
}

export function resolveKrakenMode(diferencia) {
  const diff = Number(diferencia ?? 0);
  if (diff === 0) return KRAKEN_MODE.TIED;
  if (diff >= 1 && diff <= 2) return KRAKEN_MODE.DANGER;
  return KRAKEN_MODE.SAFE;
}
