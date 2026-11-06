# CLS / LCP fix

Scope: the two worst measured numbers on the hero (`docs/PERF-AUDIT.md`): CLS
1.00, LCP 1,433ms. Measured on the local dev server
(`avatar-studio/tools/devserver.py`, port 8081) with a scripted Chromium
session (Playwright) running the real `PerformanceObserver` API — `largest-
contentful-paint` and `layout-shift`, buffered, with shift sources — not
DevTools heuristics. Branch `avatar-hero`.

## Baseline, reproduced

| metric | value |
|---|---|
| LCP | ~1,472ms (desktop 1440×900), element: the `<span>` for "Thakkar" in `.hx-name` |
| CLS | 1.054 total, in one burst in the first ~400ms |

## What was actually shifting

The CLS was **not** the font/entrance-animation story the previous audit
guessed at from DevTools' heuristic attribution. The dominant shift —
**value 1.0 of the 1.054 total, at ~206ms** — had no attributable DOM node
(Chrome reports `node: null` for shifts that come from the document's own
height changing under everything, not one element moving). The cause:

- `.hx-scene { min-height: 100svh; }` applies unconditionally. Without the
  `.hx-live` class, each of the hero's five scenes (intro, palm, eyes, desk,
  handoff) sits in normal document flow — a plain stack, ~5×100svh tall.
  This is the deliberate accessible/no-JS fallback (`css/hero.css`'s own
  comment: "Default layout... is a plain stack of the same scenes").
- `.hx-live .hx-pin { height: 100svh; overflow: hidden; }` plus
  `.hx-live .hx-scene { position: absolute; inset: 0; }` is what collapses
  those five stacked scenes into one pinned 100svh frame, with GSAP/
  ScrollTrigger driving which one shows.
- `.hx-live` was added by `js/hero/index.js`'s `initHero()`, a `type="module"`
  script — deferred by spec, so it only runs after the full document is
  parsed. GSAP and ScrollTrigger are loaded with `<script defer>` too. That
  means on every normal load, the browser painted the full five-scene
  flowing stack first (~4,500px desktop / much more on narrow viewports),
  then `initHero()` ran a beat later and added `.hx-live`, collapsing the
  document height by roughly four viewport-heights in one frame. Everything
  below the hero (the sticky rail, "Selected work", the whole story section)
  jumped up to match. That collapse, not a font swap, is the 1.0 shift.
- The remaining ~0.054 (two sub-pixel `.rail-tick` shifts that round to
  0.0000, plus one ~0.049 shift in the hero's top copy block and one ~0.005
  shift in the footer copy) is ordinary web-font FOUT reflow as the real
  fonts swap in — small, independent of the structural issue above, and
  left alone (see "Not fixed" below).

Separately, **LCP was gated by an entrance animation**, exactly the brief's
suspicion: `css/hero-appear.css`'s `hx-appear` keyframe animated
`.hx-intro .hx-name > span` (the literal LCP element) from `opacity: 0` with
a 180–240ms delay plus an 800ms duration. The Largest Contentful Paint API
does not count an element as painted while it's invisible, so LCP couldn't
fire until that keyframe resolved — on top of however long render-blocking
CSS/fonts took to let the keyframe start at all. That's the real 1.4s.

## What was changed

**1. `index.html`** — the existing synchronous inline `<script>` in `<head>`
(the one that already sets `html.js` and the theme before first paint) now
also adds `html.hx-live`, gated on the same `prefers-reduced-motion: reduce`
check `initHero()` already uses. CSS's `.hx-live .hx-pin`/`.hx-live .hx-scene`
selectors are descendant selectors — they match `html.hx-live` as the
ancestor exactly as they matched `#top.hx-live` before, so no CSS changed.
This moves the layout decision from "after the deferred module script runs"
to "before the parser even reaches `<body>`," so the five-scene flowing
stack is never painted for a visitor whose motion isn't reduced — which is
the pinned/collapsed layout nearly everyone sees anyway, just arrived at
without a visible collapse.

