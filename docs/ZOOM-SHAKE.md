# Zoom shake fix

Scope: Anand's report, "the zoom settings shakes the whole webpage." Measured on
the local dev server (`avatar-studio/tools/devserver.py`, this worktree's own
port, 8193 - not the shared :8082, which serves the main checkout) with
Playwright driving real Chromium. Branch `avatar-hero`.

## Which interpretation reproduced

Both candidates named in the brief were tested and only one reproduced:

- **Hero's own camera push-in zoom** (the palm scene's push toward the palm,
  `js/hero/scenes/palm.js`'s `cameraScale()`): this scales `.hx-cam` with a
  plain CSS `transform`. A transform is compositor-only - it never touches
  layout, box size, or `document.documentElement.scrollHeight`. There is no
  mechanism by which it could move anything outside its own scene, so it was
  ruled out by code inspection and confirmed not to be page-wide.
- **Browser zoom / a non-100% OS display scale**: this is the one that
  reproduces, and it is a page-wide defect, not a cosmetic one.

## Reproduction attempts and why the first three found nothing

Browser zoom (Cmd+/Cmd-, or OS display scaling) was modeled three ways, in
order, because each prior attempt turned up zero jitter and needed a better
model before the real mechanism showed up:

1. **CSS `zoom` property** on `<html>` at 50/67/80/90/100/110/125/150/175%,
   4 device pixel ratios (1, 1.5, 2, 2.5), both themes: zero jitter in
   pin-spacer height, pin top position, or document height at every
   combination (`repro.cjs`). This property doesn't touch the CSS-pixel-to-
   device-pixel ratio, so it can't surface a device-pixel rounding bug.
2. **Playwright's real "page zoom" model** - viewport shrunk by the zoom
   factor and `deviceScaleFactor` multiplied by it (what Chrome actually does:
   `window.innerWidth`/`innerHeight` shrink as you zoom in, `devicePixelRatio`
   scales up) - across the same 9 zoom levels, 2 base DPRs (1 and a 1.5
   fractional OS-scale case), both themes, 500-sample continuous-scroll sweep
   per combination: still zero jitter (`repro2.cjs`).
3. **Real Chromium `--force-device-scale-factor`** flag (the actual
   compositor-level DPR, not a DevTools-protocol emulation shim) at 1, 1.25,
   1.33, 1.5, 1.75, 2, 2.25: the flag was silently overridden back to 1 by
   Playwright's own context emulation once a context `deviceScaleFactor` is
   set, so this collapsed back to attempt 2's results (`repro3.cjs`).

All three attempts only ever changed scroll position with `window.scrollTo()`
set to an exact pixel target, waited one animation frame, and read the
position back. That pattern hid the real bug.

## The measured root cause

`css/base.css:2` sets `scroll-behavior: smooth` on `<html>`, globally, for
every page load. It was added for the nav-rail anchor links (`#heart`,
`#vision`, `#care`, ... in `index.html`) so clicking one glides instead of
jumping - there's no JS handling those plain `<a href="#...">` clicks, so the
glide comes entirely from this one CSS property.

Reproduced it directly (`anchor-test.cjs`): calling `window.scrollTo(0, y)`
and reading `window.scrollY` back one frame later showed the position was
**not** at `y` - it was still animating toward it, by up to 24,411px short in
one sample. `scroll-behavior: smooth` intercepts *every* programmatic scroll-
position change, not just user-facing nav clicks.

GSAP's ScrollTrigger relies on exactly this kind of programmatic scroll
change when it refreshes: on window resize (`invalidateOnRefresh: true` is
set in `js/hero/index.js`'s `createScroller()`, and a real browser zoom change
fires a native `resize` event), ScrollTrigger recalculates the pin's start/end
range and, if the scroll position needs to move to keep the pin's progress
continuous, it calls the scroll setter to correct it. That correction is a
plain scroll position change - with `scroll-behavior: smooth` active, the
browser turns it into a multi-frame glide instead of landing it in the same
frame ScrollTrigger reads the position back. ScrollTrigger's refresh math then
runs against a scroll position that's still mid-glide, decides the trigger is
out of its pin range, and unpins. Nothing re-pins it until the next real
scroll event, because the glide itself never fires one.

