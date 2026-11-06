# Intro scene: eye-ignition streak

Last open instance of the eye-ignition "reads as a bar, not a glint" defect, already root-caused
and fixed twice elsewhere: `docs/IRIS-ALIGNMENT.md` (Jim, eyes scene) and `docs/PALM-EYES.md`
(Stanley, palm scene). Both prior docs already flagged intro as carrying the same two bugs but
left it untouched as out of scope for their jobs. This job confirms and fixes both in the intro
scene (`js/hero/scenes/intro.js`, `css/hero.css`).

## Verified present (not assumed)

Both defects were measured, not just inferred from the pattern:

**Defect 1 — streak not zeroed.** `js/hero/fx/eye-fire.js`'s per-point `STRENGTH` defaults
`streak: 1` unless a scene opts out. `eyes.js` and (after the palm job) `palm.js` both set
`streak: 0`; `intro.js`'s `EYE_POINT` did not. Confirmed by reading the source directly — no
`streak` key present in the frozen object.

**Defect 2 — the shared `canvas { max-width: 100% }` clamp (`css/base.css`).** `.hx-eyefx`'s base
rule sizes the intro/palm canvas at `width: fig-w * 2, height: fig-w` (2:1), but neither
`.hx-eyes .hx-eyefx` nor `.hx-palm .hx-eyefx`'s existing `max-width: none` override covered
`.hx-intro`. Measured live with Playwright `getBoundingClientRect()` on my own dev server (port
8301, started from this worktree): at master timeline t=2.4 (mid-ignite), the intro canvas
rendered at **617.9×617.9px (square)** against an intended **1235.8×617.9px (2:1)** — width ratio
0.5, the same clamp signature as the palm-scene bug.

A screenshot at the same moment showed both defects compounding exactly as predicted: a wide red
bar spanning the full name ("Anand Thakkar"), not a glint on the eyes.

## Fix

Same established pattern as both prior fixes, no new approach invented:

1. **`js/hero/scenes/intro.js`** — added `streak: 0` to `EYE_POINT`.
2. **`css/hero.css`** — added `.hx-intro .hx-eyefx { max-width: none; }`, scoped to the intro scene
   only, mirroring the existing `.hx-eyes .hx-eyefx` and `.hx-palm .hx-eyefx` rules. Did not touch
   the shared `.hx-eyefx` rule or `css/base.css`.
3. Updated the stale comment on `.hx-eyes .hx-eyefx` that said "intro/palm keep the clamp for
   now" — no longer true now that both have their own scene-scoped fix.

## Before / after (measured + screenshotted)

Playwright, own dev server (port 8301), master timeline t=2.4 (mid-ignite in intro's 1.2–3.6s
`track()` window), 1440×900, night theme:

| | Canvas box | Center | Appearance |
|---|---|---|---|
| Before | 617.9×617.9 (square, should be 2:1) | (708.9, 199.8) | Wide red bar across the full name |
| After | 1235.8×617.9 (correct 2:1) | (708.9, 199.8) | Contained glow + aperture blades on the face, no bar |

Center unchanged to the decimal — the clamp fix only restores the box's shape, `translate(-50%,
-50%)` keeps it anchored exactly where it was, same as the palm-scene fix confirmed.

Mobile (390×844, paper theme) at the same timeline moment: no visible glow in either before or
after shot. This is expected, not a regression — `eye-fire.js` already nearly zeroes the glow on
paper theme ("On paper the soft glow reads as a red stain on his face, so it is nearly off").

## Regression check: palm and eyes scenes unaffected

Re-measured both already-fixed scenes on the same build, before and after this change:

- **Palm** (master t=10.3, post-overlap): canvas box `1363.0×681.5` / `1360.8×680.4`
  before/after — pixel-identical (sub-pixel float noise only), same center. Screenshot:
  pixel-identical.
- **Eyes** (master t=25, post-ignite close-up): canvas box `2035.2×1017.6` unchanged before/after,
  same center. Screenshot: pixel-identical.

Full real-scroll pass (`scroll-check.mjs`, 70 wheel-scroll steps across the whole timeline,
t=0→46.8) on the fixed build: zero console errors, zero page errors, zero failed requests.

## What's left

Nothing open for this defect — both instances flagged in the two prior docs are now fixed
(intro here, palm already fixed). No other scene shares `eye-fire.js`'s single-merged-point
pattern without its own `streak: 0` + clamp override.

## Boundaries respected

- Based on `avatar-hero` tip, worked in my own worktree/branch (`agent/worker-portfolio-intro-streak`).
- Did not touch `css/base.css`, `eyes.js`, `palm.js`, or `eye-fire.js`'s shared constants.
- Deleted nothing; no avatar source images regenerated or repainted.
- No bounce/spring/elastic/overshoot easing introduced — pure `streak` flag + CSS clamp override,
  no easing calls touched.
- Ran a local Python dev server on a free port (8301) from my own worktree; did not touch or kill
  god's server on 8082.
- No AI attribution added to any commit.
