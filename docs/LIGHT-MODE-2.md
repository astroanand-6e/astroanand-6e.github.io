# Light mode, round 2: art direction

`docs/LIGHT-MODE.md` (Meredith) audited every surface for contrast and found the theme
technically clean - all pairs pass WCAG AA, one real defect fixed (eye-fire glow going flat on
paper). The user still rejected the light theme after that pass. Passing contrast was never the
problem; the hero's procedural effects were authored and tuned by eye against a black canvas, and
several of them read as something other than what they're meant to be once the canvas turns white.
This pass is a design-lead judgment call on the rendered pixels, not another contrast sweep.

## Method

Own devserver (port 8099, not the shared 8082), Chrome DevTools MCP, `localStorage.theme` forced to
`paper`/`ink` and `data-theme` verified on the live DOM after each reload (`prefers-color-scheme`
has no effect here - `js/theme.js` only reads the saved value, ink is the unauthenticated default).
`window.__hero.set(progress)` landed on the midpoint of each of the 5 scenes for repeatable,
side-by-side screenshots in both themes. Below-hero sections, the footer, and the blog were
screenshotted and read for the same "does this look considered" judgment, not re-measured for
contrast (Meredith already did that and nothing here contradicts it).

## Findings and fixes

### 1. Fixed - intro/palm eye-ignition reads as a scar, not a glow

**Surface:** `.hx-eyefx` canvas (`js/hero/fx/eye-fire.js`), shared by intro, palm, and eyes.

Meredith's fix (`mix-blend-mode: multiply` plus a two-layer `drop-shadow`) is real and the right
approach - multiply is the only way added light doesn't vanish on white - but at normal viewing
size the two blur radii (6px/18px) only softened the mark's own hard edge. The result at full
resolution was a crisp, flat maroon line with no visible light around it: unmistakably a facial
scar or dried blood, not the glowing HUD-scan effect the dark theme sells. This is a worse failure
than "dull" - it reads as the wrong thing, not a weak version of the right thing.

**Fix, two parts:**
- `js/hero/fx/eye-fire.js`: `PAPER.glow` raised from `0.12` to `0.22`. This was deliberately killed
  almost to zero out of fear it would "stain" the face; a small increase gives the drop-shadow
  filter actual soft alpha to amplify, instead of just blurring a hard line.
- `css/hero.css` `.hx-eyefx` paper filter: three `drop-shadow` layers (3px/16px/38px) instead of
  two (6px/18px). The wide outer layer is what actually bleeds a visible warm halo past the ink
  edge at full hero scale - the original two layers never reached past the mark itself.

Confirmed on intro (closest view of the mark) and re-confirmed on palm mid-crossfade; both now read
as a warm red glow with presence, not a cut.

### 2. Fixed - eyes-scene sky reads as a pastel gradient, not an ink wash

**Surface:** `.hx-sky` canvas, `js/hero/fx/genjutsu.js`, `u_light` branch.

The code comment already named the intent correctly ("a sumi-e variant... a pale vermilion wash
that deepens toward the horizon"), but the actual color ramp anchored the upper frame on
`vec3(0.975, 0.9, 0.88)` - a saturated peach close enough to pastel pink that the whole frame read
as a sweet gradient-background template, not ink bleeding into paper. The cloud-band mask also
only reached partial opacity over most of its area, so the "ink bands" read as soft gray smoke
rather than brush strokes.

**Fix:** anchored the wash closer to warm ivory (`0.96, 0.935, 0.91`) and steepened the falloff
exponent (1.7 to 2.6) so the upper frame stays near-paper and only the lower reach, nearer the
horizon and the figure, carries real color - matching how a sumi-e wash actually sits on the page.
Pushed the cloud-mask multiplier from `0.82` to `1.1` so bands saturate to true ink more often
instead of sitting at partial mix. Verified with a pixel crop of the frame's top-left corner:
before, a visible pink cast; after, neutral off-white matching the page paper. The mid-to-lower
frame still carries intentional color (that's the "deepens toward the horizon" design, not a bug),
so the full-frame screenshot still shows warm color - just less of it, and starting later.

### 3. Fixed - handoff "burn" ash reads as a dirty brown stain, not char

**Surface:** `.hx-film` burn canvas, `js/hero/fx/burn.js`, `u_light` branch.

The light-mode char ramp passed through `vec3(0.38, 0.12, 0.08)` - a warm brown - as its midpoint
on the way from near-black to paper, and that brown occupied most of the visible burnt area (the
smoothstep from char to paper only started at the same point the brown took over). The result
looked like spilled coffee or a bruise fading into white, not fire damage. This was the clearest
"looks broken" scene in the original pass.

**Fix:** swapped the brown midpoint for a neutral warm gray (`0.58, 0.55, 0.52` - real ash is
achromatic, not brown) and tightened the char-to-paper smoothstep range (`0.3-0.85` instead of a
bare `wash`) so that gray band stays a thin transition instead of dominating the frame. Before/after
screenshots at the same scrub position: before, a muddy tan smear with red cracks; after, genuine
dark char cooling to gray ash with the same red cracks and embers, reading as deliberate as the
dark-mode version.

### 4. Checked, no defect - palm scene, desk scene

Palm's orbiting tool icons and halo ring (each on their own white/shadowed backgrounds, independent
of the shared canvas fixes above) read correctly in both themes - no streak is visible at this
point in its timeline (`palm.js` sets `streak: 0`). Desk's photographic plate and teal LED glow are
unchanged by theme beyond the existing paper text-shadow override; the only difference is a light
vignette at the frame edges, present and equivalent in both themes.

### 5. Checked, no defect - below-hero sections, footer, blog

Selected-work cards, the Skills/Contact footer, and the blog index all read as a deliberate,
restrained editorial system in paper: warm off-white cards with soft borders, serif display type,
monospace tags, hairline rules, italic headers. Nothing here looked like an unstyled default or a
flat #fff-on-#000 theme flip. This matches Meredith's finding 4 and nothing here changes it - no
edits were made outside the hero.

## Left deliberately alone

- The genjutsu sky still carries real color through its lower half and near the horizon - that's
  the documented "wash deepens toward the horizon" intent, not a residual bug. A fully neutral sky
  would contradict the design comment and flatten the one scene most meant to feel like a world
  flipping, not just a filter.
- Desk and palm scenes needed no changes; nothing was touched there beyond re-confirming them.
- No copy was changed anywhere (voice-dna compliance: not applicable, no text touched).
- No `.webp` source frames were touched; all three fixes are procedural (CSS filter values and
  WebGL/canvas color math inside existing `u_light`/paper-only branches).

## Regression check

All three effect files guard their light-mode-only changes behind `u_light > 0.5` (the shaders) or
a `PAPER`-only constant (`eye-fire.js`); the ink/dark-mode code paths are untouched by construction.
Confirmed by screenshotting intro, eyes, and handoff in `ink` before and after the edits at the same
scrub positions: visually identical in every case. The CSS change is scoped to
`html[data-theme="paper"] .hx-eyefx` and does not touch the unscoped `.hx-eyefx` base rule that ink
uses.
