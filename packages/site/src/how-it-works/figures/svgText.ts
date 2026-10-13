/**
 * `how-it-works/figures/svgText` — the two text-node conveniences the figures need.
 *
 * @remarks
 * `svg()` takes `Node` children, so every `<text>` / `<tspan>` in a figure would otherwise repeat
 * `svg('text', attrs, [document.createTextNode(label)])`. These two one-liners keep the figure
 * builders as declarative as the templates they were ported from — the DRY equivalent of a template
 * language's `{{ interpolation }}`.
 *
 * @packageDocumentation
 */

import { svg } from '@filter-enginez/examples-shared/dom';

/**
 * Build an SVG `<text>` element with a single text child.
 *
 * @param attrs - Attributes applied verbatim via `setAttribute`.
 * @param content - The text content.
 * @returns The `<text>` element.
 */
export function svgText(attrs: Readonly<Record<string, number | string>>, content: string): SVGElement {
	return svg('text', attrs, [document.createTextNode(content)]);
}

/**
 * Build an SVG `<tspan>` element with a single text child.
 *
 * @param attrs - Attributes applied verbatim via `setAttribute`.
 * @param content - The text content.
 * @returns The `<tspan>` element.
 */
export function svgTspan(attrs: Readonly<Record<string, number | string>>, content: string): SVGElement {
	return svg('tspan', attrs, [document.createTextNode(content)]);
}
