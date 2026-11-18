/**
 * `how-it-works/figures/viewBoxes` — each figure's SVG `viewBox`, keyed by its band's id.
 *
 * @remarks
 * One source for two readers. Each figure builder draws in its own box, and the page's build-time half
 * (`prerender.ts`) puts an empty SVG with the same box into the band's placeholder. The figure's SVG and
 * that frame carry the same `fe-fig__svg` sizing (full width, height from the box), so the placeholder
 * has the figure's height from the first paint, and mounting the figure moves nothing. Without it, each
 * placeholder painted as an empty frame a few pixels tall and grew as its figure mounted, which moved
 * the text beside or below it.
 *
 * DOM-free, so the build-time half can import it under Node.
 *
 * @packageDocumentation
 */

/** Each figure's `viewBox`, by the id of the band that shows it (`HowItWorksSection.id`). */
export const FIGURE_VIEW_BOXES = {
	bayesian: '0 0 460 250',
	bloom: '0 0 460 210',
	exclusion: '0 0 460 300',
	memoization: '0 0 460 236',
	roaring: '0 0 470 232',
	rtree: '0 0 440 322',
	similarity: '0 0 460 214',
	textindex: '0 0 460 250',
} as const;

/**
 * {@link FIGURE_VIEW_BOXES} as a lookup by a band's id.
 *
 * @remarks
 * A `Map` rather than an index into the object, which would also answer for inherited names such as
 * `constructor`.
 */
export const HOW_IT_WORKS_FIGURE_VIEW_BOXES: ReadonlyMap<string, string> = new Map(Object.entries(FIGURE_VIEW_BOXES));
