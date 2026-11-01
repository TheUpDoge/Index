/* UPDOGE OS — a retro desktop shell for static sites.
 * bootOS(config) builds: boot screen, Three.js ASCII wallpaper, desktop icons, window manager,
 * taskbar + start menu, and a few native apps (folder, notepad, terminal, settings).
 * Every page of the site opens in its own window (same-origin iframe). Deep links: #open=<appId>.
 */
import { THREE, Loop, AsciiView, Sfx, Store, clamp } from '../engine/udg.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const coarse = () => matchMedia('(pointer:coarse)').matches;
const small = () => innerWidth < 720;
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

export function bootOS(cfg) {
  // A page inside an OS window that links "home" would otherwise load a desktop inside a desktop.
  try { if (window.parent !== window && window.parent.UPDOGE_OS) { location.replace(cfg.framedFallback || 'about:blank'); return null; } } catch (e) { /* cross-origin parent: carry on */ }
  const store = new Store(cfg.storeKey || 'updoge-os');
  const sfx = new Sfx(store);
  const set = Object.assign({ wall: coarse() ? 'still' : 'ascii', crt: true, boot: true, density: 132, palette: 'color', soloAudio: true }, store.get('settings', {}));
  const saveSet = () => store.set('settings', set);
  const APPS = new Map(cfg.apps.map((a) => [a.id, a]));

  /* ---------- skeleton ---------- */
  document.body.classList.toggle('crt-on', !!set.crt);
  document.body.append(
    h('div', { id: 'desk' }, h('div', { id: 'wall', 'aria-hidden': 'true' }), h('div', { id: 'icons', role: 'list', 'aria-label': 'Desktop' }), h('div', { id: 'wins' })),
    h('div', { id: 'taskbar' },
      h('button', { id: 'start', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Start menu' }, h('span', {}, '▣'), cfg.startLabel || 'START'),
      h('div', { id: 'tasks', role: 'toolbar', 'aria-label': 'Open windows' }),
      h('div', { id: 'tray' },
        cfg.ring ? h('a', { href: cfg.ring.prev, title: cfg.ring.name + ' — previous site', rel: 'noopener' }, '◀') : null,
        cfg.ring ? h('a', { href: cfg.ring.home, title: cfg.ring.name, rel: 'noopener' }, cfg.ring.icon || '◎') : null,
        cfg.ring ? h('a', { href: cfg.ring.next, title: cfg.ring.name + ' — next site', rel: 'noopener' }, '▶') : null,
        h('button', { id: 'tWall', title: 'Wallpaper: live ASCII / pixel / still' }, '◐'),
        h('button', { id: 'tSnd', title: 'Sound on/off' }, '♪'),
        h('span', { id: 'clock', 'aria-label': 'Clock' }))),
    h('nav', { id: 'menu', hidden: true, 'aria-label': 'Start menu' }, h('div', { class: 'side' }, h('span', { html: cfg.menuSide || 'UPDOGE<b>OS</b>' })), h('ul')),
    h('div', { id: 'off', hidden: true, role: 'button', tabindex: '0' }, h('pre')));

  /* ---------- wallpaper: UPDOGE City — eye-level night avenue, semantic ASCII (inspired by ASCII City) ---------- */
  const wallHost = $('#wall');
  let view = null, scene, camera, wallLoop, wallT = 0;
  function buildWall() {
    view = new AsciiView(wallHost, { mode: set.wall === 'pixel' ? 'pixel' : 'ascii', semantic: true, palette: set.palette || 'color', maxCols: set.density, cellCss: 7, fps: 24, bg: '#07040d', budgetMs: 20 });
    const V = view;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0618);
    scene.fog = new THREE.Fog(0x0b0618, 16, 118);
    camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 260);
    camera.position.set(0.6, 1.7, 0);
    const basic = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o));
    const tag = (o, g, scale) => { o.userData.glyph = g; if (scale) o.userData.glyphScale = scale; return o; };
    // glyph sets
    V.defineGlyph('bldA', { pattern: 'windows', lit: [255, 196, 110], litRamp: ':#%@', fill: ' ', gain: 5 });
    V.defineGlyph('bldB', { pattern: 'windows', lit: [80, 230, 235], litRamp: ':#%@', fill: ' .', gain: 5 });
    V.defineGlyph('bldC', { pattern: 'windows', lit: [255, 90, 190], litRamp: ':+%#', fill: ' ', gain: 5 });
    V.defineGlyph('road', { pattern: 'road', fill: '.', kerb: '=', line: ':', lineColor: [232, 200, 114], sparse: 3, gain: 4 });
    V.defineGlyph('walk', { pattern: 'road', fill: ':', kerb: ' ', line: ' ', sparse: 4, gain: 4 });
    V.defineGlyph('lamp', { ramp: ' .oO@', gain: 1.4 });
    V.defineGlyph('pole', { ramp: ' .|||', gain: 6 });
    V.defineGlyph('car', { ramp: ' .=[#', gain: 4 });
    V.defineGlyph('rain', { pattern: 'rain', ramp: "/'/" });
    V.defineGlyph('sun', { ramp: ' .-=+*#%@', gain: 1 });
    const SIGNS = cfg.signs || [...APPS.values()].filter((a) => a.url && !a.external).map((a) => a.name.toUpperCase());
    SIGNS.forEach((s) => V.defineGlyph('sign:' + s, { pattern: 'text', text: s }));
    const NEON = [0xff3cac, 0x2de2e6, 0xe8c872, 0x9a7cff, 0x6dffb0, 0xff7a3c];

    // sun at the end of the avenue
    const sun = new THREE.Group();
    sun.add(tag(new THREE.Mesh(new THREE.CircleGeometry(40, 48), basic(0xff4fb0, { fog: false })), 'sun'));
    const core = tag(new THREE.Mesh(new THREE.CircleGeometry(27, 48), basic(0xffcf70, { fog: false })), 'sun'); core.position.z = 0.05; sun.add(core);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.9 + i * 0.7), basic(0x0b0618, { fog: false })); c.position.set(0, -4 - i * 4.2, 0.1); sun.add(c); }
    scene.add(sun);
    // stars
    const SN = 220, sg = new THREE.BufferGeometry(), spos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { spos[i * 3] = (Math.random() - 0.5) * 300; spos[i * 3 + 1] = 30 + Math.random() * 80; spos[i * 3 + 2] = -120 - Math.random() * 60; }
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe9dfc8, size: 1, sizeAttenuation: false, fog: false })); scene.add(stars);
    // road + sidewalks (follow the camera, snapped to the 6 m dash rhythm)
    const L = 240;
    const road = tag(new THREE.Mesh(new THREE.PlaneGeometry(14, L), basic(0x1c1430)), 'road', [14, L]); road.rotation.x = -Math.PI / 2; scene.add(road);
    const walks = [-1, 1].map((s) => { const m = tag(new THREE.Mesh(new THREE.PlaneGeometry(4, L), basic(0x231a3a)), 'walk', [4, L]); m.rotation.x = -Math.PI / 2; m.position.set(s * 9, 0.12, 0); scene.add(m); return m; });
    // buildings with signs, both sides, recycled as we walk
    const N = 14, GAP = 15, rows = [];
    const bMats = [basic(0x2a1c48), basic(0x182a44), basic(0x3a1838), basic(0x231a3a)];
    function dressBuilding(b, side, z) {
      const w = 9 + Math.random() * 5, hgt = 14 + Math.random() * 46, d = 12;
      b.box.scale.set(w, hgt, d); b.box.position.set(side * (11 + w / 2), hgt / 2, z);
      b.box.material = bMats[(Math.random() * bMats.length) | 0];
      b.box.userData.glyph = ['bldA', 'bldB', 'bldC'][(Math.random() * 3) | 0];
      b.box.userData.glyphScale = [Math.max(w, d) / 2.4, hgt / 3.2]; b.box.userData.glyphSeed = Math.random() * 100;
      const show = Math.random() < 0.7, text = SIGNS[(Math.random() * SIGNS.length) | 0];
      b.sign.visible = show; b.hasSign = show;
      if (show) {
        const sw = Math.max(3, text.length * 0.75);
        b.sign.scale.set(sw, 1.3, 1); b.sign.userData.glyph = 'sign:' + text;
        b.sign.material.color.setHex(NEON[(Math.random() * NEON.length) | 0]);
        b.sign.position.set(side * (10.6 + sw / 2 * 0), 4 + Math.random() * 6, z + d / 2 + 0.3);
        b.sign.position.x = side * (11 + sw / 2 - 0.5);
      }
    }
    for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
      const b = { box: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bMats[0]), sign: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic(0xff3cac, { fog: true })) };
      b.sign.material = basic(0xff3cac); scene.add(b.box, b.sign); dressBuilding(b, side, -i * GAP - (side > 0 ? 7 : 0)); b.side = side; rows.push(b);
    }
    // street lamps
    const lamps = [];
    for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      g.add(tag(new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.5, 0.15), basic(0x6a5a90)), 'pole')); g.children[0].position.y = 2.75;
      const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), basic(0xffd27a)), 'lamp'); head.position.set(-side * 0.6, 5.5, 0); g.add(head);
      g.position.set(side * 7.6, 0, -i * 22 - (side > 0 ? 11 : 0)); scene.add(g); lamps.push(g);
    }
    // traffic
    const cars = [];
    for (let i = 0; i < 6; i++) {
      const away = i % 2 === 0, g = new THREE.Group();
      g.add(tag(new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.2), basic([0x7b2ff7, 0x2de2e6, 0xe9dfc8, 0xff3cac][i % 4])), 'car'));
      g.children[0].position.y = 0.8;
      for (const s of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.1), basic(away ? 0xff2244 : 0xfff2c0)); l.position.set(s, 0.9, 2.12); g.add(l); }
      g.userData.v = away ? -(6 + Math.random() * 4) : 9 + Math.random() * 5;
      g.position.set(away ? -3.4 : 3.4, 0, -20 - i * 30); if (!away) g.rotation.y = Math.PI;
      scene.add(g); cars.push(g);
    }
    // rain (Points), around the camera
    const RN = 160, rg = new THREE.BufferGeometry(), rp = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) { rp[i * 3] = (Math.random() - 0.5) * 30; rp[i * 3 + 1] = Math.random() * 18; rp[i * 3 + 2] = -Math.random() * 40; }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = tag(new THREE.Points(rg, new THREE.PointsMaterial({ color: 0x5a6a9a, size: 1, sizeAttenuation: false })), 'rain');
    rain.frustumCulled = false; scene.add(rain);

    const SPEED = 2.6;
    const update = (dt) => {
      wallT += dt;
      const cz = (camera.position.z -= SPEED * dt);
      camera.position.y = 1.7 + Math.abs(Math.sin(wallT * 4.2)) * 0.05; // gentle walking bob
      camera.position.x = 0.6 + Math.sin(wallT * 0.11) * 1.2;
      const snap = Math.floor(cz / 6) * 6;
      road.position.z = snap - L / 2 + 20; for (const w of walks) w.position.z = snap - L / 2 + 20;
      sun.position.set(0, 26, cz - 200); stars.position.z = cz;
      for (const b of rows) { if (b.box.position.z > cz + 12) dressBuilding(b, b.side, b.box.position.z - N * GAP); const vis = b.box.position.z > cz - 116; b.box.visible = vis; b.sign.visible = vis && b.hasSign; }
      for (const l of lamps) if (l.position.z > cz + 6) l.position.z -= 10 * 22;
      for (const c of cars) { c.position.z += c.userData.v * dt; if (c.position.z > cz + 15) c.position.z = cz - 150 - Math.random() * 40; if (c.position.z < cz - 190) c.position.z = cz + 10; }
      const p = rg.attributes.position;
      for (let i = 0; i < RN; i++) { let y = p.getY(i) - dt * 16, z = p.getZ(i); if (y < 0) { y = 18; z = cz - Math.random() * 40; p.setX(i, camera.position.x + (Math.random() - 0.5) * 30); } if (z > cz + 2) z -= 40; p.setY(i, y); p.setZ(i, z); }
      p.needsUpdate = true;
    };
    const render = () => { camera.lookAt(camera.position.x * 0.4, 3.2, camera.position.z - 40); view.render(scene, camera); };
    wallLoop = new Loop({ update, render: () => { if (wallVisible()) render(); }, fps: 24 });
    wallLoop.renderOnce = () => { update(0); render(); };
    update(1 / 24);
    applyWall();
    addEventListener('resize', () => { if (set.wall === 'still') requestAnimationFrame(() => wallLoop.renderOnce()); });
  }
  function wallVisible() { // skip work when a maximized window covers the desktop
    for (const w of wins.values()) if (w.max && !w.min) return false;
    return true;
  }
  function applyWall() {
    if (!view) return;
    view.setMode(set.wall === 'pixel' ? 'pixel' : 'ascii');
    if (set.wall === 'still') { wallLoop.stop(); wallLoop.renderOnce(); }
    else { wallLoop.start(); }
    $('#tWall').textContent = { ascii: '◐', pixel: '◑', still: '○' }[set.wall];
  }
  try { buildWall(); } catch (e) { console.warn('wallpaper disabled:', e); wallHost.style.background = 'radial-gradient(ellipse at 50% 70%,#3a0f55,#0a0612 70%)'; }

  /* ---------- window manager ---------- */
  const wins = new Map(); let zTop = 10, cascade = 0, focused = null;
  // Each page that loads /engine/audio-guard.js exposes UDGAudio: minimized windows go quiet,
  // and with "sound only from the active window" on, so do windows in the background.
  function audio(w, action, reason) {
    const fr = w && w.el && w.el.querySelector('iframe'); if (!fr) return;
    try { const A = fr.contentWindow && fr.contentWindow.UDGAudio; if (A) A[action](reason); } catch (e) { /* cross-origin page: can't reach it */ }
  }
  function syncAudio() {
    for (const [k, o] of wins) {
      audio(o, o.min ? 'pause' : 'resume', 'min');
      audio(o, set.soloAudio && k !== focused ? 'pause' : 'resume', 'blur');
    }
  }
  function open(id, extra) {
    const app = typeof id === 'string' ? APPS.get(id) : id;
    if (!app) return;
    if (app.external) { window.open(app.url, '_blank', 'noopener'); sfx.beep(660, 0.05, 'square', 0.03); return; }
    if (app.href) { location.href = app.href; return; }
    const key = app.id;
    if (wins.has(key)) { const w = wins.get(key); w.min = false; w.el.classList.remove('min'); focus(key); syncAudio(); return; }
    const vw = $('#wins').clientWidth, vh = $('#wins').clientHeight;
    const w = { app, min: false, max: small() || !!app.max, w: Math.min(app.w || 900, vw - 30), h: Math.min(app.h || 600, vh - 30) };
    // open beside the icon columns when there is room, so the desktop stays usable
    let ir = 0; for (const ic of document.querySelectorAll('#icons .ico')) ir = Math.max(ir, ic.offsetLeft + ic.offsetWidth);
    const x0 = vw - ir - 24 >= Math.min(w.w, 520) ? ir + 16 : 30;
    if (x0 > 30) w.w = Math.min(w.w, vw - x0 - 12);
    w.x = clamp(x0 + (cascade % 6) * 28, 0, Math.max(0, vw - w.w)); w.y = clamp(12 + (cascade % 6) * 24, 0, Math.max(0, vh - w.h)); cascade++;
    const bar = h('div', { class: 'bar' },
      h('span', { class: 't' }, (app.icon ? app.icon + ' ' : '') + app.name),
      h('button', { title: 'Minimize', 'aria-label': 'Minimize', onclick: () => minimize(key) }, '_'),
      h('button', { title: 'Maximize', 'aria-label': 'Maximize', onclick: () => toggleMax(key) }, '□'),
      h('button', { title: 'Close', 'aria-label': 'Close', onclick: () => close(key) }, '×'));
    const body = h('div', { class: 'wbody' });
    const el = h('section', { class: 'win opening', role: 'dialog', 'aria-label': app.name, 'data-id': key }, bar, body);
    w.el = el; w.body = body;
    if (app.url) {
      const ld = h('div', { class: 'loading' }, h('span', {}, 'LOADING ' + app.name.toUpperCase() + ' …'));
      const fr = h('iframe', { src: app.url, title: app.name, allow: 'autoplay; fullscreen; gamepad; clipboard-write', loading: 'eager' });
      fr.addEventListener('load', () => { ld.remove(); try { fr.contentWindow.__UPDOGE_OS__ = true; } catch (e) { /* cross-origin */ } syncAudio(); });
      body.append(fr, ld);
      el.append(h('div', { class: 'wstatus' }, h('span', {}, app.status || app.url), h('a', { href: app.url, target: '_blank', rel: 'noopener', title: 'Open in its own tab' }, 'open in tab ↗')));
    } else if (app.kind && NATIVE[app.kind]) NATIVE[app.kind](body, app, extra);
    el.append(h('div', { class: 'grip', 'aria-hidden': 'true' }));
    $('#wins').append(el);
    place(w); wins.set(key, w);
    wireDrag(w, bar); wireResize(w, $('.grip', el));
    el.addEventListener('pointerdown', () => focus(key), true);
    bar.addEventListener('dblclick', (e) => { if (e.target === bar || e.target.classList.contains('t')) toggleMax(key); });
    el.addEventListener('animationend', () => el.classList.remove('opening'), { once: true });
    task(key); focus(key);
    sfx.beep(520, 0.05, 'triangle', 0.04); setTimeout(() => sfx.beep(780, 0.06, 'triangle', 0.04), 50);
    return w;
  }
  function place(w) {
    const s = w.el.style;
    w.el.classList.toggle('max', w.max);
    if (!w.max) { s.left = w.x + 'px'; s.top = w.y + 'px'; s.width = w.w + 'px'; s.height = w.h + 'px'; }
  }
  function focus(key) {
    const w = wins.get(key); if (!w) return;
    focused = key; w.el.style.zIndex = ++zTop;
    for (const [k, o] of wins) { o.el.classList.toggle('focus', k === key); o.tb && o.tb.classList.toggle('on', k === key && !o.min); }
    try { history.replaceState(null, '', '#open=' + key); } catch (e) { /* file:// */ }
    syncAudio();
    resumeWall();
  }
  function minimize(key) {
    const w = wins.get(key); if (!w) return;
    w.min = true; w.el.classList.add('min'); w.tb.classList.remove('on'); audio(w, 'pause', 'min');
    sfx.beep(400, 0.05, 'triangle', 0.035);
    const next = [...wins.entries()].filter(([, o]) => !o.min).sort((a, b) => b[1].el.style.zIndex - a[1].el.style.zIndex)[0];
    if (next) focus(next[0]); else { focused = null; clearHash(); }
    resumeWall();
  }
  function toggleMax(key) { const w = wins.get(key); if (!w || small()) return; w.max = !w.max; place(w); resumeWall(); }
  function close(key) {
    const w = wins.get(key); if (!w) return;
    audio(w, 'pause', 'closing'); const fr = $('iframe', w.el); if (fr) fr.src = 'about:blank'; // stop audio/loops immediately
    w.el.remove(); w.tb.remove(); wins.delete(key);
    sfx.beep(330, 0.06, 'triangle', 0.035);
    const next = [...wins.keys()].pop(); if (next) focus(next); else { focused = null; clearHash(); }
    resumeWall();
  }
  const clearHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } };
  function resumeWall() { if (wallLoop && set.wall !== 'still' && wallVisible()) wallLoop.start(); }
  function task(key) {
    const w = wins.get(key);
    w.tb = h('button', { title: w.app.name, onclick: () => { if (focused === key && !w.min) minimize(key); else { w.min = false; w.el.classList.remove('min'); focus(key); syncAudio(); } } }, (w.app.icon || '▪') + ' ' + w.app.name);
    $('#tasks').append(w.tb);
  }
  function dragger(handle, onMove, w) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button') || w.max || small()) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, o = { x: w.x, y: w.y, w: w.w, h: w.h };
      $('#desk').classList.add('dragging');
      const mv = (ev) => { onMove(o, ev.clientX - sx, ev.clientY - sy); place(w); };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); $('#desk').classList.remove('dragging'); };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }
  function wireDrag(w, bar) {
    dragger(bar, (o, dx, dy) => {
      const vw = $('#wins').clientWidth, vh = $('#wins').clientHeight;
      w.x = clamp(o.x + dx, 80 - w.w, vw - 80); w.y = clamp(o.y + dy, 0, vh - 28);
    }, w);
  }
  function wireResize(w, grip) {
    dragger(grip, (o, dx, dy) => { w.w = Math.max(260, o.w + dx); w.h = Math.max(160, o.h + dy); }, w);
  }
  // clicking inside an iframe doesn't bubble: detect focus moving into a frame
  let frameWatch = 0;
  addEventListener('blur', () => {
    clearInterval(frameWatch);
    const check = () => { const a = document.activeElement; if (a && a.tagName === 'IFRAME') { const wEl = a.closest('.win'); if (wEl && wEl.dataset.id !== focused) focus(wEl.dataset.id); } };
    setTimeout(check, 0); frameWatch = setInterval(check, 300);
  });
  addEventListener('focus', () => clearInterval(frameWatch));
  addEventListener('resize', () => { for (const w of wins.values()) { if (small()) w.max = true; place(w); } });

  /* ---------- native apps ---------- */
  const NATIVE = {
    folder(body, app) {
      for (const sec of app.sections || [{ items: app.items }]) {
        if (sec.title) body.append(h('div', { class: 'sect' }, sec.title));
        const list = h('div', { class: 'list' });
        for (const it of sec.items) {
          const a = typeof it === 'string' ? APPS.get(it) : it; if (!a) continue;
          list.append(h('button', { class: 'card', onclick: () => open(a) },
            h('span', { class: 'g' }, a.icon || '▪'),
            h('span', {}, h('b', {}, a.name), h('small', {}, a.desc || ''), a.tag ? h('span', { class: 'tag' }, a.tag) : null)));
        }
        body.append(list);
      }
    },
    note(body, app) { body.append(h('div', { class: 'pad', html: app.html })); if (app.onmount) app.onmount(body, api); },
    terminal(body) {
      const out = h('div', { class: 'out', 'aria-live': 'polite' }); const inp = h('input', { 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false' });
      const form = h('form', {}, h('span', { class: 'p' }, (cfg.prompt || 'guest@updoge') + ':~$'), inp);
      body.append(h('div', { class: 'term' }, out, form));
      const print = (s) => { out.textContent += s + '\n'; out.scrollTop = out.scrollHeight; };
      print((cfg.termBanner || 'UPDOGE OS terminal') + "\ntype 'help' for commands.\n");
      const hist = []; let hi = 0;
      const cmds = {
        help: () => 'help · ls · open <app> · games · whoami · date · echo <txt> · vibe · ring · counter · clear · reboot · shutdown',
        ls: () => [...APPS.values()].filter((a) => !a.hidden).map((a) => `${a.id.padEnd(14)} ${a.name}`).join('\n'),
        apps: () => cmds.ls(),
        open: (arg) => { const a = APPS.get(arg) || [...APPS.values()].find((x) => x.name.toLowerCase().includes((arg || '').toLowerCase()) && arg); if (!a) return 'no such app: ' + (arg || '(none)') + " — try 'ls'"; open(a); return 'opening ' + a.name + '…'; },
        games: () => { if (APPS.has('games')) { open('games'); return 'opening Games…'; } return 'no games folder'; },
        whoami: () => cfg.whoami || 'guest',
        date: () => new Date().toString(),
        echo: (arg) => arg || '',
        vibe: () => { vibe(); return '~ vibe engaged ~'; },
        ring: () => cfg.ring ? `${cfg.ring.name}: ${cfg.ring.home}` : 'no webring',
        counter: () => { const c = document.querySelector('[data-counter]'); return c ? 'souls counted: ' + c.textContent : 'counter lives in the About window'; },
        clear: () => { out.textContent = ''; return null; },
        reboot: () => { reboot(); return 'rebooting…'; },
        shutdown: () => { shutdown(); return 'goodbye.'; },
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault(); const line = inp.value.trim(); inp.value = ''; if (!line) return;
        hist.push(line); hi = hist.length; print('> ' + line);
        const [c, ...rest] = line.split(/\s+/); const fn = cmds[c.toLowerCase()];
        const r = fn ? fn(rest.join(' ')) : `command not found: ${c}`;
        if (r != null) print(r);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' && hi > 0) { inp.value = hist[--hi]; e.preventDefault(); }
        if (e.key === 'ArrowDown') { inp.value = hi < hist.length - 1 ? hist[++hi] : ''; hi = Math.min(hi, hist.length); e.preventDefault(); }
      });
      setTimeout(() => inp.focus({ preventScroll: true }), 50);
    },
    settings(body) {
      const row = (label, ctl) => h('label', {}, h('span', {}, label), ctl);
      const sel = h('select', { onchange: (e) => { set.wall = e.target.value; saveSet(); applyWall(); } },
        ...[['ascii', 'Live ASCII'], ['pixel', 'Live 3D (pixel)'], ['still', 'Still (saves battery)']].map(([v, t]) => h('option', { value: v, selected: set.wall === v }, t)));
      const den = h('input', { type: 'range', min: 60, max: 160, value: set.density, oninput: (e) => { set.density = +e.target.value; saveSet(); if (view) { view.setDensity(set.density); if (set.wall === 'still') wallLoop.renderOnce(); } } });
      const chk = (k, fn) => h('input', { type: 'checkbox', checked: !!set[k], onchange: (e) => { set[k] = e.target.checked; saveSet(); fn && fn(); } });
      const snd = h('input', { type: 'checkbox', checked: !sfx.muted, onchange: (e) => { sfx.setMuted(!e.target.checked); syncTray(); } });
      const pal = h('select', { onchange: (e) => { set.palette = e.target.value; saveSet(); if (view) { view.setPalette(set.palette); if (set.wall === 'still') wallLoop.renderOnce(); } } },
        ...[['color', 'Full colour'], ['amber', 'Phosphor amber'], ['phosphor', 'Phosphor green']].map(([v, t]) => h('option', { value: v, selected: (set.palette || 'color') === v }, t)));
      body.append(h('div', { class: 'set' },
        row('Wallpaper', sel), row('Palette', pal), row('Glyph grid  [ ]', den),
        row('CRT scanlines', chk('crt', () => document.body.classList.toggle('crt-on', set.crt))),
        row('Boot screen', chk('boot')), row('Sound', snd),
        row('Sound only from the active window', chk('soloAudio', syncAudio)),
        h('p', { class: 'dim', style: 'margin:6px 0 0;font-size:11px' }, 'Settings stay on this device only. Wallpaper pauses itself when a window is maximized or the tab is hidden.')));
    },
  };
  for (const [k, fn] of Object.entries(cfg.native || {})) NATIVE[k] = fn;

  /* ---------- desktop icons ---------- */
  const iconsEl = $('#icons'); let selIcon = null;
  for (const id of cfg.desktop) {
    const a = APPS.get(id); if (!a) continue;
    const b = h('button', { class: 'ico', role: 'listitem', title: a.desc || a.name, 'data-id': id }, h('span', { class: 'g', 'aria-hidden': 'true' }, a.icon || '▪'), h('span', { class: 'l' }, a.name));
    b.addEventListener('click', (e) => {
      sfx.unlock();
      if (coarse() || e.detail === 0) { open(id); return; } // touch or keyboard: single activation
      if (selIcon) selIcon.classList.remove('sel'); selIcon = b; b.classList.add('sel');
    });
    b.addEventListener('dblclick', () => open(id));
    iconsEl.append(b);
  }
  $('#desk').addEventListener('pointerdown', (e) => { if (e.target.id === 'icons' || e.target.id === 'wall' || e.target.closest('#wall')) { if (selIcon) selIcon.classList.remove('sel'); selIcon = null; } });

  /* ---------- start menu ---------- */
  const menu = $('#menu'), startBtn = $('#start'), ul = $('ul', menu);
  const item = (a) => h('li', {}, h('button', { onclick: () => { toggleMenu(false); open(a); } }, h('span', { class: 'g' }, a.icon || '▪'), a.name));
  for (const grp of cfg.menu) {
    if (grp === '-') { ul.append(h('li', { class: 'sep', role: 'separator' })); continue; }
    if (grp.head) ul.append(h('li', { class: 'head' }, grp.head));
    for (const id of grp.items) { const a = typeof id === 'string' ? APPS.get(id) : id; if (a) ul.append(item(a)); }
  }
  ul.append(h('li', { class: 'sep', role: 'separator' }),
    h('li', {}, h('button', { onclick: () => { toggleMenu(false); reboot(); } }, h('span', { class: 'g' }, '↻'), 'Restart')),
    h('li', {}, h('button', { onclick: () => { toggleMenu(false); shutdown(); } }, h('span', { class: 'g' }, '⏻'), 'Shut Down…')));
  function toggleMenu(on = menu.hidden) {
    menu.hidden = !on; startBtn.setAttribute('aria-expanded', String(on));
    if (on) { sfx.unlock(); sfx.beep(880, 0.04, 'square', 0.03); const f = $('button', ul); f && f.focus({ preventScroll: true }); }
  }
  startBtn.addEventListener('click', () => toggleMenu());
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !startBtn.contains(e.target)) toggleMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { toggleMenu(false); startBtn.focus(); }
    if ((e.key === 'Meta' || e.key === 'OS') && !e.repeat) { /* leave the real OS key alone */ }
  });

  /* ---------- tray ---------- */
  const clockEl = $('#clock');
  const tick = () => { const d = new Date(); clockEl.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);
  const syncTray = () => { $('#tSnd').textContent = sfx.muted ? '♪̸' : '♪'; $('#tSnd').style.opacity = sfx.muted ? 0.5 : 1; };
  $('#tSnd').addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); syncTray(); if (!sfx.muted) sfx.beep(660, 0.08, 'triangle', 0.05); });
  $('#tWall').addEventListener('click', () => { const order = ['ascii', 'pixel', 'still']; set.wall = order[(order.indexOf(set.wall) + 1) % 3]; saveSet(); applyWall(); });
  syncTray();

  /* ---------- [ ] resize the glyph grid (desktop focus only) ---------- */
  document.addEventListener('keydown', (e) => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if ((e.key === '[' || e.key === ']') && view) {
      set.density = clamp(set.density + (e.key === ']' ? 12 : -12), 60, 170); saveSet(); view.setDensity(set.density);
      if (set.wall === 'still') wallLoop.renderOnce();
    }
  });

  /* ---------- vibe easter egg (site tradition: type "vibe" anywhere) ---------- */
  let buf = '';
  function vibe() {
    document.body.style.transition = 'filter .12s'; document.body.style.filter = 'hue-rotate(140deg) saturate(1.6)';
    sfx.beep(523, 0.08, 'square', 0.04); setTimeout(() => sfx.beep(784, 0.1, 'square', 0.04), 90);
    setTimeout(() => { document.body.style.filter = ''; }, 420);
  }
  document.addEventListener('keydown', (e) => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key.length !== 1) return; buf = (buf + e.key.toLowerCase()).slice(-4);
    if (buf === 'vibe') { buf = ''; vibe(); }
  });

  /* ---------- boot / shutdown ---------- */
  function startupChime() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx.beep(f, 0.22, 'triangle', 0.05), i * 110)); }
  function runBoot() {
    return new Promise((done) => {
      let skip = false; const first = !sessionStorage.getItem('updoge-os-booted');
      if (!set.boot || !first) { done(); return; }
      try { sessionStorage.setItem('updoge-os-booted', '1'); } catch (e) { /* ignore */ }
      const el = h('div', { id: 'boot', role: 'status', 'aria-label': 'Booting' }, h('pre'), h('div', { class: 'hint' }, 'press any key or tap to skip'));
      document.body.append(el);
      const pre = $('pre', el);
      const finish = () => {
        if (skip) return; skip = true; sfx.unlock();
        el.classList.add('done'); setTimeout(() => el.remove(), 380); startupChime(); done();
      };
      el.addEventListener('pointerdown', finish); addEventListener('keydown', finish, { once: true });
      const lines = cfg.bootLines || [];
      if (reduced()) { pre.innerHTML = (cfg.bootLogo || '') + '\n' + lines.join('\n'); setTimeout(finish, 900); return; }
      pre.innerHTML = `<span class="logo">${esc(cfg.bootLogo || '')}</span>\n`;
      let i = 0;
      const step = () => {
        if (skip) return;
        if (i >= lines.length) { setTimeout(finish, 650); return; }
        const L = lines[i++]; pre.innerHTML += esc(L).replace(/\b(OK|READY)\b/g, '<span class="ok">$1</span>') + '\n';
        setTimeout(step, 90 + Math.random() * 140);
      };
      setTimeout(step, 350);
    });
  }
  function shutdown() {
    for (const k of [...wins.keys()]) close(k); // close() pauses each window's audio first
    if (wallLoop) wallLoop.stop();
    const off = $('#off'); $('pre', off).textContent = cfg.shutdownArt || "It's now safe to turn off\nyour computer.";
    off.hidden = false; off.focus();
    [784, 659, 523, 392].forEach((f, i) => setTimeout(() => sfx.beep(f, 0.2, 'triangle', 0.05), i * 120));
    const back = () => { try { sessionStorage.removeItem('updoge-os-booted'); } catch (e) { /* ignore */ } location.reload(); };
    off.onclick = back; off.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') back(); };
  }
  function reboot() { try { sessionStorage.removeItem('updoge-os-booted'); } catch (e) { /* ignore */ } location.reload(); }

  /* ---------- go ---------- */
  const api = { open, close, focus, minimize, wins, store, sfx, set, vibe, shutdown, reboot };
  window.UPDOGE_OS = api;
  runBoot().then(() => {
    const m = location.hash.match(/open=([\w-]+)/);
    if (m && APPS.has(m[1])) open(m[1]);
    else if (cfg.autoOpen && !small()) open(cfg.autoOpen);
  });
  return api;
}

/* JSONP visitor counter helper (the site's own Apps Script backend). */
export function jsonpCounter(url, el, width = 6) {
  const draw = (s) => { el.textContent = s; };
  draw('-'.repeat(width));
  if (!url) return;
  const cb = '__updogeHits' + Math.random().toString(36).slice(2, 8);
  window[cb] = (r) => { if (r && typeof r.hits === 'number') draw(String(r.hits).padStart(width, '0')); delete window[cb]; };
  const s = document.createElement('script');
  s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
  s.onerror = () => draw('-'.repeat(width));
  document.head.append(s);
}
