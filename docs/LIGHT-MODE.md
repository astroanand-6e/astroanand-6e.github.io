# Light mode (paper) audit

Full-site audit of `html[data-theme="paper"]` against the `ink` baseline, done by rendering
both themes with Playwright/chrome-devtools (forced `colorScheme` + `localStorage.theme`,
verified `data-theme` actually flipped) and comparing screenshots pixel-for-pixel, scene by
scene and section by section. Scope was appearance only: no copy, no dark-mode values, no
`.webp` source frames touched.

## Method

- Local devserver (`tools/devserver.py`) on a free port, never the shared 8082/8081.
- Chrome DevTools MCP (`emulate` + `evaluate_script` to drive `__hero.master.time()`) to land
  on each of the 5 hero scenes (intro, palm, eyes, desk, handoff) in both themes.
- For sections below the hero, `element.scrollIntoView()` after a settle delay (the GSAP
  ScrollTrigger pin spacer measures `document.documentElement.scrollHeight` wrong for ~1s right
  after a theme-triggered reload — a load-timing artifact, not a light-mode bug; both themes
  converge on the same `25227px` once settled).
- Contrast ratios computed from the actual token hex values (WCAG relative-luminance formula),
  not eyeballed.

## Findings

### 1. Fixed — eye-fire effects read as dull, flat ink marks on paper

**Surface:** palm scene (eye-ignition streak across the face) and eyes scene (iris glow),
both driven by the shared `.hx-eyefx` canvas (`fx/eye-fire.js`).

**Before:** `html[data-theme="paper"] .hx-eyefx { mix-blend-mode: multiply; }` was already in
place (a previous fix, to stop the effect's added light from vanishing into white paper). But
`multiply` can only ever darken — it has no way to produce the warm bloom a `screen`-blended
glow gives on black. The result on paper was a flat, thin red line with zero halo: correct
in that it didn't disappear, but visibly dull next to dark mode's glowing version. This matches
the live product feedback ("the effects in light mode go dull").

**Fix:** layered two `drop-shadow()`s onto the same rule, applied *before* the blend mode runs
(so the shadow is still subject to `multiply`, and still reads as ink rather than blown-out
light):

```css
html[data-theme="paper"] .hx-eyefx {
  mix-blend-mode: multiply;
  filter: drop-shadow(0 0 6px rgba(192, 0, 0, 0.55)) drop-shadow(0 0 18px rgba(192, 0, 0, 0.3));
}
```

`drop-shadow` follows the alpha channel of the canvas (and respects its existing mask-image on
the eyes scene), so it bleeds a soft red halo just past the streak/iris edge — giving back the
glow quality without ever brightening past paper white. Dark mode is untouched (`screen` blend,
no new rule added there).

**Also bumped** the paper-only rim light on the eyes-scene figure from `26px / 0.4` alpha to
`30px / 0.5`, closer to (but still softer than) ink's `30px / 0.55`, so the close-up portrait's
face glow has comparable presence in both themes without matching it exactly (paper doesn't
need as much — the effect is additive on top of a lit face, not a black void).

### 2. Checked, no defect — "SEE THE WORK" cue on the handoff/DJ scene

Visually looked low-contrast in a thumbnail (dark gray text on a dark club photo), but the
existing paper override (`html[data-theme="paper"] .hx-handoff .cue { color: #d8d6d0; }`,
already in the codebase) is active and computes to `rgb(216, 214, 208)` — confirmed via
`getComputedStyle`. No change needed.

### 3. Checked, no defect — index-section illustrations read faint on paper

The isometric SVG illustrations (desk setup, ECG monitor, DJ gear) sit at very low opacity
while their section is the active scroll "zone" (`html[data-zone="index"] #stage { opacity:
0.12 }`), by design — the dimming makes the index cards pop. This is symmetric in both themes
(it's an opacity on the shared SVG, not a color), and where I compared the *settled* Heart/Vision/
Care/Decks/Calm/Voice/Now sections directly, paper's illustrations were legible (sometimes more
so than ink's, which uses dark lines on a near-black field). No light-mode-specific issue.

### 4. Checked, no defect — hero copy, below-hero sections, blog

Hero intro name/kicker/sub copy, the five pinned-scene beat lines and kickers, all seven story
sections (stat tiles, buttons, sliders, rhythm/mask/conveyor pickers), the footer
(education/skills/contact), the blog index, and a full blog post page (skill-matrix table,
scatter chart, model cards) all render with solid contrast in paper. Measured:

| Pair | Ratio | WCAG AA (text) |
|---|---|---|
| `--ink` (#0a0a0a) on `--paper` (#f4f4f2) | 17.98:1 | pass (needs 4.5:1) |
| `--ink-2` (#55534f) on `--paper` (secondary text) | 6.97:1 | pass |
| `--sakura-text` (#c00000) on `--paper` (kickers, links) | 5.88:1 | pass |
| `--sakura` (#d40000) on `--paper` (graphics only, not text) | 5.02:1 | pass (3:1 needed for large/UI) |
| `--on-accent` (#fff) on `--sakura` (#d40000) (filled buttons) | 5.53:1 | pass |

No borders, dividers, drop shadows, or red accents were found to vanish, vibrate, or go pink
on paper; `--rule` / `--rule-strong` and the existing per-scene paper overrides (desk-plate
mask, static-mode eyes gradient, handoff beat colors, halo rings) all held up against direct
side-by-side screenshots.

## Left deliberately alone

- The index-zone dimming (`opacity: 0.12`) described in finding 3 — it's shared, intentional,
  and not theme-specific.
- The intro/palm anamorphic-streak clamp note already in `hero.css` (lines 60-69) — a separate,
  already-documented issue outside this job's scope, per the comment left by the prior worker.
- No copy was touched anywhere (voice-dna compliance: not applicable, since no text changed).

## Regression check

Dark mode (`ink`) screenshots taken before and after the `hero.css` edit are pixel-identical
for every scene — both new rules are scoped to `html[data-theme="paper"]` only, and no existing
ink-mode selector or value was edited.