**2. `js/hero/index.js`** — `initHero()`'s two fallback paths (`!hasGsap ||
reduced`, and `startLive()`'s `.catch`) now also remove `html.hx-live`, not
just `#top`'s copy of the class, so the optimistic early guess is correctly
undone if GSAP fails to load or the hero can't start. Verified:
`prefers-reduced-motion: reduce` still yields `html.hx-live === false`,
`#top.hx-static` present, and the flowing ~4,500px stack (`pinHeight:
"4500px"`) — unchanged from before this fix.

**3. `css/hero-appear.css`** — `.hx-intro .hx-name > span` removed from the
`hx-appear` animated selector list (and its now-unused `--ad` delay rules
for the two name spans removed with it). The hero name now renders at full
opacity immediately; every other on-load element (kicker, line, sub,
status, link row, cue, the portrait) still plays the exact same LOAD-APPEAR
entrance, unchanged. `display: inline-block` stays on the name spans (GSAP's
intro scene still scales/translates `.hx-name` as a whole for the scroll
push).

No easing changed, nothing in `js/hero/` scene code changed, no GSAP curve
touched, no bounce/spring/overshoot introduced. The motion system in
`docs/MOTION-SYSTEM.md` is untouched — the LOAD-APPEAR job still exists and
still runs for everything except the one element that was gating LCP.

## After, measured the same way

| metric | before | after |
|---|---|---|
| LCP (desktop 1440×900) | 1,472ms | **360ms** |
| CLS (desktop 1440×900) | 1.054 | **0.049** |
| LCP (mobile 390×844) | not separately measured before | **252ms** |
| CLS (mobile 390×844) | not separately measured before | **0.020** |

Both metrics are now well inside "good" (LCP < 2.5s, CLS < 0.1) on desktop
and mobile, in both themes (spot-checked `ink`; the collapse fix is
theme-independent since it's a layout-only change).

## Verified the hero film still works

- `avatar-studio/tools/hero-strip.mjs` (ink, t=0–10, step 2): scene opacities
  step through intro → palm exactly as before (`palm:0.00→1.00` at the
  intro→palm handoff, no change from pre-fix behavior) — no regression.
- `avatar-studio/tools/moment-probe.mjs` at t=43.5 (handoff scene): all five
  scene layers and every fx canvas report the same opacity/visibility/size
  as expected mid-handoff, zero console errors.
- Reduced-motion path (scripted, `prefers-reduced-motion: reduce`):
  `html.hx-live` absent, `#top.hx-static` present, flowing stack height
  intact (4,500px) — confirms the fallback this fix depends on still works.

## Not fixed, and why

The residual ~0.049 CLS (desktop) / ~0.02 (mobile) is web-font FOUT reflow:
a small width/position change in the hero's top copy block as the real
Instrument Serif/Geist fonts swap in over the fallback font, and a smaller
one in the footer copy. This is well under the "needs improvement"
threshold (0.1) on its own, is a font-metrics issue rather than a layout-
system or motion-system issue, and the prior worker already confirmed
image/font compression has no further room here. A font-metric override
(`size-adjust`/`ascent-override` on the `@font-face` declarations, or
switching the Google Fonts request to `font-display: optional`) could close
this remaining gap if Anand wants to chase it further, but that's a font-
loading change, not a motion or layout one, and risks trading a small CLS
win for either a flash of invisible text (`optional` can skip the custom
font entirely on a slow connection) or a fiddlier font-metrics tuning pass
— flagging it rather than doing it here, same call the previous audit made.

No trade-off against the motion system was needed: the hero name's entrance
animation was removed entirely rather than retimed, which the brief itself
named as "a legitimate and probably correct answer" for the page's LCP
element, and the CLS fix is pure layout-timing (an HTML/JS change, not a
CSS easing one) — neither touches anything Oscar's motion-system pass
established.
