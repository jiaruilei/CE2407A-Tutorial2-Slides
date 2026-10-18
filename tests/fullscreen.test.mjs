import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullscreenController } from '../fullscreen.js';

function fixture(configure = () => {}) {
  const listeners = new Map();
  const doc = {
    documentElement: {}, fullscreenElement: null,
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name) { for (const listener of [...(listeners.get(name) || [])]) listener(); }
  };
  const changes = [], fallbacks = [];
  configure(doc);
  const controller = createFullscreenController({ document: doc, onChange: state => changes.push(state), onFallback: value => fallbacks.push(value) });
  return { doc, changes, fallbacks, controller, last: () => changes.at(-1) };
}

function standard(doc) {
  doc.fullscreenEnabled = true;
  doc.documentElement.requestFullscreen = async function () { assert.equal(this, doc.documentElement); doc.fullscreenElement = this; doc.dispatch('fullscreenchange'); };
  doc.exitFullscreen = async function () { assert.equal(this, doc); doc.fullscreenElement = null; doc.dispatch('fullscreenchange'); };
}

test('missing APIs use CSS expansion and toggle or exit restores normal view', async () => {
  const p = fixture();
  assert.deepEqual(p.last(), { expanded: false, mode: 'none', pending: false, nativeSupported: false });
  assert.equal((await p.controller.toggle()).mode, 'fallback');
  assert.equal(p.controller.isExpanded(), true);
  assert.equal((await p.controller.toggle()).mode, 'none');
  await p.controller.toggle();
  assert.equal((await p.controller.exit()).mode, 'none');
  assert.deepEqual(p.fallbacks, [true, false, true, false]);
  p.controller.dispose();
});

test('disabled capability or a missing native exit method selects fallback without a request', async () => {
  for (const mode of ['disabled', 'no-exit']) {
    let requests = 0;
    const p = fixture(doc => {
      standard(doc);
      doc.documentElement.requestFullscreen = () => { requests++; };
      if (mode === 'disabled') doc.fullscreenEnabled = false;
      else delete doc.exitFullscreen;
    });
    assert.equal(p.last().nativeSupported, false);
    assert.equal((await p.controller.toggle()).mode, 'fallback');
    assert.equal(requests, 0);
    p.controller.dispose();
  }
});

test('standard native entry and exit report actual state and system Escape updates the UI', async () => {
  const p = fixture(standard);
  assert.equal(p.last().nativeSupported, true);
  assert.equal((await p.controller.toggle()).mode, 'native');
  assert.equal(p.controller.isExpanded(), true);
  assert.equal((await p.controller.toggle()).mode, 'none');
  await p.controller.toggle();
  p.doc.fullscreenElement = null;
  p.doc.dispatch('fullscreenchange');
  assert.equal(p.last().expanded, false);
  assert.equal(p.last().mode, 'none');
  assert.deepEqual(p.fallbacks, []);
  p.controller.dispose();
});

test('entry rejection uses CSS fallback and avoids repeated native requests in the session', async () => {
  let requests = 0;
  const p = fixture(doc => {
    standard(doc);
    doc.documentElement.requestFullscreen = async () => { requests++; throw new Error('Not allowed'); };
  });
  assert.deepEqual(await p.controller.toggle(), { expanded: true, mode: 'fallback', pending: false, nativeSupported: false });
  await p.controller.exit();
  await p.controller.toggle();
  assert.equal(requests, 1);
  assert.deepEqual(p.fallbacks, [true, false, true]);
  p.controller.dispose();
});

test('synchronous entry errors also select fallback', async () => {
  const p = fixture(doc => { standard(doc); doc.documentElement.requestFullscreen = () => { throw new Error('Unsupported'); }; });
  assert.equal((await p.controller.toggle()).mode, 'fallback');
  assert.equal(p.last().nativeSupported, false);
  p.controller.dispose();
});

