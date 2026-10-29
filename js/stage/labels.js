import * as THREE from 'three';
import { EDGE_PAD, TOPBAR_INSET_PX, NARROW_SLOT_PX, NARROW_BAND_ROWS, NARROW_ROW_PX } from './slots.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ROW_GAP = 17;
const MAX_ROW_GAP = 30;
const ELBOW_MIN_PX = 14;
const DOT_RADIUS = 1.5;
const SILHOUETTE_SHARE = 0.86;
const FOCUS_SLACK = 1.12;
const SMOOTH_RATE = 18;
const SNAP_PX = 0.5;
const NARROW_MAX_LABELS = NARROW_BAND_ROWS * 2;
const UNCROSS_PASSES = 3;
const FALLBACK_COLUMN_PX = 150;

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

const pad2 = (n) => String(n).padStart(2, '0');
const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function segmentsCross(a, b) {
  const d1 = cross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d2 = cross(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const d3 = cross(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d4 = cross(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Anchors count when inside any focus zone, or else inside the focus sphere. */
function isInFocus(point, focus) {
  if (focus.zones && focus.zones.length) {
    return focus.zones.some((zone) => point.distanceTo(zone.center) <= zone.radius);
  }
  return point.distanceTo(focus.center) <= focus.radius * FOCUS_SLACK;
}

/** Spreads sorted ideal y values apart by `gap` inside [top, bottom]. */
function relax(ys, gap, top, bottom) {
  const out = ys.map((y) => Math.min(Math.max(y, top), bottom));
  for (let i = 1; i < out.length; i += 1) out[i] = Math.max(out[i], out[i - 1] + gap);
  const over = out.length ? out[out.length - 1] - bottom : 0;
  if (over > 0) {
    out[out.length - 1] = bottom;
    for (let i = out.length - 2; i >= 0; i -= 1) out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  return out;
}

/**
 * Anatomy-plate callouts for the ACTIVE station: two columns of numbered
 * labels either side of the object's silhouette, each joined to its anchor by
 * a hairline leader that ends in a 3px dot. Labels are sorted by anchor y and
 * then uncrossed, so leaders never intersect.
 */
export function createLabels() {
  const layer = document.createElement('div');
  layer.className = 'stage-labels';
  layer.setAttribute('aria-hidden', 'true');
  const svg = svgEl('svg', { class: 'stage-labels__svg' });
  layer.appendChild(svg);
  document.body.appendChild(layer);

  const stations = new Map();
  const world = new THREE.Vector3();
  let lastActive = null;
  let columnPx = FALLBACK_COLUMN_PX;

  function remeasure() {
    let widest = 0;
    stations.forEach((entries) => {
      entries.forEach((entry) => {
        entry.width = entry.el.offsetWidth;
        widest = Math.max(widest, entry.width);
      });
    });
    if (widest > 0) columnPx = widest;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  function makeEntry(anchor, index) {
    const el = document.createElement('div');
    el.className = 'stage-label';
    const num = document.createElement('span');
    num.className = 'stage-label__n';
    num.textContent = pad2(index + 1);
    const name = document.createElement('span');
    name.className = 'stage-label__t';
    name.textContent = anchor.label;
    el.append(num, name);
    const group = svgEl('g', { class: 'stage-leader' });
    const line = svgEl('polyline', { fill: 'none', pathLength: 1 });
    const dot = svgEl('circle', { r: DOT_RADIUS });
    group.append(line, dot);
    layer.appendChild(el);
    svg.appendChild(group);
    return { anchor, index, el, group, line, dot, width: 0, y: NaN, sx: 0, sy: 0, isOn: false, isHot: false };
  }

  function setStation(id, anchors) {
    removeStation(id);
    const entries = anchors.map(makeEntry);
    stations.set(id, entries);
    requestAnimationFrame(remeasure);
  }

  function removeStation(id) {
    const entries = stations.get(id);
    if (!entries) return;
    entries.forEach(({ el, group }) => {
      el.remove();
      group.remove();
    });
    stations.delete(id);
  }

  function setOn(entry, isOn, order = 0) {
    if (entry.isOn !== isOn) {
      entry.isOn = isOn;
      if (isOn) {
        entry.el.style.setProperty('--i', order);
        entry.group.style.setProperty('--i', order);
        entry.y = NaN;
      }
      entry.el.classList.toggle('is-on', isOn);
      entry.group.classList.toggle('is-on', isOn);
    }
  }

  function setHot(entry, isHot) {
    if (entry.isHot === isHot) return;
    entry.isHot = isHot;
    entry.el.classList.toggle('is-hot', isHot);
    entry.group.classList.toggle('is-hot', isHot);
  }

  function hideStation(entries) {
    if (entries) entries.forEach((entry) => setOn(entry, false));
  }

  function project(entry, camera, view, focus, bounds) {
    entry.anchor.object3D.getWorldPosition(world);
    const inFocus = !focus || isInFocus(world, focus);
    world.project(camera);
    if (!inFocus || world.z > 1 || world.z < -1) return false;
    entry.sx = view.left + (world.x * 0.5 + 0.5) * view.width;
    entry.sy = view.top + (-world.y * 0.5 + 0.5) * view.height;
    return (
      entry.sx > bounds.left &&
      entry.sx < bounds.right &&
      entry.sy > bounds.top &&
      entry.sy < bounds.bottom
    );
  }

  function sample(list, cap) {
    if (list.length <= cap) return list;
    return Array.from({ length: cap }, (_, i) => list[Math.floor((i * list.length) / cap)]);
  }

  function leaderEnd(entry, side, edge, silhouette) {
    const reach = silhouette.r * SILHOUETTE_SHARE;
    const base = side < 0 ? edge + entry.width + ELBOW_MIN_PX : edge - entry.width - ELBOW_MIN_PX;
    const wanted = silhouette.x + side * reach;
    const toAnchor = entry.sx - side * 6;
    if (side < 0) return Math.max(base, Math.min(wanted, toAnchor));
    return Math.min(base, Math.max(wanted, toAnchor));
  }

  /** Assigns a row y to every entry of one column; returns them in row order. */
  function layoutColumn(column, side, edge, silhouette, limits) {
    column.sort((a, b) => a.sy - b.sy);
    const span = Math.max(limits.bottom - limits.top, 1);
    const gap = Math.min(MAX_ROW_GAP, Math.max(MIN_ROW_GAP, span / Math.max(column.length, 1)));
    const rows = relax(column.map((e) => e.sy), gap, limits.top, limits.bottom);
    const ends = column.map((entry) => leaderEnd(entry, side, edge, silhouette));
    const segment = (i, order) => ({ x1: ends[order[i]], y1: rows[i], x2: column[order[i]].sx, y2: column[order[i]].sy });
    const order = column.map((_, i) => i);
    for (let pass = 0; pass < UNCROSS_PASSES; pass += 1) {
      let swapped = false;
      for (let i = 0; i < order.length - 1; i += 1) {
        for (let j = i + 1; j < order.length; j += 1) {
          if (!segmentsCross(segment(i, order), segment(j, order))) continue;
          [order[i], order[j]] = [order[j], order[i]];
          swapped = true;
        }
      }
      if (!swapped) break;
    }
    return order.map((k, i) => ({ entry: column[k], end: ends[k], row: rows[i] }));
  }

  /**
   * Phone layout (leading = left-aligned stack above the object, trailing =
   * right-aligned stack below it). Upper anchors lead, lower anchors trail. Rows run in descending
   * anchor x, so a leader that drops to its anchor never crosses a lower rule.
   */
  function layoutBands(shown, bounds, limits) {
    const bySy = [...shown].sort((a, b) => a.sy - b.sy);
    const upper = bySy.slice(0, Math.ceil(bySy.length / 2)).sort((a, b) => b.sx - a.sx);
    const lower = bySy.slice(upper.length).sort((a, b) => b.sx - a.sx);
    const left = bounds.left + EDGE_PAD;
    const right = bounds.right - EDGE_PAD;
    const firstLower = limits.bottom - (lower.length - 1) * NARROW_ROW_PX;
    return {
      leading: upper.map((entry, i) => ({
        entry,
        row: limits.top + i * NARROW_ROW_PX,
        end: Math.max(left + entry.width + ELBOW_MIN_PX, entry.sx),
      })),
      trailing: lower.map((entry, i) => ({
        entry,
        row: firstLower + i * NARROW_ROW_PX,
        end: Math.min(right - entry.width - ELBOW_MIN_PX, entry.sx),
      })),
    };
  }

  function draw({ entry, end, row }, side, edge, dt) {
    setOn(entry, true, entry.index);
    if (!Number.isFinite(entry.y)) entry.y = row;
    else if (Math.abs(row - entry.y) < SNAP_PX) entry.y = row;
    else entry.y += (row - entry.y) * (1 - Math.exp(-SMOOTH_RATE * dt));
    const y = entry.y;
    entry.line.setAttribute('points', `${edge},${y} ${end},${y} ${entry.sx},${entry.sy}`);
    entry.dot.setAttribute('cx', entry.sx);
    entry.dot.setAttribute('cy', entry.sy);
    const shift = side < 0 ? '0, -100%' : '-100%, -100%';
    entry.el.style.transform = `translate(${edge}px, ${y}px) translate(${shift})`;
    entry.el.classList.toggle('is-right', side > 0);
  }

  /**
   * ctx: activeId, isShown, hoverLabel, camera, view (canvas rect), bounds
   * (slot rect, viewport px), silhouette {x, y, r}, focus {center, radius}, dt.
   */
  function update(ctx) {
    const { activeId, isShown, hoverLabel, camera, view, bounds, silhouette, focus, dt } = ctx;
    if (activeId !== lastActive) {
      stations.forEach((entries, id) => id !== activeId && hideStation(entries));
      lastActive = activeId;
    }
    const entries = stations.get(activeId);
    if (!entries || !isShown) {
      hideStation(entries);
      return;
    }
    const limits = {
      top: Math.max(bounds.top, view.top + TOPBAR_INSET_PX) + EDGE_PAD,
      bottom: bounds.bottom - EDGE_PAD,
    };
    const isNarrow = bounds.width < NARROW_SLOT_PX;
    const visible = entries.filter((entry) => project(entry, camera, view, focus, bounds));
    const shown = sample(visible, isNarrow ? NARROW_MAX_LABELS : visible.length);
    entries.forEach((entry) => !shown.includes(entry) && setOn(entry, false));

    const leftEdge = bounds.left + EDGE_PAD;
    const rightEdge = bounds.right - EDGE_PAD;
    let columns;
    if (isNarrow) {
      columns = layoutBands(shown, bounds, limits);
    } else {
      const byX = [...shown].sort((a, b) => a.sx - b.sx);
      const leftCount = Math.ceil(byX.length / 2);
      columns = {
        leading: layoutColumn(byX.slice(0, leftCount), -1, leftEdge, silhouette, limits),
        trailing: layoutColumn(byX.slice(leftCount), 1, rightEdge, silhouette, limits),
      };
    }
    columns.leading.forEach((item) => draw(item, -1, leftEdge, dt));
    columns.trailing.forEach((item) => draw(item, 1, rightEdge, dt));
    entries.forEach((entry) => setHot(entry, entry.isOn && entry.anchor.label === hoverLabel));
  }

  function dispose() {
    layer.remove();
    stations.clear();
  }

  return { setStation, removeStation, update, dispose, columnWidth: () => columnPx };
}
