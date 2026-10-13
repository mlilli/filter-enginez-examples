/**
 * `<fe-brain-synapse>` — the hero boot loader, over the shared geometry in `@filter-enginez/brand`.
 *
 * @remarks
 * Seventeen nodes, eighteen edges and five pulses, all read from `brand/loaders/brainSynapseGeometry`
 * rather than transcribed. A hand-copied set would be one more copy to keep in step, and **a
 * mistyped `cx` is invisible to every gate in this repo** — nothing typechecks a coordinate, and the
 * only instrument that reports a node in the wrong place is an eye on a rendered page.
 *
 * ## The rules are scoped PER INSTANCE, and that is not a style preference
 *
 * Two loaders on one page sharing `@keyframes` names fire in lockstep instead of independently. React
 * scopes with `useId`, Svelte with `$props.id()`, Vue with `useId()`; Angular's equivalent is a
 * per-instance counter, because Angular has no `useId` and `crypto.randomUUID` is more machinery than
 * a CSS scope needs. The value is sanitized to word characters before it reaches the stylesheet.
 *
 * The CSS goes into the SVG's `<defs>` through `[innerHTML]`, which is safe **here and only here**: its
 * content is a pure function of module constants and this component's own generated id. No input, no
 * corpus value and no URL reaches it. `DomSanitizer.bypassSecurityTrustHtml` is required because
 * Angular strips `<style>` from bound HTML by default — the bypass is the point, and it is why the
 * source of that string matters so much.
 *
 * Respects `prefers-reduced-motion` — pulses freeze, nodes hold their lit state. That behavior lives
 * in the shared CSS builder, not here.
 *
 * ## The import is the NARROW subpath, and that is load-bearing
 *
 * `@filter-enginez/brand/loaders` is the React barrel — it re-exports three `.tsx` components, so
 * importing it here fails the build outright (`--jsx is not set`) and would drag React into the one
 * vertical that ships none. `./loaders/brain-synapse-geometry` is the surface-neutral half, and it
 * exists for exactly this. Same relationship `books-boot-core` has to `books-core`.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_NODE_RADIUS,
	BRAIN_SYNAPSE_PULSE_INDICES,
	BRAIN_SYNAPSE_QUIET_NODES,
	BRAIN_SYNAPSE_VIEW_BOX,
	brainSynapseStageStyle,
	buildBrainSynapseCss,
} from '@filter-enginez/brand/loaders/brain-synapse-geometry';

/** Per-instance scope counter. See the class remarks for why a shared scope would be wrong. */
let instanceCounter = 0;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-brain-synapse',
	template: `
		<div class="fe-boot-loader" role="img" [attr.aria-label]="loaderLabel()" [style]="stageStyle()">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				preserveAspectRatio="xMidYMid slice"
				[attr.viewBox]="viewBox"
				style="display: block; height: 100%; width: 100%"
			>
				<defs [innerHTML]="styleTag()"></defs>

				@for (edge of edges; track $index) {
					<svg:line
						[attr.class]="scope + '-edge'"
						[attr.x1]="edge.x1"
						[attr.y1]="edge.y1"
						[attr.x2]="edge.x2"
						[attr.y2]="edge.y2"
					/>
				}

				@for (node of firingNodes; track $index) {
					<svg:circle
						[attr.class]="scope + '-node ' + scope + '-node-fire'"
						[attr.cx]="node.cx"
						[attr.cy]="node.cy"
						[attr.r]="nodeRadius"
						[style.animation-delay]="node.delay"
					/>
				}

				@for (node of quietNodes; track $index) {
					<svg:circle
						[attr.class]="scope + '-node'"
						[attr.cx]="node.cx"
						[attr.cy]="node.cy"
						[attr.r]="nodeRadius"
					/>
				}

				@for (index of pulseIndices; track index) {
					<svg:circle
						[attr.class]="scope + '-pulse ' + scope + '-p' + index"
						cx="0"
						cy="0"
						[attr.r]="nodeRadius"
					/>
				}
			</svg>
		</div>
	`,
})
export class BrainSynapseComponent {
	/** Accessible name for the loader. Not `ariaLabel` — see `hierarchical-picker`'s docblock. */
	public readonly loaderLabel = input.required<string>();

	/** Rendered width in px. The stage keeps the geometry's aspect ratio. */
	public readonly width = input<number>(520);

	/** Sanitized to word characters, so it can only ever be a legal CSS identifier. */
	protected readonly scope = `fe-bs-${String((instanceCounter += 1))}`.replaceAll(/\W/gu, '');

	/** Bound into the template — the geometry, read rather than transcribed. */
	protected readonly edges = BRAIN_SYNAPSE_EDGES;

	protected readonly firingNodes = BRAIN_SYNAPSE_FIRING_NODES;

	protected readonly nodeRadius = BRAIN_SYNAPSE_NODE_RADIUS;

	protected readonly pulseIndices = BRAIN_SYNAPSE_PULSE_INDICES;

	protected readonly quietNodes = BRAIN_SYNAPSE_QUIET_NODES;

	protected readonly viewBox = BRAIN_SYNAPSE_VIEW_BOX;

	private readonly _sanitizer = inject(DomSanitizer);

	/** The stage box — width, aspect-preserving height, and the loader's custom properties. */
	protected readonly stageStyle = computed(() => brainSynapseStageStyle(this.width()));

	/** Instance-scoped keyframes + rules. Trusted because it is built from constants — see the remarks. */
	protected readonly styleTag = computed<SafeHtml>(() =>
		this._sanitizer.bypassSecurityTrustHtml(`<style>${buildBrainSynapseCss(this.scope)}</style>`),
	);
}
