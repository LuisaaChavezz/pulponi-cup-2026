import RulesBadgesSection from '../components/RulesBadgesSection';

export default function RulesPage() {
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
            En la pestaña PARLAY arma una combinada virtual con entre 5 y 25 partidos. En cada partido
            eliges el resultado (local, empate o visitante). Indica un monto virtual en puntos y el slip
            calcula el momio total multiplicando cada selección; tu posible ganancia depende de ese momio
            y del monto apostado. Si hay API de momios autorizada configurada (The Odds API vía proxy
            seguro), verás cotizaciones reales agregadas; si no, momios Pulponi estimados, claramente
            etiquetados. No se maneja dinero real: solo puntos virtuales y diversión dentro de Pulponi
            Cup.
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
      <RulesBadgesSection />
    </>
  );
}
