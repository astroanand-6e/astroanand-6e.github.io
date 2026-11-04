/** Small SVG and math helpers shared by the controller parts. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const SCALLOP_STEPS = 8;

const isChild = (child) => child !== undefined && child !== null && child !== false;

/** parent.append that flattens arrays and skips null, undefined and false. Returns the parent. */
export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) if (isChild(child)) parent.append(child);
  return parent;
}

/** Creates an SVG element. Null, undefined and false attributes or children are skipped. */
export function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(name, String(value));
  }
  return append(node, ...children);
}

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fixed = (n) => Number(n.toFixed(2));
export const roundTo = (value, places = 4) => Number(value.toFixed(places));

/** Point on a circle. 0 degrees is 12 o'clock, clockwise is positive. */
export function polar(r, deg, cx = 0, cy = 0) {
  const a = deg * DEG;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** Open arc path on a circle around the origin, clockwise from fromDeg to toDeg. */
export function arcPath(r, fromDeg, toDeg) {
  const [x0, y0] = polar(r, fromDeg);
  const [x1, y1] = polar(r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg >= fromDeg ? 1 : 0;
  return `M${fixed(x0)} ${fixed(y0)}A${r} ${r} 0 ${large} ${sweep} ${fixed(x1)} ${fixed(y1)}`;
}

/** Closed outline of a disc whose edge has shallow grip dimples, like a jog wheel rim. */
export function scallopPath(r, depth, lobes) {
  const total = lobes * SCALLOP_STEPS;
  let path = '';
  for (let i = 0; i < total; i += 1) {
    const deg = (i / total) * 360;
    const radius = r - depth * (0.5 + 0.5 * Math.cos(lobes * deg * DEG));
    const [x, y] = polar(radius, deg);
    path += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(y)}`;
  }
  return `${path}Z`;
}

/** Visitor-friendly clock: 83.4 becomes "1:23.4". */
export function formatClock(seconds, places = 1) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const rest = (safe - minutes * 60).toFixed(places).padStart(places ? 3 + places : 2, '0');
  return `${minutes}:${rest}`;
}
