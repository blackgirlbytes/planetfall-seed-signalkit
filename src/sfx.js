// Synthesized sound effects for the arcade levels. No audio assets — everything
// is generated with the Web Audio API so it stays tiny and fits the retro/CRT
// feel. One shared AudioContext, created and resumed on the first (gesture-
// driven) play. Honors the global mute, wired in main.js to the music button.

let ctx = null;
let master = null;
let muted = false;
let ducker = null;     // main.js registers this to dip the background music

function duck(depth, ms) {
  if (!muted) ducker?.(depth, ms);
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1.0;   // SFX need to punch through the background music
  master.connect(ctx.destination);
  return ctx;
}
function resume() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

// One enveloped oscillator: freq → to (optional glide) with a short AD envelope.
function tone({ freq, to, type = "sine", dur = 0.15, vol = 0.3, attack = 0.005, delay = 0, detune = 0 }) {
  if (!ensure() || muted) return;
  resume();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  if (detune) osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A short decaying noise burst, for impacts.
function noise({ dur = 0.12, vol = 0.25, type = "highpass", freq = 800, delay = 0 }) {
  if (!ensure() || muted) return;
  resume();
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

export const sfx = {
  setMuted(m) { muted = !!m; },
  setVolume(v) { if (ensure()) master.gain.value = Math.max(0, Math.min(1, v)); },
  setDucker(fn) { ducker = fn; },
  resume,

  // Cannon bolt — a quick punchy descending zap. Light, short music dip.
  shoot() {
    tone({ freq: 820, to: 190, type: "sawtooth", dur: 0.14, vol: 0.4, attack: 0.003 });
    noise({ dur: 0.07, vol: 0.18, type: "highpass", freq: 1100 });
    duck(0.8, 130);
  },
  // Good hit — record recovered: bright two-note rise.
  recover() {
    tone({ freq: 680, type: "triangle", dur: 0.11, vol: 0.55 });
    tone({ freq: 1020, type: "triangle", dur: 0.18, vol: 0.55, delay: 0.08 });
    duck(0.4, 380);
  },
  // Checkpoint linked — a clean upward confirmation, distinct from pickup.
  checkpoint() {
    tone({ freq: 520, type: "triangle", dur: 0.1, vol: 0.45 });
    tone({ freq: 780, type: "triangle", dur: 0.12, vol: 0.5, delay: 0.07 });
    tone({ freq: 1170, type: "sine", dur: 0.22, vol: 0.42, delay: 0.14 });
    noise({ dur: 0.12, vol: 0.08, type: "highpass", freq: 2400, delay: 0.12 });
    duck(0.35, 460);
  },
  // Bad hit — wreckage: harsh low detuned buzzer.
  wrong() {
    tone({ freq: 150, to: 80, type: "square", dur: 0.24, vol: 0.5 });
    tone({ freq: 152, to: 78, type: "square", dur: 0.24, vol: 0.32, detune: 10 });
    duck(0.35, 420);
  },
};
