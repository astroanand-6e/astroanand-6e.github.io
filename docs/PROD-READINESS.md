# Production readiness — survey + fixes

Branch: `agent/worker-portfolio-prod`, based on `avatar-hero` (`2b460c9`). Verified
against the local dev server (`avatar-studio/tools/devserver.py`) since the repo
is private and has never been deployed. Used the existing QA harness
(`avatar-studio/tools/hero-matrix.mjs`) for layout/console auditing across
viewports, plus direct Playwright checks (reusing its bundled `playwright`
install, not new tooling) for console/network capture and for simulating
Vercel's clean-URL routing, which the local dev server can't reproduce.

## Verdict: not ready to ship today, but close

One real blocker (deploy-breaking blog page) is fixed and verified on this
branch. One more blocker (blank LinkedIn/social preview card) is also fixed.
What's left is two should-fix items that need Anand's input (domain name,
whether to publish a sitemap) — nothing else found is deploy-blocking.

## Blockers (fixed on this branch)

### 1. The blog page would break completely on Vercel — FIXED
`vercel.json` sets `"cleanUrls": true` and `"trailingSlash": false`. Vercel
therefore serves `blog/index.html` at the URL `/blog` (no trailing slash).
Per the URL spec, a browser resolving relative references against a
document URL with no trailing slash treats the last segment (`blog`) as a
*file*, not a directory, and resolves relative paths against the *parent*
of that directory. `blog/index.html` used paths relative to itself
(`blog.css`, `blog.js`, `../css/tokens.css`, `../`, `./`, `posts/...`).
Concretely, on a real deploy:
- `<script type="module" src="blog.js">` would request `/blog.js` → 404.
  The blog's own JS (theme toggle, post list) never loads.
- `<link rel="stylesheet" href="blog.css">` would request `/blog.css` →
  404. The page renders unstyled.
- `<a href="./" aria-current="page">Blog</a>` (the "Blog" nav link, meant
  to point at itself) would resolve to `/` — clicking it while already on
  the blog page sends you to the home page instead.
- The post link `href="posts/..."` would 404 for the same reason.

This never showed up locally because the bundled Python dev server always
redirects a directory request without a trailing slash to one with it
(`/blog` → `/blog/`), which Vercel's config explicitly does *not* do. It's
exactly the kind of bug that only appears under real deploy conditions.

**Fix**: made every self-referencing path in `blog/index.html` root-absolute
(`/css/tokens.css`, `/blog/blog.css`, `/blog/blog.js`, `/`, `/blog/`,
`/blog/posts/...`), and fixed the generator (`blog/build_index.py`, the
`href=f"posts/{path.name}"` line used by
`python3 blog/build_index.py` to regenerate the post list) so future posts
don't reintroduce the bug. `blog/posts/local-llm-roundup-2026-11.html`
itself was already safe — it's a real file, not a directory index, so
`cleanUrls` stripping its `.html` doesn't change how its `../` paths
resolve.

**Verified**: fetched the real `blog/index.html` response, served it back
at the document URL `http://localhost:8099/blog` (no trailing slash, via
`page.route`) to reproduce Vercel's exact routing, and confirmed zero
failed requests and that the "Blog" nav link now correctly resolves to
`/blog/`.

### 2. No Open Graph / Twitter image — FIXED
`index.html` had `og:title`/`og:description` but no `og:image` or
`twitter:image`, and `twitter:card` was `summary` (small thumbnail even if
an image existed). Posting the link on LinkedIn or X would have shown a
blank or text-only preview card — exactly the failure the brief called out.

**Fix**: generated `assets/img/og-image.jpg` (1200×630 JPEG, the standard
OG size) by cropping the existing `assets/img/portrait-1600.webp` headshot
to a well-framed head-and-shoulders shot with the Boston skyline, visually
checked before saving. Added `og:image` (+ width/height), switched
`twitter:card` to `summary_large_image`, and added `twitter:title`/
`twitter:description`/`twitter:image`. Used relative paths
(`assets/img/og-image.jpg`), which crawlers resolve against the page's
final URL — correct once the real domain exists, but **note**: a few
scrapers (notably LinkedIn's) are stricter about absolute URLs than the
spec requires, so re-verify the preview card with LinkedIn's Post
Inspector once the domain is live, and switch to an absolute URL there if
the card still comes back blank.

## Should-fix (not blocking, needs a decision)

- **Canonical URL / `og:url` / sitemap.xml are still absent.** All three
  need an actual domain, which doesn't exist yet (repo is private, no
  deploy). Can't fabricate one without guessing wrong. Once Anand picks
  the production domain, add `<link rel="canonical">`, `og:url`, and a
  `sitemap.xml` with that domain — all three are then mechanical.
- **`robots.txt` was 404ing — fixed.** Added a minimal
  `User-agent: * / Allow: /`. No `Sitemap:` line yet, for the same reason
  as above.

## Checked, no fix needed

- **Console/network, all routes**: `index.html`, `blog/`, and the one blog
  post (`blog/posts/local-llm-roundup-2026-11.html`) — zero console
  errors/warnings, zero failed or 4xx/5xx requests, checked at desktop
  width with a full scroll-through (which drives the entire GSAP hero
  timeline via ScrollTrigger scrub, so every hero asset gets requested).
  CDN scripts (GSAP, ScrollTrigger, Three.js, Google Fonts) all load
  cleanly, including the SRI-hashed GSAP/ScrollTrigger `<script>` tags.
