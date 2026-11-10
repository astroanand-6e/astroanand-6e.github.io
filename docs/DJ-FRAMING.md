# Handoff scene: the DDJ-FLX4 was cut out of frame

The last hero beat ("Off the clock" / handoff scene, `index.html:192-199`) says
"I mix on a DDJ-FLX4" over a shot where the controller wasn't visible. Three
suspects were named; here's what each one turned out to be.

## What the source image actually holds

`assets/hero/dj.webp` is 1184×896. A 10%-grid overlay (via ffmpeg) gave exact
proportions:

| Feature | Row (% of height) |
|---|---|
| Hair crown | ~8% |
| Eyes / glasses | ~22–26% |
| Chin | ~32% |
| Controller top (platters/knobs) | ~70% |
| Controller bottom (flush with image edge) | 100% |

Full face + full controller spans rows 8%–100% (92% of the image height).

## Suspect 1 — cropping: CONFIRMED, and it's in two places, not one

`css/hero.css:223`'s `object-position: 50% 12%` was one culprit, but the
**live JS experience most visitors actually see isn't that `<img>` at all.**
`fx/dj.js` replaces it with a PixiJS canvas (`.hx-dj-alive img { opacity: 0 }`)
that computes its own cover-crop in `fit()`. Its landscape branch anchored the
vertical offset at `0.12` — the same 12%-from-top idea, independently
hardcoded — with a comment saying it was deliberately tuned to "keep his hair
crown in frame... crop mostly from the table, not the head." That's the real
bug: it was working as designed, and the design cropped out the entire point
of the shot.

Rendered proof at 1920×1080 (a common desktop width) before the fix: the
controller is **completely absent** — the frame bottom lands mid-coat, well
above the desk. At 1366×768 and 1440×900 it fared a little better (partially
visible, flush-cropped at the very bottom) only because those viewports are
closer to the image's own 1.32:1 aspect ratio, so cover-cropping had less to
remove.

Math: at 1920×1080 the cover scale is `max(1920/1184, 1080/896)*1.04 ≈ 1.69`,
so only `1080/1.69 ≈ 640px` (71.5%) of the original 896px-tall image survives
the crop. The face-to-controller span needed is 824px (92%) — **no single
anchor can show all of both at that aspect ratio.** This is the genuine
can't-have-both case the brief anticipated.

**Fix (compromise):** moved the anchor from `0.12` to `0.54` in both
`js/hero/fx/dj.js` (the live canvas `fit()`) and `css/hero.css` (`.hx-dj img`,
for the pre-Pixi flash and the no-JS/reduced-motion fallback). At `0.54`:
- 1920×1080: shows rows ~15%–86.5% — full face, full platters/knobs, loses
  only the deck's bottom trim and nothing of the head.
- 1366×768 / 1440×900: shows ~90%+ of the image, essentially everything.
- Only genuinely extreme aspect ratios (21:9 ultrawide browser windows) would
  still have to trade a little more; that's an accepted, documented
  compromise, not a regression — those viewports were unusably cropped
  before too.

Portrait was a separate, correct code path (`fit()`'s `else` branch, and the
`@media (orientation: portrait)` CSS rule) and was already showing the full
controller correctly in the live JS render (verified at 390×844 before and
after — unchanged). Its CSS fallback counterpart (`object-position: 48% 0`,
i.e. top-anchored, cropping the controller off the bottom for no-JS/
reduced-motion users) got the same proportional fix: `0` → `70%`.

## Suspect 2 — lazy loading: not the cause of absence, but still wrong

`index.html:193` was the only hero image carrying `loading="lazy"`. In
practice this element sits inside `.hx-live .hx-scene { position: absolute;
inset: 0 }`, i.e. it occupies full-viewport geometry from page load (just
`opacity: 0` via `.hx-live .hx-dj`), so the native lazy-load heuristic saw it
as already in-viewport and fetched it immediately — confirmed by every
screenshot taken (the `<img>` and the PixiJS canvas both rendered without any
extra wait). Separately, `fx/dj.js`'s `createDJ()` fetches the same file via
its own `Assets.load(imageUrl('dj'))` for the canvas, independent of the
`<img>`'s `loading` attribute, so the live path never depended on it at all.

It was still wrong to leave it lazy: it's the only hero image singled out
that way, it does matter for the brief window before PixiJS finishes loading
and for the no-JS/reduced-motion static fallback (where the scene sits in
normal document flow and genuinely could be deferred past the point a user
scrolls to it), and it's inconsistent with every sibling `data-hx-img`.

