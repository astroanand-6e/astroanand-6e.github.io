/**
 * Portfolio page figure: the five hero scenes on one scrub bar. Durations and overlaps come from
 * js/hero/config.js (read only); if that import fails the same values are used from FALLBACK.
 */
import { initProject, htmlEl } from './common.js';

const FALLBACK = Object.freeze([
  { id: 'intro', duration: 10, overlap: 0 }, { id: 'palm', duration: 13, overlap: 1 }, { id: 'eyes', duration: 14, overlap: 2.2 },
  { id: 'desk', duration: 12, overlap: 5 }, { id: 'handoff', duration: 8, overlap: 2 },
]);
const VH_PER_SECOND = 36; // percent of a screen height per second, VH_PER_SECOND_DESKTOP in the config
const NOTES = Object.freeze({
  intro: ['Intro', 'The character stands in front of my name, alive with small idle motion. Scrolling ignites the eyes while the camera pushes in. Canvas effects.'],
  palm: ['Palm', 'An arm swings up into an open palm, built from drawn frames with optical-flow in-betweens. A WebGL vortex pulls four tool icons in and a crown forms.'],
  eyes: ['Eyes', 'A close-up. A red-sky shader floods out from the eyes, then the portrait breaks apart into crows.'],
  desk: ['Desk', 'Seeded Canvas crows fly at the camera and the desk scene opens up behind them.'],
  handoff: ['Burn', 'A WebGL burn clears the desk away, leaving the page colour for the next section. Copy about music appears in the ash.'],
});

async function loadScenes() {
  try {
    const mod = await import('../hero/config.js');
    return Array.isArray(mod.SCENES) && mod.SCENES.length ? mod.SCENES : FALLBACK;
  } catch (error) {
    return FALLBACK;
  }
}

function layout(scenes) {
  let start = 0;
  return scenes.map((scene, i) => {
    const begin = i === 0 ? 0 : start - scene.overlap;
    start = begin + scene.duration;
    return { id: scene.id, begin, end: start };
  });
}

async function init() {
  const track = document.getElementById('film-track');
  const range = document.getElementById('film-t');
  if (!track || !range) return;
  const spans = layout(await loadScenes());
  const total = Math.max(...spans.map((s) => s.end));
  range.max = total.toFixed(1);

  const row = htmlEl('li', { class: 'film-row' });
  const els = spans.map((span) => {
    const el = htmlEl('span', { class: 'film-scene' }, (NOTES[span.id] || [span.id])[0]);
    el.style.left = `${(span.begin / total) * 100}%`;
    el.style.width = `${((span.end - span.begin) / total) * 100}%`;
    row.append(el);
    return el;
  });
  const head = htmlEl('i', { class: 'film-head', 'aria-hidden': 'true' });
  row.append(head);
  track.replaceChildren(row);

  const render = () => {
    const t = Number(range.value);
    const live = spans.filter((s) => t >= s.begin && t <= s.end);
    els.forEach((el, i) => el.classList.toggle('is-live', live.includes(spans[i])));
    head.style.left = `${(t / total) * 100}%`;
    document.getElementById('film-out').textContent = `${t.toFixed(1)} s`;
    const main = live[live.length - 1] || spans[0];
    const note = NOTES[main.id] || [main.id, ''];
    const both = live.length > 1 ? ` Two scenes overlap here: ${live.map((s) => (NOTES[s.id] || [s.id])[0]).join(' and ')}.` : '';
    document.getElementById('film-read').replaceChildren(htmlEl('p', {}, `${note[0]}, ${t.toFixed(1)} s in, about ${((t * VH_PER_SECOND) / 100).toFixed(1)} screen heights down the page. ${note[1]}${both}`));
  };
  range.addEventListener('input', render);
  render();
}

initProject();
init();
