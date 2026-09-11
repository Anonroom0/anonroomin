/** ===========================================================================
 * SPLASH LOADER
 * ============================================================================
 * Full-screen boot/auth-loading animation. Rendered by authContext.jsx while
 * `loading` is true (session/profile still being resolved) — previously that
 * gap rendered nothing at all (`{!loading && children}`), which just showed
 * whatever background color the raw HTML/body had underneath, with no
 * indication anything was happening.
 *
 * Animation: "ANONROOM" types in left-to-right, one letter at a time (each
 * <span> fades/slides up on its own staggered CSS animation-delay — see
 * .anon-splash-letter in styles/animations.css). Once the last letter's
 * entrance finishes, a small SQUARE "full stop" pops in right after the
 * word and then bounces in an infinite loop for as long as this stays
 * mounted — that jumping square doubles as the loading indicator, so there's
 * no separate spinner.
 *
 * All the actual keyframe/timing physics live in styles/animations.css
 * (.anon-splash-*), per this file's own convention (see that file's header
 * comment) — this component only computes the per-letter --i stagger index
 * and drives the dot's pop -> jump phase transition via plain timeouts.
 * ========================================================================= */

import { useEffect, useState } from 'react';

const SPLASH_WORD = 'ANONROOM';

// Must match .anon-splash-letter's animation-delay step (90ms) and duration
// (380ms) in animations.css, and .anon-splash-dot-pop's duration (260ms) —
// kept as constants here rather than hardcoded magic numbers so the two
// files' timings are easy to keep in sync if either ever changes.
const LETTER_STEP_MS = 90;
const LETTER_DURATION_MS = 380;
const DOT_POP_MS = 260;

export default function SplashLoader() {
  // 'hidden' -> 'pop' (plays the pop-in once) -> 'jump' (infinite bounce)
  const [dotPhase, setDotPhase] = useState('hidden');

  useEffect(() => {
    const lastLetterDelay = (SPLASH_WORD.length - 1) * LETTER_STEP_MS;
    const popAt = lastLetterDelay + LETTER_DURATION_MS;
    const jumpAt = popAt + DOT_POP_MS;
    const popTimer = setTimeout(() => setDotPhase('pop'), popAt);
    const jumpTimer = setTimeout(() => setDotPhase('jump'), jumpAt);
    return () => {
      clearTimeout(popTimer);
      clearTimeout(jumpTimer);
    };
  }, []);

  return (
    <div className="anon-splash" role="status" aria-live="polite" aria-label="Loading Anonroom">
      <div className="anon-splash-word">
        {SPLASH_WORD.split('').map((letter, i) => (
          <span key={i} className="anon-splash-letter" style={{ '--i': i }} aria-hidden="true">
            {letter}
          </span>
        ))}
        <span
          aria-hidden="true"
          className={
            'anon-splash-dot' +
            (dotPhase === 'pop' ? ' anon-splash-dot-pop' : '') +
            (dotPhase === 'jump' ? ' anon-splash-dot-jump' : '')
          }
        />
      </div>
    </div>
  );
}
