// Include the source tutorial in statement keys so question numbers stay unambiguous.
const SLIDE_KEY = /^(?:slide-[1-5](?::expanded)?|question-t1-q[67]|question-t2-q[12]|whiteboard)$/;
const MAX_STROKES = 5000;
const MAX_POINTS = 200000;
const MAX_COORDINATE = 1e7;
const EMPTY = Object.freeze([]);
const validatedStrokes = new WeakSet();

function validPoint(point) {
  return point !== null && typeof point === 'object' && !Array.isArray(point) &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Math.abs(point.x) <= MAX_COORDINATE && Math.abs(point.y) <= MAX_COORDINATE;
}

function plainRecord(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function slideKey(value) {
  if (typeof value !== 'string' || !SLIDE_KEY.test(value)) throw new TypeError('Invalid annotation slide ID.');
  return value;
}

function immutableStroke(stroke) {
  if (stroke !== null && typeof stroke === 'object' && validatedStrokes.has(stroke)) return stroke;
  if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke) ||
      typeof stroke.id !== 'string' || !stroke.id.trim() || stroke.id.length > 128 ||
      !['pen', 'highlighter'].includes(stroke.tool) ||
      typeof stroke.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(stroke.color) ||
      !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 40 ||
      !['slide', 'question'].includes(stroke.anchor) ||
      !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > MAX_POINTS) {
    throw new TypeError('Invalid annotation stroke.');
  }
  const points = stroke.points.map(point => {
    if (!validPoint(point)) throw new TypeError('Invalid annotation coordinates.');
    return Object.freeze({ x: point.x, y: point.y });
  });
  const result = Object.freeze({
    id: stroke.id, tool: stroke.tool, color: stroke.color.toLowerCase(), width: stroke.width,
    anchor: stroke.anchor, points: Object.freeze(points)
  });
  validatedStrokes.add(result);
  return result;
}

function snapshot(strokes, totals = { strokes: 0, points: 0 }) {
  if (!Array.isArray(strokes) || strokes.length + totals.strokes > MAX_STROKES) throw new RangeError('Too many annotation strokes.');
  const ids = new Set();
  const result = strokes.map(stroke => {
    // Check the size before allocating a copy of the coordinates.
    if (!Array.isArray(stroke?.points) || stroke.points.length + totals.points > MAX_POINTS) throw new RangeError('Too many annotation points.');
    const value = immutableStroke(stroke);
    if (ids.has(value.id)) throw new TypeError('Duplicate annotation stroke ID.');
    ids.add(value.id);
    totals.strokes += 1;
    totals.points += value.points.length;
    return value;
  });
  return result.length ? Object.freeze(result) : EMPTY;
}

function sameSnapshot(a, b) {
  return a.length === b.length && a.every((stroke, index) => {
    const other = b[index];
    return stroke === other || (stroke.id === other.id && stroke.tool === other.tool &&
      stroke.color === other.color && stroke.width === other.width && stroke.anchor === other.anchor &&
      stroke.points.length === other.points.length && stroke.points.every((point, i) =>
        point.x === other.points[i].x && point.y === other.points[i].y));
  });
}

/** Immutable slide snapshots. The limit includes the current revision. */
export class InkHistory {
  #slides = new Map();
  #maxHistory;

  constructor(options = {}) {
    const maxHistory = typeof options === 'number' ? options : options.maxHistory ?? 50;
    if (!Number.isInteger(maxHistory) || maxHistory < 1 || maxHistory > 50) throw new RangeError('History limit must be from 1 to 50.');
    this.#maxHistory = maxHistory;
  }

  get(slideId) {
    const entry = this.#slides.get(slideKey(slideId));
    return entry ? entry.revisions[entry.index] : EMPTY;
  }

