# @filter-enginez/brand

Canonical brand assets for Filter EngineZ — the single source of truth that every demo app, `react-ui` and the
documentation site consume.

**What's in here:**

- `<Mark />` — the canonical logomark (baseline chamfer, right-side flare, three crescent arcs, breathing synapse;
  primary, subdued and animated modes)
- `<Wordmark />` — `FILTER ENGINEZ` in Orbitron with the highlighted Z (cyan + glow)
- Three loaders:
  - `<SynapticOrbit />` — ambient/passive loading (page load, idle, route transitions)
  - `<NeuralCluster />` — active computation (query running, filter rebuild) · phosphor-themed
  - `<BrainSynapse />` — the signature dataset-load moment · locked brand cyan
- `./motion` — the framework-free `prefers-reduced-motion` check, and `./loaders/brain-synapse-geometry` — the Brain
  Synapse geometry the non-React apps render from
- `tokens.css` — design tokens (grayscale ramp, dual accents, status colors, type scale, spacing, radii, motion) plus
  the repository's global element defaults. Its `:root` token block matches
  `docs/branding/design-system/colors_and_type.css` declaration for declaration, which
  `tests/tooling/brandTokens.test.ts` enforces.
- `fonts/` — the self-hosted variable webfonts (Inter, JetBrains Mono, Orbitron): each font's TTF and `OFL.txt`, and the
  WOFF2 subset of it that `tokens.css` loads, written by `node scripts/subset-brand-fonts.mjs` (Orbitron's is named
  Filter EngineZ Display, because its license reserves the name Orbitron for the unmodified font)
- `./assets/*` — the logomark and favicon files; the four non-React apps serve generated copies
  (`pnpm sync:brand-assets`).

**Source-of-truth flow:** [`docs/branding/design-system/`](../../docs/branding/design-system/README.md) is the
_authored_ source, where the design system is maintained; this package is the _consumed_ source, what runtime code
imports. When the design system changes, the design-system folder changes first and this package follows. The
dual-accent contract applies throughout: cyan means data, identity and _what_; phosphor means activity, computation and
_when_. The two are never used interchangeably.
