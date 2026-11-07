// ---------- shared UI state and helpers (all ui/*.js files share one scope) ----------
const { CITY, CITIES, PLANE, PLANES, REGION, REGIONS, BUSINESSES } = G;
const SAVE = 'contrail-save-v2', PREFS = 'contrail-prefs';
let S = null;
const ui = {
  tab: 'map', sel: null, sheet: null, ed: null, buyQty: {}, confirmClose: false, confirmNew: false,
  slotN: 10, adRegion: null, adTier: 0, start: { era: 2000, home: 'LHR', diff: 5, name: 'Golden Air', face: 7 },
  queue: [], lastRep: null,
};
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } })();
function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) {} }

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Math.round(n).toLocaleString('en-US');
const money = (m, dp = 1) => {
  const a = Math.abs(m), sign = m < 0 ? '−' : '';
  if (a > 0 && a < 0.05 * Math.pow(10, 1 - dp) && Math.round(a * 1000) > 0) return sign + '$' + Math.round(a * 1000) + 'k';
  return sign + '$' + (a >= 1000 ? (a / 1000).toFixed(2) + 'B' : a.toFixed(dp) + 'M');
};
const signed = m => (m >= 0 ? '+' : '') + money(m);
const pct = v => (v >= 0 ? '+' : '') + v + '%';
const qLabel = (y, q) => `Q${q + 1} ${y}`;
const ME = () => S.airlines[0];
const kpax = n => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : nf(n / 1000) + 'k');

function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} }
function loadSave() { try { const t = localStorage.getItem(SAVE); const s = t ? JSON.parse(t) : null; return s && s.v >= 2 ? G.migrate(s) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) {} }
const RECORDS = 'contrail-records';
function loadRecords() { try { return JSON.parse(localStorage.getItem(RECORDS)) || []; } catch (e) { return []; } }
function saveRecord(r) { try { const list = loadRecords(); list.push(r); list.sort((x, y) => y.value - x.value); localStorage.setItem(RECORDS, JSON.stringify(list.slice(0, 20))); } catch (e) {} }

let toastT = 0;
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3400);
  if (kind === 'err') sfx('buzz');
}

// ---------- sound: tiny synth, starts only after the player taps something ----------
let actx = null;
function sfx(kind) {
  if (prefs.mute) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const tone = (f, d, type = 'sine', v = 0.06, at = 0) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(v, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g).connect(actx.destination); o.start(t + at); o.stop(t + at + d + 0.02);
    };
    const click = (at, v = 0.05) => {
      const b = actx.createBuffer(1, 400, actx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = actx.createBufferSource(), g = actx.createGain(); g.gain.value = v;
      src.buffer = b; src.connect(g).connect(actx.destination); src.start(t + at);
    };
    if (kind === 'flap') for (let i = 0; i < 14; i++) click(i * 0.035 + Math.random() * 0.01, 0.04 + Math.random() * 0.03);
    if (kind === 'ok') { tone(660, 0.12, 'triangle'); tone(990, 0.18, 'triangle', 0.05, 0.08); }
    if (kind === 'buzz') tone(140, 0.18, 'square', 0.03);
    if (kind === 'coin') { tone(1320, 0.08, 'square', 0.025); tone(1760, 0.2, 'square', 0.025, 0.07); }
    if (kind === 'low') { tone(330, 0.2, 'sawtooth', 0.025); tone(247, 0.3, 'sawtooth', 0.025, 0.15); }
    if (kind === 'fanfare') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.05, i * 0.12));
    if (kind === 'jet') {
      const n = actx.createBuffer(1, actx.sampleRate * 0.9, actx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      src.buffer = n; src.connect(f).connect(g).connect(actx.destination); src.start(t);
    }
  } catch (e) { /* audio is optional */ }
}

// ---------- background music: a slow, soft generative pad with the odd bell note ----------
// Chords drift through a gentle progression; everything goes through a low-pass filter and a
// soft echo, at a low volume under the sound effects. It never repeats exactly.
const music = { on: false, master: null, timer: 0, next: 0, step: 0 };
const CHORDS = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62], [48, 55, 62, 67], [45, 52, 59, 64], [41, 48, 55, 64], [43, 47, 55, 62]];
const BELLS = [72, 74, 76, 79, 81, 84];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function musicStart(force) {
  if (music.on || (prefs.music === false && !force)) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const master = actx.createGain(), lp = actx.createBiquadFilter(), echo = actx.createDelay(1.5), fb = actx.createGain(), wet = actx.createGain();
    master.gain.setValueAtTime(0.0001, t); master.gain.exponentialRampToValueAtTime(0.055, t + 5);
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.3;
    echo.delayTime.value = 0.62; fb.gain.value = 0.38; wet.gain.value = 0.5;
    lp.connect(master); lp.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(master);
    master.connect(actx.destination);
    Object.assign(music, { on: true, master, lp, next: t + 0.2, step: Math.floor(Math.random() * CHORDS.length) });
    musicTick();
    music.timer = setInterval(musicTick, 1000);
  } catch (e) { /* audio is optional */ }
}
function musicTick() {
  if (!music.on || !actx) return;
  const now = actx.currentTime, len = 9;
  while (music.next < now + 3) {
    const t = music.next, chord = CHORDS[music.step % CHORDS.length];
    chord.forEach((m, k) => {
      const o = actx.createOscillator(), o2 = actx.createOscillator(), g = actx.createGain();
      o.type = k === 0 ? 'sine' : 'triangle'; o2.type = 'sine';
      o.frequency.value = hz(m); o2.frequency.value = hz(m) * 1.004;
      const v = k === 0 ? 0.32 : 0.16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 3); g.gain.setValueAtTime(v, t + len - 3); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
      o.connect(g); o2.connect(g); g.connect(music.lp);
      o.start(t); o2.start(t); o.stop(t + len + 2); o2.stop(t + len + 2);
    });
    // a few soft bell notes over each chord
    for (let k = 0; k < 3; k++) {
      if (Math.random() < 0.35) continue;
      const bt = t + 1 + Math.random() * (len - 2), o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = hz(BELLS[Math.floor(Math.random() * BELLS.length)]);
      g.gain.setValueAtTime(0.0001, bt); g.gain.exponentialRampToValueAtTime(0.09, bt + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, bt + 2.6);
      o.connect(g).connect(music.lp); o.start(bt); o.stop(bt + 2.7);
    }
    music.step += Math.random() < 0.8 ? 1 : 2;
    music.next += len - 1.5;
  }
}
function musicStop() {
  if (!music.on) return;
  music.on = false; clearInterval(music.timer);
  try { const m = music.master, t = actx.currentTime; m.gain.cancelScheduledValues(t); m.gain.setValueAtTime(m.gain.value, t); m.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); setTimeout(() => m.disconnect(), 1500); } catch (e) {}
}
function musicPause(hidden) {
  if (!actx) return;
  try { if (hidden) actx.suspend(); else actx.resume(); } catch (e) {}
}