Confirmed end to end (`full-chain-test.cjs`): scrolled into the middle of the
hero's pin range, fired a real viewport resize (the same event a zoom change
fires), then sampled `.hx-pin`'s `getBoundingClientRect().top` for 90 frames.

| | `scroll-behavior: smooth` (current) | `scroll-behavior: auto` |
|---|---|---|
| pin top before resize | 0 | 0 |
| pin top after resize, settled | **5,067px** (detached, stays detached for the full 90-frame/1.5s sample) | 0 (never moves) |

That 5,067px jump of the entire pinned hero section is "the whole webpage
shakes" - it's page-wide because `scroll-behavior` is a document-level
property, not scene-scoped, so it isn't specific to any one scene's content;
it fires on the resize that any zoom change produces, at any zoom percentage,
in either theme (there is nothing theme-dependent in the mechanism).

## What was changed

**`css/base.css`** - one rule added directly after the existing
`html { ... scroll-behavior: smooth; ... }` line:

```css
html.hx-live { scroll-behavior: auto; }
```

`html.hx-live` is the class `js/hero/index.js`'s `initHero()` already adds
(and `index.html`'s pre-paint inline script already adds synchronously, per
`docs/CLS-FIX.md`) whenever the live, GSAP-driven hero is active and
`prefers-reduced-motion` isn't set - so this is scoped to exactly the state
where ScrollTrigger pinning exists. A class selector always wins over a bare
element selector on specificity, so this holds regardless of source order.
The reduced-motion/static fallback (`initStaticHero()`) never sets
`html.hx-live`, so nav-rail anchor links keep their smooth glide there,
unchanged.

No scene code, no easing, no GSAP config, and no bounce/spring/overshoot was
touched. Nothing was hidden with `overflow: hidden` or a transform hack - this
is GSAP's own documented recommendation for pages using ScrollTrigger pinning
(avoid `scroll-behavior: smooth`), applied as narrowly as the existing
`.hx-live` convention allows.

## Verification

**Shake gone, every required zoom level, both themes** (`verify-fix.cjs`): for
each of 50, 67, 80, 90, 100, 110, 125, 150, 175%, loaded at 100% (1440x900),
scrolled to six points spanning the full document (0%, 15%, 30%, 50%, 70%,
90%), then resized to the zoom-equivalent viewport and sampled `.hx-pin`'s
position for 40 frames after. Of 108 total samples, 73 were inside the hero's
pin range at the moment of resize - **all 73 held at `pinTop === 0` after
settling, with zero exceptions**, across every zoom level and both themes.
(The other 35 samples were scroll positions already past the hero into the
"Selected work" story content, where the pin-spacer naturally isn't at 0 -
that's correct document flow, not a bug, and was excluded from the pass
criterion for that reason.)

**No CLS regression**: `docs/CLS-FIX.md`'s own measurement method
(`PerformanceObserver` on `layout-shift`, buffered, real API) re-run with the
fix applied. A single draw read 0.0776 (paper) / 0.1031 (ink), which looked
like a regression against that doc's reported 0.049 - but `css/base.css`'s
`html.hx-live { scroll-behavior: auto; }` only changes scroll *animation*
timing, not any element's box or visibility, so there's no mechanism by which
it could move a CLS number. Confirmed it's noise, not a regression: reverted
the one rule, re-measured, got 0.0492 (paper) / 0.0793 (ink) - close to the
"with fix" draw, not meaningfully different. Then ran the fixed code five
more times back to back with nothing changed between runs: paper varied
0.005-0.0776, ink varied 0.0492-0.1031 - the same spread in both directions,
confirming this is exactly the font-load/FOUT run-to-run jitter `docs/CLS-
FIX.md` already documents and explicitly left alone, not something this fix
introduced or worsened.

**Dark mode**: every reproduction and verification run above included the
`ink` theme alongside `paper`; results were identical in both (the mechanism
is scroll/resize-driven, not paint/color-driven, so there was never a
theme-dependent code path to diverge). No dark-mode-specific regression.