**Perf check:** `dj.webp` is 37.6 KB, in line with the other hero images
(27–52 KB) — not an outlier — and since PixiJS already fetches it
unconditionally on the live path, removing `loading="lazy"` adds no new
network cost there. **Fix:** removed the attribute (`index.html:193`), now
consistent with every other hero image.

## Suspect 3 — incomplete opacity reveal: ruled out

`.hx-live .hx-dj { opacity: 0 }` is real, but `handoff.js`'s GSAP timeline
(`tl.fromTo(stage, {opacity:0,...}, {opacity:1,...}, BURN_DONE - 0.4)`) tweens
it to full opacity well before the beat line appears (`LINE_IN_AT`), and the
scene wrapper itself (`tl.fromTo(el, {opacity:0}, {opacity:1}, 0)`) is already
at 1. Probed via a headless-Chrome script scrolled to the exact beat time: the
`handoff` scene reports `op=1` in computed style, and every screenshot at
that timeline position shows the beat line fully legible over a fully-opaque,
fully-lit DJ plate. No incomplete reveal.

## Verification method

Dev server on `http://localhost:8082` (left running, not killed). Hyperframes
0.9.19's own `capture` command was blocked by its remote capture service
returning an access-protection 403 (unrelated to this fix — a network/infra
issue with the hyperframes backend itself, not this site). Fell back to a
direct Playwright probe (adapted from `avatar-studio/tools/moment-probe.mjs`,
copied into a scratch dir with the port changed from 8081→8082, not edited
in place) that scrolls the real page to the handoff scene's timeline moment
and screenshots it. Confirmed before/after at 1920×1080, 1440×900, 1366×768,
and 390×844 (portrait, to confirm no regression), plus a `reducedMotion:
'reduce'` context check at 1440×900.

## Files changed

- `index.html` — removed `loading="lazy"` from the `dj` image.
- `js/hero/fx/dj.js` — `fit()` landscape vertical anchor `0.12` → `0.54`.
- `css/hero.css` — `.hx-dj img` object-position `50% 12%` → `50% 54%`;
  portrait override `48% 0` → `48% 70%`.

## Second pass: "still a bit misplaced" at `0.54`

Anand's report after the first fix landed: the deck frame reads as a bit
misplaced. It isn't gone again (the first fix's anchor change is still in
place and still correct for a static plate); the frame is tighter than the
`0.54` anchor's own numbers say it should be, and it gets tighter the longer a
visitor dwells on the beat. The anchor fix was computed against a plate at
rest (`scale: 1`). It never was at rest.

### The actual bug: the anchor was tuned for the wrong scale

`js/hero/scenes/handoff.js` runs the DJ plate (`.hx-dj`, same element as
`fit()` sizes) through its own GSAP scale tween, independent of and on top of
`fit()`'s own cover-crop math:

```js
tl.fromTo(stage, { opacity: 0, filter: 'brightness(0.2) blur(10px)', scale: 1.12 },
  { opacity: 1, filter: 'brightness(1) blur(0px)', scale: 1, duration: 1.6, ease: 'power2.out' }, BURN_DONE - 0.4);
tl.to(stage, { scale: 1.05, duration: DURATION - BURN_DONE - 1.2, ease: 'none' }, BURN_DONE + 1.2);
```

The beat line ("It is music...") lands at `LINE_IN_AT = BURN_DONE + 0.75`,
partway through the first tween (plate scale is already past 1.0, settling
toward it). From there the second tween pushes the whole plate from `scale:
1` up to a **held `scale: 1.05`** for the rest of the scene's dwell time —
this is a deliberate slow push-in, not a bug, and not something to remove
(no easing type changed, this is a `duration`/`scale` tween, not a bounce or
elastic ease). But it's a transform on the *outer* `.hx-dj` box, applied
*after* `fit()` has already decided which part of the 1184×896 source is
visible. A CSS `transform: scale()` on a box zooms in on its own center,
uniformly eating into whatever margin the crop math left on every edge —
`fit()` never knew this was coming, so the `0.54` anchor was tuned as if the
plate would stay at `scale: 1` forever.

### What that costs, measured

At 1440×900 (`W=1184, H=896`, landscape cover scale `s = max(1440/1184,
900/896) * 1.04 ≈ 1.265`, so the plate before any push-in is already
1123px wider and 134px taller than the viewport, i.e. object-fit:cover's own
built-in overscan/crop):

