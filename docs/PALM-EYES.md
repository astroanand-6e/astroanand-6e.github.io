# Palm scene: eye-ignition alignment

Anand's report: in the hero's PALM scene the eyes read as badly placed/misaligned. This covers
the palm scene only (`js/hero/scenes/palm.js`, `css/hero.css`), which shares the `eye-fire` fx
module (`js/hero/fx/eye-fire.js`) with the intro and eyes scenes. `docs/IRIS-ALIGNMENT.md` (Jim,
commit a2bed3a) fixed the eyes-scene close-up and already flagged the bug fixed here as a known,
unfixed follow-up: "intro/palm's streak width is currently only 'fine' because the same clamp bug
happens to shorten it."

## What was actually wrong (two defects, same root cause as the eyes-scene fix)

The palm scene draws a single merged eye-fire point (`EYE_FIRE_START = { x: 0.5, y: 0.5 }`) at the
centre of its own fx canvas, which CSS anchors over the midpoint between his eyes
(`--eye-x`/`--eye-y`, `css/hero.css`). Measuring the live page with Playwright
(`getBoundingClientRect()` on the canvas and figure, at 1440x900, master timeline t=9.9/10.3, the
start of the palm scene) showed the anchor **position** was already correct — canvas centre landed
at (707.75, 192.9)px, exactly `48.2%, 13.7%` of the figure box, matching `EYE_X_PCT`/`EYE_Y_PCT` in
`config.js`. The reported "badly placed" look was not a mislocated point; it was two shape defects
at that correctly-placed point:

**Defect 1 — the anamorphic streak spans most of the figure's width.** `eye-fire.js`'s per-point
spec defaults `streak: 1` (full strength) unless a scene opts out, which `eyes.js` already does
(`streak: 0`, "it read as scratches on the lenses") but `palm.js` did not. At the palm canvas's
backing-store width (1024px) `STREAK_HALF_FRAC = 0.46` draws a streak spanning roughly 940 of those
1024px, which — even squashed by Defect 2 below — rendered on screen as a solid red bar from
`x=400` to `x=1010` (a 1440px-wide capture), well outside the figure's own `580-860` px span. A
screenshot at master t=9.9 (full ignite) showed this literally as a horizontal bar across his
forehead and both temples, obscuring the eyes entirely — not a glint on the iris, a slash across
the face.

**Defect 2 — the same global clamp from `docs/IRIS-ALIGNMENT.md`, still live here.** `css/base.css`
has `canvas { max-width: 100% }`. The palm canvas's own CSS sizes it as `width: fig-w * 2, height:
fig-w` (a 2:1 box, matching its 1024x512 backing store). The clamp pins the *width* back to `1 *
fig-w` while leaving height uncapped, so the rendered box becomes exactly square (confirmed live:
1360.8x680.4 intended vs. 680.4x680.4 rendered, width ratio 0.5). Squashing a 2:1 canvas into a 1:1
box doesn't move the centre point (translate(-50%, -50%) keeps it anchored exactly where it was —
confirmed: canvas centre was identical, to sub-pixel precision, before and after the fix), but it
does stretch every circle the fx draws — the iris ring and the three aperture blades — into a tall
vertical oval roughly 2x as tall as wide, reading as a smeared blob rather than a clean point.

`docs/IRIS-ALIGNMENT.md` scoped its clamp fix to the eyes scene only specifically *because* lifting
it on the shared `.hx-eyefx` rule would also un-clamp intro/palm and fully reveal Defect 1 (the
streak) at an even larger size (~1251px wide unclamped, vs. ~626px clamped) — worse, not better, on
its own. Fixing Defect 1 first is what makes lifting the clamp for Defect 2 safe.

## Fix

1. **`js/hero/scenes/palm.js`** — added `streak: 0` to `EYE_FIRE_START`, matching `eyes.js`'s
   existing pattern. Scene-local only; `eye-fire.js` and `intro.js` are untouched, so intro's own
   (separately out-of-scope, already-flagged) streak-width issue is unaffected either way.
2. **`css/hero.css`** — added `.hx-palm .hx-eyefx { max-width: none; }`, scoped to the palm scene
   only (same pattern as the existing `.hx-eyes .hx-eyefx` rule). Does not touch the shared
   `.hx-eyefx` rule or `css/base.css`, so intro keeps the clamp exactly as `docs/IRIS-ALIGNMENT.md`
   left it.

## What I measured (Playwright, own dev server, port 8213, not the shared 8082/8081 servers)

- Canvas/figure `getBoundingClientRect()` at master timeline t=9.3 (pre-ignite), t=9.9 (mid-ignite,
  still overlapping the intro scene's own eye-fire, which fades out — and is unaffected by this fix
  — at master t=10) and t=10.3 (palm-only, post-overlap), at 1440x900.
- Before: canvas box 680.4x680.4 (square; should be 1360.8x680.4), centre (707.75, 192.9).
- After: canvas box 1360.8x680.4 (correct 2:1), centre unchanged at (707.75, 192.9) — confirming
  the clamp fix only restores the box's shape, not its anchor position.
- Screenshots before/after at t=10.3 (palm-only glow, no intro overlap), desktop 1440x900 and
  mobile 390x844, night theme: before, a wide horizontal bar crosses the forehead/temples with a
  smeared vertical blob at the bridge of the nose; after, a contained, roughly circular red glow
  sits on the face between the eyes with thin blade lines through them — no bar, no oval smear.
- Re-checked the intro scene (t=5, fire fully lit) and the eyes-scene close-up (t=23, post-ignite)
  on the same build: both screenshots are visually identical to before this change — intro still
  has its own (separately flagged, not touched) full-width streak, eyes scene is unaffected. Zero
  console errors/warnings across all probes.

## What I deliberately left alone

- **Intro's own streak-width issue.** Exactly the same `streak: 1` default is live in `intro.js`'s
  `EYE_POINT`, and intro's canvas is still clamped square by the same `max-width: 100%` reset. This
  task is scoped to the palm scene; intro was not reported broken, and `docs/IRIS-ALIGNMENT.md`
  already flagged it as a known follow-up. Left exactly as Jim found it.
- **Per-eye split for palm (two points instead of one merged point).** `docs/IRIS-ALIGNMENT.md`
  already considered and rejected re-deriving two separate iris points for intro/palm at this
  scale/pose ("a single merged glow point is the deliberate design... the existing anchor is
  accurate enough"); nothing in this task's measurement contradicts that, so the single-point
  design is unchanged.
- **`eye-fire.js` constants** (`BLADE_REACH`, outer-ring radius, `STREAK_HALF_FRAC`, etc.) — shared
  by all three scenes and already sized correctly by the eyes-scene fix; not touched here.
- **`css/base.css`** — not touched at all; both CSS changes in this job (by Jim and by this job) are
  scene-scoped overrides in `css/hero.css`.
- No avatar source images regenerated or repainted; no bounce/spring/elastic/overshoot easing
  introduced (this is static geometry and one per-point flag, no easing calls touched); nothing
  deleted.
