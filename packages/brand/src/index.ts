/**
 * @filter-enginez/brand
 *
 * Canonical brand assets for Filter EngineZ — single source of truth across the six demo apps,
 * the shared UI packages and the docs site. The runtime consumer of the design system at
 * `docs/branding/design-system/`.
 *
 * @remarks
 * Five components (`Mark`, `Wordmark`, three loaders), each ported from its design-system
 * reference implementation and unit-tested alongside it.
 *
 * ### `tokens.css` is two things, not a copy
 *
 * It is not a byte-identical copy of `colors_and_type.css`. Its `:root` block IS the design
 * system's, declaration for declaration and in order — pinned by
 * `tests/tooling/brandTokens.test.ts`. Everything below that block belongs to this package
 * and is deliberately absent upstream: the semantic element styles wrapped in `@layer base`
 * (unlayered they outrank every Tailwind utility — see `tests/tooling/cascadeLayers.test.ts`),
 * `color-scheme: dark`, and the checkbox / radio cursor normalizations. Each fixes a problem
 * that exists only downstream of the design system, so pushing them up would encode a
 * consumer's build choice in the delivered system.
 *
 * **Adding a token goes in `colors_and_type.css` first; adding an element default goes here.**
 *
 * The raw assets under `src/assets/` follow the opposite rule — byte-equal to their
 * design-system sources, distributed by `pnpm sync:brand-assets`, pinned by
 * `tests/tooling/brandAssets.test.ts`.
 *
 * **Sub-exports** (see `package.json` `exports` map):
 *
 *   - `@filter-enginez/brand` — main barrel (`<Mark />`, `<Wordmark />` and the three loaders)
 *   - `@filter-enginez/brand/motion` — `prefersReducedMotion()` + `REDUCED_MOTION_QUERY`
 *   - `@filter-enginez/brand/mark` — just `<Mark />`
 *   - `@filter-enginez/brand/wordmark` — just `<Wordmark />`
 *   - `@filter-enginez/brand/loaders` — all three loaders
 *   - `@filter-enginez/brand/loaders/synaptic-orbit` — just `<SynapticOrbit />`
 *   - `@filter-enginez/brand/loaders/neural-cluster` — just `<NeuralCluster />`
 *   - `@filter-enginez/brand/loaders/brain-synapse` — just `<BrainSynapse />`
 *   - `@filter-enginez/brand/loaders/brain-synapse-geometry` — the loader's framework-neutral
 *     geometry and CSS builder, for non-React verticals
 *   - `@filter-enginez/brand/tokens.css` — design tokens + element defaults (consumer
 *     imports via `import '@filter-enginez/brand/tokens.css'` at app entry point)
 *   - `@filter-enginez/brand/assets/*` — the raw logomark files, for a vertical that would
 *     rather import them than serve a synced copy
 *
 * See `docs/branding/design-system/README.md` for the full design system contract, including
 * the dual-accent semantic rules (cyan = data / identity / what; phosphor = activity /
 * computation / when).
 *
 * @packageDocumentation
 */

export { Mark, type MarkProps } from './Mark.js';
export { Wordmark, type WordmarkProps } from './Wordmark.js';
export * from './loaders/index.js';