| State | Visible rows (% of source image height) |
|---|---|
| `0.54` anchor, plate at `scale: 1` (what the first fix measured) | 11.1%–90.5% |
| `0.54` anchor, plate held at `scale: 1.05` (what a visitor who reads the line actually sees) | 13.0%–88.6% |
| `0.63` anchor, plate held at `scale: 1.05` (this fix) | 14.9%–90.5% |

The held `scale: 1.05` alone eats back ~1.9 percentage points of vertical
coverage versus the `scale: 1` case the first fix verified, entirely from
the bottom — exactly where the controller is. The bottom edge drifts from
90.5% to 88.6%, trimming further into the deck's lower trim than documented,
while the top edge barely moves (hair crown, already the tighter margin, is
untouched either way at this anchor). Confirmed in the browser: with the
plate progressed to the scene's end (`window.__hero.set(1)`, the steady
state most of the scroll-locked dwell settles into), `getComputedStyle(.hx-dj)
.transform` reads `matrix(1.05, 0, 0, 1.05, 0, 0)` — the push-in is live and
held, not a transient.

### Fix: re-tune the anchor for the plate's held scale, not its rest scale

`0.54` → `0.63` in both places that set it (`js/hero/fx/dj.js`'s `fit()`
landscape branch, and `css/hero.css`'s `.hx-dj img, .hx-dj canvas` rule, which
the no-JS/reduced-motion static fallback and the brief pre-Pixi-load flash
both use). `0.63` is picked so that once the plate is at its *held* `1.05`,
the visible window's bottom edge lands back at ~90.5% — the same bottom-edge
coverage the first fix's own numbers call correct — instead of drifting
tighter as the scene dwells. The portrait branch (`fit()`'s `else`, and the
`orientation: portrait` media query) is untouched: it doesn't use this
constant and was already correct per the first pass.

### Verified: measured, before/after, three widths, both themes

Dev server for this worktree only, on `localhost:8097` (the shared `:8082`
server serves the main checkout, not this branch — left running at time of
writing, stop with the PID in `/private/tmp/claude-501/djframe/`). Measured
with a Playwright probe (`/private/tmp/claude-501/djframe/probe.mjs`) that
loads the real page, calls `window.__hero.set(1)` to settle the handoff scene
at its end-of-dwell state (`scale: 1.05` held, the worst case), then reads
`getBoundingClientRect()`/`getComputedStyle()` off the scene, `.hx-dj` plate,
`<img>` and `<canvas>`, plus a full-page screenshot, at `1440×900`, `834×1194`
and `390×844`, in both `data-theme="paper"` and `data-theme="ink"`.

| Width | Theme | Before (`0.54`, held `1.05`) | After (`0.63`, held `1.05`) |
|---|---|---|---|
| 1440 | paper | rows 13.0%–88.6% visible; hand, jog wheel and knobs present but the bottom trim of the deck is tighter than the first fix's own target | rows 14.9%–90.5%; matches the first fix's documented bottom-edge coverage; headphone hand, face, both jog wheels, the knob row and the scratching hand all fully in frame |
| 1440 | ink | same as paper (object-position isn't theme-dependent) | same as paper |
| 834 | paper | unaffected — portrait branch (`fit()`'s `else`), rows 0%–100% of the source always shown, scaled to 74% of viewport height | unaffected, confirmed identical (the `0.63`/`0.54` constant isn't read on this path) |
| 834 | ink | unaffected | unaffected |
| 390 | paper | unaffected, same portrait branch | unaffected |
| 390 | ink | unaffected | unaffected |

Screenshots: `shot-1440-{paper,ink}.png` (before) and `after-{1440,834,390}-
{paper,ink}.png` (after) in `/private/tmp/claude-501/djframe/`. The static/
reduced-motion fallback was also checked directly:
`getComputedStyle(img).objectPosition` on the plate's `<img>` reads
`"50% 63%"` once the fix is applied, confirming that code path (which
`fit()` never touches) picked up the same change.

No dark-mode regression: `.hx-dj`'s object-position isn't theme-conditional,
and the 1440 ink screenshot is pixel-equivalent in composition to the paper
one (only the page chrome around the pinned hero differs by theme, as
before).

## Files changed (second pass)

- `js/hero/fx/dj.js` — `fit()` landscape vertical anchor `0.54` → `0.63`,
  with a comment explaining the held-scale compensation.
- `css/hero.css` — `.hx-dj img, .hx-dj canvas` object-position `50% 54%` →
  `50% 63%`.