// ---------- portraits: deterministic illustrated faces from a seed ----------
function faceSvg(seed, color, size = 48) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const r = () => ((x = (x ^ (x << 13)) >>> 0, x = (x ^ (x >>> 17)) >>> 0, x = (x ^ (x << 5)) >>> 0) % 10000) / 10000;
  const skins = ['#f3d2b6', '#e8b993', '#d19a72', '#b07a52', '#8a5a3a', '#5e3d27'];
  const hairs = ['#1c1410', '#3a271b', '#5e3d22', '#8c5a32', '#c9a26a', '#9aa0a8', '#e9e4dc', '#a7442a'];
  const skin = skins[Math.floor(r() * skins.length)], hair = hairs[Math.floor(r() * hairs.length)];
  const style = Math.floor(r() * 6), glasses = r() < 0.3, beard = r() < 0.22, smile = r();
  const jacket = ['#1f2a3d', '#2c2c34', '#33281f', '#203229'][Math.floor(r() * 4)];
  const hairPath = [
    'M19 26c0-9 6-14 13-14s13 5 13 14c-3-5-8-7-13-7s-10 2-13 7z',
    'M18 30c-1-11 6-18 14-18s15 7 14 18c-1-6-4-9-6-10-5 3-12 3-18 0-2 1-3 4-4 10z',
    'M17 44c-2-14 2-30 15-30s17 16 15 30c-2-8-3-16-4-20-6 2-16 2-22 0-1 4-2 12-4 20z',
    'M20 22c2-6 7-9 12-9s10 3 12 9c-4-2-8-3-12-3s-8 1-12 3z',
    'M19 27c-2-8 3-15 13-15 10 0 15 7 13 15-1-3-3-6-6-7l-3 3-4-3-4 3-3-3c-3 1-5 4-6 7z',
    'M18 26c1-9 7-13 14-13s13 4 14 13c-2-2-4-3-6-3l-2-4c-6 3-13 4-20 7z',
  ][style];
  const bun = style === 3 && r() < 0.5 ? `<circle cx="32" cy="11" r="5" fill="${hair}"/>` : '';
  const mouth = smile > 0.6 ? 'M27 37q5 4 10 0' : smile > 0.25 ? 'M27.5 37.5q4.5 2 9 0' : 'M28 38h8';
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="#1a2740"/>
    <clipPath id="fc${seed}"><circle cx="32" cy="32" r="32"/></clipPath>
    <g clip-path="url(#fc${seed})">
      ${style === 2 ? `<path d="${hairPath}" fill="${hair}"/>` : ''}
      <path d="M8 66c2-12 11-17 24-17s22 5 24 17z" fill="${jacket}"/>
      <path d="M26 49l6 9 6-9z" fill="#f2f2f2"/><path d="M31 51h2l1 9h-4z" fill="${color}"/>
      <rect x="28" y="40" width="8" height="10" rx="3" fill="${skin}"/>
      <ellipse cx="19.5" cy="29" rx="2.5" ry="3.5" fill="${skin}"/><ellipse cx="44.5" cy="29" rx="2.5" ry="3.5" fill="${skin}"/>
      <ellipse cx="32" cy="28" rx="12.5" ry="15" fill="${skin}"/>
      ${beard ? `<path d="M20 30c1 10 6 14 12 14s11-4 12-14c-2 5-6 7-12 7s-10-2-12-7z" fill="${hair}"/>` : ''}
      ${style !== 2 ? `<path d="${hairPath}" fill="${hair}"/>` : ''}${bun}
      <path d="M24 24.5q3-1.6 6 0M34 24.5q3-1.6 6 0" stroke="${hair}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="27" cy="28.5" r="1.4" fill="#1b1b1b"/><circle cx="37" cy="28.5" r="1.4" fill="#1b1b1b"/>
      <path d="M32 29.5l-1.6 4.5h3" stroke="rgba(0,0,0,.25)" stroke-width="1" fill="none"/>
      <path d="${mouth}" stroke="#7a3b2e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      ${glasses ? '<g fill="none" stroke="#0e0e0e" stroke-width="1.2"><circle cx="27" cy="28.5" r="4"/><circle cx="37" cy="28.5" r="4"/><path d="M31 28.5h2"/></g>' : ''}
    </g></svg>`;
}
const ADVISOR_FACE = { ops: 11, fin: 23, strat: 5, gov: 42 };
