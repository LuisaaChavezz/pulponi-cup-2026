import RulesBadgesSection from '../components/RulesBadgesSection';

export default function RulesPage({
  unlockedAchievementIds = null,
  userBadgeRows = [],
  profileId = null,
}) {
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">Oficial</span>
          <h2>Reglas</h2>
        </div>
      </div>
      <div className="rules-accordion">
        <details open>
          <summary>Sistema de puntos</summary>
          <p>
            Marcador exacto (90&apos; + compensación): 3 puntos. Resultado correcto (ganador o empate): 1
            punto. Sin predicción: 0 puntos.
          </p>
        </details>
        <details>
          <summary>Cómo funciona la quiniela</summary>
          <p>
            Antes de cada kickoff elige el marcador al 90&apos; (+ compensación). Solo cuenta el tiempo
            regular: tiempos extra y penales no cambian tu pick de marcador. En eliminatorias puedes
            indicar quién avanza en penales para un bonus extra.
          </p>
        </details>
        <details>
          <summary>Parlay virtual Pulponi</summary>
          <p>
            Un parlay es una apuesta combinada donde eliges el resultado de varios partidos al mismo
            tiempo. Para ganar, tienes que acertar todos los partidos que seleccionaste.
          </p>
          <p>
            <strong>¿Cómo funciona en Pulponi Cup?</strong>
          </p>
          <ul className="rules-accordion__list">
            <li>Elige entre 5 y 25 partidos</li>
            <li>En cada partido selecciona quién gana o si hay empate</li>
            <li>Pon tu monto virtual (mínimo $200 pesos)</li>
            <li>La app multiplica los momios de todos tus partidos y calcula tu posible ganancia</li>
            <li>Si aciertas todos, ganas. Si fallas uno, pierdes la combinada</li>
          </ul>
          <p>
            <strong>¿Qué son los momios?</strong>
          </p>
          <p>
            Es el factor que determina cuánto ganas. Un momio negativo (-250) significa que ese equipo es
            favorito y paga menos. Un momio positivo (+335) significa que es menos favorito y paga más.
            Entre más arriesgada tu combinada, mayor la ganancia potencial.
          </p>
          <p>
            <strong>Ejemplo:</strong>
          </p>
          <p>
            Si apuestas $200 pesos en una combinada de 5 partidos con momios altos, puedes ganar miles de
            pesos. Pero si fallas uno solo, pierdes todo.
          </p>
        </details>
        <details>
          <summary>Reglamento · Penales</summary>
          <p>
            La quiniela se califica solo con el marcador al final del tiempo regular. Tiempos extra no
            cuentan. Si hay penales, tu marcador regular sigue siendo el del 90&apos;. En eliminatorias
            indica quién avanza: +1 bonus si aciertas.
          </p>
        </details>
        <details>
          <summary>Cierre de picks</summary>
          <p>
            Puedes editar tu resultado hasta el inicio del partido (kickoff). Cuando el partido está en
            vivo o terminado, verás &quot;Predicción cerrada&quot;.
          </p>
        </details>
        <details>
          <summary>Desempates</summary>
          <p>1) Más puntos 2) Más exactos 3) Mayor racha.</p>
        </details>
        <details>
          <summary>Ranking y logros</summary>
          <p>
            El ranking se calcula desde Supabase en tiempo real. Los logros se desbloquean automáticamente
            según tus exactos, racha, ranking e Índice Pulpo.
          </p>
        </details>
      </div>
      <RulesBadgesSection
        unlockedAchievementIds={unlockedAchievementIds}
        userBadgeRows={userBadgeRows}
        profileId={profileId}
      />
    </>
  );
}