test('double clicks share a pending native operation instead of immediately exiting', async () => {
  let resolveEntry, requests = 0;
  const p = fixture(doc => {
    standard(doc);
    doc.documentElement.requestFullscreen = () => { requests++; return new Promise(resolve => { resolveEntry = resolve; }); };
  });
  const first = p.controller.toggle(), second = p.controller.toggle();
  assert.equal(first, second);
  assert.equal(p.last().pending, true);
  assert.equal(requests, 1, 'native request runs within the original click, before toggle returns');
  p.doc.fullscreenElement = p.doc.documentElement;
  p.doc.dispatch('fullscreenchange');
  resolveEntry();
  assert.equal((await first).mode, 'native');
  assert.equal(p.last().pending, false);
  p.controller.dispose();
});

test('rejected native exit keeps accurate fullscreen state and permits a retry', async () => {
  const p = fixture(standard);
  await p.controller.toggle();
  p.doc.exitFullscreen = async () => { throw new Error('Cannot exit yet'); };
  const failed = await p.controller.exit();
  assert.equal(failed.mode, 'native');
  assert.equal(failed.expanded, true);
  assert.equal(failed.pending, false);
  standard(p.doc);
  assert.equal((await p.controller.exit()).mode, 'none');
  assert.deepEqual(p.fallbacks, []);
  p.controller.dispose();
});

test('WebKit void APIs settle on events and preserve the correct receiver', async () => {
  const p = fixture(doc => {
    doc.webkitFullscreenEnabled = true;
    doc.documentElement.webkitRequestFullscreen = function () {
      assert.equal(this, doc.documentElement);
      queueMicrotask(() => { doc.webkitFullscreenElement = this; doc.dispatch('webkitfullscreenchange'); });
    };
    doc.webkitExitFullscreen = function () {
      assert.equal(this, doc);
      queueMicrotask(() => { doc.webkitFullscreenElement = null; doc.dispatch('webkitfullscreenchange'); });
    };
  });
  assert.equal((await p.controller.toggle()).mode, 'native');
  assert.equal((await p.controller.exit()).mode, 'none');
  assert.deepEqual(p.fallbacks, []);
  p.controller.dispose();
});

test('legacy WebKit aliases with promises and boolean state are supported', async () => {
  const p = fixture(doc => {
    doc.documentElement.webkitRequestFullScreen = async () => { doc.webkitIsFullScreen = true; doc.dispatch('webkitfullscreenchange'); };
    doc.webkitCancelFullScreen = async () => { doc.webkitIsFullScreen = false; doc.dispatch('webkitfullscreenchange'); };
  });
  assert.equal((await p.controller.toggle()).mode, 'native');
  assert.equal((await p.controller.exit()).mode, 'none');
  p.controller.dispose();
});

test('WebKit error events without promises enter fallback', async () => {
  const p = fixture(doc => {
    doc.documentElement.webkitRequestFullscreen = () => queueMicrotask(() => doc.dispatch('webkitfullscreenerror'));
    doc.webkitExitFullscreen = () => {};
  });
  assert.equal((await p.controller.toggle()).mode, 'fallback');
  assert.equal(p.last().nativeSupported, false);
  p.controller.dispose();
});

test('a late native entry removes CSS fallback and native exit does not restore it', async () => {
  const p = fixture();
  await p.controller.toggle();
  p.doc.fullscreenElement = p.doc.documentElement;
  p.doc.dispatch('fullscreenchange');
  assert.equal(p.last().mode, 'native');
  assert.deepEqual(p.fallbacks, [true, false]);
  p.doc.fullscreenElement = null;
  p.doc.dispatch('fullscreenchange');
  assert.equal(p.last().mode, 'none');
  p.controller.dispose();
});

test('dispose removes events and CSS expansion without later callbacks', async () => {
  const p = fixture();
  await p.controller.toggle();
  p.controller.dispose();
  const count = p.changes.length;
  assert.deepEqual(p.fallbacks, [true, false]);
  p.doc.fullscreenElement = p.doc.documentElement;
  p.doc.dispatch('fullscreenchange');
  assert.equal(p.changes.length, count);
  await p.controller.toggle();
  assert.equal(p.changes.length, count);
});
