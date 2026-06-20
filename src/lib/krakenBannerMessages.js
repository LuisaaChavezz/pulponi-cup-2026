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
  '🦑 {retador} igualó al elegido. {elegido}, el Kraken te está mirando. No lo decepciones.',
];

export function formatKrakenBannerMessage(template, elegido, retador) {
  return String(template)
    .replace(/\{elegido\}/g, elegido)
    .replace(/\{retador\}/g, retador);
}

export function pickRandomBannerMessage(templates) {
  if (!templates?.length) return '';
  return templates[Math.floor(Math.random() * templates.length)];
}
