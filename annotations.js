import { InkHistory, pointFromClient, segmentHitsStroke, clipSegmentToRect } from './annotations-model.js?v=whiteboard-1';

const NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'ce2407a-tutorial2-slides:ink:v1';
const WIDTH = 1280, HEIGHT = 720;
const makeSVG = (tag, attributes = {}) => {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};

export function installAnnotations(deck, notice) {
  const history = new InkHistory();
  const toolbar = document.getElementById('ink-toolbar');
  const toggle = document.getElementById('ink-toggle');
  const thickness = document.getElementById('ink-width');
  const status = document.getElementById('ink-status');
  const undo = document.getElementById('ink-undo');
  const redo = document.getElementById('ink-redo');
  const clear = document.getElementById('ink-clear');
  const toolButtons = [...toolbar.querySelectorAll('[data-ink-tool]')];
  const colorButtons = [...toolbar.querySelectorAll('[data-ink-color]')];
  const surfaces = new Map();
  const colors = { pen: '#e53935', highlighter: '#ffd43b' };
  let tool = 'pointer', open = false, active = null, scheduled = false;
  let storageWarning = false, touchBeforeInk = true;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !history.load(saved)) notice('Saved ink could not be read. New ink is ready.');
  } catch { /* Drawing still works when browser storage is unavailable. */ }

  const currentSlide = () => deck.getCurrentSlide() || document.getElementById('slide-1');
  const slideKey = slide => `${slide.id}${slide.querySelector('.web-panel.is-expanded') ? ':expanded' : ''}`;
  const currentKey = () => slideKey(currentSlide());
  const inRect = (point, rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

  function save(key) {
    try {
      // Only replace the edited view, preserving saved ink on other slides
      // if the presentation is also open in another tab.
      const latest = new InkHistory();
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) latest.load(stored);
      const payload = latest.serialize();
      const strokes = history.get(key);
      if (strokes.length) payload.slides[key] = strokes;
      else delete payload.slides[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      status.textContent = 'Ink saved in this browser.';
    } catch {
      status.textContent = 'Ink is available for this session only.';
      if (!storageWarning) notice('Browser storage is unavailable. Keep this tab open to retain ink.');
      storageWarning = true;
    }
  }

  // Question coordinates belong to the iframe document, so ink follows scrolling.
  // Separate normal/expanded histories avoid reflow moving annotations onto other text.
  function frameGeometry(slide, surface) {
    const frame = slide.querySelector('iframe');
    if (!frame || !frame.hasAttribute('src')) return null;
    try {
      if (!frame.contentDocument?.body) return null;
      const rect = frame.getBoundingClientRect();
      const slideRect = surface.getBoundingClientRect();
      const scale = slideRect.width / WIDTH;
      if (!scale || !rect.width || !rect.height) return null;
      const x = (rect.left - slideRect.left) / scale;
      const y = (rect.top - slideRect.top) / scale;
      return { x, y, width: rect.width / scale, height: rect.height / scale,
        scrollX: frame.contentWindow.scrollX, scrollY: frame.contentWindow.scrollY,
        rect };
    } catch { return null; }
  }

  function toInk(point, anchor, geometry) {
    return anchor === 'question' && geometry
      ? { x: point.x - geometry.x + geometry.scrollX, y: point.y - geometry.y + geometry.scrollY }
      : point;
  }

  function toSlide(point, anchor, geometry) {
    return anchor === 'question'
      ? { x: point.x + geometry.x - geometry.scrollX, y: point.y + geometry.y - geometry.scrollY }
      : point;
  }

  function strokePath(points) {
    return points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  }

  function render() {
    scheduled = false;
    for (const [slide, surface] of surfaces) {
      const geometry = frameGeometry(slide, surface);
      const clipId = `${slide.id}-ink-clip`;
      const nodes = [];
      if (geometry) {
        const defs = makeSVG('defs'), clip = makeSVG('clipPath', { id: clipId });
        clip.append(makeSVG('rect', { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }));
        defs.append(clip); nodes.push(defs);
      }
      const key = slideKey(slide);
      const strokes = active?.key === key ? active.strokes : history.get(key);
      const all = active?.key === key && active.stroke ? [...strokes, active.stroke] : strokes;
      for (const stroke of all) {
        if (stroke.anchor === 'question' && !geometry) continue;
        const points = stroke.points.map(point => toSlide(point, stroke.anchor, geometry));
        const attributes = { 'data-stroke-id': stroke.id, 'data-anchor': stroke.anchor,
          opacity: stroke.tool === 'highlighter' ? .32 : 1 };
        if (stroke.anchor === 'question') attributes['clip-path'] = `url(#${clipId})`;
        if (points.length === 1) nodes.push(makeSVG('circle', {
          ...attributes, cx: points[0].x, cy: points[0].y, r: stroke.width / 2, fill: stroke.color
        }));
        else nodes.push(makeSVG('path', { ...attributes, d: strokePath(points), fill: 'none',
          stroke: stroke.color, 'stroke-width': stroke.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      }
      surface.replaceChildren(...nodes);
      surface.dataset.strokeCount = String(all.length);
      surface.classList.toggle('is-drawing', open && tool !== 'pointer' && !deck.isOverview());
      surface.classList.toggle('is-erasing', tool === 'eraser');
    }
    updateControls();
  }

  function requestRender() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(render); }
  }

  function updateControls() {
    const key = currentKey();
    undo.disabled = !history.canUndo(key);
    redo.disabled = !history.canRedo(key);
    clear.disabled = history.get(key).length === 0;
    toolButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inkTool === tool)));
    colorButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inkColor === colors[tool === 'highlighter' ? 'highlighter' : 'pen'])));
    thickness.disabled = tool === 'pointer' || tool === 'eraser';
  }

  function finish() {
    if (!active) return;
    const gesture = active;
    active = null;
    if (gesture.surface.hasPointerCapture?.(gesture.pointerId)) gesture.surface.releasePointerCapture(gesture.pointerId);
    try {
      const changed = gesture.stroke ? history.add(gesture.key, gesture.stroke) : history.commit(gesture.key, gesture.strokes);
      if (changed) save(gesture.key);
    } catch {
      notice('This ink could not be saved. Clear some ink and try again.');
    }
    requestRender();
  }

  function selectTool(value) {
    finish();
    const wasDrawing = tool !== 'pointer';
    tool = value;
    if (!wasDrawing && tool !== 'pointer') { touchBeforeInk = deck.getConfig().touch; deck.configure({ touch: false }); }
    if (wasDrawing && tool === 'pointer') deck.configure({ touch: touchBeforeInk });
    status.textContent = tool === 'pointer' ? 'Pointer. Question controls are available.' : `${tool === 'pen' ? 'Pen' : tool === 'highlighter' ? 'Highlighter' : 'Eraser'} selected.`;
    requestRender();
  }

  function setOpen(value) {
    open = value;
    toolbar.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('ink-toolbar-open', open);
    selectTool(open ? 'pen' : 'pointer');
    deck.layout();
    requestRender();
  }

  function addPoint(event) {
    if (!active || active.pointerId !== event.pointerId) return;
    const rect = active.surface.getBoundingClientRect();
    const point = pointFromClient(event.clientX, event.clientY, rect, WIDTH, HEIGHT);
    const geometry = frameGeometry(active.slide, active.surface);
    if (active.stroke) {
      const p = toInk(point, active.stroke.anchor, geometry);
      const last = active.stroke.points[active.stroke.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= .7) active.stroke.points.push(p);
    } else {
      const from = active.lastPoint || point;
      active.strokes = active.strokes.filter(stroke => {
        const sweep = stroke.anchor === 'question'
          ? geometry && clipSegmentToRect(from, point, geometry)
          : { from, to: point };
        if (!sweep) return true;
        return !segmentHitsStroke(stroke, toInk(sweep.from, stroke.anchor, geometry), toInk(sweep.to, stroke.anchor, geometry), 13);
      });
    }
    active.lastPoint = point;
    requestRender();
  }

  for (const slide of document.querySelectorAll('.slides > section')) {
    const surface = makeSVG('svg', { class: 'ink-surface', viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      'aria-label': `Ink for ${slide.dataset.title}`, role: 'img', 'data-stroke-count': 0 });
    slide.append(surface);
    surfaces.set(slide, surface);
    surface.addEventListener('pointerdown', event => {
      if (!open || tool === 'pointer' || deck.isOverview() || active || (event.button !== 0 && event.button !== 5) || event.isPrimary === false) return;
      event.preventDefault(); event.stopPropagation();
      const rect = surface.getBoundingClientRect();
      const point = pointFromClient(event.clientX, event.clientY, rect, WIDTH, HEIGHT);
      const geometry = frameGeometry(slide, surface);
      const anchor = geometry && inRect({x:event.clientX,y:event.clientY},geometry.rect) ? 'question' : 'slide';
      const erasing = tool === 'eraser' || event.button === 5;
      active = { key: slideKey(slide), slide, surface, pointerId: event.pointerId, strokes: [...history.get(slideKey(slide))], lastPoint: point,
        stroke: erasing ? null : { id: crypto.randomUUID(), tool, color: colors[tool],
          width: Number(thickness.value) * (tool === 'highlighter' ? 4 : 1), anchor, points: [toInk(point, anchor, geometry)] } };
      surface.setPointerCapture(event.pointerId);
      if (erasing) addPoint(event);
      requestRender();
    });
    surface.addEventListener('pointermove', event => {
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) addPoint(sample);
    });
    surface.addEventListener('pointerup', event => {
      if (active?.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); addPoint(event); finish();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) surface.addEventListener(name, event => {
      if (active?.pointerId === event.pointerId) finish();
    });
    surface.addEventListener('contextmenu', event => { if (tool !== 'pointer') event.preventDefault(); });
    const frame = slide.querySelector('iframe');
    frame?.addEventListener('load', () => {
      try { frame.contentWindow.addEventListener('scroll', requestRender, { passive: true }); }
      catch { /* Cross-origin frames retain slide-coordinate annotations. */ }
      requestRender();
    });
  }

  toggle.addEventListener('click', () => setOpen(!open));
  toolButtons.forEach(button => button.addEventListener('click', () => selectTool(button.dataset.inkTool)));
  colorButtons.forEach(button => button.addEventListener('click', () => {
    if (tool !== 'pen' && tool !== 'highlighter') selectTool('pen');
    colors[tool] = button.dataset.inkColor;
    updateControls();
  }));
  function edit(action) {
    finish();
    if (history[action](currentKey())) save(currentKey());
    requestRender();
  }
  undo.addEventListener('click', () => edit('undo'));
  redo.addEventListener('click', () => edit('redo'));
  clear.addEventListener('click', () => edit('clear'));
  // Capture before Reveal, and leave ordinary input/iframe editing alone.
  document.addEventListener('keydown', event => {
    if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'Escape' && open && tool !== 'pointer') {
      selectTool('pointer'); event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (active) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!open || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      edit(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('blur', finish);
  window.addEventListener('resize', () => { finish(); requestRender(); });
  document.addEventListener('fullscreenchange', () => { finish(); requestRender(); });
  document.addEventListener('tutorial:layout', () => { finish(); requestRender(); });
  deck.on('slidechanged', () => { finish(); requestRender(); });
  deck.on('overviewshown', () => { finish(); selectTool('pointer'); requestRender(); });
  deck.on('overviewhidden', requestRender);
  deck.on('ready', requestRender);
}
