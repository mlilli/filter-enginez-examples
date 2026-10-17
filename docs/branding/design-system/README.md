# Filter EngineZ — Design System

> Dark, moody, sophisticated, slightly futuristic. The visual anchor metaphor is the **neural synapse** — data flowing
> through a network of nodes, signals lighting up, predicates firing.

## What this is for

**Filter EngineZ** is an open-source TypeScript library for adding rich, data-driven filtering UIs to any web app. The
engine itself is framework-agnostic; this design system is what gives its showcase a single visual identity across six
demo apps and three datasets (real estate, wine, books):

- `examples-react-rtk/` — React + Redux Toolkit
- `examples-react-plain/` — React, no Redux
- `examples-sveltekit/` — SvelteKit
- `examples-vue/` — Vue
- `examples-angular/` — Angular
- `examples-vanilla/` — framework-free TypeScript

These demo apps are the showcase. They must read as **a single, premium, modern product** — not a Bootstrap demo, not a
stock shadcn install. Target audience: other developers, tech leads evaluating libraries, designers checking design
quality, recruiters reviewing portfolios.

## Index

| File / Folder            | What it is                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors_and_type.css`    | Canonical design tokens — grays, accent, status, type scale, spacing, radii, motion                                                                                     |
| `fonts/`                 | Self-hosted variable webfonts — Inter, JetBrains Mono, Orbitron — each with its SIL Open Font License                                                                   |
| `assets/loaders/`        | The three canonical loaders (Synaptic Orbit, Neural Cluster, Brain Synapse). Start at `assets/loaders/index.html`                                                       |
| `assets/logomark/`       | **Canonical FilterEngineZ logomark** — SVG sources, PNG exports at every size, lockups, favicon set, OG card, brand-usage doc. Start at `assets/logomark/showcase.html` |
| `preview/`               | Single-purpose preview cards, one per component or token group — the specs the components implement                                                                     |
| `ui_kits/filter-engine/` | High-fidelity interactive React mockup of the demo apps' filter shell — three example datasets                                                                          |

---

## Content Fundamentals

The Filter EngineZ demo apps talk like a tool built by engineers who care about engineering, for engineers who care
about engineering. Confident but never marketing-y. Specific over vague.

**Voice:**

- **Direct, technical, lowercase-leaning UI labels.** "Clear all", "Filter by region", "237 results" — not "Reset Your
  Search!" or sentence-case marketing copy.
- **Engineer-to-engineer.** When a result is hidden because zero items match, the tooltip says "selecting this would
  yield 0 results" — accurate, factual, no exclamation marks.
- **No emoji** in product UI. Emoji read as casual; this system reads as instrumented.
- **No first-person.** UI doesn't say "I think you'll like…". It says "Suggested next filters: Pinot Noir (P=0.78),
  Vintage 2015 (P=0.62)" — probability shown in JetBrains Mono.
- **Numbers are sacred** — always in JetBrains Mono with `font-variant-numeric: tabular-nums`, never in the body font.
  Counts, prices, dates, percentages, IDs, rule expressions.
- **Status copy is calm.** "Couldn't load data. Retry?" not "Oops! Something went wrong!"

**Casing:**

- UI labels and button text: **sentence case** ("Clear filters", "Save preset")
- Section / nav titles: **sentence case** ("Active filters", "Devtools")
- The wordmark and hero titles: **UPPERCASE with letter-spacing**, Orbitron only
- Code, identifiers, rule names: **lowercase / camelCase** ("InSetRule", "valueRule"), JetBrains Mono

**Examples (verbatim copy patterns to use):**

```text
237 results · Burgundy · Pinot Noir · 2015–2020         (active-filter chip bar)
Suggested next: Vintage 2015 (0.78) · Body: Full (0.62) (Bayesian suggestion)
No results match your filters. Clear filters?           (empty state)
Loading filters…                                        (live-region announcement)
selecting this would yield 0 results                    (disabled tooltip)
filter saved · undo                                     (toast)
```

---

## Visual Foundations

**Mode.** Dark only. Light mode is explicitly out of scope.

**Palette.**

- 12-step **warm/clay grayscale** ramp from `--gray-0` (#0B0A09) to `--gray-11` (#F1ECDF). Subtle warm hue (~35°) at ~3%
  chroma — almost imperceptible warmth, but enough to make the cyan accent feel cool by contrast.
- **Paired-accent system: cyan + phosphor.**
  - **Cyan** (`--accent` #22D3EE, glow #67E8F9) = **data / identity / what**. Carries the synapse metaphor. Links, focus
    rings, selected states, primary CTAs, the result count, filter-chip dots, the synapse glow itself.
  - **Phosphor** (`--engine` #F97316, glow #FED7AA) = **activity / computation / when**. The CRT-era amber-orange that
    reads as electrical/engine activity. Time-travel cursor in devtools, "computing" indicators, recompute states,
    undo/redo press feedback, the secondary loading animation (Neural Cluster). Never for data references or primary
    CTAs.
  - The two accents are temperature-paired (warm + cool) and semantically disjoint. Never use them interchangeably — if
    you reach for phosphor, you're saying "the engine is firing right now." Cyan = the data. Phosphor = the work being
    done on the data.
- Status colors (`--danger`, `--warn`, `--success`, `--info`) appear only when their meaning applies. Not decorative.

**Type.**

- **Inter** for 90%+ of UI text. Variable axis, weight 400–700.
- **JetBrains Mono** for numbers, rule expressions, IDs, timestamps, devtools log entries.
- **Orbitron** is reserved for moments of brand identity only — the wordmark, hero page titles, occasional
  devtools-panel chrome. Never for general headings.
- Modular scale 1.25 (major third), 12px → 56px.

**Backgrounds.** Flat color, full-bleed. The hero backgrounds use a _very_ subtle radial gradient (`--gray-1` center →
`--gray-0` edges) for depth without drop shadows. No textures, no repeating patterns, no photography behind UI.

**Imagery vibe.** When dataset cards include photos (real-estate listings, wine bottles), they sit inside dark cards and
use mild desaturation + a slight cool/cyan cast on hover — never neon, never warm-orange-graded. B&W is acceptable for
placeholder states.

**Animation.**

- Default easing `cubic-bezier(0.32, 0.72, 0, 1)` (ease-out, quick start, gentle landing). Both-ends-at-rest transitions
  use `cubic-bezier(0.85, 0, 0.15, 1)` (ease-in-out).
- Durations: **150ms** for micro-interactions, **300–400ms** for state changes, **600–800ms** for narrative moments
  (filter chip slide-in, result-count tick).
- Only `transform` and `opacity` are animated. Never `height`/`width`/`top`/`left`.
- `prefers-reduced-motion: reduce` collapses every animation to 0.001ms.
- The brain-synapse loader is the signature piece. See `assets/loaders/index.html` and
  `preview/brain-synapse-loader.html`.

**Hover states.**

- Surfaces: lift one step on the gray ramp (`--gray-1` → `--gray-2`, etc.).
- Buttons and selectable rows: slight accent glow (`box-shadow: 0 0 0 1px var(--accent-dim)`).
- Links: text color shifts from `--accent` to `--accent-glow`.
- Never use underline-on-hover for non-link affordances.

**Press states.** No shrinking. Instead, color darkens one step (button background `--accent` → `--accent-strong`) and
any active glow tightens.

**Focus states.** 2px ring in `--accent-glow` with a 2px offset against `--gray-0`. Implemented via `box-shadow`,
surfaced only on `:focus-visible` (not `:focus`).

**Borders.**

- Hairlines (`1px solid var(--gray-4)`) divide adjacent surfaces of similar elevation.
- Default container borders (`1px solid var(--gray-5)`) for cards, inputs, popovers.
- Stronger borders (`1px solid var(--gray-6)`) only on inputs in their focused or filled states.

**Shadows.** Used sparingly. Modals/popovers get `--shadow-lg`. Floating action elements get `--shadow-md`. Flat cards
on the main page get none — they're separated by gray-ramp contrast, not by shadow. The glow shadow (`--shadow-glow`) is
reserved for the accent-state shadow on active filter chips and on hover-pulses inside the brain-synapse loader.

**Capsules vs. gradients.** Active filter chips are **capsules** (pill-shaped, `border-radius: 9999px`, `--gray-2` bg,
hairline `--gray-5` border, accent dot indicator). Hero backdrops use subtle gradients only — never on flat panels.

**Layout rules.**

- Fixed app header (height 56px), fixed sidebar (width 320px), fluid main content.
- Devtools panel slides over the right edge, 400px wide, doesn't push content.
- Mobile: sidebar collapses to a drawer below the `lg` breakpoint (1024px).
- Container max 1440px; the results grid auto-fills columns with a 280px minimum track, so it steps 4 → 3 → 2 → 1 as
  width allows.

**Transparency & blur.**

- Modal backdrops: `rgba(0,0,0,0.65)` + `backdrop-filter: blur(8px)`.
- Sticky filter-panel header: `--gray-1` at 90% opacity + `backdrop-filter: blur(12px)` on scroll.
- Otherwise, surfaces are opaque. No frosted glass on cards or panels.

**Corner radii.**

- Inputs, buttons, cards: `--radius-md` (6px) or `--radius-lg` (10px).
- Modals, popovers: `--radius-xl` (14px).
- Filter chips, tags: `--radius-full` (pill).
- Sharp corners only inside the devtools log entries (suggests "data, not UI").

**Cards.** Flat. `--gray-1` background, `1px solid var(--gray-4)` border, `--radius-lg`. No shadow at rest; subtle
accent border on hover. Internal padding `--space-5` (20px). Hover lifts background to `--gray-2` over 150ms.

---

## Iconography

**Library:** [Lucide](https://lucide.dev)'s consistent stroke-based style. Icons embed as inline SVG paths with
`currentColor` so they inherit text color; the UI kit's `Icon.jsx` carries its small curated set inline.

**Conventions:**

- **Stroke width 1.75** (slightly thinner than Lucide's default 2 — reads more elegant on dark).
- **Sizes:** 16px (dense secondary UI), 18px (inline default), 24px (primary affordances — sidebar nav, toolbar), 32px+
  (empty-state, hero).
- **Color: `currentColor` always.** Never hardcode icon fills/strokes — they inherit from their text container.
- **Status icons** that pair with text (success checkmark + "Filter saved") use the matching status color, not the
  accent.

**Emoji.** Never in product UI. The system is engineering-grade — emoji would undercut the tone.

**Unicode chars as icons.** Avoided. The Lucide set covers what's needed; using `×` for close icons or `•` for
separators is acceptable in monospace contexts only.

**Custom illustrations.** Five bespoke SVG pieces have standalone previews in `preview/`:

- `brain-synapse-loader.html` — the signature loader animation.
- `algo-roaring-bitmap.html` — Roaring Bitmap intersection illustration.
- `algo-rtree.html` — R-tree spatial-index descent illustration.
- `algo-bayesian.html` — probability propagation across filters.
- `algo-minhash-lsh.html` — signature-hashing-into-buckets illustration.

All share the same visual vocabulary: nodes, pulses, glows, propagation. Single accent color over the gray ramp.
Stroke-only, no fills, thin strokes (1px–1.5px on illustration scale).

**Logos.** The **canonical FilterEngineZ mark** lives in `assets/logomark/` — an angular Z with asymmetric chamfers (7u
baseline, 10u right-side flare), three crescent arcs at offset angles, glowing synapse node at center, polished neon
glow. Two presentation modes — Primary (cyan + neon, dark surfaces) and Subdued (mono-gray outline, light surfaces).
Plus the Orbitron wordmark "FILTER ENGINE**Z**". Full visual gallery in `assets/logomark/showcase.html`; usage rules in
`assets/logomark/BRAND-USAGE.md`. All sizes, lockups (D canonical, E hero, A documentation, stacked), mark-in-circle,
favicon set, OG card, and animated SVG are pre-built.

---

## Notes

- **Fonts are self-hosted** variable TTFs in `fonts/` — Inter, JetBrains Mono and Orbitron — each shipped alongside its
  SIL Open Font License (`OFL.txt`). The sites serve WOFF2 subsets of them from `@filter-enginez/brand`; Orbitron's is
  named Filter EngineZ Display, because its license reserves the name Orbitron for the unmodified font, and
  `--font-display` names both.
- **Icons** follow [Lucide](https://lucide.dev) and are inlined as SVG paths; no icon set is vendored or loaded here.
- **Algorithm illustrations** ship as standalone HTML previews in `preview/algo-*.html`; the
  [how-it-works page](https://filterenginez.com/how-it-works) and the documentation site render eight algorithm figures
  in the same vocabulary. They are SVG and CSS animation only — no canvas, no `requestAnimationFrame` loops — which
  keeps the payload small and makes the reduced-motion fallback trivial.
