/**
 * ============================================================================
 * MESSAGE COOLDOWN / RATE LIMITER
 * ============================================================================
 * This script powers the visual cooldown ring on the Send buttons in both
 * GroupChat and DirectMessages. It prevents database spamming by locking
 * the send function for a few seconds after a message or image is sent.
 * ============================================================================
 */

export function createCooldown(onUpdate, onComplete, cooldownMs = 3000) {
  let startTime = 0;
  let animationFrameId = null;
  let isCanceled = false;

  function tick() {
    if (isCanceled) return;

    const elapsed = Date.now() - startTime;
    const remaining = cooldownMs - elapsed;

    if (remaining <= 0) {
      onUpdate(0); // 0% cooldown remaining
      if (onComplete) onComplete();
      return;
    }

    // Calculate percentage remaining (100 to 0)
    const percent = (remaining / cooldownMs) * 100;
    onUpdate(percent);

    animationFrameId = requestAnimationFrame(tick);
  }

  return {
    start: () => {
      isCanceled = false;
      startTime = Date.now();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(tick);
    },
    cancel: () => {
      isCanceled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      onUpdate(0);
    }
  };
}