  #totalsExcept(slideId) {
    const totals = { strokes: 0, points: 0 };
    for (const [key, entry] of this.#slides) {
      if (key === slideId) continue;
      const current = entry.revisions[entry.index];
      totals.strokes += current.length;
      totals.points += current.reduce((sum, stroke) => sum + stroke.points.length, 0);
    }
    return totals;
  }

  commit(slideId, strokes) {
    const key = slideKey(slideId);
    const next = snapshot(strokes, this.#totalsExcept(key));
    const current = this.get(key);
    if (sameSnapshot(current, next)) return false;
    const previous = this.#slides.get(key) || { revisions: [EMPTY], index: 0 };
    const revisions = previous.revisions.slice(0, previous.index + 1);
    revisions.push(next);
    if (revisions.length > this.#maxHistory) revisions.splice(0, revisions.length - this.#maxHistory);
    this.#slides.set(key, { revisions, index: revisions.length - 1 });
    return true;
  }

  add(slideId, stroke) { return this.commit(slideId, [...this.get(slideId), stroke]); }
  clear(slideId) { return this.commit(slideId, EMPTY); }

  #canMove(slideId, direction) {
    const key = slideKey(slideId), entry = this.#slides.get(key);
    if (!entry || entry.index + direction < 0 || entry.index + direction >= entry.revisions.length) return false;
    // Other slides may have gained ink since this older snapshot was recorded.
    // Restoring it must respect the same document-wide storage limits.
    const target = entry.revisions[entry.index + direction], totals = this.#totalsExcept(key);
    return target.length + totals.strokes <= MAX_STROKES &&
      target.reduce((sum, stroke) => sum + stroke.points.length, totals.points) <= MAX_POINTS;
  }

  canUndo(slideId) { return this.#canMove(slideId, -1); }
  canRedo(slideId) { return this.#canMove(slideId, 1); }

  #move(slideId, direction) {
    if (!this.#canMove(slideId, direction)) return false;
    const entry = this.#slides.get(slideId);
    entry.index += direction;
    return true;
  }

  undo(slideId) { return this.#move(slideId, -1); }
  redo(slideId) { return this.#move(slideId, 1); }

  serialize() {
    const slides = {};
    for (const [key, entry] of this.#slides) {
      const current = entry.revisions[entry.index];
      if (current.length) slides[key] = current;
    }
    return { version: 1, slides };
  }

  /** Replace saved ink atomically. Invalid data leaves existing ink/history intact. */
  load(payload) {
    try {
      if (typeof payload === 'string') {
        if (payload.length > 20000000) return false;
        payload = JSON.parse(payload);
      }
      if (!plainRecord(payload) || !Object.hasOwn(payload, 'version') || payload.version !== 1 ||
          !Object.hasOwn(payload, 'slides') || !plainRecord(payload.slides)) return false;
      const totals = { strokes: 0, points: 0 }, next = new Map();
      for (const key of Object.keys(payload.slides)) {
        slideKey(key);
        next.set(key, { revisions: [snapshot(payload.slides[key], totals)], index: 0 });
      }
      this.#slides = next;
      return true;
    } catch (_) { return false; }
  }
}

/** Map viewport coordinates through a scaled slide rectangle without clamping. */
export function pointFromClient(clientX, clientY, rect, width = 1280, height = 720) {
  if (![clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, width, height].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) throw new TypeError('Invalid drawing rectangle.');
  return { x: (clientX - rect.left) * width / rect.width, y: (clientY - rect.top) * height / rect.height };
}

/** Clip an eraser sweep to the visible question viewport. Boundary hits count. */
export function clipSegmentToRect(from, to, rect) {
  if (!validPoint(from) || !validPoint(to) ||
      ![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) ||
      rect.width < 0 || rect.height < 0) return null;
  const right = rect.x + rect.width, bottom = rect.y + rect.height;
  if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  const p = [-dx, dx, -dy, dy];
  const q = [from.x - rect.x, right - from.x, from.y - rect.y, bottom - from.y];
  let enter = 0, leave = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const position = q[i] / p[i];
    if (p[i] < 0) enter = Math.max(enter, position);
    else leave = Math.min(leave, position);
    if (enter > leave) return null;
  }
  return {
    from: { x: from.x + enter * dx, y: from.y + enter * dy },
    to: { x: from.x + leave * dx, y: from.y + leave * dy }
  };
}

function pointSegmentDistanceSquared(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  const x = from.x + t * dx - point.x, y = from.y + t * dy - point.y;
  return x * x + y * y;
}

function cross(a, b, p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
function opposite(a, b) { return (a < 0 && b > 0) || (a > 0 && b < 0); }
function segmentDistanceSquared(a, b, c, d) {
  if (opposite(cross(a, b, c), cross(a, b, d)) && opposite(cross(c, d, a), cross(c, d, b))) return 0;
  return Math.min(pointSegmentDistanceSquared(a, c, d), pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b), pointSegmentDistanceSquared(d, a, b));
}

/** Whole-stroke erasing using the entire swept eraser path, including crossings. */
export function segmentHitsStroke(stroke, from, to, radius) {
  if (!validPoint(from) || !validPoint(to) || !Number.isFinite(radius) || radius < 0 ||
      !Number.isFinite(stroke?.width) || stroke.width < 1 || stroke.width > 40 ||
      !Array.isArray(stroke.points) || !stroke.points.length || !stroke.points.every(validPoint)) return false;
  const limit = (radius + stroke.width / 2) ** 2;
  if (stroke.points.length === 1) return pointSegmentDistanceSquared(stroke.points[0], from, to) <= limit;
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (segmentDistanceSquared(from, to, stroke.points[i - 1], stroke.points[i]) <= limit) return true;
  }
  return false;
}
