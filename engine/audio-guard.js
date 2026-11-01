/* UDG audio guard — stops music from "persisting" after you leave.
 *
 * Load it FIRST in <head>, before any script that makes sound:
 *   <script src="/engine/audio-guard.js"></script>
 *
 * What it does, for every page and game that includes it:
 *  - Tracks every AudioContext and <audio>/<video> element the page creates.
 *  - Pauses all of them when the page is hidden (tab switch, phone locked), unloaded,
 *    or when the UPDOGE OS says so (window minimized, or another window is active).
 *  - While paused, new notes are swallowed instead of piling up, so nothing bursts out on resume.
 *  - Passes pause/resume on to same-origin child frames (e.g. games inside The Crossroads).
 *
 * API: window.UDGAudio.pause(reason) · .resume(reason) · .isPaused() · .contexts
 * Reasons stack: sound returns only when every reason that paused it has been lifted.
 */
(function () {
  'use strict';
  if (window.UDGAudio) return;
  var reasons = Object.create(null);
  var contexts = [];
  var resumeLater = new WeakSet();   // contexts that were running when we paused
  var mediaLater = new Set();        // media elements that were playing when we paused
  var swallowed = new WeakSet();     // source nodes whose start() we skipped while paused
  var paused = function () { for (var k in reasons) if (reasons[k]) return true; return false; };

  // resume() may live on AudioContext.prototype or BaseAudioContext.prototype depending on the browser:
  // remember the real one, and patch it wherever it is actually defined.
  var CtxClasses = [window.AudioContext, window.webkitAudioContext, window.BaseAudioContext].filter(Boolean);
  var origResume = null;
  for (var ci = 0; ci < CtxClasses.length && !origResume; ci++) if (CtxClasses[ci].prototype.resume) origResume = CtxClasses[ci].prototype.resume;

  function track(ctx) {
    contexts.push(ctx);
    if (paused()) { resumeLater.add(ctx); try { ctx.suspend(); } catch (e) { /* ignore */ } }
  }
  function wrap(C) {
    if (!C) return C;
    try {
      var W = class extends C { constructor() { super(...arguments); track(this); } };
      Object.defineProperty(W, 'name', { value: C.name });
      return W;
    } catch (e) { return C; }
  }
  if (window.AudioContext) window.AudioContext = wrap(window.AudioContext);
  if (window.webkitAudioContext) window.webkitAudioContext = wrap(window.webkitAudioContext);

  // While paused, a page calling ctx.resume() (most do, on every note) must not wake the audio.
  CtxClasses.forEach(function (C) {
    var proto = C.prototype;
    if (!Object.prototype.hasOwnProperty.call(proto, 'resume')) return;
    var own = proto.resume;
    proto.resume = function () {
      if (paused() && contexts.indexOf(this) >= 0) { resumeLater.add(this); return Promise.resolve(); }
      return own.apply(this, arguments);
    };
  });
  // Swallow notes scheduled while paused (otherwise they all fire at once on resume).
  function patchStart(proto) {
    if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'start')) return;
    var orig = proto.start;
    proto.start = function () {
      if (paused() && contexts.indexOf(this.context) >= 0) { swallowed.add(this); return; }
      return orig.apply(this, arguments);
    };
  }
  if (window.AudioScheduledSourceNode) {
    patchStart(window.AudioScheduledSourceNode.prototype);
    var origStop = window.AudioScheduledSourceNode.prototype.stop;
    window.AudioScheduledSourceNode.prototype.stop = function () {
      if (swallowed.has(this)) return; // never started: stopping it would throw
      return origStop.apply(this, arguments);
    };
  }
  if (window.AudioBufferSourceNode) patchStart(window.AudioBufferSourceNode.prototype);
  if (window.OscillatorNode) patchStart(window.OscillatorNode.prototype);
  if (window.ConstantSourceNode) patchStart(window.ConstantSourceNode.prototype);

  // <audio>/<video>, including new Audio() objects that never enter the page.
  var media = new Set();
  if (window.HTMLMediaElement) {
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      media.add(this);
      if (paused()) { mediaLater.add(this); return Promise.resolve(); }
      return origPlay.apply(this, arguments);
    };
  }

  function forward(action, reason) {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { var A = frames[i].contentWindow && frames[i].contentWindow.UDGAudio; if (A && A !== api) A[action](reason); } catch (e) { /* cross-origin */ }
    }
  }
  function doPause() {
    contexts.forEach(function (c) { if (c.state === 'running') { resumeLater.add(c); try { c.suspend(); } catch (e) { /* ignore */ } } });
    media.forEach(function (m) { if (!m.paused) { mediaLater.add(m); try { m.pause(); } catch (e) { /* ignore */ } } });
  }
  function doResume() {
    contexts.forEach(function (c) { if (resumeLater.has(c)) { resumeLater.delete(c); if (c.state === 'suspended' && origResume) origResume.call(c).catch(function () {}); } });
    mediaLater.forEach(function (m) { try { var p = m.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } });
    mediaLater.clear();
  }
  var api = {
    pause: function (reason) { reason = reason || 'manual'; var was = paused(); reasons[reason] = true; if (!was) doPause(); forward('pause', reason); },
    resume: function (reason) { reason = reason || 'manual'; delete reasons[reason]; if (!paused()) doResume(); forward('resume', reason); },
    isPaused: paused,
    reasons: function () { return Object.keys(reasons); },
    contexts: contexts,
  };
  window.UDGAudio = api;

  // Leaving the page / hiding the tab
  function vis() { if (document.hidden) api.pause('hidden'); else api.resume('hidden'); }
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', function () { api.pause('hidden'); });
  window.addEventListener('pageshow', function () { if (!document.hidden) api.resume('hidden'); });
  // The UPDOGE OS (or any same-origin parent) can also ask: {udgAudio:'pause'|'resume', reason}
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object' || !d.udgAudio) return;
    if (e.origin !== location.origin && e.origin !== 'null') return;
    if (d.udgAudio === 'pause') api.pause(d.reason || 'os'); else if (d.udgAudio === 'resume') api.resume(d.reason || 'os');
  });
  if (document.hidden) api.pause('hidden');
})();
