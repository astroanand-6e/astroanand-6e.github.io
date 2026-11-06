# Motion system — beat inventory, the system, and what changed

Scope: every transition and motion beat on the page, hero film first (GSAP
ScrollTrigger scrub), then the rest of the page (IntersectionObserver reveal,
CSS transitions, theme switch, on-load appear). Goal per the brief: find
seams where the same job is done with different curves/durations in
different places, name a small system, and bring outliers onto it without
touching anything that isn't actually broken.

## 0. How to read this

Each beat below is: **trigger** (what starts it) → **duration/ease** → **hands
off to** (what it leaves for, and how). "Job" tags which bucket of the
proposed system (§2) it belongs to, or "n/a" if it's outside the hero film's
GSAP system (CSS-only layers are inventoried separately in §3).

## 1. Beat inventory, scroll order

All times are **master-timeline seconds** (`js/hero/index.js` stacks all five
scenes on one paused GSAP timeline; `ScrollTrigger` scrub binds scroll
position to its playhead 1:1 at `SCRUB_SECONDS = 0.6`). Scene boundaries
(`SCENES` in `js/hero/config.js`, each overlapping the previous by `overlap`
seconds): intro 0–10, palm 9–22, eyes 19.8–33.8, desk 28.8–40.8, handoff
38.8–46.8. Total ≈ 46.8s, scaled to scroll by `VH_PER_SECOND_DESKTOP = 36`
(≈300vh/scene).

### Intro (`js/hero/scenes/intro.js`), 0–10
- Figure push-in: `0→9s`, scale 1→1.12, **power1.inOut** — job: EMPHASIS (camera).
- Name push: `0→9s`, scale/position, **none** — job: SCRUB (tied 1:1 to the same push).
- Eye fire ignite: `1.2→4.8s`, **power2.out** — job: ENTRANCE.
- Scroll cue fade-out: `0.4→1.4s`, **none** — a quick utilitarian disappearance, not a cinematic exit; left alone (see §4).
- Foot/top copy exit: `7.4→8.6s` / `8.2→9.4s`, **power1.in** — job: EXIT.
- Hands off to palm: scene opacity hard-cut to 0 at `t=10` (`tl.set`), while palm's own `opacity 0→1` fade-in (`0→1s` of its local clock, i.e. global `t=9→10`) already covers the 1s before that cut. **No gap, no double-fade** — this handoff is clean.

### Palm (`js/hero/scenes/palm.js`), 9–22
- Scene fade-in: **none**, 1s, overlapping intro's own exit (see above).
- Arm raise (optical-flow pose blend): `1.9→3.6s`, **none** — job: SCRUB (pose directly tracks scroll).
- Camera push toward palm: `1→8s`, local `easeInOut` (quadratic, power1-equivalent) — job: EMPHASIS.
- Camera dive into portal: `9.4→12.4s`, local `easeIn` (quadratic) — accelerating into the cut, a different flavor of EMPHASIS.
- Icon orbit rise: `3.4→5.8s`, local `easeOut` (cubic, power2-equivalent) — job: ENTRANCE.
- Icon orbit spin: `3.4→11.4s`, **none** — job: SCRUB.
- Beat text in/out: `4.2s` / `9.2s`, via `beat()` helper (**power2.out** in, **power1.in** out) — job: ENTRANCE/EXIT, already standardized (see §2.1).
- Portal open: `9.2→12.5s`, **power2.inOut** — job: FX_RAMP (a dramatic shader ramp, not a camera move — see §4 for why this is a different strength than EMPHASIS on purpose).
- Figure fade-out: `11.6→12.4s`, **none** — job: SCRUB (cross-dissolve).
- Hands off to eyes: eyes' own scene fade-in (`0→1s` local, global `t≈19.8→20.8`) and its clip-path iris-reveal (`0→1.6s` local) both start as palm's figure is already fading past `t=20.8`, before palm's hold ends at `t=22`. The two scenes genuinely overlap for ~1.2s, by design: the face is meant to arrive out of the rift the portal just opened. **This is the handoff the docs already singled out** (`eyes.js` comment: "the face arrives out of the palm's rift... fully opaque before the sky starts to flood, so a half-faded face over the red sky never reads as a smear"). Verified still true by source: `fig` opacity reaches 1 at local `t=0.95s` (global ≈20.75), red sky (`genjutsu`) doesn't start its flip until local `t=1.6s` (global ≈21.4) — a 0.65s margin. Clean.

