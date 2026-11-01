/* UDG — UpDoge Game engine: core helpers + Three.js AsciiView. Import udg-core.js instead if you don't need 3D. */
import * as THREE from 'three';
import { clamp } from './udg-core.js';

export { THREE };
export * from './udg-core.js';

/**
 * AsciiView — renders a Three.js scene as normal pixels or as coloured ASCII.
 *
 * Two ASCII paths:
 *  - luminance (default): render small → map brightness to a glyph ramp.
 *  - semantic (opts.semantic=true): a second tiny GPU pass writes, per cell, which glyph set the
 *    surface uses and a pattern value (window grid, sign letter index, road marking). Walls read as
 *    walls, signs spell words, roads get lane marks. Objects opt in with obj.userData.glyph = 'name'
 *    after view.defineGlyph('name', spec).
 * Output is drawn with pre-baked glyph sprites onto one canvas (no DOM-per-cell).
 * Palettes: 'color' | 'amber' | 'phosphor'.
 */
const PATTERNS = { none: 0, windows: 1, text: 2, road: 3, rain: 4 };
const ID_VERT = `varying vec2 vUv;
void main(){ vUv = uv; gl_PointSize = 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ID_FRAG = `uniform float uId; uniform float uPat; uniform vec2 uScale; uniform float uSeed;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
void main(){
  float g = 0.0;
  if (uPat > 0.5 && uPat < 1.5) {            // windows: floor lines, mullions, lit/dark panes
    vec2 c = vUv * uScale; vec2 f = fract(c); vec2 i = floor(c);
    if (f.y < 0.14) g = 128.0;
    else if (f.x < 0.12) g = 64.0;
    else if (f.x > 0.26 && f.x < 0.84 && f.y > 0.3 && f.y < 0.88) g = hash(i) > 0.52 ? 255.0 : 192.0;
  } else if (uPat > 1.5 && uPat < 2.5) {     // text: letter index along u
    g = floor(clamp(vUv.x, 0.0, 0.9999) * uScale.x);
  } else if (uPat > 2.5 && uPat < 3.5) {     // road: dashed centre line + kerbs (uScale = metres)
    vec2 c = vUv * uScale; float cx = abs(c.x - uScale.x * 0.5);
    if (cx < 0.09 && fract(c.y / 6.0) < 0.5) g = 255.0;
    else if (c.x < 0.35 || c.x > uScale.x - 0.35) g = 128.0;
  } else if (uPat > 3.5) { g = 255.0; }
  gl_FragColor = vec4(uId / 255.0, g / 255.0, 0.0, 1.0);
}`;

export class AsciiView {
  constructor(host, opts = {}) {
    this.host = host;
    this.o = Object.assign({
      mode: 'ascii', maxCols: 110, minCols: 44, cellCss: 7, maxDpr: 1.5, chars: ' .:-=+*#%@',
      bg: '#07040f', cw: 8, ch: 16, fps: 30, semantic: false, palette: 'color', aspect: 2,
    }, opts);
    this.mode = this.o.mode;
    this.palette = this.o.palette;
    this.lost = false;
    // phone gate: touch devices start with a coarser grid; adaptive quality lowers it further if frames run long
    if (window.matchMedia && matchMedia('(pointer:coarse)').matches) this.o.maxCols = Math.min(this.o.maxCols, 80);
    this.ms = 0; this._n = 0; this.adaptive = this.o.adaptive !== false; this.o.budgetMs = this.o.budgetMs || 22;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    this.renderer.setClearColor(this.o.bg, 1);
    this.gl = this.renderer.domElement;
    this.out = document.createElement('canvas');
    this.octx = this.out.getContext('2d', { alpha: false });
    this.samp = document.createElement('canvas');
    this.sctx = this.samp.getContext('2d', { willReadFrequently: true });
    for (const c of [this.gl, this.out]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(this.gl); host.appendChild(this.out);
    this.atlas = new Map();
    this.camera = null;
    // semantic glyph registry
    this.specs = [null]; this.specIds = new Map();
    this.idMat = new THREE.ShaderMaterial({
      vertexShader: ID_VERT, fragmentShader: ID_FRAG,
      uniforms: { uId: { value: 0 }, uPat: { value: 0 }, uScale: { value: new THREE.Vector2(1, 1) }, uSeed: { value: 0 } },
    });
    this._black = new THREE.Color(0x000000);
    this.gl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.onLost && this.onLost(); });
    this.gl.addEventListener('webglcontextrestored', () => { this.lost = false; this.resize(true); this.onRestored && this.onRestored(); });
    this._ro = new ResizeObserver(() => { cancelAnimationFrame(this._rq); this._rq = requestAnimationFrame(() => this.resize()); });
    this._ro.observe(host);
    this.setChars(this.o.chars);
    this.resize(true);
    this.setMode(this.mode);
  }
  setChars(s) { this.chars = s; this.atlas.clear(); }
  setPalette(p) { this.palette = p; this.atlas.clear(); }
  setMode(m) {
    this.mode = m;
    this.gl.style.visibility = m === 'pixel' ? 'visible' : 'hidden';
    this.out.style.visibility = m === 'ascii' ? 'visible' : 'hidden';
    this.resize(true);
  }
  setDensity(cols) { this.o.maxCols = cols; this.resize(true); }
  /** Register a glyph set. spec: { pattern:'windows'|'text'|'road'|'rain'|'none', ramp, text, lit:[r,g,b], fill, gain } */
  defineGlyph(name, spec) {
    let id = this.specIds.get(name);
    if (id === undefined) { id = this.specs.length; this.specIds.set(name, id); this.specs.push(null); }
    this.specs[id] = Object.assign({ pattern: 'none', ramp: this.chars, gain: 1 }, spec, { pat: PATTERNS[spec.pattern || 'none'] || 0 });
    return id;
  }
  resize(force) {
    const w = this.host.clientWidth || 320, h = this.host.clientHeight || 180;
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const { cw, ch } = this.o;
    this.cols = clamp(Math.round(w / this.o.cellCss), this.o.minCols, this.o.maxCols);
    this.rows = Math.max(12, Math.round(this.cols * (h / w) * (cw / ch)));
    this.out.width = this.cols * cw; this.out.height = this.rows * ch;
    this.samp.width = this.cols; this.samp.height = this.rows;
    if (this.mode === 'ascii') {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.cols * 3, this.rows * 3, false);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.o.maxDpr));
      this.renderer.setSize(w, h, false);
    }
    if (this.o.semantic) {
      const mk = (W, H, srgb) => { const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace; return rt; };
      if (this.rtC) { this.rtC.dispose(); this.rtI.dispose(); }
      this.rtC = mk(this.cols * 2, this.rows * 2, true); this.rtI = mk(this.cols, this.rows, false);
      this.bufC = new Uint8Array(this.cols * 2 * this.rows * 2 * 4); this.bufI = new Uint8Array(this.cols * this.rows * 4);
    }
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  _tint(r, g, b) { // palette mapping, 0..15 channels in/out
    if (this.palette === 'color') return [r, g, b];
    const v = Math.max(r, g, b);
    return this.palette === 'amber' ? [v, Math.round(v * 0.68), Math.round(v * 0.12)] : [Math.round(v * 0.35), v, Math.round(v * 0.45)];
  }
  _sprite(chr, r, g, b) {
    const key = chr.charCodeAt(0) * 4096 + r * 256 + g * 16 + b; // numeric key: no per-cell string garbage
    let s = this.atlas.get(key);
    if (s) return s;
    const { cw, ch } = this.o;
    s = document.createElement('canvas'); s.width = cw; s.height = ch;
    const c = s.getContext('2d');
    const [R, G, B] = this._tint(r, g, b);
    c.fillStyle = `rgb(${R * 17},${G * 17},${B * 17})`;
    c.font = `bold ${Math.round(ch * 0.92)}px "Courier New",monospace`;
    c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    c.fillText(chr, cw / 2, ch * 0.8);
    if (this.atlas.size > 6000) this.atlas.clear(); // bounded cache
    this.atlas.set(key, s);
    return s;
  }
  render(scene, camera) {
    if (this.lost) return;
    if (camera !== this.camera) { this.camera = camera; camera.aspect = this.w / this.h; camera.updateProjectionMatrix(); }
    const t0 = performance.now();
    if (this.mode !== 'ascii') { this.renderer.render(scene, camera); return; }
    this._frame(scene, camera);
    // adaptive density: if the CPU side of a frame stays over budget, shrink the glyph grid (never grows back, so no flicker)
    this.ms += (performance.now() - t0 - this.ms) * 0.1;
    if (this.adaptive && ++this._n > 40 && this.ms > this.o.budgetMs && this.cols > this.o.minCols) {
      this.o.maxCols = Math.max(this.o.minCols, Math.floor(this.cols * 0.86));
      this._n = 0; this.ms = this.o.budgetMs * 0.8; this.resize(true);
      this._frame(scene, camera); // resizing clears the canvases: repaint now, no black frame
      this.onAdapt && this.onAdapt(this.cols);
    }
  }
  _frame(scene, camera) { if (this.o.semantic) this._semantic(scene, camera); else { this.renderer.render(scene, camera); this._ascii(); } }
  _ascii() {
    const { cols, rows } = this, { cw, ch } = this.o, chars = this.chars, maxI = chars.length - 1;
    const sc = this.sctx;
    sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = 'high';
    sc.drawImage(this.gl, 0, 0, cols, rows);
    const d = sc.getImageData(0, 0, cols, rows).data;
    const oc = this.octx;
    oc.fillStyle = this.o.bg; oc.fillRect(0, 0, this.out.width, this.out.height);
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
        const ci = Math.min(maxI, Math.round(Math.pow(lum, 0.7) * maxI));
        if (ci === 0) continue;
        const m = Math.max(R, G, B, 1);
        const k = (0.45 + 0.55 * lum) * 15 / m;
        oc.drawImage(this._sprite(chars[ci], (R * k) | 0, (G * k) | 0, (B * k) | 0), x * cw, y * ch);
      }
    }
  }
  _semantic(scene, camera) {
    const r = this.renderer, { cols, rows } = this, { cw, ch } = this.o;
    // pass 1: colour at 2x2 per cell
    r.setRenderTarget(this.rtC); r.render(scene, camera);
    r.readRenderTargetPixels(this.rtC, 0, 0, cols * 2, rows * 2, this.bufC);
    // pass 2: glyph ids + pattern values
    const bg = scene.background, fog = scene.fog, idm = this.idMat, specs = this.specs;
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine)) return;
      if (o._udgHook) return;
      o._udgHook = true;
      const prev = o.onBeforeRender;
      o.onBeforeRender = function (rr, s, c, g, mat) {
        if (mat === idm) {
          let n = this, name = null; while (n && !name) { name = n.userData && n.userData.glyph; n = n.parent; }
          const id = name ? (s.userData.glyphIds && s.userData.glyphIds.get(name)) || 0 : 0;
          const sp = specs[id];
          idm.uniforms.uId.value = id; idm.uniforms.uPat.value = sp ? sp.pat : 0;
          const scl = this.userData.glyphScale || (sp && sp.scale) || (sp && sp.text ? [sp.text.length, 1] : [1, 1]);
          idm.uniforms.uScale.value.set(scl[0], scl[1]); idm.uniforms.uSeed.value = this.userData.glyphSeed || this.id * 0.731;
          idm.uniformsNeedUpdate = true;
        } else if (prev) prev.apply(this, arguments);
      };
    });
    scene.userData.glyphIds = this.specIds;
    scene.background = this._black; scene.fog = null; scene.overrideMaterial = idm;
    r.setRenderTarget(this.rtI); r.render(scene, camera);
    r.readRenderTargetPixels(this.rtI, 0, 0, cols, rows, this.bufI);
    scene.background = bg; scene.fog = fog; scene.overrideMaterial = null;
    r.setRenderTarget(null);
    // compose
    const C = this.bufC, I = this.bufI, W2 = cols * 2, oc = this.octx, ramp0 = this.chars, max0 = ramp0.length - 1;
    oc.fillStyle = this.o.bg; oc.fillRect(0, 0, this.out.width, this.out.height);
    for (let y = 0; y < rows; y++) {
      const fy = rows - 1 - y; // GL rows are bottom-up
      for (let x = 0; x < cols; x++) {
        const a = ((fy * 2) * W2 + x * 2) * 4, b = a + W2 * 4;
        const R = (C[a] + C[a + 4] + C[b] + C[b + 4]) >> 2, G = (C[a + 1] + C[a + 5] + C[b + 1] + C[b + 5]) >> 2, B = (C[a + 2] + C[a + 6] + C[b + 2] + C[b + 6]) >> 2;
        const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
        const ii = (fy * cols + x) * 4, id = I[ii], gv = I[ii + 1];
        const sp = id ? specs[id] : null;
        let chr = null, cr = R, cg = G, cb = B, bright = 0.45 + 0.55 * lum;
        if (!sp) {
          const ci = Math.min(max0, Math.round(Math.pow(lum, 0.7) * max0)); if (ci === 0) continue; chr = ramp0[ci];
        } else if (sp.pat === 1) { // windows
          const f = Math.min(1, lum * sp.gain);
          if (f < 0.04) continue;
          if (gv === 255) { chr = sp.litRamp ? sp.litRamp[Math.min(sp.litRamp.length - 1, (f * sp.litRamp.length) | 0)] : '#'; [cr, cg, cb] = sp.lit || [255, 200, 120]; bright = 0.25 + 0.75 * f; }
          else if (gv === 192) { chr = sp.dark || ':'; bright = 0.35 + 0.5 * f; }
          else if (gv === 128) { chr = sp.floor || '='; bright = 0.3 + 0.6 * f; }
          else if (gv === 64) { chr = sp.mull || '|'; bright = 0.3 + 0.6 * f; }
          else { const fl = sp.fill || ' '; chr = fl[(x * 7 + y * 3) % fl.length]; if (chr === ' ') continue; bright = 0.25 + 0.5 * f; }
        } else if (sp.pat === 2) { // text — when a letter spans several cells, draw it once (letter-spaced sign, no "SSIIGGNN")
          if (lum < 0.05) continue; const tx = sp.text;
          if (x > 0) { const pj = ii - 4; if (I[pj] === id && I[pj + 1] === gv) continue; }
          chr = tx[Math.min(tx.length - 1, gv)]; if (chr === ' ') continue; bright = 0.55 + 0.45 * Math.min(1, lum * 1.6);
        } else if (sp.pat === 3) { // road
          const f = Math.min(1, lum * sp.gain);
          if (gv === 255) { chr = sp.line || '|'; [cr, cg, cb] = sp.lineColor || [232, 200, 114]; bright = 0.3 + 0.7 * f; }
          else if (gv === 128) { chr = sp.kerb || '='; bright = 0.3 + 0.6 * f; }
          else { if ((x + y * 2) % (sp.sparse || 3)) continue; chr = sp.fill || '.'; bright = 0.25 + 0.6 * f; if (f < 0.05) continue; }
        } else if (sp.pat === 4) { // rain
          if (lum < 0.03) continue; chr = sp.ramp[(x + y) % sp.ramp.length]; bright = 0.4 + 0.6 * lum;
        } else { // per-set ramp
          const rp = sp.ramp, mx = rp.length - 1, ci = Math.min(mx, Math.round(Math.pow(Math.min(1, lum * sp.gain), 0.7) * mx)); if (ci === 0) continue; chr = rp[ci];
        }
        const m = Math.max(cr, cg, cb, 1), k = bright * 15 / m;
        oc.drawImage(this._sprite(chr, (cr * k) | 0, (cg * k) | 0, (cb * k) | 0), x * cw, y * ch);
      }
    }
  }
  dispose() { this._ro.disconnect(); if (this.rtC) { this.rtC.dispose(); this.rtI.dispose(); } this.renderer.dispose(); this.gl.remove(); this.out.remove(); }
}
