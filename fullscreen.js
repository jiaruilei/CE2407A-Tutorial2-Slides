// Native fullscreen when available; otherwise let the presentation expand in CSS.
export function createFullscreenController({ document: doc, onChange = () => {}, onFallback = () => {} }) {
  if (!doc?.documentElement) throw new TypeError('A document with a root element is required.');
  const root = doc.documentElement;
  let fallback = false, rejectedEntry = false, pending = null, disposed = false;
  const transitions = new Set();

  function nativeElement() {
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.webkitCurrentFullScreenElement ||
      (doc.webkitIsFullScreen ? root : null);
  }

  function nativeAPI() {
    if (typeof root.requestFullscreen === 'function' && typeof doc.exitFullscreen === 'function' && doc.fullscreenEnabled !== false) {
      return { request: root.requestFullscreen, exit: doc.exitFullscreen };
    }
    const request = root.webkitRequestFullscreen || root.webkitRequestFullScreen;
    const exit = doc.webkitExitFullscreen || doc.webkitCancelFullScreen;
    if (typeof request === 'function' && typeof exit === 'function' && doc.webkitFullscreenEnabled !== false) return { request, exit };
    return null;
  }

  function state() {
    const native = Boolean(nativeElement());
    return { expanded: native || fallback, mode: native ? 'native' : fallback ? 'fallback' : 'none',
      pending: Boolean(pending), nativeSupported: !rejectedEntry && Boolean(nativeAPI()) };
  }

  function notify() { if (!disposed) onChange(state()); }
  function setFallback(value) {
    if (fallback === value || disposed) return;
    fallback = value;
    onFallback(value);
  }

  // Older WebKit methods return void and report their result through events.
  function watchTransition() {
    let settle, timer;
    const promise = new Promise(resolve => {
      settle = reason => { clearTimeout(timer); transitions.delete(settle); resolve(reason); };
      transitions.add(settle);
      timer = setTimeout(() => settle('timeout'), 1500);
    });
    return { promise, cancel: () => settle('cancelled') };
  }

  function changed() {
    if (nativeElement()) setFallback(false);
    for (const settle of [...transitions]) settle('change');
    notify();
  }
  function failed() {
    for (const settle of [...transitions]) settle('error');
  }
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) doc.addEventListener(name, changed);
  for (const name of ['fullscreenerror', 'webkitfullscreenerror']) doc.addEventListener(name, failed);

  async function enter() {
    const api = !rejectedEntry && nativeAPI();
    if (!api) { setFallback(true); return; }
    const transition = watchTransition();
    try {
      const result = api.request.call(root);
      if (result && typeof result.then === 'function') await result;
      if (!nativeElement() && !disposed) await transition.promise;
      if (!nativeElement() && !disposed) { rejectedEntry = true; setFallback(true); }
    } catch {
      if (!disposed && !nativeElement()) { rejectedEntry = true; setFallback(true); }
    } finally { transition.cancel(); }
    if (nativeElement()) setFallback(false);
  }

  async function leave() {
    if (!nativeElement()) { setFallback(false); return; }
    const exit = doc.fullscreenElement && typeof doc.exitFullscreen === 'function' ? doc.exitFullscreen :
      doc.webkitExitFullscreen || doc.webkitCancelFullScreen || doc.exitFullscreen;
    if (typeof exit !== 'function') return;
    const transition = watchTransition();
    try {
      const result = exit.call(doc);
      if (result && typeof result.then === 'function') await result;
      if (nativeElement() && !disposed) await transition.promise;
      if (!nativeElement()) setFallback(false);
    } catch { /* Keep reporting native fullscreen if the browser could not exit. */ }
    finally { transition.cancel(); }
  }

  function run(action) {
    if (disposed) return Promise.resolve(state());
    if (pending) return pending;
    let resolveOperation, rejectOperation;
    const operation = new Promise((resolve, reject) => { resolveOperation = resolve; rejectOperation = reject; });
    pending = operation;
    notify();
    // Keep the request inside the original click handler for older WebKit's
    // user-gesture requirement, while publishing the pending promise first.
    void (async () => {
      let failure;
      try { if (!disposed) await action(); }
      catch (error) { failure = error; }
      pending = null;
      notify();
      if (failure) rejectOperation(failure);
      else resolveOperation(state());
    })();
    return operation;
  }

  notify();
  return {
    toggle: () => run(() => state().expanded ? leave() : enter()),
    exit: () => run(leave),
    isExpanded: () => state().expanded,
    dispose() {
      if (disposed) return;
      if (fallback) setFallback(false);
      disposed = true;
      for (const name of ['fullscreenchange', 'webkitfullscreenchange']) doc.removeEventListener(name, changed);
      for (const name of ['fullscreenerror', 'webkitfullscreenerror']) doc.removeEventListener(name, failed);
      for (const settle of [...transitions]) settle('disposed');
    }
  };
}
