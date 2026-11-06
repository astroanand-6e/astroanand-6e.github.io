# Copy audit — confidence pass

Scope: every user-visible string in `index.html`, `blog/`, `room/`, `mix/` (including
`mix/js/lessons/*` lesson copy), `play/` (unbuilt, nothing to review), alt text, meta
descriptions, button/link labels. No 404 page exists in the repo.

**Headline finding: the copy is already in good shape.** It reads as written against
`/Users/anand/career-ops/voice-dna.md` (short paragraphs, active voice, specific numbers,
no banned AI vocabulary, no negative-parallelism reframes). `mix/js/lessons/copy.test.js`
already runs an automated check for banned words, em dashes, number-words-as-digits and
reframes across all lesson source files, and it passes clean (6/6). That lane was already
covered before this pass; I did not duplicate it by hand.

I found exactly one hedging/confidence problem, worth fixing, and one real gap (a project
card with no quantified result) that needs Anand's input, not a rewrite, since the number
doesn't exist anywhere in his own materials (checked `Anand_Resume.pdf` too).

## Flagged lines

| File | Line | Problem | Rewrite |
|---|---|---|---|
| `index.html` | 313 | "I'm a beginner DJ on a white DDJ-FLX4. I mix for fun." — self-deprecating skill framing ("beginner") right before a stats block (`dl.spec`) that otherwise reads like an achievements list (92.0% Dice, AUROC 0.871, etc.). On a page aimed at a Bose-style audio/AI review, naming yourself a "beginner" at the one hobby that overlaps your target domain undercuts rather than charms. | "I taught myself to mix on a white DDJ-FLX4. I do it for fun." — same facts, same voice (short, concrete, self-directed), framed as initiative instead of apology. |
| `index.html` | 317 | `<dt>Skill level</dt><dd>Beginner</dd>` inside the Decks spec list — the only self-rated, non-measured stat on the entire site; every sibling stat elsewhere (Dice, AUROC, WER, p50 latency) is a number. "Beginner" sitting in that slot reads like a disclaimer next to hard data. | Replace with `<dt>Approach</dt><dd>Self-taught</dd>` — keeps `data-n="3"` (layout-safe), stays a plain fact, matches the "built it from scratch" register used for ViT/MAE elsewhere. |

## Flagged gap (not a tone problem — needs Anand, not a rewrite)

- **`index.html` lines 229–233 (and the matching `#heart` section, lines 252–258): ResFormer card has no quantified result.** Every other project card states a number that proves the engineering worked (CALM 83.9%, Astro 0.974 purity, CoronarySAM2 92.0% Dice, CDSS AUROC 0.871, VentureViz is a non-metric viz tool so it's exempt). ResFormer says "ResNet plus Transformer encoder, compared against Bi-LSTM and attention variants. First author." with no accuracy/F1/AUC. I checked `Anand_Resume.pdf` — it has the same gap, no metric anywhere for ResFormer. **I'm not fabricating a number.** If Anand has the paper's reported accuracy/F1/AUROC, add it to both the project card (line ~231) and the Heart story step (line ~257); until then this is the one card where a reviewer can't verify "it worked" in ten seconds.

## Recommend CUT (not deleted — Anand's call)

- **`index.html` line 433: `CGPA 7.58/10`.** Not hedging language, it's a plain fact, so I didn't touch it. But it's the one disclosed number on the page that reads as a mild weakness rather than a strength, in a section (Education) that otherwise carries no editorial judgment calls. Common practice for a strong candidate is to omit an unremarkable GPA rather than state it. Recommend cutting the number (keep "B.Tech in Computer Science & Engineering, Chennai." alone); leaving it in place does no real harm either.

## Checked and found clean (no edit needed)

- Hero film beats, all 7 story-timeline sections, work-grid project cards 1–4 and 6, publications/experience/education/skills/contact rows, footer, help dialog, meta/OG descriptions, JSON-LD, all `alt` text, `room/index.html`, `mix/index.html`, `blog/index.html`, the one published blog post, and every lesson `title`/`blurb` in `mix/js/lessons/unit*.js` — specific, active-voice, no hedge words, no inflation, each answers what/built/why-hard within its own scope.
- Searched the whole repo's HTML for hedge markers (`learning to`, `aspiring`, `trying to`, `hope to`, `passionate about`, `hobby project`, `simple little`, `just a`, `coming soon`, `we will be`, `under construction`, `placeholder`, `TBD`, `FIXME`) and inflation markers (`world-class`, `cutting-edge`, `unparalleled`, `the best`, `game-changing`, etc.) — only the two DJ lines above and one unrelated verbatim quote inside the blog post's Reddit-paraphrase block (`"it's just a classifier"`, a direct community quote, correctly left alone).
- `play/` has no HTML yet (only a test stub), so there's nothing to audit there. Note: `room/index.html`'s WebGL-fallback section links to `../play/`, which doesn't resolve to real content yet. That's a functionality gap for whichever worker owns the `/play` build, not a copy problem — flagging here so it doesn't get missed, not fixing it (out of my lane).

## Boundaries honored

Worked only in this repo, on `agent/worker-portfolio-content` off `avatar-hero` (2b460c9).
Two small edits applied directly to `index.html` (lede line + one `dl.spec` entry); no other
file touched, nothing reformatted, nothing deleted. No motion/animation touched — did not go
near `js/hero/scenes/palm.js` or anything covered by the no-bounce constraint. Committed
locally only.
