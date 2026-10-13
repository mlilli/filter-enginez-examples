/**
 * `<fe-neural-cluster>` — the phosphor "engine is firing" loader.
 *
 * @remarks
 * Geometry is byte-faithful to the React / Vue / Svelte / vanilla versions: a slowly rotating cluster
 * of 22 synapse edges and 13 nodes on a 200×200 viewBox. The one liberty this port takes is
 * structural rather than visual — the edges and nodes are declared as data and rendered with `@for`,
 * instead of 35 hand-written SVG elements. Same output, a third the lines, and the per-element
 * `animation-delay` values become a readable table instead of being buried in markup.
 *
 * All animation lives in `@filter-enginez/ui-styles`; the theme tokens are set inline because they are
 * per-instance, not per-rule.
 *
 * **Do not add component styles to this file.** The doubled tempo in the books header comes from a
 * DESCENDANT selector (`.fe-computing-indicator .fe-cluster { --fe-cluster-spin-duration: 4s; … }`) in
 * the global sheet. That works only because this component contributes no styles of its own, so
 * Angular's emulated encapsulation never rewrites anything — the moment it does, the override silently
 * stops matching and the 30px loader looks frozen.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One synapse edge: endpoints plus its pulse offset, in seconds. */
interface ClusterEdge {
	readonly delay: number;
	readonly x1: number;
	readonly x2: number;
	readonly y1: number;
	readonly y2: number;
}

/** One node: position, radius, and (for firing nodes) its pulse offset in seconds. */
interface ClusterNode {
	readonly cx: number;
	readonly cy: number;
	readonly delay: number;
	readonly isFiring: boolean;
	readonly r: number;
}

/** Phosphor theme tokens — mirrors the brand loader's `THEME_COLORS`. */
const PHOSPHOR_THEME =
	'--nc-loader:#F97316;--nc-glow:#FED7AA;--nc-deep:#C2410C;--nc-node:#7C2D12;--nc-line:#3A1E0C;--nc-burnt:#9A3412;';

/** The 22 edges — the outer ring first, then the spokes into the centre, then the inner triangles. */
const EDGES: readonly ClusterEdge[] = [
	{ delay: 0, x1: 62, x2: 88, y1: 58, y2: 42 },
	{ delay: 0.3, x1: 88, x2: 125, y1: 42, y2: 50 },
	{ delay: 0.5, x1: 125, x2: 148, y1: 50, y2: 76 },
	{ delay: 0.8, x1: 148, x2: 155, y1: 76, y2: 112 },
	{ delay: 1, x1: 155, x2: 140, y1: 112, y2: 148 },
	{ delay: 1.3, x1: 140, x2: 108, y1: 148, y2: 160 },
	{ delay: 1.5, x1: 108, x2: 72, y1: 160, y2: 152 },
	{ delay: 1.8, x1: 72, x2: 48, y1: 152, y2: 122 },
	{ delay: 2, x1: 48, x2: 45, y1: 122, y2: 88 },
	{ delay: 2.3, x1: 45, x2: 62, y1: 88, y2: 58 },
	{ delay: 0.4, x1: 88, x2: 100, y1: 42, y2: 92 },
	{ delay: 0.7, x1: 100, x2: 148, y1: 92, y2: 76 },
	{ delay: 0.9, x1: 100, x2: 155, y1: 92, y2: 112 },
	{ delay: 1.4, x1: 100, x2: 108, y1: 92, y2: 160 },
	{ delay: 1.9, x1: 100, x2: 48, y1: 92, y2: 122 },
	{ delay: 2.4, x1: 100, x2: 62, y1: 92, y2: 58 },
	{ delay: 0.2, x1: 100, x2: 72, y1: 92, y2: 118 },
	{ delay: 1.6, x1: 100, x2: 118, y1: 92, y2: 130 },
	{ delay: 1.2, x1: 72, x2: 48, y1: 118, y2: 122 },
	{ delay: 0.3, x1: 72, x2: 72, y1: 118, y2: 152 },
	{ delay: 0.9, x1: 118, x2: 140, y1: 130, y2: 148 },
	{ delay: 2.1, x1: 118, x2: 108, y1: 130, y2: 160 },
];

/** The 13 nodes — five firing, seven quiet, then the larger centre node. */
const NODES: readonly ClusterNode[] = [
	{ cx: 62, cy: 58, delay: 0, isFiring: true, r: 3 },
	{ cx: 125, cy: 50, delay: 0.9, isFiring: true, r: 3 },
	{ cx: 155, cy: 112, delay: 0.3, isFiring: true, r: 3 },
	{ cx: 108, cy: 160, delay: 1.4, isFiring: true, r: 3 },
	{ cx: 48, cy: 122, delay: 0.6, isFiring: true, r: 3 },
	{ cx: 88, cy: 42, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 148, cy: 76, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 140, cy: 148, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 72, cy: 152, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 45, cy: 88, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 72, cy: 118, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 118, cy: 130, delay: 0, isFiring: false, r: 2.5 },
	{ cx: 100, cy: 92, delay: 1.7, isFiring: true, r: 4 },
];

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-neural-cluster',
	template: `
		<svg
			class="fe-cluster"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			[attr.width]="size()"
			[attr.height]="size()"
			role="img"
			aria-label="Computing"
			[style]="theme"
		>
			<g class="fe-cluster__rotate">
				@for (edge of edges; track $index) {
					<line
						class="fe-cluster__edge fe-cluster__edge-pulse"
						[attr.x1]="edge.x1"
						[attr.y1]="edge.y1"
						[attr.x2]="edge.x2"
						[attr.y2]="edge.y2"
						[style.animation-delay.s]="edge.delay"
					/>
				}
				@for (node of nodes; track $index) {
					<circle
						[class]="node.isFiring ? 'fe-cluster__node-fire' : 'fe-cluster__node'"
						[attr.cx]="node.cx"
						[attr.cy]="node.cy"
						[attr.r]="node.r"
						[style.animation-delay.s]="node.isFiring ? node.delay : null"
					/>
				}
			</g>
		</svg>
	`,
})
export class NeuralClusterComponent {
	/** Render size in px (square). The books header uses 30; the 404 uses 168. */
	public readonly size = input<number>(40);

	/** The edge table, exposed for the template. */
	protected readonly edges = EDGES;

	/** The node table, exposed for the template. */
	protected readonly nodes = NODES;

	/** Inline theme tokens the shared CSS reads. */
	protected readonly theme = PHOSPHOR_THEME;
}
