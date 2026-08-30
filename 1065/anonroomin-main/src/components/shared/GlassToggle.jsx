/** ===========================================================================
 * GLASS TOGGLE — consolidated switch
 * ============================================================================
 * Replaces the duplicate AppleToggle components in AuthModal.jsx and
 * EditProfile.jsx. Every settings row from here on — including
 * NotificationSettingsPanel's five toggles — uses this instead.
 *
 *   <GlassToggle checked={bool} onChange={fn} disabled={bool} />
 *
 * Track color is an instant swap (--ink-2 off / --ember on) with no
 * transition on the color itself — an immediate cut reads as more
 * responsive than a fade here, per spec. The knob is the only thing that
 * animates: it slides using .toggle-knob-droplet from animations.css,
 * which already encodes the 220ms spring easing and the mid-slide 0.85
 * scaleX compression, so this component only ever toggles which class is
 * present rather than deriving any motion of its own.
 *
 * Every flip also fires a haptic + sound tick here, centrally — since
 * every settings toggle in the app renders through this one component,
 * fixing it once gives the whole app tactile/audio feedback on every
 * switch without touching each call site.
 * ========================================================================= */

import { hapticSelect } from '../../lib/haptics';
import { playTap } from '../../lib/soundManager';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
const KNOB_SIZE = 20;
const KNOB_INSET = 2;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2; // 20px

export default function GlassToggle({ checked, onChange, disabled = false }) {
  function handleClick() {
    if (disabled) return;
    hapticSelect();
    playTap();
    onChange?.(!checked);
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        // Instant swap — deliberately no transition on background here.
        background: checked ? 'var(--ember)' : 'var(--ink-2)',
        position: 'relative',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        // The class (not this component) owns the slide/spring/squash
        // motion. Swapping which variant is present — rather than just
        // toggling a style prop — is what makes the browser replay the
        // animation on every check/uncheck instead of only on mount.
        className={checked ? 'toggle-knob-droplet' : 'toggle-knob-droplet is-off'}
        style={{
          '--knob-travel': `${KNOB_TRAVEL}px`,
          position: 'absolute',
          top: KNOB_INSET,
          left: KNOB_INSET,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        }}
      />
    </div>
  );
}
