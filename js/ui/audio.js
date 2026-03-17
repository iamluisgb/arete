// ── Shared audio/haptic engine ───────────────────────────

let _audioCtx = null;

export function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

export function beep(freq = 880, ms = 200) {
  try {
    const ctx = getAudioCtx(), now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + ms / 1000);
    o.start(now); o.stop(now + ms / 1000);
  } catch (e) { /* silent fail */ }
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch (e) { /* silent fail */ }
}

// ── Keep-alive: silent audio to prevent Chrome from suspending the page ──

let _keepAliveAudio = null;
let _keepAliveOsc = null;

/** Start silent audio loop to keep the page alive in background (e.g. screen locked) */
export function startKeepAlive() {
  if (_keepAliveAudio) return;

  // Primary: <audio> element with silent MP3 loop — registers with OS media session
  const audio = new Audio('assets/silence.mp3');
  audio.loop = true;
  audio.volume = 0.01;
  audio.play().catch(() => {});
  _keepAliveAudio = audio;

  // Reinforcement: Web Audio oscillator at near-zero gain
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    _keepAliveOsc = osc;
  } catch (e) { /* silent fail */ }

  // Show meaningful info in media notification
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Carrera en curso',
      artist: 'Barra Libre',
    });
  }
}

/** Stop the keep-alive audio */
export function stopKeepAlive() {
  if (_keepAliveAudio) { _keepAliveAudio.pause(); _keepAliveAudio.src = ''; _keepAliveAudio = null; }
  if (_keepAliveOsc) { try { _keepAliveOsc.stop(); } catch (e) {} _keepAliveOsc = null; }
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

/** Resume keep-alive after returning to foreground */
export function resumeKeepAlive() {
  if (!_keepAliveAudio) return;
  _keepAliveAudio.play().catch(() => {});
  try { const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
}
