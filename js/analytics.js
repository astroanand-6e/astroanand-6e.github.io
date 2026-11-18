// Vercel Web Analytics (page views, referrers, countries, devices, plus a few interaction events) and
// Speed Insights (real-visitor Core Web Vitals). Both scripts only exist on Vercel deployments once each is
// enabled in the project dashboard, so they load off localhost only. Every page loads this module.
const SCRIPTS = Object.freeze(['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);
const CHAPTER_SELECTOR = '[data-chapter]';
const CHAPTER_VISIBLE_RATIO = 0.5;

const isLocal = LOCAL_HOSTS.has(location.hostname);

function installQueue() {
  window.va = window.va || function queue(...args) {
    (window.vaq = window.vaq || []).push(args);
  };
  window.si = window.si || function queue(...args) {
    (window.siq = window.siq || []).push(args);
  };
}

function loadScripts() {
  SCRIPTS.forEach((src) => {
    const script = document.createElement('script');
    script.defer = true;
    script.src = src;
    script.onerror = () => console.warn(`Analytics script failed to load: ${src}`);
    document.head.append(script);
  });
}

export function track(name, data) {
  if (isLocal) return;
  window.va('event', data ? { name, data } : { name });
}

function linkLabel(link) {
  const href = link.getAttribute('href') || '';
  if (href.endsWith('.pdf')) return 'resume';
  if (href.startsWith('mailto:')) return 'email';
  if (link.host && link.host !== location.host) return link.host.replace(/^www\./, '');
  return null;
}

function onClick(event) {
  const link = event.target.closest && event.target.closest('a[href]');
  if (!link) return;
  const label = linkLabel(link);
  if (label) track('Link', { label });
}

function watchChapters() {
  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.dataset.chapter;
      if (!entry.isIntersecting || seen.has(id)) return;
      seen.add(id);
      track('Chapter', { id });
    });
  }, { threshold: CHAPTER_VISIBLE_RATIO });
  document.querySelectorAll(CHAPTER_SELECTOR).forEach((el) => observer.observe(el));
}

function init() {
  if (isLocal) return;
  installQueue();
  loadScripts();
  document.addEventListener('click', onClick);
  window.addEventListener('break', () => track('Break it'));
  window.addEventListener('theme', (event) => track('Theme', { to: String(event.detail?.theme ?? event.detail ?? '') }));
  if ('IntersectionObserver' in window) watchChapters();
}

init();
