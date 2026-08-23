export const RATE_LIMIT_MS = 5000;

const TICK_INTERVAL_MS = 100;

// Counts down from RATE_LIMIT_MS to 0, calling onTick(percentRemaining)
// roughly every 100ms and onDone() once it reaches 0. This only drives UI
// (disabling the composer / showing a countdown) — real enforcement is the
// Postgres trigger in schema.sql.
export function createCooldown(onTick, onDone) {
  let intervalId = null;
  let startedAt = null;

  function clear() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function tick() {
    const elapsed = Date.now() - startedAt;
    const remainingMs = Math.max(RATE_LIMIT_MS - elapsed, 0);
    const percent = (remainingMs / RATE_LIMIT_MS) * 100;

    if (remainingMs <= 0) {
      clear();
      onTick(0);
      onDone();
      return;
    }

    onTick(percent);
  }

  function start() {
    clear();
    startedAt = Date.now();
    onTick(100);
    intervalId = setInterval(tick, TICK_INTERVAL_MS);
  }

  function cancel() {
    clear();
  }

  return { start, cancel };
}
