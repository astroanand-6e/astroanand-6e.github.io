# Performance audit

Scope: make the shipped site load like a produced product. Measured on the
local dev server (`avatar-studio/tools/devserver.py`, port 8081) with Chrome
DevTools (performance trace + Resource Timing API), 1x CPU, no network
throttling, cold reload (cache bypassed). Branch based on `avatar-hero`.

## 0. What actually ships — .vercelignore vs the repo

`.vercelignore` excludes: `mix/`, `room/`, `play/`, `.claude/`, `*.test.js`,
`css/zen-style.css`, `js/zen-script.js`, `fonts/` (the old Bootstrap
glyphicon font files, 220 KB). Everything else in the repo — including
`new_images/` and `assets/img/` — **is deployed**.

That distinction matters for the next section: being in the deploy bundle is
not the same as costing a visitor anything. A browser only downloads a file
if something on the rendered page links to it. An unreferenced file sitting
in the deployed folder adds to repo/deploy size, not to any real page load.

## 1. Orphaned assets — confirmed, and one more set found

**God's finding, independently confirmed**: `new_images/` (12 MB) —
`pfp3.jpg` (4.2 MB), `pfp_2.jpg` (2.9 MB), `pfp.jpg` (2.0 MB),
`KF_Panda_peachtree.jpeg` (1.9 MB), `bonsai_gemini.gif` (672 KB) — are
referenced by nothing in any `.html`/`.js`/`.css` in the repo. I grepped for
each filename across all three extensions; zero hits. `Sakura_petal.png` (one
of the other three files in that folder) is referenced only by
`js/zen-script.js`, which is itself excluded from deploy by `.vercelignore`
and not loaded by `index.html` — so it's also effectively dead.

**Newly found while auditing what does ship**: `assets/img/portrait-1600.{webp,avif}`,
`assets/img/portrait-800.{webp,avif}`, `assets/img/avatar-wave-{768,480}.webp`,
`assets/img/avatar-idle-{768,480}.webp` — 8 files, 636 KB total, already
correctly built as responsive webp/avif pairs — are **also unreferenced**
anywhere in the repo (`index.html`, `room/`, `mix/`, `blog/`: only
`assets/img/favicon.svg` is used). These look like a half-finished responsive
`<picture>` setup for an about-section portrait/avatar that never got wired
into the markup.

**Precision on impact, per the brief's instruction**: none of these 13 files
cost a visitor anything today. They ship to the Vercel deployment bundle
(not excluded) but since nothing links to them, no browser ever requests
them — zero effect on transfer size, LCP, or TTI for an actual page load.
This is a deploy-bloat / repo-hygiene issue, not a page-speed issue. I did
not delete or move anything, per the boundary. Recommend Anand either wire
the portrait/avatar set into an actual `<picture>` element (it's already
correctly built — webp+avif, two sizes) or delete it along with
`new_images/`'s five dead files.

## 2. Images that do ship — audit result

