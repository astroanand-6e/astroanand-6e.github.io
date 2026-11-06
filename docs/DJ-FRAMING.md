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
