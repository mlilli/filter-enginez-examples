/**
 * `about/figures/exclusion` — framework-less port of the Mutual-Exclusion-Graph illustration.
 *
 * @remarks
 * Six rule-chips in a ring: a compatible spark crosses a solid edge (both endpoints settle cyan) and
 * an excluded spark strikes the `∅` marker on a dashed edge, dimming its target — the engine
 * short-circuits an impossible combination without computing. Geometry is verbatim from the React
 * figure; the `fe-fig-excl__*` animation CSS lives in `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import { el, svg } from '../../dom.js';
import { svgText, svgTspan } from './svgText.js';

/** A rule chip in the exclusion graph. */
interface GraphNode {
	readonly cx: number;
	readonly cy: number;
	/** Resting (completed-frame) state: the compatible pair is `lit`, the excluded target is `dim`. */
	readonly label: string;
	readonly state: 'dim' | 'lit' | 'neutral';
}

const NODE_WIDTH = 82;
const NODE_HEIGHT = 26;

/** Ring of six chips. Coordinates are pill centers in the 460×300 viewBox. */
const NODES = {
	napa: { cx: 300, cy: 250, label: 'napa', state: 'neutral' },
	price: { cx: 95, cy: 250, label: '≤ $15', state: 'lit' },
	red: { cx: 300, cy: 50, label: 'red', state: 'neutral' },
	reserve: { cx: 30, cy: 150, label: 'reserve', state: 'neutral' },
	sauvignon: { cx: 95, cy: 62, label: 'sauvignon', state: 'lit' },
	sparkling: { cx: 388, cy: 150, label: 'sparkling', state: 'dim' },
} satisfies Record<string, GraphNode>;

/** Plain structural edges (gray hairlines) sketching the graph. */
const EDGES: readonly (readonly [keyof typeof NODES, keyof typeof NODES])[] = [
	['sauvignon', 'red'],
	['red', 'sparkling'],
	['sparkling', 'napa'],
	['napa', 'price'],
	['price', 'reserve'],
	['reserve', 'sauvignon'],
];

/**
 * Midpoint of two nodes.
 *
 * @param a - The first node.
 * @param b - The second node.
 * @returns The midpoint in user units.
 */
function midpoint(a: GraphNode, b: GraphNode): { x: number; y: number } {
	return { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
}

const compatFrom = NODES.sauvignon;
const compatTo = NODES.price;
const exclFrom = NODES.red;
const exclTo = NODES.sparkling;
const exclMid = midpoint(exclFrom, exclTo);

/**
 * Build the Mutual-Exclusion-Graph figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createExclusionGraphFigure(): HTMLElement {
	const structuralEdges = EDGES.map(([fromId, toId]) =>
		svg('line', {
			class: fromId === 'red' && toId === 'sparkling' ? 'fe-fig-excl__edge is-exclusion' : 'fe-fig-excl__edge',
			x1: NODES[fromId].cx,
			x2: NODES[toId].cx,
			y1: NODES[fromId].cy,
			y2: NODES[toId].cy,
		}),
	);

	const chips = Object.entries(NODES).map(([id, node]) =>
		svg('g', { class: `fe-fig-excl__node is-${node.state}`, 'data-node': id }, [
			svg('rect', {
				class: 'fe-fig-excl__chip',
				height: NODE_HEIGHT,
				rx: 13,
				width: NODE_WIDTH,
				x: node.cx - NODE_WIDTH / 2,
				y: node.cy - NODE_HEIGHT / 2,
			}),
			svgText({ class: 'fe-fig-excl__chip-label', x: node.cx, y: node.cy }, node.label),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				"A graph of filter rules. One spark crosses a valid edge and both rules light up; another spark hits a 'no' marker on a forbidden edge and the rule it points to goes dark.",
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-excl__svg', viewBox: '0 0 460 300', xmlns: 'http://www.w3.org/2000/svg' },
				[
					// Structural edges
					...structuralEdges,
					// Compatible edge (emphasized, solid)
					svg('line', {
						class: 'fe-fig-excl__edge is-compat',
						x1: compatFrom.cx,
						x2: compatTo.cx,
						y1: compatFrom.cy,
						y2: compatTo.cy,
					}),
					// The ∅ marker at the excluded edge midpoint
					svg('g', { class: 'fe-fig-excl__void', transform: `translate(${exclMid.x}, ${exclMid.y})` }, [
						svg('circle', { class: 'fe-fig-excl__void-ring', r: 10 }),
						svg('line', { class: 'fe-fig-excl__void-slash', x1: -6, x2: 6, y1: 6, y2: -6 }),
					]),
					// Chips
					...chips,
					// Sparks (phosphor, transient)
					svg('circle', {
						class: 'fe-fig-excl__spark is-compat',
						cx: compatFrom.cx,
						cy: compatFrom.cy,
						r: 3.5,
						style: `--dx: ${compatTo.cx - compatFrom.cx}px; --dy: ${compatTo.cy - compatFrom.cy}px`,
					}),
					svg('circle', {
						class: 'fe-fig-excl__spark is-excl',
						cx: exclFrom.cx,
						cy: exclFrom.cy,
						r: 3.5,
						style: `--dx: ${exclMid.x - exclFrom.cx}px; --dy: ${exclMid.y - exclFrom.cy}px`,
					}),
					// Caption
					svg('text', { class: 'fe-fig-excl__caption', x: 230, y: 290 }, [
						svgTspan({ class: 'fe-fig-excl__caption-void' }, '∅ precomputed'),
						document.createTextNode(' — selecting sparkling would yield 0 results'),
					]),
				],
			),
		],
		className: 'fe-fig fe-fig-excl',
	});
}