### Eyes (`js/hero/scenes/eyes.js`), 19.8–33.8
- Clip-path iris reveal: `0→1.6s`, **power2.in** — job: REVEAL.
- Figure opacity-in: `0.05→0.95s`, was **power1.out**, now **power2.out** — job: ENTRANCE (fixed, see §4.1).
- Figure scale-down (1.14→1): `0.05→5.55s`, **power2.out** — job: ENTRANCE.
- Rim glow ramp: `1.6→4.2s`, **power2.inOut** — job: FX_RAMP.
- Red-sky flip/moon: `0→14s` driven continuously, **none** — job: SCRUB.
- Eye-fire glint: `2.2→4.8s`, **power2.out** — job: ENTRANCE.
- Beat text: `4.2s`/`8.8s` via `beat()` — ENTRANCE/EXIT, standardized.
- Figure exit: `9→10.4s`, **power1.in** — job: EXIT.
- Scene fade-out: `13→14s`, **none** — job: SCRUB.
- Hands off to desk: desk's crow burst starts at its local `t=0`, global `t=28.8` — 5s before eyes' own hold ends at `t=33.8`, i.e. a long 5s overlap window (`desk` overlap is the largest of any scene, `5s`). The crows are meant to be what the dissolving portrait turns into (desk.js comment: "the portrait breaks into a flock of crows"); eyes' figure is already faded to 0 by `t=10.4` local / `t=30.2` global, well before desk's crow burst peaks. **Clean**, and the long overlap is clearly deliberate, not a seam.

### Desk (`js/hero/scenes/desk.js`), 28.8–40.8
- Crow burst (desk opacity jumps to 1 instantly, `duration: 0.01`): `t=0`.
- Crow flight: `0→5.2s`, **none** — job: SCRUB.
- Desk plate clip-reveal: `2.2→4.6s`, **power2.in** — job: REVEAL.
- Plate settle (scale 1.18→1): `2.2→5.2s`, **power2.out** — job: ENTRANCE.
- Plate slow push (scale 1→1.07): `5.2→12s`, **none** — job: SCRUB (ambient, tied to remaining scroll).
- Code-screen typing (anime.js, default; `?code=gsap` shows the older `code-screen.js`): `3.4→9.6s`, internal build/break/hold curves (see §4.1) — job: SCRUB (`render(p)` is seeked by scroll progress both ways).
- Beat text: `5.4s`/`9.3s` via `beat()` — standardized. Comment in source already notes this was placed so the line leaves before the hand-off's burn starts (2s before desk's own end), confirmed: beat exit finishes at `10.1s` local (`global 38.9`), handoff's burn starts at global `38.8+0.4=39.2` — 0.3s clearance. Tight but clean.
- Hands off to handoff: desk is explicitly hidden by `handoff.js` (`tl.set(desk, {autoAlpha:0}, BURN_DONE)`) once the flames have visually covered it — not a cross-dissolve, a deliberate occlusion-then-hide. This was the handoff fixed in `f282847`.

### Handoff (`js/hero/scenes/handoff.js`), 38.8–46.8
- Burn: `0.4→5.4s`, **none** — job: SCRUB (code comment: "Linear: an eased burn raced across the frame in a short flick of the wheel" — a deliberate, already-documented rejection of easing here).
- Desk hidden: at `BURN_DONE ≈ 4.8s`.
- Burn-layer fade: `4.8→6s`, **power2.inOut** — job: FX_RAMP.
- DJ stage in (brightness/blur/scale): `4.4→6s`, **power2.out** — job: ENTRANCE.
- DJ stage push: `6.8→8s`, **none** — job: SCRUB.
- Beat text in: `5.55s` via `beat()` — standardized.
- Hands off to the page: at `t=8` (global 46.8) the pinned `.hx-pin` releases and native page scroll takes over into the `story` section. No GSAP-side exit needed here — the pin simply ends and the page's existing background color (which the burn layer already matched) is what's left on screen.

### Rest of the page (outside the hero's pinned film)
- **Story rail / chapter tracking** (`js/story/scrolly.js`, `rail.js`, `zone.js`): `IntersectionObserver`-driven, no animation itself — just toggles `.is-active`/`aria-current` and a `--progress`/`--fig` custom property that CSS reads. No easing to unify; it's state, not motion.
- **Project-timeline reveal** (`js/story/reveal.js` + `css/base.css` `.reveal-on`): staggered fade+rise (`translateY(12px)`+opacity), `--dur-slow` (600ms) / `--ease-out` (`cubic-bezier(0.2, 0.7, 0.1, 1)`), `40ms` per-child stagger. **Already consistent** with the UI-chrome system (tokens.css) — this is the site's actual "section entrance" system outside the hero, and it already behaves as one.
- **Mobile stage clip** (`js/story/slot-clip.js`): no transition, a `clip-path` set synchronously per scroll frame — a hard clip, not an eased motion; correctly has no ease to unify.
- **Story numeral drift** (`css/story.css`): `animation-timeline: view()`, native CSS scroll-driven animation, **linear**. A third scroll-reactivity *mechanism* (GSAP scrub, IntersectionObserver class-toggle, and this), isolated to one decorative numeral. Left alone — see §4.

