/* UDG core — UpDoge Game helpers with NO Three.js dependency (loop, input, audio, storage, rng). Small, dependency-light helpers for static-hosted Three.js + ASCII games.
 * Design goals: no glitches on phones. Fixed timestep, pause on tab-hide, capped canvas/pixel ratio,
 * WebGL context-loss handling, safe storage, no per-frame allocations in hot paths.
 */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Seeded RNG (mulberry32) — reproducible runs, easy to test. */
export function rng(seed = (Date.now() & 0xffffffff)) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

/** localStorage that never throws (private mode, blocked storage, quota). */
export class Store {
  constructor(ns) { this.ns = ns + ':'; this.mem = {}; }
  get(k, d) {
    try { const v = localStorage.getItem(this.ns + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return k in this.mem ? this.mem[k] : d; }
  }
  set(k, v) {
    this.mem[k] = v;
    try { localStorage.setItem(this.ns + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
}

/** Fixed-timestep loop with fps cap. Stops rendering while the tab is hidden. */
export class Loop {
  constructor({ update, render, step = 1 / 60, fps = 60, maxFrame = 0.1 }) {
    Object.assign(this, { update, render, step, maxFrame });
    this.minMs = 1000 / fps;
    this.acc = 0; this.prev = 0; this.lastDraw = 0;
    this.running = false; this.paused = false; this.raf = 0;
    this._vis = () => {
      if (document.hidden) this._cancel();
      else if (this.running) { this.prev = performance.now(); this._queue(); }
    };
    document.addEventListener('visibilitychange', this._vis);
  }
  _queue() { if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
  _cancel() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  start() {
    if (this.running) return;
    this.running = true; this.prev = performance.now(); this.acc = 0; this._queue();
  }
  stop() { this.running = false; this._cancel(); }
  tick = (now) => {
    this.raf = 0;
    if (!this.running || document.hidden) return;
    this._queue();
    if (now - this.lastDraw < this.minMs - 2) return;
    let frame = (now - this.prev) / 1000;
    this.prev = now; this.lastDraw = now;
    if (frame > this.maxFrame) frame = this.maxFrame; // tab-switch / hitch guard
    if (!this.paused) {
      this.acc += frame;
      let n = 0;
      while (this.acc >= this.step && n < 5) { this.update(this.step); this.acc -= this.step; n++; }
      if (n === 5) this.acc = 0; // spiral-of-death guard
    }
    this.render(this.acc / this.step, frame);
  };
  /** Advance manually (used by tests). */
  advance(seconds) {
    const n = Math.round(seconds / this.step);
    for (let i = 0; i < n; i++) this.update(this.step);
  }
}

/** Keyboard + touch/pointer → discrete actions: left right up down action pause. */
export class Input {
  constructor(el, onAction) {
    this.onAction = onAction;
    const keymap = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      Space: 'action', Enter: 'action', KeyP: 'pause', Escape: 'pause',
    };
    this._key = (e) => {
      const a = keymap[e.code];
      if (!a) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.onAction(a);
    };
    window.addEventListener('keydown', this._key);

    let sx = 0, sy = 0, sid = -1, st = 0;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); });
    const end = (e) => {
      if (e.pointerId !== sid) return;
      sid = -1;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 24 && ady < 24) {
        if (performance.now() - st < 400) { // tap: left third / right third / middle = action
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          this.onAction(x < 0.33 ? 'left' : x > 0.66 ? 'right' : 'action');
        }
      } else if (adx > ady) this.onAction(dx < 0 ? 'left' : 'right');
      else this.onAction(dy < 0 ? 'up' : 'down');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { sid = -1; });
  }
}

/** Tiny WebAudio sfx. Created lazily on first gesture; suspended when tab hidden. */
export class Sfx {
  constructor(store) {
    this.store = store; this.muted = store ? store.get('muted', false) : false; this.ctx = null;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (!this.muted) this.ctx.resume();
    });
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.muted) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } }
  }
  setMuted(m) { this.muted = m; if (this.store) this.store.set('muted', m); }
  beep(freq = 440, dur = 0.1, type = 'square', vol = 0.06, slideTo = 0) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
}