Everything actually linked from `index.html` was already optimized in an
earlier pass: `assets/hero/*.webp` (hero pose frames, 28–52 KB each,
appropriately sized at 768×1024/1024×768/1184×896 for a full-bleed hero that
scales up to large monitors), `assets/img/portrait-*`/`avatar-*` (unused, see
above, but correctly built as responsive webp/avif if ever wired in),
`assets/hero/flow/*.png` (optical-flow fields for `pose-flow.js`, lossless
PNG is correct here — they're interpolation data, not displayed images).
Total shipped `assets/` footprint: **1.1 MB**.

**One real, low-risk win found and applied**: the four orbit icons
(`assets/hero/icons/{vscode,claude,codex,hermes}.webp`) were 256×256 but the
orbit (`css/hero.css:83`, sized via `--u: min(1svh, 0.85vw)`) never displays
them larger than ~173 CSS px even on a 4K monitor at 1x scaling — so 256px
was already headroom beyond 2x-retina need on any realistic screen. I
resized them to 192×192 (safe margin: covers 2x-retina up to ~1920px-tall
logical displays, i.e. any normal laptop/external monitor, with only a
vanishingly-rare 5K-external-at-1x case seeing any softness on a 44–86px
decorative icon) via `dwebp` → `sips` → `cwebp -q 92 -alpha_q 100`, verified
pixel-identical rendering at display scale before committing:

| file | before | after | saved |
|---|---|---|---|
| vscode.webp | 6,634 B | 4,870 B | 27% |
| claude.webp | 12,198 B | 7,906 B | 35% |
| codex.webp | 9,490 B | 7,096 B | 25% |
| hermes.webp | 8,996 B | 6,544 B | 27% |
| **total** | **36.4 KB** | **25.8 KB** | **29% (10.9 KB)** |

Chrome's own `ImageDelivery` insight confirms this: "estimated wasted bytes"
for images dropped from 63.9 KB to 52.6 KB after the swap (the remaining
52.6 KB is the tool's naive per-viewport heuristic flagging the hero
`stand.webp`/`palm.webp` frames again — see "Not touched" below for why I
left those).

**What I did not touch, and why**: Chrome's `ImageDelivery` insight also
flags `assets/hero/stand.webp` and `palm.webp` (768×1024 file vs. 534×712
displayed) for ~14.4 KB savings each. That "displayed size" is measured at
whatever viewport DevTools happened to be at during the trace — these are
full-bleed hero images that scale up to the real viewport width on normal
and large screens, so shrinking them to fit one small test viewport would
visibly soften the hero portrait on anyone's actual monitor. Not a safe
change without a proper responsive `srcset` (a bigger, riskier change than
this audit's "clear win, keep quality" bar), so I left them and I'm flagging
it here instead of guessing.

## 3. Real measured load numbers

Trace via Chrome DevTools Performance panel + `PerformanceObserver`
(largest-contentful-paint), cold reload, localhost, 1x CPU:

| metric | value |
|---|---|
| Total transfer (initial load) | ~990 KB (88–89 requests) |
| DOMContentLoaded | 179 ms |
| Load event | 291 ms |
| TTFB | 1 ms (localhost; not meaningful for prod latency) |
| **LCP** | **1,433 ms** — TTFB 1 ms + render delay 1,432 ms |
| **CLS** | **1.00** (max possible per cluster) |

**The LCP element is not an image.** I confirmed this directly with a
`PerformanceObserver` on `largest-contentful-paint`: the final LCP candidate
is the `<span>` containing "Thakkar" inside `<h1 class="hx-name">` (painted
at ~1,376 ms). The H1 markup (`index.html:107`,
`<h1 class="hx-name"><span>Anand</span> <span>Thakkar</span></h1>`) is
static HTML, not JS-generated — the delay isn't asset download, it's the
render path: ~1.1 s of render-blocking CSS/font loading plus (very likely,
based on the CLS culprit below) the page's own fade-up entrance choreography
holding that text at `opacity: 0` until a `.reveal-on`/`.is-in` class lands
(`css/base.css:126-131`).

**This means image/font compression cannot move LCP on this page** — the
bottleneck is render-path timing and animation choreography, not payload
size. That's a different problem than what items 1–2 of the brief address,
and it's the single biggest lever on this page's numbers if Anand wants it
addressed.

**CLS = 1.00** (max per cluster) happens in a single burst between 216 ms
and 1,332 ms. Chrome's `CLSCulprits` insight attributes it to four Google
Fonts files finishing their network load in that window, impacting a
`::after` pseudo-element. I could not conclusively isolate the exact DOM
node from the trace's generic label, but the timing lines up with the same
fade-up reveal window as the LCP delay above. **I did not touch this.**
Diagnosing or retiming an entrance animation/reveal choreography is a motion
decision, not an asset/network one — it's squarely `worker-portfolio-motion`'s
territory per the parallel dispatch, and the brief's "no bounce/spring/
overshoot" constraint is about exactly this kind of hero-motion code.
Flagging it here with the measured numbers so whoever picks it up isn't
starting blind.

## 4. Font loading (FOUT/FOIT)

Already handled correctly, no changes needed: both Google Fonts `<link>`
tags use `&display=swap` (text renders in a fallback font immediately,
no invisible-text flash), and `<link rel="preconnect">` to
`fonts.googleapis.com`/`fonts.gstatic.com` is already in `index.html:42-43`.
This is the standard low-risk fix and it's already in place — nothing to
change here.

One thing I checked and ruled out: merging the two Google Fonts `<link>`
requests into one URL to cut a render-blocking round trip. **Don't do
this** — the second request
(`...family=Noto+Serif+Devanagari&text=...`) uses Google Fonts' `text=`
subsetting parameter, which applies to the *entire* response, not per
family. Merging it with the Instrument Serif/Geist/Geist Mono request would
subset those fonts down to only the Devanagari phrase's characters and
break all other body text. Leave these as two separate requests.

## 5. Render-blocking resources and long tasks

**Render-blocking on every load**: 2 Google Fonts stylesheet requests + 9
local CSS files (`tokens.css`, `base.css`, `story.css`, `components.css`,
`index.css`, `stage.css`, `hero.css`, `hero-film.css`, `hero-appear.css`) =
11 render-blocking requests before first paint. On localhost this costs
~90 ms total (Chrome's own estimate: 67 ms FCP/LCP savings available). On a
real network with per-request latency this chain would cost meaningfully
more — each of the 9 local CSS files is a separate round trip. **I didn't
merge them.** There's no build/bundle step in this project (plain `<script
type="module">` + hand-written `<link>` tags), so collapsing 9 files into
one means either hand-concatenating maintained source files (fragile, loses
the "many small files" organization) or introducing a build step — both are
real restructuring, outside this audit's "tight, reviewable diff" boundary.
Recommend it as a follow-up if Anand wants a build step added.

**Third-party scripts**: GSAP + ScrollTrigger (jsDelivr), plus — loaded
unconditionally on every page view, before any scroll — Three.js, Pixi.js,
and anime.js, which only drive the below-the-fold DJ/desk/stage scenes.
Combined 3rd-party transfer ~138 KB, ~196 ms of main-thread time from
jsDelivr scripts specifically. **Recommend, didn't implement**: lazy-load
Three.js/Pixi.js/anime.js behind a dynamic `import()` gated on the DJ/desk
scene's own trigger/`IntersectionObserver`, instead of the current eager
load. This is a real, sizeable win (cuts ~100+ KB and a good chunk of
main-thread parse/compile time off the critical path) but it touches the
stage/scene loading architecture (`js/stage/station-loader.js` and
friends), which is more than a tight audit-scope diff — flagging for a
deliberate follow-up rather than doing it here.

**Long tasks**: no standalone "long tasks" insight was available from the
trace tool for this page, but the 196 ms of jsDelivr main-thread time above
(Three.js + Pixi.js + anime.js parse/eval, all loaded eagerly) is the
closest thing to one on this page.

## 6. Caching

Production (`vercel.json`) already sets
`Cache-Control: public, max-age=31536000, immutable` on `/assets/(.*)` —
correct, since hero/icon images are cache-busted via `?v=${IMAGE_VERSION}`
in `js/hero/config.js`. `/css/(.*)` and `/js/(.*)` get no such header and
aren't cache-busted at all (no query param or hash in their URLs), so I
did **not** recommend adding long-lived caching there — doing so without a
cache-busting scheme would mean visitors could get stale JS/CSS after a
deploy. That would need a build step (content-hashed filenames) before it's
safe, same caveat as item 5.

The dev server intentionally sends `Cache-Control: no-store, must-revalidate`
on every response (see its docstring: avoids mixing stale JS modules while
editing) and doesn't gzip/brotli — so the `DocumentLatency` (22.9 KB
"wasted," from missing text compression) and `Cache` (2.1 KB "wasted")
insights the trace reported are dev-server artifacts, not production
issues. Vercel compresses text responses automatically. No action needed.

## Summary — what changed, what I'm recommending, what I couldn't do

**Committed**: resized 4 orbit-icon webps from 256×256 to 192×192
(10.9 KB / 29% smaller, visually unchanged at display scale).

**Confirmed, not changed (listed for Anand's call, nothing deleted or
moved)**:
- `new_images/`: 5 dead files, 12 MB (god's finding, confirmed).
- `assets/img/`: 8 dead files, 636 KB (newly found this audit) — a
  half-wired responsive portrait/avatar set.
- Both sets ship to the Vercel bundle but cost visitors nothing (unlinked
  files aren't downloaded) — this is repo hygiene, not page speed.

**Recommended, not implemented (each would be a real structural change,
outside this audit's tight-diff / don't-restructure boundary)**:
- Retime or investigate the hero-name fade-up reveal that's gating LCP
  (1,432 ms render delay) and likely driving the CLS=1.00 spike — route to
  `worker-portfolio-motion`, this is a choreography call, not an asset one.
- Lazy-load Three.js/Pixi.js/anime.js behind the DJ/desk scene's own
  trigger instead of loading them eagerly on every page view.
- Consider a build step (bundling + content-hashed filenames) to safely
  collapse the 9-file CSS waterfall and enable long-lived caching on
  `/css/` and `/js/`.

**Couldn't fix**: LCP and CLS are both dominated by render-path timing and
motion choreography, not by asset weight — so image/font compression (this
audit's actual mandate) has no further room to move those two numbers on
this page. Said so plainly above rather than resizing more images for
cosmetic "before/after" numbers that wouldn't reflect a real improvement.