## 2. The system

Two layers exist for two different reasons, and they shouldn't be forced into
one vocabulary: the **hero film** is one continuous GSAP timeline where
"progress" is always a local 0..1 fraction of scroll, so its curves answer
"how does local scroll-fraction map to visual change." The **rest of the
page** is discrete, triggered content (on-load, in-view, hover, theme
toggle), where "progress" is wall-clock time after a trigger. Forcing a
scroll-scrub easing vocabulary onto a one-shot hover transition (or vice
versa) would be a category error, not a fix — so §2.1 and §2.2 are each a
complete, independently-consistent system, and the real seams were the ones
*within* each layer (found and fixed in §3), not between them.

### 2.1 Hero film (GSAP, `js/hero/`)

| Name | Curve | Job |
|---|---|---|
| **ENTRANCE** | `power2.out` | Something settling into place as it arrives: opacity/scale resolving, a beat line rising in, the DJ stage lighting up. |
| **EXIT** | `power1.in` | Something leaving, softer and slower to start than it is to finish: beat lines leaving, copy clearing before the next scene. |
| **REVEAL** | `power2.in` | A mask or clip opening, accelerating: the clip-path iris/plate reveals. |
| **EMPHASIS** | `power1.inOut` (GSAP) / quadratic equivalent (hand-rolled JS, see §4.2) | A continuous, scrub-driven camera move: gentle at both ends because it's felt the whole time it's on screen, not just at a cut. |
| **FX_RAMP** | `power2.inOut` | A dramatic shader/glow ramp (portal opening, rim glow, the burn-layer fade): stronger than EMPHASIS on purpose — these read as effects, not camera work. |
| **SCRUB** | `none` (linear) | Anything whose rate should track scroll 1:1 with no remapping: cross-dissolves, pose-flow, orbit spin, crow flight, code typing, ambient pushes. |

`js/hero/timeline-utils.js` already encodes the two most common jobs as
shared helpers rather than inline literals: `beat()` is ENTRANCE-in/EXIT-out
for copy, `fade()` defaults to SCRUB for scene cross-dissolves. These are the
system's real enforcement point — every scene already calls them instead of
hand-rolling, and that's what's kept the EXIT/SCRUB jobs this consistent
already.

### 2.2 Rest of the page (CSS + small DOM scripts)

| Name | Mechanism | Curve/duration | Job |
|---|---|---|---|
| **LOAD-APPEAR** | CSS `@keyframes`, `css/hero-appear.css` | `cubic-bezier(0.16, 1, 0.3, 1)`, 0.8s (copy) / 1.05s (photo) | Plays once on load, before any scroll: the page resolving into view. |
| **CHROME** | CSS `transition`, `css/tokens.css` (`--dur-fast`/`--dur`/`--dur-slow`, `--ease-out`) | `cubic-bezier(0.2, 0.7, 0.1, 1)`, 160/280/600ms | Hover/focus/press states: nav links, buttons, the rail, the fader. |
| **REVEAL-ON-SCROLL** | `IntersectionObserver` + CSS `transition`, same tokens as CHROME | `--dur-slow`/`--ease-out`, 40ms stagger | Section/content entrances past the hero (project timeline, story blocks). |
| **THEME-SWITCH** | View Transitions API + Web Animations API, `css/base.css` + `js/story/resonance.js` | `cubic-bezier(0.45, 0, 0.25, 1)` | The radial wipe and its trailing ripples/kicks on theme toggle — its own job (a wavefront), correctly its own curve. |

## 3. What was brought onto the system (fixed)

### 3.1 `js/hero/scenes/eyes.js:47` — figure opacity-in was `power1.out`, now `power2.out`
In the same breath (`t=0.05s`) the figure's scale-down already uses
`power2.out` (ENTRANCE). Its opacity was the one property anywhere in the
film using `power1.out` for an arrival — every other entrance (fire, plate,
DJ stage, the shared `beat()` helper) converges on `power2.out`. One word
changed; duration and timing untouched.

