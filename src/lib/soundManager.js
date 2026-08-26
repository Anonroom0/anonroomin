/** ===========================================================================
 * SOUND MANAGER
 * ============================================================================
 * Synthesizes every UI sound purely with the Web Audio API
 * (OscillatorNode / AudioBufferSourceNode + GainNode envelopes) — no
 * external audio files, no reverb/swoosh. Every sound stays short, dry,
 * and mechanical. Call the exported play*() functions at the interaction
 * points that name them; never construct a new AudioContext or inline
 * new AudioContext code anywhere else in the app.
 *
 * The single shared AudioContext is created lazily, on the first play*()
 * call — never at module load — because browsers require an AudioContext
 * to be created (or resumed) inside a real user-gesture call stack, and
 * every play*() call here is already only ever invoked from a UI event
 * handler (click, tap, etc.), which satisfies that for free.
 * ========================================================================= */

const MUTE_STORAGE_KEY = 'anonroom_sound_muted';

let audioContext = null;

// Cached in memory so isMuted() doesn't re-hit localStorage on every call;
// setMuted() keeps this and localStorage in sync.
let mutedCache = readMutedFromStorage();

function readMutedFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
}

export function isMuted() {
  return mutedCache;
}

export function setMuted(muted) {
  mutedCache = !!muted;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(mutedCache));
  }
}

/**
 * Lazily creates (and resumes, if a prior gesture left it suspended) the
 * single shared AudioContext. Only ever called from inside a play*()
 * function, which is itself only ever called from a user-gesture handler.
 */
function getAudioContext() {
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null; // Web Audio unsupported — play*() calls become silent no-ops.
    audioContext = new Ctor();
  }
  if (audioContext.state === 'suspended') {
    // Defensive — most browsers auto-resume since creation itself happens
    // inside the user-gesture call stack, but this covers the rest.
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Short filtered noise burst — the dry "tactile click" building block
 * shared by playSend() and the two clicks in playRefreshComplete().
 */
function scheduleNoiseClick(ctx, startTime, { filterFreq = 1200, peakGain = 0.5, duration = 0.06 } = {}) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.005); // fast attack
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // fast decay

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(startTime);
  noise.stop(startTime + duration);
}

/**
 * Short, dry oscillator "blip" — the building block shared by
 * playReceive(), playTabSwitch(), and playError().
 */
function scheduleTone(ctx, startTime, { type = 'sine', frequency = 440, peakGain = 0.3, duration = 0.08, sustainUntil = null } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime); // constant — no pitch bend

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.005); // fast attack
  if (sustainUntil !== null) {
    gain.gain.setValueAtTime(peakGain, startTime + sustainUntil); // flat sustain, no decay curve
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // fast decay

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Dry, low tactile click (~60ms) — filtered noise burst through a lowpass + fast gain envelope. */
export function playSend() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleNoiseClick(ctx, ctx.currentTime, { filterFreq: 900, peakGain: 0.5, duration: 0.06 });
}

/** Slightly higher, soft single tick (~80ms) — short triangle blip. */
export function playReceive() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, { type: 'triangle', frequency: 880, peakGain: 0.35, duration: 0.08 });
}

/** Near-silent low thud (~40ms). */
export function playTabSwitch() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, { type: 'sine', frequency: 120, peakGain: 0.12, duration: 0.04 });
}

/** Short two-tone rise — two quick dry clicks in succession (~100ms total), not a chime. */
export function playRefreshComplete() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  scheduleNoiseClick(ctx, now, { filterFreq: 700, peakGain: 0.4, duration: 0.045 });
  scheduleNoiseClick(ctx, now + 0.05, { filterFreq: 1400, peakGain: 0.4, duration: 0.05 }); // higher-filtered second click = the "rise"
}

/** Single flat low buzz, no pitch bend (~90ms). */
export function playError() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, { type: 'square', frequency: 160, peakGain: 0.25, duration: 0.09, sustainUntil: 0.07 });
}
