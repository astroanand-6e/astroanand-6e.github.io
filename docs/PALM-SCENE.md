# Palm scene — survey

## 0. Headline finding: the scene already exists

The brief describes a scene to build: palm raise, camera push-in, VS Code /
Claude / Codex / Hermes icons orbiting the hand, driven by scroll. That scene
is **already implemented and wired in** on this branch (`avatar-hero`), not a
gap to fill:

- `js/hero/scenes/palm.js` — the full scene: arm-raise, camera push, icon
  orbit, portal dive.
- `js/hero/index.js` — loads it as the second scene (`SCENES` in
  `js/hero/config.js`), between `intro` and `eyes`.
- `index.html:130-157` — the markup: `.hx-palm` scene with four
  `<img class="hx-icon">` tags pointing at `assets/hero/icons/{vscode,claude,
  codex,hermes}.webp`, inside `.hx-orbit`.
- Git history on this branch shows it was built incrementally:
  `5bbc37b` (scroll-driven hero with five scenes), `e9a8f6c` (fix: palm
  orbit), `507d0e3` (palm scene: arm swings up through three in-betweens),
  `83e0663` (optical-flow in-betweens for the arm raise), `181746d` (remove
  spring/dip/overshoot per Anand: "no bouncing").

So there is nothing left to design from scratch. What follows is how it
works, so a future change (tuning, a fix, or extending it) starts from the
real mechanism instead of guessing.

## 1. How the existing palm/arm-raise scene is built

File: `js/hero/scenes/palm.js`, `DURATION = 13` (timeline seconds, scaled to
scroll distance by `VH_PER_SECOND_DESKTOP`/`MOBILE` in `config.js`).

- **Pose**: four key drawings (`stand → raise-1 → raise-1b → raise-2 →
  raise-3 → palm`, via `RAISE_FLOW` in `config.js`) are in-betweened on a
  WebGL canvas by `js/hero/fx/pose-flow.js` (`createPoseFlow`), driven by
  `track(tl, RAISE.at, RAISE.for, pose.render, 'none')` where `RAISE = {at:
  1.9, for: 1.7}`.
- **Camera**: `cameraScale(t)` combines a push-in toward the palm
  (`PUSH_PALM = 1.45`) and a later dive (`DIVE_SCALE = 1.5`) into the portal.
  Applied as a CSS `transform: translate(...) scale(...)` on `.hx-cam`,
  anchored at the palm's percentage position on the image
  (`PALM_X_PCT`/`PALM_Y_PCT` in `config.js`, hand-tuned to the actual
  artwork).
- **Icon orbit**: `createOrbit(el)` in the same file. Reads the four
  `.hx-icon` elements and two `.hx-halo` elements already in the DOM
  (`index.html`), and on each paint computes a tilted elliptical orbit
  (`ORBIT_TILT`, `ORBIT_ROLL`, `ORBIT_RADIUS`, `ORBIT_LIFT`, `ORBIT_TURNS`)
  with per-icon depth-based scale/opacity/z-index so icons behind the hand
  look smaller and more transparent. Driven by two independent tracks:
  `orbit.setRise` (icons rising out of the palm, `RISE = {at: 3.4, for:
  2.4}`) and `orbit.setSpin` (continuous rotation, `SPIN = {at: 3.4, for:
  8}`), plus `orbit.setScale` tied to the camera's current zoom so icon size
  stays consistent in screen units as the camera pushes in.
- **Portal**: `createPortal` (`fx/portal.js`), a WebGL shader canvas, opens
  a rift centered on the palm at `PORTAL = {at: 9.2, for: 3.3}` and the
  scene fades out (`fade(tl, fig, 0, 11.6, 0.8)`), handing off into the
  `eyes` scene.
