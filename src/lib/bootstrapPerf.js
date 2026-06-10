export const BOOTSTRAP_READY_TIMEOUT_MS = 10_000;

const boot = {
  startedAt: typeof performance !== 'undefined' ? performance.now() : 0,
  queries: [],
  phaseMarks: [],
};

/** Resuelve con `fallback` si la promesa tarda más de `ms` (evita loaders infinitos en móvil). */
export function withTimeout(promise, ms, label = 'task', fallback = undefined) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) window.clearTimeout(timer);
    }),
    new Promise((resolve) => {
      timer = window.setTimeout(() => {
        console.warn(`[withTimeout] ${label} exceeded ${ms}ms`);
        resolve(fallback);
      }, ms);
    }),
  ]);
}

export function markBootstrapStart() {
  boot.startedAt = performance.now();
  boot.queries = [];
  boot.phaseMarks = [];
}

export function trackQuery(name, durationMs, meta = {}) {
  boot.queries.push({ name, ms: durationMs, ...meta });
}

export async function timedQuery(name, fn) {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    trackQuery(name, performance.now() - t0);
  }
}

export function markBootstrapPhase(label) {
  boot.phaseMarks.push({ label, atMs: performance.now() - boot.startedAt });
}

export function reportBootstrapDiagnostics(label = 'Bootstrap') {
  const totalMs = performance.now() - boot.startedAt;
  const sorted = [...boot.queries].sort((a, b) => b.ms - a.ms);
  const slowest = sorted[0] ?? null;
  const report = {
    label,
    totalMs,
    requestCount: boot.queries.length,
    slowestQuery: slowest?.name ?? null,
    slowestMs: slowest?.ms ?? 0,
    queries: sorted,
    phases: boot.phaseMarks,
  };

  console.group(`[Pulponi Perf] ${label}`);
  console.log(`Tiempo de carga: ${totalMs.toFixed(0)} ms`);
  console.log(`Requests: ${report.requestCount}`);
  if (slowest) {
    console.log(`Consulta más lenta: ${slowest.name} (${slowest.ms.toFixed(0)} ms)`);
  }
  console.table(sorted.map((q) => ({ consulta: q.name, ms: q.ms.toFixed(1) })));
  console.groupEnd();

  return report;
}

export function scheduleIdleWork(fn, { delayMs = 0 } = {}) {
  const run = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => void fn(), { timeout: 2500 });
    } else {
      void fn();
    }
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}
