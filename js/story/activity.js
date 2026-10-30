/** Hero activity control: radiogroup that drives the 3D character and mirrors its auto-cycle. */
const AUTO = 'auto';
const LABELS = { coding: 'coding', gaming: 'gaming', mixing: 'mixing' };

export function initActivity() {
  const group = document.getElementById('activity-group');
  if (!group) return;
  const radios = [...group.querySelectorAll('[role="radio"]')];
  const autoBtn = document.getElementById('activity-auto');
  const live = document.getElementById('activity-live');
  let isManual = false;

  const paint = (value) => {
    radios.forEach((radio) => {
      const isOn = radio.dataset.value === value;
      radio.setAttribute('aria-checked', String(isOn));
      radio.tabIndex = isOn ? 0 : -1;
    });
    if (!radios.some((r) => r.tabIndex === 0) && radios[0]) radios[0].tabIndex = 0;
  };
  const paintAuto = () => autoBtn?.setAttribute('aria-pressed', String(!isManual));
  const send = (value) => window.dispatchEvent(new CustomEvent('control', { detail: { action: 'activity', value } }));

  const choose = (radio) => {
    const { value } = radio.dataset;
    const wasActive = radio.getAttribute('aria-checked') === 'true';
    if (isManual && wasActive) {
      isManual = false;
      paintAuto();
      if (live) live.textContent = 'Now: auto-cycling';
      send(AUTO);
      return;
    }
    isManual = true;
    paint(value);
    paintAuto();
    if (live) live.textContent = `Now: ${LABELS[value]}`;
    send(value);
  };

  group.addEventListener('click', (event) => {
    const radio = event.target.closest('[role="radio"]');
    if (radio) choose(radio);
  });
  group.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = radios.indexOf(document.activeElement);
    const next = radios[(at + step + radios.length) % radios.length];
    next.focus();
    isManual = false;
    choose(next);
  });
  autoBtn?.addEventListener('click', () => {
    if (!isManual) return;
    isManual = false;
    paintAuto();
    if (live) live.textContent = 'Now: auto-cycling';
    send(AUTO);
  });
  window.addEventListener('activity-change', (event) => {
    const value = event.detail?.value;
    if (value in LABELS) paint(value);
  });
  paint('coding');
  paintAuto();
}
