/**
 * `<fe-exclusion-graph-figure>` — the Mutual-Exclusion-Graph illustration.
 *
 * @remarks
 * Six rule-chips in a ring: a compatible spark crosses a solid edge (both endpoints settle cyan) and
 * an excluded spark strikes the `∅` marker on a dashed edge, dimming its target — the engine
 * short-circuits an impossible combination without computing. Geometry is verbatim from the React /
 * Vue figures; the `fe-fig-excl__*` animation CSS lives in `@filter-enginez/ui-styles`.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

/** A rule chip in the exclusion graph. */
interface GraphNode {
	readonly cx: number;
	readonly cy: number;
	/** Resting (completed-frame) state: the compatible pair is `lit`, the excluded target is `dim`. */
	readonly label: string;
	readonly state: 'dim' | 'lit' | 'neutral';
}

/** A chip as rendered: its record key (for `data-node`) plus the node itself. */
interface RenderedNode {
	readonly id: string;
	readonly node: GraphNode;
}

/** A structural edge resolved to endpoint coordinates plus its class. */
interface RenderedEdge {
	readonly className: string;
	readonly key: string;
	readonly x1: number;
	readonly x2: number;
	readonly y1: number;
	readonly y2: number;
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

/** Midpoint of two nodes. */
function midpoint(a: GraphNode, b: GraphNode): { x: number; y: number } {
	return { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
}

const compatFrom: GraphNode = NODES.sauvignon;
const compatTo: GraphNode = NODES.price;
const exclFrom: GraphNode = NODES.red;
const exclTo: GraphNode = NODES.sparkling;
const exclMid = midpoint(exclFrom, exclTo);

/** The structural edges resolved to coordinates — the `red → sparkling` edge is the exclusion. */
const RENDERED_EDGES: readonly RenderedEdge[] = EDGES.map(([fromId, toId]) => ({
	className:
		fromId === 'red' && toId === 'sparkling' ? 'fe-fig-excl__edge is-exclusion' : 'fe-fig-excl__edge',
	key: `${fromId}-${toId}`,
	x1: NODES[fromId].cx,
	x2: NODES[toId].cx,
	y1: NODES[fromId].cy,
	y2: NODES[toId].cy,
}));

/** The chips in record order, so each keeps its `data-node` id. */
const RENDERED_NODES: readonly RenderedNode[] = Object.entries(NODES).map(([id, node]) => ({ id, node }));

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-exclusion-graph-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-excl"
			role="img"
			aria-label="A graph of filter rules. One spark crosses a valid edge and both rules light up; another spark hits a 'no' marker on a forbidden edge and the rule it points to goes dark."
		>
			<svg viewBox="0 0 460 300" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-excl__svg">
				<!-- Structural edges -->
				@for (edge of edges; track edge.key) {
					<line
						[attr.x1]="edge.x1"
						[attr.y1]="edge.y1"
						[attr.x2]="edge.x2"
						[attr.y2]="edge.y2"
						[class]="edge.className"
					/>
				}

				<!-- Compatible edge (emphasized, solid) -->
				<line
					[attr.x1]="compatFrom.cx"
					[attr.y1]="compatFrom.cy"
					[attr.x2]="compatTo.cx"
					[attr.y2]="compatTo.cy"
					class="fe-fig-excl__edge is-compat"
				/>

				<!-- The ∅ marker at the excluded edge midpoint -->
				<g class="fe-fig-excl__void" [attr.transform]="voidTransform">
					<circle r="10" class="fe-fig-excl__void-ring" />
					<line x1="-6" y1="6" x2="6" y2="-6" class="fe-fig-excl__void-slash" />
				</g>

				<!-- Chips -->
				@for (entry of nodes; track entry.id) {
					<g [class]="'fe-fig-excl__node is-' + entry.node.state" [attr.data-node]="entry.id">
						<rect
							[attr.x]="entry.node.cx - nodeWidth / 2"
							[attr.y]="entry.node.cy - nodeHeight / 2"
							[attr.width]="nodeWidth"
							[attr.height]="nodeHeight"
							rx="13"
							class="fe-fig-excl__chip"
						/>
						<text [attr.x]="entry.node.cx" [attr.y]="entry.node.cy" class="fe-fig-excl__chip-label">{{
							entry.node.label
						}}</text>
					</g>
				}

				<!-- Sparks (phosphor, transient) -->
				<circle
					class="fe-fig-excl__spark is-compat"
					[attr.cx]="compatFrom.cx"
					[attr.cy]="compatFrom.cy"
					r="3.5"
					[style]="compatSparkStyle"
				/>
				<circle
					class="fe-fig-excl__spark is-excl"
					[attr.cx]="exclFrom.cx"
					[attr.cy]="exclFrom.cy"
					r="3.5"
					[style]="exclSparkStyle"
				/>

				<!-- Caption -->
				<text x="230" y="290" class="fe-fig-excl__caption">
					<tspan class="fe-fig-excl__caption-void">∅ precomputed</tspan>
					— selecting sparkling would yield 0 results
				</text>
			</svg>
		</div>
	`,
})
export class ExclusionGraphFigureComponent {
	/** Origin chip of the compatible spark. */
	protected readonly compatFrom = compatFrom;

	/** Travel vector of the compatible spark, as CSS custom properties. */
	protected readonly compatSparkStyle = `--dx:${compatTo.cx - compatFrom.cx}px;--dy:${compatTo.cy - compatFrom.cy}px;`;

	/** Destination chip of the compatible spark. */
	protected readonly compatTo = compatTo;

	/** The structural edges, exposed for the template. */
	protected readonly edges = RENDERED_EDGES;

	/** Origin chip of the excluded spark. */
	protected readonly exclFrom = exclFrom;

	/** Travel vector of the excluded spark — it stops dead at the `∅` marker. */
	protected readonly exclSparkStyle = `--dx:${exclMid.x - exclFrom.cx}px;--dy:${exclMid.y - exclFrom.cy}px;`;

	/** Chip pill height. */
	protected readonly nodeHeight = NODE_HEIGHT;

	/** The chips, exposed for the template. */
	protected readonly nodes = RENDERED_NODES;

	/** Chip pill width. */
	protected readonly nodeWidth = NODE_WIDTH;

	/** Placement of the `∅` marker at the excluded edge's midpoint. */
	protected readonly voidTransform = `translate(${exclMid.x}, ${exclMid.y})`;
}
