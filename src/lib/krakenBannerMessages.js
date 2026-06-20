import { resolveKrakenMessageText } from './krakenProfileNames';

export const BANNER_MODE = {
  THRONE_CHANGE: 'throne_change',
  TIED: 'tied',
  DANGER: 'danger',
};

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

export function resolveMessage(template, vars) {
  return resolveKrakenMessageText(template, vars);
}

export function pickRandomBannerMessage(templates) {
  if (!templates?.length) return '';
  return templates[Math.floor(Math.random() * templates.length)];
}

/** Plantillas para chat/comunidad: sin {miNombre} (mensaje privado por usuario). */
export function filterPublicKrakenTemplates(templates) {
  return (templates ?? []).filter((template) => !String(template).includes('{miNombre}'));
}

export function buildBannerText(mode, vars) {
  const templates =
    mode === BANNER_MODE.THRONE_CHANGE
      ? BANNER_THRONE_CHANGE
      : mode === BANNER_MODE.TIED
        ? BANNER_TIED
        : BANNER_DANGER;
  const template = pickRandomBannerMessage(templates);
  return resolveMessage(template, vars);
}

/** Solo mensajes públicos (dos nombres / trono / sin Pulpo {miNombre}). */
export function buildPublicBannerText(mode, vars) {
  const templates =
    mode === BANNER_MODE.THRONE_CHANGE
      ? filterPublicKrakenTemplates(BANNER_THRONE_CHANGE)
      : mode === BANNER_MODE.TIED
        ? filterPublicKrakenTemplates(BANNER_TIED)
        : filterPublicKrakenTemplates(BANNER_DANGER);

  const pool = templates.length
    ? templates
    : mode === BANNER_MODE.THRONE_CHANGE
      ? BANNER_THRONE_CHANGE
      : mode === BANNER_MODE.TIED
        ? BANNER_TIED
        : BANNER_DANGER;

  const template = pickRandomBannerMessage(pool);
  return resolveMessage(template, vars);
}