### 3.2 `css/hero-appear.css:15` — the portrait's on-load curve now matches the copy's
`hx-appear` (every other on-load element) used `cubic-bezier(0.16, 1, 0.3,
1)`; `hx-photo` (the portrait only) used a different curve,
`cubic-bezier(0.33, 1, 0.68, 1)`, for what is the same job — resolving into
view on load, in the same beat as the copy around it. Now both use the same
curve; the photo keeps its own longer duration (1.05s vs 0.8s) and its
blur+saturate treatment, since it's a heavier element and that duration
difference is a deliberate emphasis choice, not a seam.

### 3.3 `css/stage.css:15` — removed a phantom near-duplicate curve
`--ease-draw: var(--ease, cubic-bezier(0.2, 0.7, 0.2, 1))` carried a fallback
that only differs from the real token (`--ease-out: cubic-bezier(0.2, 0.7,
0.1, 1)`, aliased to `--ease` in `tokens.css`) by one coordinate (0.2 vs
0.1) — and `--ease` is always defined, so the fallback was dead code that
could only ever matter if someone later removed the token, at which point
it would silently diverge instead of erroring. Collapsed to `var(--ease)`.

## 4. What was deliberately left alone, and why

### 4.1 `code-screen-anime.js`'s `outExpo` snap vs. the film's `power2.out`
The code-shatter "snap back" (`js/hero/fx/code-screen-anime.js`, HOLD phase)
uses anime.js's `outExpo`, a much sharper deceleration than the
`power2.out`/cubic family used everywhere else for an ENTRANCE. Its
build-in (`outQuad`) and drop-out (`inQuad`/`inOutQuad`) phases already
match the film's power1-family shape, so only this one curve stands out.
Left alone on purpose: this is a digital snap (code re-assembling), not an
organic settle (a figure, a stage lighting up), and the brief for this exact
beat (commit `3c16b8e`) is "typed char by char; code shatters red; holds:
snaps back" — a sharper, more mechanical snap is the right read for that
idea, not a seam to sand off. It is also not bounce/overshoot (monotonic,
no overshoot past 0), so it doesn't violate the no-spring constraint.

### 4.2 `timeline-utils.js`'s `easeIn`/`easeOut`/`easeInOut` aren't one matched family
`easeOut` is a cubic curve; `easeIn` and `easeInOut` are quadratic. As a
*named* utility trio this reads like it should be one family (mirror images
of each other), and it isn't. In practice every call site already lands in
the right bucket by what it's used for (palm's camera push/dive use
`easeIn`/`easeInOut`, both EMPHASIS; the orbit rise uses `easeOut`,
ENTRANCE) — so there's no place on screen where two uses of "the same job"
visibly disagree. Rewriting the formulas to match would touch three
hand-tuned, scrub-linked moves (the camera push, the dive, and the orbit
rise) that were tuned by eye over several commits (`83e0663`, `507d0e3`,
`181746d`) with no visible defect driving the change — exactly the kind of
"polish for its own sake" the brief's no-bounce constraint warns against
re-litigating. Documented here instead of changed; a future pass with a
specific visual complaint about one of these three moves should fix the
formula, not just the call site.

### 4.3 `js/hero/fx/living.js:201`'s inline smoothstep
The idle camera-arc blend uses `t*t*(3-2t)` (smoothstep) inline rather than
importing `easeInOut` from `timeline-utils.js`. This runs on every
animation-frame tick of an ambient, not-scrubbed loop (per its own header
comment), not from a one-shot `track()` call, so it isn't actually "the same
job" as the shared helper's 0..1 progress curves — it's a continuous
per-frame positional blend with no other instance on the page to disagree
with. Reusing the shared helper would add a cross-file import for a
one-line formula in a hot loop for no visible change. Left alone.

### 4.4 `js/hero/scenes/palm.js`'s portal (`power2.inOut`) vs. the camera's `easeInOut` (EMPHASIS)
Both are "continuous, symmetric, scrub-driven" by job, but the portal uses a
stronger curve (FX_RAMP) than the camera push (EMPHASIS). Kept distinct
deliberately: the portal is a dramatic shader effect (a rift tearing open),
the camera push is meant to be felt, not noticed. Collapsing them to one
curve would make the portal feel more like ambient camera drift, which is
the opposite of what that beat is for.

### 4.5 `css/story.css`'s native scroll-timeline numeral drift
`animation-timeline: view()` is a third scroll-reactivity mechanism besides
GSAP scrub and `IntersectionObserver`, but it drives one purely decorative
numeral drift, not a content entrance. Rewiring it onto either of the
page's two real systems would mean wiring new JS for a cosmetic detail with
no visible inconsistency to fix. Left alone.

