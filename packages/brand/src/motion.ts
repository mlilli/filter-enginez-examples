/**
 * `@filter-enginez/brand/motion` — motion preferences, framework-free.
 *
 * @remarks
 * ### Why this lives in `brand`
 *
 * "Does this person want animation?" is a design-system question, not an application one — the same
 * category as a color token or a type scale. It ends up here for a practical reason too: `brand` is
 * the one package every consumer already depends on. `react-ui`, `examples-shared`, `ui-styles` and
 * all six demo apps import it, and crucially `react-ui` *cannot* import `examples-shared` without
 * inverting the tier dependency, which ruled out the otherwise-obvious home.
 *
 * ### Why a dedicated subpath and not the root barrel
 *
 * `brand`'s root export pulls in the React logomark and loaders. The non-React verticals (Vue,
 * Svelte, vanilla, Angular) need this predicate too, and importing it through the barrel would drag
 * React into four bundles that have no use for it. The `./motion` subpath resolves to this file alone
 * — no React, no DOM components, nothing but the query. Same isolation trick as
 * `examples-shared/books-boot-core`.
 *
 * **Keep this file React-free.** A single `import … from 'react'` here silently re-taints four
 * bundles, and nothing in CI would catch it.
 *
 * @packageDocumentation
 */

/** The media query the whole design system honors. Exported so callers can match on it directly. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the person has asked their operating system to reduce motion.
 *
 * @remarks
 * Read per-animation rather than cached at module load, so a preference changed mid-session takes
 * effect without a reload.
 *
 * The `typeof` guard is not defensive padding: this module is imported by isomorphic and SSR paths
 * where `matchMedia` genuinely does not exist, and the honest default there is "motion is fine" —
 * server-rendered output has no animation to suppress, and the client will re-evaluate on hydration.
 *
 * CSS keyframes across `@filter-enginez/ui-styles` already honor the query directly. This exists for
 * the animations CSS cannot see: JS-driven ones like the results count roll, which would otherwise
 * keep animating for someone who explicitly asked it not to.
 *
 * @returns `true` when motion should be suppressed.
 */
export function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION_QUERY).matches;
}
