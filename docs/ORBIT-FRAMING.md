# Palm scene — orbit ring framing fix

## The bug

The tool-icon ring in the palm scene (`js/hero/scenes/palm.js`, `createOrbit`) sat across the
figure's chest/coat instead of floating above the open palm, and icons (Claude's included) landed
directly on the hand during parts of the orbit. Measured live with Playwright against a local
no-cache static server (own instance on port 8311, serving this worktree — the shared 8081/8082
dev servers on this machine point at the main checkout, not this worktree, so measuring against
them silently measures someone else's code) using `window.__hero.set(progress)` (the debug handle
`js/hero/index.js` already exposes) to drive the master timeline to exact points in the palm
scene, independent of actual scroll/pin mechanics.

**Root cause**: `createOrbit`'s `unit()` helper divided every position offset (ring radius, lift,
halo size) by the camera's current zoom (`state.scale`), so the ring rendered at a **fixed screen
size** throughout the scene. But `.hx-orbit` lives inside `.hx-cam`, which applies a `scale()`
transform that push-zooms toward the palm as the scene plays (`cameraScale()`, up to `PUSH_PALM *
DIVE_SCALE` ≈ 2.18×). The character image grows with that zoom; the fixed-size ring did not. So as
the camera pushed in, the hand and collar grew to meet (and swallow) a ring that stayed the same
size — worse the deeper into the scene, and present even early (phone width already clipped the
hand at `frac=0.3`).

## Fix

1. **`js/hero/scenes/palm.js`, `createOrbit`'s `unit()`**: stopped dividing by `state.scale` for
   position/radius. `.hx-cam`'s own `scale()` transform (a parent of `.hx-orbit`) now multiplies
   the offset back in, so the ring's radius and lift grow proportionally with the push-in, tracking
   the figure instead of staying glued to a fixed on-screen size. (Icon and halo *size* — the
   separate `s` scale factor in `paint()` — is untouched and still stays visually constant, which
   was never the bug.)
2. **`ORBIT_TILT` 0.32 → 0.22, `ORBIT_RADIUS` 22 → 32, `ORBIT_LIFT` 12 → 30** (`ORBIT_ROLL` and
   `ORBIT_TURNS` unchanged). With the scale fix alone the ring still ran low enough to clip the
   hand (worst case -3.5px, i.e. still overlapping); these three constants were re-tuned by
   iterating the same Playwright measurement until the hand cleared solidly at every sampled width/
   theme/scroll-offset, then nudged until coat contact was minimal. No easing or motion curves were
   touched — this is static geometry (radius/lift/tilt), not a timing change, so the "no bounce/
   spring/overshoot" constraint (commit `181746d`) is untouched.

### What "above the palm" means geometrically, and the one residual

`assets/hero/palm.webp` (768×1024) was inspected directly: the chin ends and the coat's collar
begins almost immediately below it (roughly 19.5%–21.5% of image height — a ~2% sliver). There is
no exploitable gap there wide enough to route a ring through at every zoom level and viewport
width; and because `createOrbit` spaces 4 icons 90° apart and spins continuously, at any instant
exactly one icon is at the top of the ellipse and one at the bottom — some icon crosses *every*
height band between those extremes at some point in the loop, by construction. Threading a ~2%
sliver with that geometry would be fragile (liable to start failing again at a slightly different
zoom/viewport) rather than genuinely fixed.

The fix instead lifts the ring to arc **above the head**, clearing the hand with large margin and
the coat almost entirely, at the cost of a small, brief graze of the very top hair wisps as an icon
passes over the top of its loop — never the eyes/glasses/face, confirmed below. Screenshots taken
during this run show it reading as a halo arcing above the figure, clearly separated from the
hand/coat, in both themes.

## Measurements

Methodology: `window.__hero.set(progress)` to 5 points through the palm scene's own local timeline
(`frac` = 0.05, 0.3, 0.5, 0.7, 0.95 of the scene's `start`→`end` window), × 3 viewports (1440×900,
834×1194, 390×844) × 2 themes (`paper`, `ink`) = 30 samples, up to 4 icons each once risen (opacity
> 0.05) = up to 120 icon-position checks, 96 actually visible across the sweep. Per sample:
`getBoundingClientRect()` on each `.hx-icon`, and on `.hx-palm .hx-pose-palm` (the actual camera-
transformed image, not `.hx-figure`'s own untransformed layout box — using the latter silently
drops the camera's pan/zoom from the anchor math and reports a stable point that doesn't match
reality; this was caught and corrected mid-run) to derive the palm/eye anchor points in the same
camera-transformed space as the icons.

Hand-overlap check: `palmPt.y − icon.bottom` (positive = icon fully above the palm point).
Face/coat checks: fixed boxes read directly off `palm.webp`'s pixels (percent of the image box) —
head `x 33–62%, y 4.5–20.5%`, hand `x 34–56%, y 27–38%`, coat `x 24–70%, y 20.5–95%`.

### Before (this worktree, pre-fix)

| | hand-overlap samples (icon rect crosses palm point) | worst hand clearance | coat-box hits | head-box hits |
|---|---|---|---|---|
| all 96 visible icon-positions | present at every width | **-7.4px** (phone, frac 0.3) | 96 / 96 | 0 / 96 |

Representative rows at `frac=0.5` (mid-orbit), paper theme — `handClear` = `palmPt.y − icon.bottom`,
negative means the icon's own rectangle already crosses the palm point:

| width | palmPt (x,y) | worst icon | handClear |
|---|---|---|---|
| 1440×900 | (717.8, 499.4) | claude.webp | +18.9px (thin) |
| 834×1194 | (414.1, 662.5) | claude.webp | +14.9px (thin) |
| 390×844 | (193.7, 443.7) | **claude.webp** | **-1.8px (overlap)** |

(At `frac=0.3`, phone width, the worst case was claude.webp at **-7.4px** — a real, measured
overlap with the hand, matching the reported bug.)

### After (this fix)

| | hand-overlap samples | worst/min hand clearance | coat-box hits | head-box hits (hair only) |
|---|---|---|---|---|
| all 96 visible icon-positions | **0 / 96** | **+58.0px** (all samples positive) | 4 / 96 | 38 / 96 (max depth 71.9px ≈ 3.7% of image height; **0 eye/face overlaps**) |

Same representative rows at `frac=0.5`, paper theme:

| width | palmPt (x,y) | worst icon handClear (before → after) |
|---|---|---|
| 1440×900 | (717.8, 499.4) | claude.webp: +18.9px → **+311.7px** |
| 834×1194 | (414.1, 662.5) | claude.webp: +14.9px → **+245.5px** |
| 390×844 | (193.7, 443.7) | claude.webp: **-1.8px → +106.0px** |

## Checks

- Both themes re-checked at all 3 widths across the 5-point sweep (30 total samples, listed above);
  `paper`/`ink` produce pixel-identical icon geometry (expected — the orbit math doesn't read
  theme), confirmed numerically from the raw capture, and visually via screenshots in both themes.
- `css/base.css`'s `canvas { max-width: 100% }` reset was not touched (the orbit is DOM/CSS
  transforms on `<img>`/`<span>`, not a canvas) — unaffected either way.
- No avatar `.webp` source frames regenerated or repainted; nothing deleted; no spring/bounce/
  overshoot easing added (`track()` calls and their eases in `buildScene` are untouched — only the
  5 `ORBIT_*` constants and the `unit()` helper's scale math changed).
- Did not touch `eyes.js`, `intro.js`, or any other scene.