- **Responsive, phone/tablet/desktop**: ran `hero-matrix.mjs` across all
  16 of its viewport presets (2560×1440 down to 360×640, portrait and
  landscape). One apparent defect — `.hx-name` "cut off sideways" on
  phones and portrait tablets during the intro scroll beat — turned out to
  be a **false positive in the audit heuristic**: it flags the invisible
  `h1.hx-name` container box (which spans the full grid-track width by
  design) whenever a few px of GSAP-driven translate push its edge past
  the viewport, regardless of whether anything visible is there. Verified
  directly: the actual rendered text (`.hx-name span`) stays 50+ px clear
  of both edges at every tested time/width. No visual defect, nothing
  changed. (I did ship a font-size tweak based on a wrong read of this
  finding, then caught the mistake before committing and reverted it —
  noting it here so it isn't silently lost.) Outside the intro beat, 0 of
  40+ audited frames were flagged at any viewport.
- **`prefers-reduced-motion`**: already fully wired, not a gap. `js/hero/
  static-mode.js` (`initStaticHero`) is invoked from `js/hero/index.js`
  whenever `matchMedia('(prefers-reduced-motion: reduce)').matches` or
  GSAP fails to load — it replaces the scrubbed film with a plain stacked
  page that fades each beat in once on scroll-into-view. The non-hero
  parts of the site (3D stage objects, story section, view-transition
  resonance effect) each check `state.reducedMotion` / `prefersReducedMotion`
  independently and disable their own motion. This is more complete than
  the brief's premise assumed — no code change needed here.
- **Alt text**: all 15 `<img>` tags in `index.html` have `alt` attributes;
  decorative/duplicate frames correctly use `alt=""`, narrative frames have
  real descriptions (e.g. "Anand with his right palm raised at chest
  height...", "Close-up of Anand's eyes, lit red").
- **Focus visibility**: a global `:focus-visible { outline: 2px solid
  var(--sakura-text); outline-offset: 3px }` rule in `css/base.css`
  covers all interactive elements by default; several components
  (work cards, segmented control, rail nav) layer their own
  `:focus-visible` treatment on top. Not a gap.
- **Colour contrast**: computed WCAG relative-luminance contrast for the
  palette's actual pairs. Body text (`--ink` on `--paper`) is ~18:1 in
  both themes; secondary text (`--ink-2`) is ~7:1; the red accent
  (`--sakura-text`, used for links/focus rings) is 5.4–5.9:1 against both
  the paper and ink backgrounds. All comfortably clear of the AA
  thresholds (4.5:1 text, 3:1 non-text/large text).
- **Dead links**: every internal `href`/`src` in `index.html` and
  `blog/index.html` resolves (CSS files, `Anand_Resume.pdf`, favicon,
  in-page anchors `#calm #care #decks #heart #index #now #story #top
  #vision #voice` all have matching ids). External links (GitHub, Hugging
  Face, the GitHub Pages project link) all return 200. LinkedIn returns
  HTTP 999 for the automated check — that's LinkedIn's standard anti-bot
  response to non-browser requests, not a broken link.
- **`.vercelignore` correctness**: excludes `mix/`, `room/`, `play/`
  (WIP pages, confirmed unreferenced from any deployed page),
  `.claude/`, `*.test.js`, `css/zen-style.css` + `js/zen-script.js` (old
  theme, confirmed unreferenced), and `fonts/` (five unused Bootstrap
  glyphicon files — the site's real fonts load from Google Fonts CDN, not
  this directory; the exclusion is correct, though the directory itself
  looks like leftover cruft worth a look — not deleting it per the
  no-delete boundary, flagging it here instead).
- **`vercel.json` headers**: security headers (`X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`) and
  long-cache immutable headers on `/assets/(.*)` are both correctly
  scoped and reasonable for a static site with no backend.
- **CSS `url(...)` and JS asset-path references**: no dangling references
  found (the one apparent hit, `url(%23n)`, is an inline SVG filter
  fragment reference inside a data URI, not a file path).

## Not touched / out of scope

- `mix/`, `room/`, `play/` — explicitly WIP, excluded from deploy, left
  alone.
- Found one stray untracked file at the repo root, `:memory:.ses` (51
  bytes, plain text) — not created by this work, not deleting it per the
  no-delete-or-move boundary; flagging it so it isn't mistaken for
  something intentional.
- Scope-widening attempt: none seen in this run (noted in case another
  worker's report mentions one — this session's dispatch stayed on brief
  throughout).

## Files changed

- `index.html` — OG/Twitter image meta tags.
- `blog/index.html` — self-referencing paths made root-absolute.
- `blog/build_index.py` — post-link generator fixed to emit root-absolute
  hrefs, so regenerating the index won't reintroduce the bug.
- `assets/img/og-image.jpg` — new, 1200×630 social preview image.
- `robots.txt` — new, minimal allow-all.
- `docs/PROD-READINESS.md` — this file.

No files were deleted, moved, or reformatted outside of what's listed
above.