### 4.6 `js/story/resonance.js`'s `kick()` using the keyword `ease-in-out`
The theme-switch "kick" on each visible block is a hand-authored
damped-oscillation keyframe shape (`KICK_SHAPE`), where the per-keyframe
interpolation easing is just smoothing between already-authored points, not
the shape of the motion itself (that's what `KICK_SHAPE`'s six values
encode). Wrapping it in the system's `cubic-bezier(0.45, 0, 0.25, 1)` would
double up easing in a way that doesn't map onto a six-point physics curve
the way it does onto a two-point fade. Left alone.

### 4.7 `css/base.css:122-123`'s unused `@keyframes rise`/`@keyframes fade`
Not referenced by any `animation:` rule found in the codebase (the actual
entrance system that looks like it should use these is `.reveal-on`, which
uses `transition`, not `animation`, per §2.2). Likely a leftover from before
`reveal.js`'s current approach. Not a motion-system seam (nothing on screen
uses it), and outside this brief's "delete nothing" boundary to touch beyond
noting it here.

### 4.8 `js/zen-script.js` / `css/zen-style.css` (the "Sakura" cherry-blossom theme)
Confirmed **not loaded** by `index.html` (neither file is linked/scripted
there) — dead code from an earlier theme, not part of the live motion
system at all. Not in scope to fix or unify; noted so it isn't mistaken for
an active seam in a future pass.

## 5. Live verification

**Numeric QA (`avatar-studio/tools/hero-strip.mjs`, ink theme, 0.3s steps,
run across all four scene-boundary windows plus the handoff tail):** no two
scenes' beat text ever show nonzero opacity at the same timestamp (no
collisions), and no window shows both the outgoing and incoming scene near 0
opacity at once (no dead frames) — every handoff is a true crossfade where
the incoming scene is already fully opaque before or as the outgoing one
clears. Confirms the source-level handoff analysis in §1.

**Live browser pass (`aside` CLI, real GSAP/ScrollTrigger session at
http://127.0.0.1:8081, desktop 1440×900, dark/"ink" theme):** `aside` was
available and did drive the real running page — this is runtime-observed,
not source-inferred — but its sandboxed screenshot output didn't
reliably persist to disk for pixel-level review, so verification leaned on
reading live computed DOM state (`opacity`/`visibility` of each
`[data-hx-scene]` and FX layer) at real scroll positions rather than a human
eyeballing frames. **Being explicit about that limit, per the job's own
instruction not to silently skip it:** the findings below are confirmed at
the DOM-state level, not confirmed as "looks right" at the pixel level.
- intro→palm, eyes→desk, handoff→story: clean crossfades, no gap, matches §1.
- palm→eyes: both scenes sit at opacity 1 simultaneously for part of the
  overlap (eyes' clip-path reveals over palm) before palm is hard-set to 0 —
  but only after its visible figure had already faded out ~0.8s earlier via
  its own tween, so the hard cut lands on an already-invisible layer. Not a
  defect.
- desk→handoff: both scenes at opacity 1 throughout, as expected (the burn
  draws over desk via WebGL canvas before desk is hidden) — DOM state can't
  confirm the fire itself is visibly painting, only that the layering is
  correct.
- Fast-flick scrolling (large wheel deltas) produced no console errors and
  landed mid-scene normally; true pixel comparison at flick speed vs. slow
  scroll was not done.
- **Not verified by this pass:** light mode (the theme toggle didn't visibly
  flip in the session), the post-hero story-rail/reveal beats, and any
  genuine "does this look polished" visual judgment — the screenshot
  limitation above blocked all three. One screenshot came back solid black
  after a page reload at a forced scroll position; not reported as a defect
  since a forced jump right after reload (before `ScrollTrigger` re-inits)
  is a plausible test artifact, not a demonstrated bug — would need a slow
  real wheel-scroll from a fresh load to confirm either way.

**`moment-probe.mjs` (ink theme, 1440×900, `t=20.5` — inside the fixed
`eyes.js` entrance, §3.1):** scene opacities and all nine FX canvases report
normal `opacity=1`/`disp=block`, zero console/page errors. The one GSAP ease
change in this job renders clean.

**Net:** the fixes in §3 are verified not to regress anything the harness or
the live DOM-state pass can see. The honest gap is pixel-level "does the
handoff look smooth" judgment, which this environment's `aside` sandboxing
didn't let the browser-watch pass complete — a human pass (or a working
screenshot pipeline) is the one thing this report can't substitute for.