- **Anand's own editorial call** (commit `181746d`): no spring/overshoot/dip
  anywhere in the hero — `pose-flow.js` has `ANTICIPATE = 0` and
  `OVERSHOOT = 0` explicitly set to zero with a comment ("Anand doesn't want
  springy motion"). Any orbit/camera tuning should keep that constraint:
  motion should ease, not bounce or overshoot.

**Reusability**: 100% of the orbit mechanism is already general-purpose —
`createOrbit` takes any `.hx-icon`/`.hx-halo` set from the DOM, so changing
icon count or identity is a markup + asset change, not a rewrite. There is
no separate "arm-raise scene" left to extract; it's the same `palm.js`.

## 2. How scroll drives animation on this site

Mechanism: **GSAP 3.13 + ScrollTrigger (`scrub`), loaded as classic
`<script>` tags from jsDelivr** (not an npm/bundled build — see
`index.html`'s CDN `<script>` tags; confirmed by `js/hero/index.js:4`'s
comment "GSAP 3.13 and ScrollTrigger load as classic scripts from
jsDelivr"). There is no React, no React Three Fiber, no bundler-managed
component tree for the hero — `js/hero/*` is vanilla JS with native ES
modules (`<script type="module">`), dynamically `import()`-ing each scene
(`LOADERS` in `index.js`).

- `js/hero/index.js: buildMaster()` builds one paused GSAP timeline per
  scene by calling that scene's `buildScene(tl, el, opts)`, then stacks all
  five onto one paused **master timeline**, each starting `overlap` seconds
  before the previous one ends (`SCENES` config).
- `createScroller()` creates a single `ScrollTrigger` pinning `.hx-pin`,
  with `scrub: SCRUB_SECONDS` (0.6s) binding scroll position directly to
  `master`'s playhead. `end` is computed from `master.duration()` and a
  `VH_PER_SECOND` constant, so scroll distance is derived from total
  animation duration, not hardcoded.
- **Normalized progress exists, in two places**: GSAP's own
  `master.progress()` (0..1 over the whole film) and, inside each scene, the
  `track(tl, at, dur, render, ease)` helper (`timeline-utils.js`) which hands
  each effect a local `p` in `0..1` over its own time window via a GSAP
  tweened proxy object (not a raw scroll-event listener — "runs from a
  property setter... setters always fire even when GSAP suppresses events
  while seeking"). Every scene (`palm.js` included) is written against this
  `p`, never against `window.scrollY` directly.
- There is no per-event `scroll` listener driving any animation; scrubbing
  is entirely GSAP/ScrollTrigger's job. `js/hero/index.js` only adds a
  `resize` listener (debounced) and a `focusin` listener (accessibility:
  jump scroll position to a focused link's scene).
- A separate, simpler mechanism exists in `js/zen-script.js` for sections
  **outside** the pinned hero film (the rest of the page, "Selected work"
  etc. per commit `05c1049`) — not investigated in depth since it's out of
  scope for the palm scene, but it is a distinct system from the hero's
  GSAP master timeline.

## 3. The avatar asset — decisive question

**The avatar is rendered 2D image frames, not a live 3D mesh and not a
PixiJS mesh, for this scene.** Specifically:

- `assets/hero/` contains static `.webp` files: `stand.webp`, `palm.webp`,
  `raise-1.webp`, `raise-1b.webp`, `raise-2.webp`, `raise-3.webp`,
  `eyes.webp`, `desk.webp`, `dj.webp` (plus `*-depth.webp` depth maps used
  by other fx, e.g. parallax/lighting, not by the palm orbit). Each is a
  flat image (`<img data-hx-img="...">` in `index.html`).
- The "in-between" motion (arm swinging from side to palm) is **not** a
  skeletal/mesh animation. It's `fx/pose-flow.js`: dense optical-flow fields
  (`assets/hero/flow/flow-{i}-f.png` / `-b.png`, precomputed offline by
  `avatar-studio/tools/flow.py` per the code comment) warp between pairs of
  the *already-rendered* key drawings on a WebGL canvas (a Super-SloMo-style
  bidirectional warp), to make the hand appear to travel through space
  instead of cross-dissolving. This is image-space interpolation between
  fixed frames, not mesh/bone manipulation.
- Per hive memory (mempalace: `transcript-claude-code-2026-11-05.md`,
  `handoff-claude-code-2026-11-05.md`), the original character was built and
  rendered as a 3D asset in Blender, "rendered in Cycles on the Metal GPU as
  frame sequences for the scroll hero" — then further pose frames (the
  raise in-betweens) were produced via a Qwen image model, per the comment
  at the top of `palm.js` ("Qwen in-betweens warped by optical flow"). So
  the pipeline is: 3D/image-model render → fixed frame per pose → optical
  flow in-between at runtime. Nothing in the browser touches mesh geometry.
- **I opened `assets/hero/palm.webp` directly.** The hand in the key
  drawing is clearly articulated — individual fingers, natural curl, no
  fused/mitten look. The Hunyuan3D-2.1 fused-hand failure mode the brief
  worried about does not show up in this particular rendered frame.

**What this means for "camera close-in on the hand": it changes everything,
as the brief anticipated.** Because the asset is a flat raster image:
- A close-in is a 2D zoom (CSS `scale()` on `.hx-cam`, exactly what
  `cameraScale()` already does toward `PUSH_PALM`), not a dolly through 3D
  space. There is no parallax, no lighting response, no geometry to move a
  virtual camera around.
- The ceiling on "how close is too close" is **source resolution and
  render quality of that one frame**, not mesh topology. `palm.webp`'s
  actual pixel dimensions were not re-checked beyond the decode above, but
  since it's a single raster asset shared across all screen sizes
  (`assets/` served immutable, versioned by `IMAGE_VERSION`), pushing the
  zoom past whatever resolution it was exported at will show upscaling
  softness/compression artifacts on the hand before it would show a mesh
  defect — because there is no mesh in the browser to show one.
- If a tighter hand close-up than the current `PUSH_PALM = 1.45` is wanted,
  that requires either (a) a higher-resolution re-export/upscale of the
  existing `palm.webp` hand region, or (b) a dedicated close-up frame
  rendered/generated specifically for that crop (the same pipeline that
  made `palm.webp`, just cropped tighter and re-rendered at full
  resolution) — not a client-side code change.

## 4. Recommended approach, fitted to the actual stack

Since the orbit already exists and works, "recommended approach" here means
*how to extend or retune it*, not how to build it:

- **Stay inside `js/hero/scenes/palm.js` + `createOrbit`.** Any request to
  change icon count, orbit shape, spin speed, or add a new tool icon is a
  change to `ORBIT_TILT/ORBIT_ROLL/ORBIT_RADIUS/ORBIT_LIFT/ORBIT_TURNS`
  (constants at the top of the file) plus adding/removing an `<img
  class="hx-icon">` in `index.html` and an icon asset in
  `assets/hero/icons/`. `createOrbit` already reads `qsa(el, '.hx-icon')`
  generically — no code change needed to add a fifth icon.
- **Keep using `track()`/GSAP tweened proxies for any new timed effect**,
  not scroll-event math — that's the established pattern in every scene
  file and is what keeps effects correct under GSAP's scrubbing/seeking.
- **Respect the "no bounce" constraint** (`181746d`) in any new motion:
  ease in/out, no overshoot, no spring.
- **A closer hand shot is an asset task before it's a code task.** If the
  goal is literally "camera closes in further on the hand," the code
  (`cameraScale`, `PUSH_PALM`) already supports an arbitrary push amount;
  the blocker is only image resolution at that crop, so get a tighter/
  higher-res `palm.webp`-equivalent frame before touching `palm.js`.
- **PixiJS is not part of this scene** and shouldn't be introduced to it —
  it's used elsewhere in the project (the DJ/desk mesh scenes per
  `js/objects/` and commit messages mentioning "PixiJS mesh nod/scratch").
  Mixing it into `palm.js` would add a second rendering stack for no
  benefit: the orbit already runs on plain DOM/CSS transforms, which is
  cheaper and simpler than a canvas-based particle/mesh system for four
  icons.

## 5. Risks / unresolved

- **Scope mismatch**: this document assumes the dispatch's premise ("build
  the next scene") was based on a stale picture of the repo — the scene is
  already built on `avatar-hero`. If the real ask is "make it better in some
  specific way" (tighter close-up, different icons, retimed orbit, a bug),
  that's a different, much narrower task than a from-scratch build, and
  should be re-scoped against what's actually here rather than this
  document's original brief.
- Did not check whether `avatar-hero` is merged into `main`/`master` or
  still a divergent feature branch — only confirmed the scene exists and is
  wired into `index.js`'s `SCENES` list on this branch.
- Did not measure actual pixel dimensions of `palm.webp` / its hand region,
  so "how much headroom before zoom artifacts" is a judgment call from
  visual inspection, not a number.
- Did not run the page in a browser (no dev server started this run, per
  the "survey, don't build" boundary) — everything above is static code
  reading plus one direct image inspection, not a live visual QA pass of
  the orbit in motion.
- `js/zen-script.js` (the non-hero scroll system for the rest of the page)
  was located but not read in depth; if "the next scene" actually meant
  something in that system rather than the hero film, this document does
  not cover it.
