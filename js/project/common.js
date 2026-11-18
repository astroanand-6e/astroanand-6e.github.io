/**
 * Shared behaviour for the project explainer pages: theme, T shortcut, reveal on scroll,
 * figure helpers (SVG builder, button groups, in-view loops) and the previous/next pager.
 */
import { initTheme, toggleTheme } from '../theme.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

/** Work-grid order. Each page's pager walks this list. */
export const PROJECTS = Object.freeze([
  { slug: 'calm', title: 'CALM', href: '/projects/calm' },
  { slug: 'astro', title: 'Astro', href: '/projects/astro' },
  { slug: 'coronarysam2', title: 'CoronarySAM2', href: '/projects/coronarysam2' },
  { slug: 'cdss', title: 'Failure-aware CDSS', href: '/projects/cdss' },
  { slug: 'beta-vae', title: 'β-VAE write-up', href: '/papers' },
  { slug: 'resformer', title: 'ResFormer', href: '/projects/resformer' },
  { slug: 'ventureviz', title: 'VentureViz', href: '/projects/ventureviz' },
  { slug: 'portfolio', title: 'This website', href: '/projects/portfolio' },
]);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Create an SVG element with attributes; children are appended in order. */
export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  children.forEach((child) => el.append(child));
  return el;
}

/** Create an HTML element. */
export function htmlEl(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  if (text) el.textContent = text;
  return el;
}

/** Clamp a number into [low, high]. */
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Treat buttons inside `container` as a single-choice group (aria-pressed).
 * `onSelect(button)` runs on click; returns select(button) to change the choice from code.
 */
export function buttonGroup(container, selector, onSelect) {
  const buttons = Array.from(container.querySelectorAll(selector));
  const select = (target) => {
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button === target)));
    onSelect(target);
  };
  buttons.forEach((button) => button.addEventListener('click', () => select(button)));
  container.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[(index + step + buttons.length) % buttons.length];
    next.focus();
    select(next);
  });
  return select;
}

/**
 * Run `start()` while `el` is on screen and `stop()` when it leaves. Under reduced motion
 * nothing starts: callers draw the end state themselves.
 */
export function whileInView(el, start, stop) {
  if (reducedMotion() || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
  }, { threshold: 0.15 });
  observer.observe(el);
}

function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-in'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((item) => observer.observe(item));
}

function initPager() {
  const mount = document.getElementById('pager');
  if (!mount) return;
  const slug = mount.dataset.slug;
  const index = PROJECTS.findIndex((project) => project.slug === slug);
  if (index < 0) return;
  const prev = PROJECTS[(index - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(index + 1) % PROJECTS.length];
  const link = (project, cls, dir) => {
    const a = htmlEl('a', { class: cls, href: project.href });
    a.append(htmlEl('span', { class: 'dir' }, dir), htmlEl('span', { class: 'ttl' }, project.title));
    return a;
  };
  const all = htmlEl('a', { class: 'all', href: '/#index' });
  all.append(htmlEl('span', { class: 'dir' }, 'Back'), htmlEl('span', { class: 'ttl' }, 'All work'));
  mount.replaceChildren(link(prev, 'prev', 'Previous'), all, link(next, 'next', 'Next'));
}

function onKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest && event.target.closest(TEXT_INPUT_SELECTOR)) return;
  if ((event.key || '').toLowerCase() === 't') toggleTheme();
}

/** Call once from each page module, then start that page's figure. */
export function initProject() {
  initTheme();
  initReveal();
  initPager();
  document.addEventListener('keydown', onKeydown);
}
