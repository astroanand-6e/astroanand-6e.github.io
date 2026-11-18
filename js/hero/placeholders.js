/* Stand-in artwork, same sizes and aspect ratios as the real cutouts, until the files land in
   assets/hero/. Silhouettes only: dark bodies with a red rim light. */
import { ASPECT, IMAGE_SIZE, REAL_IMAGES, heroImage } from './config.js';

const RIM = '#ff2a1f';
const BODY = 'url(#b)';
const DEFS = `<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202020"/><stop offset="1" stop-color="#060606"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2a1f"/><stop offset="1" stop-color="#7a0500"/></linearGradient>
<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff2a1f" stop-opacity=".5"/><stop offset="1" stop-color="#ff2a1f" stop-opacity="0"/></radialGradient>
</defs>`;

const COAT_RIGHT = 'M470 250 Q560 270 585 360 L610 760 L560 780 L540 520 L545 1130 L400 1130 L400 250 Z';
const COAT_LEFT_RELAXED = 'M330 250 Q240 270 215 360 L190 760 L240 780 L260 520 L255 1130 L400 1130 L400 250 Z';
const COAT_LEFT_RAISED = 'M330 250 Q250 262 225 340 L170 600 L215 640 L236 540 L268 560 L262 520 L270 1130 L400 1130 L400 250 Z';

function figure(leftSide, extra) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200">${DEFS}
<g fill="${BODY}" stroke="#4a4a4a" stroke-width="2">
<path d="${leftSide}"/><path d="${COAT_RIGHT}"/>
<rect x="272" y="1124" width="110" height="64" rx="10"/><rect x="418" y="1124" width="110" height="64" rx="10"/>
<ellipse cx="400" cy="172" rx="58" ry="72"/><rect x="372" y="230" width="56" height="44"/></g>
<path d="M342 150 Q348 92 400 90 Q452 92 458 150 Q430 122 400 124 Q370 122 342 150Z" fill="#050505"/>
<path d="M388 262 L412 262 L418 1130 L382 1130Z" fill="url(#r)"/>
<path d="M330 252 L400 330 L470 252" fill="none" stroke="${RIM}" stroke-width="3" opacity=".7"/>
<path d="M215 360 Q240 270 330 250 M585 360 Q560 270 470 250" fill="none" stroke="${RIM}" stroke-width="2" opacity=".35"/>
${extra}</svg>`;
}

const PALM_HAND = '<g stroke="#6a6a6a" stroke-width="2" fill="#2a2420"><ellipse cx="248" cy="540" rx="30" ry="44"/><path d="M226 506 l-6 -34 M242 498 l-2 -42 M258 498 l4 -40 M272 508 l12 -30" stroke-width="9" stroke-linecap="round"/></g><circle cx="248" cy="540" r="90" fill="url(#g)" opacity=".5"/>';

function eyes() {
  const eye = (x) => `<ellipse cx="${x}" cy="405" rx="64" ry="15" fill="#000" stroke="#3a3a3a" stroke-width="2"/><ellipse cx="${x}" cy="405" rx="20" ry="13" fill="#2a0604"/><path d="M${x - 78} 372 Q${x} 340 ${x + 78} 372" fill="none" stroke="#050505" stroke-width="12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">${DEFS}
<path d="M0 900 L0 790 Q300 720 600 760 Q900 720 1200 790 L1200 900Z" fill="#050505" stroke="${RIM}" stroke-width="3" opacity=".9"/>
<ellipse cx="600" cy="430" rx="300" ry="380" fill="${BODY}" stroke="#4a4a4a" stroke-width="2"/>
<path d="M300 400 Q290 120 600 70 Q910 120 900 400 Q860 250 600 230 Q340 250 300 400Z" fill="#050505"/>
${eye(438)}${eye(762)}
<path d="M600 430 L580 560 Q600 580 620 560 Z" fill="#0b0b0b" opacity=".8"/>
<path d="M520 690 Q600 710 680 690" fill="none" stroke="#050505" stroke-width="9" stroke-linecap="round"/></svg>`;
}

function desk() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">${DEFS}
<rect width="1200" height="900" fill="#070606"/>
<ellipse cx="860" cy="360" rx="420" ry="300" fill="url(#g)" opacity=".5"/>
<rect x="680" y="250" width="380" height="250" rx="10" fill="#14090a" stroke="${RIM}" stroke-width="3"/>
<rect x="700" y="270" width="340" height="210" fill="#2a0806"/><path d="M730 320h180M730 360h250M730 400h140" stroke="${RIM}" stroke-width="6" opacity=".7"/>
<rect x="845" y="500" width="50" height="110" fill="#111"/>
<rect x="0" y="640" width="1200" height="260" fill="#0d0d0d"/><rect x="0" y="636" width="1200" height="5" fill="${RIM}" opacity=".5"/>
<rect x="640" y="650" width="320" height="26" rx="6" fill="#1b1b1b"/>
<circle cx="360" cy="372" r="66" fill="${BODY}" stroke="#4a4a4a" stroke-width="2"/>
<path d="M220 640 Q230 470 360 440 Q500 470 520 640Z" fill="${BODY}" stroke="#4a4a4a" stroke-width="2"/>
<path d="M520 560 L640 640" stroke="#222" stroke-width="40" stroke-linecap="round"/></svg>`;
}

const BUILDERS = {
  stand: () => figure(COAT_LEFT_RELAXED, ''),
  palm: () => figure(COAT_LEFT_RAISED, PALM_HAND),
  eyes,
  desk,
};

export function placeholderUrl(name) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BUILDERS[name]())}`;
}

export const imageUrl = (name) => (REAL_IMAGES[name] ? heroImage(name) : placeholderUrl(name));

/* Sets src (and intrinsic size) on every <img data-hx-img="name"> under root. */
export function hydrateImages(root) {
  root.querySelectorAll('img[data-hx-img]').forEach((img) => {
    const name = img.dataset.hxImg;
    img.src = imageUrl(name);
    img.closest('.hx-figure')?.style.setProperty('--ar', String(ASPECT[name]));
    const real = REAL_IMAGES[name] && IMAGE_SIZE[name];
    img.width = real ? real[0] : Math.round(1200 * Math.min(1, ASPECT[name]));
    img.height = real ? real[1] : Math.round(img.width / ASPECT[name]);
  });
}
