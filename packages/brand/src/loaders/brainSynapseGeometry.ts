/**
 * `<BrainSynapse>`'s geometry and keyframes — the framework-neutral half of the signature loader.
 *
 * @remarks
 * ## Why this is a module and not markup
 *
 * The loader is 17 nodes, 18 edges and 5 travelling pulses, and every one of those numbers is **data**
 * — it says nothing about React, Svelte or Vue. Every vertical renders this loader, so the data lives
 * here once and each framework maps it into its own markup instead of transcribing the SVG by hand.
 *
 * A transcription error here would be invisible to every gate in the repo. Nothing type-checks a `cx`,
 * and the only instrument that reports a node in the wrong place is an eye on a rendered page — the
 * same class of error `tests/tooling/brandAssets.test.ts` guards against for the logomark files.
 * Sharing the data is what makes that error impossible rather than merely unlikely.
 *
 * ## Why it lives in `brand` and carries no framework import
 *
 * `@filter-enginez/brand` owns the canonical assets, and this is one. It exports plain data and one
 * pure string builder, so a Vue SFC, a Svelte component and a React component can each consume it
 * without any of them importing another's runtime — the same rule that governs `src/assets/`.
 *
 * ## The CSS cannot live in a framework's style block
 *
 * Each consumer injects {@link buildBrainSynapseCss}'s output into the SVG's `<defs>`. That is not a
 * stylistic choice: Svelte's CSS parser rejects `drop-shadow` combined with these multi-keyframe
 * rules, and the rules must be **scoped per instance** anyway — two loaders on one page sharing
 * keyframe names would fire in lockstep instead of independently. React scopes with `useId`, Svelte
 * with `$props.id()`, Vue with `useId()`; all three pass the result here.
 *
 * @packageDocumentation
 */

/** One edge of the graph. */
export interface BrainSynapseEdge {
	readonly x1: number;
	readonly x2: number;
	readonly y1: number;
	readonly y2: number;
}

/** A node that fires in cascade, with its stagger. */
export interface BrainSynapseFiringNode {
	readonly cx: number;
	readonly cy: number;
	/** CSS `animation-delay`, e.g. `'0.6s'`. */
	readonly delay: string;
}

/** A node that stays quiet. */
export interface BrainSynapseQuietNode {
	readonly cx: number;
	readonly cy: number;
}

/** The loader's intrinsic aspect, and the `viewBox` every consumer renders. */
export const BRAIN_SYNAPSE_VIEW_BOX = '0 0 660 220';

/** Intrinsic width of {@link BRAIN_SYNAPSE_VIEW_BOX}, for the height derivation. */
export const BRAIN_SYNAPSE_INTRINSIC_WIDTH = 660;

/** Intrinsic height of {@link BRAIN_SYNAPSE_VIEW_BOX}. */
export const BRAIN_SYNAPSE_INTRINSIC_HEIGHT = 220;

/** Radius every node and pulse is drawn at. */
export const BRAIN_SYNAPSE_NODE_RADIUS = 2.5;

/**
 * Graph topology — 18 edges.
 *
 * @remarks
 * Rendered before the nodes so the nodes paint on top; SVG has no z-index, so document order IS the
 * stacking order.
 */
export const BRAIN_SYNAPSE_EDGES: readonly BrainSynapseEdge[] = [
	{ x1: 60, x2: 160, y1: 50, y2: 70 },
	{ x1: 160, x2: 220, y1: 70, y2: 110 },
	{ x1: 160, x2: 260, y1: 70, y2: 130 },
	{ x1: 220, x2: 340, y1: 110, y2: 60 },
	{ x1: 220, x2: 180, y1: 110, y2: 90 },
	{ x1: 100, x2: 180, y1: 130, y2: 170 },
	{ x1: 100, x2: 220, y1: 130, y2: 170 },
	{ x1: 300, x2: 420, y1: 90, y2: 140 },
	{ x1: 340, x2: 420, y1: 60, y2: 40 },
	{ x1: 420, x2: 540, y1: 140, y2: 170 },
	{ x1: 420, x2: 500, y1: 140, y2: 80 },
	{ x1: 500, x2: 600, y1: 80, y2: 110 },
	{ x1: 600, x2: 540, y1: 110, y2: 170 },
	{ x1: 600, x2: 620, y1: 110, y2: 50 },
	{ x1: 420, x2: 500, y1: 40, y2: 80 },
	{ x1: 340, x2: 300, y1: 60, y2: 90 },
	{ x1: 60, x2: 100, y1: 180, y2: 130 },
	{ x1: 60, x2: 180, y1: 180, y2: 170 },
];

/** The 11 nodes that fire in cascade, with their staggers. */
export const BRAIN_SYNAPSE_FIRING_NODES: readonly BrainSynapseFiringNode[] = [
	{ cx: 60, cy: 50, delay: '0s' },
	{ cx: 160, cy: 70, delay: '0.6s' },
	{ cx: 220, cy: 110, delay: '1.0s' },
	{ cx: 260, cy: 130, delay: '1.4s' },
	{ cx: 340, cy: 60, delay: '1.8s' },
	{ cx: 300, cy: 90, delay: '0.3s' },
	{ cx: 420, cy: 140, delay: '2.1s' },
	{ cx: 420, cy: 40, delay: '0.9s' },
	{ cx: 500, cy: 80, delay: '1.3s' },
	{ cx: 540, cy: 170, delay: '2.5s' },
	{ cx: 600, cy: 110, delay: '0.7s' },
];

/**
 * The 6 nodes that stay quiet.
 *
 * @remarks
 * They are the reason the graph reads as a network rather than a metronome — every node pulsing at
 * once looks like a progress bar wearing a costume.
 */
export const BRAIN_SYNAPSE_QUIET_NODES: readonly BrainSynapseQuietNode[] = [
	{ cx: 180, cy: 90 },
	{ cx: 100, cy: 130 },
	{ cx: 180, cy: 170 },
	{ cx: 220, cy: 170 },
	{ cx: 620, cy: 50 },
	{ cx: 60, cy: 180 },
];

/**
 * The travelling pulses, by index.
 *
 * @remarks
 * Each index `n` pairs a `-pn` class with a `-tn` keyframe set built below; the pulse's whole path is
 * expressed as a `transform: translate(...)` animation, so the element itself sits at the origin and
 * never needs per-frame coordinates.
 */
export const BRAIN_SYNAPSE_PULSE_INDICES: readonly number[] = [1, 2, 3, 4, 5];

/**
 * Build the loader's instance-scoped rule set.
 *
 * @remarks
 * Every selector and keyframe name is prefixed with `scope`, so two loaders on one page animate
 * independently. The caller supplies a scope derived from its framework's stable-id primitive
 * (`useId` in React and Vue, `$props.id()` in Svelte) — SSR-stable in each, so server and client
 * markup agree.
 *
 * The output contains no caller-supplied text beyond that scope, and the scope is expected to be
 * sanitized to word characters by the caller. Nothing from a corpus, a prop or a URL reaches it, which
 * is what makes injecting it as raw markup safe.
 *
 * @param scope - The instance-unique class/keyframe prefix, e.g. `bs-r1`.
 * @returns The CSS text, ready to place inside the SVG's `<defs>`.
 */
export function buildBrainSynapseCss(scope: string): string {
	return `
		.${scope}-edge { stroke: #312E29; stroke-width: 0.6; opacity: 0.6; }
		.${scope}-node { fill: #56524A; }
		.${scope}-node-fire { animation: ${scope}-fire 1.6s ease-out infinite; }
		@keyframes ${scope}-fire {
			0%, 70%, 100% { fill: #56524A; r: 2.5; filter: none; }
			75% { fill: #67E8F9; r: 4; filter: drop-shadow(0 0 6px #22D3EE); }
			85% { fill: #22D3EE; r: 3.2; filter: drop-shadow(0 0 4px #22D3EE); }
		}
		.${scope}-pulse { fill: #67E8F9; filter: drop-shadow(0 0 5px #22D3EE) drop-shadow(0 0 2px #67E8F9); }
		.${scope}-p1 { animation: ${scope}-t1 2.4s ease-in-out infinite; }
		.${scope}-p2 { animation: ${scope}-t2 2.8s ease-in-out infinite 0.4s; }
		.${scope}-p3 { animation: ${scope}-t3 3.1s ease-in-out infinite 0.9s; }
		.${scope}-p4 { animation: ${scope}-t4 2.6s ease-in-out infinite 1.3s; }
		.${scope}-p5 { animation: ${scope}-t5 2.9s ease-in-out infinite 1.7s; }
		@keyframes ${scope}-t1 { 0% { transform: translate(60px, 50px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(180px, 90px); opacity: 0; } }
		@keyframes ${scope}-t2 { 0% { transform: translate(160px, 70px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(260px, 130px); opacity: 0; } }
		@keyframes ${scope}-t3 { 0% { transform: translate(220px, 110px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(340px, 60px); opacity: 0; } }
		@keyframes ${scope}-t4 { 0% { transform: translate(100px, 130px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(220px, 170px); opacity: 0; } }
		@keyframes ${scope}-t5 { 0% { transform: translate(300px, 90px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(420px, 140px); opacity: 0; } }
		@media (prefers-reduced-motion: reduce) {
			.${scope}-node-fire,
			.${scope}-p1, .${scope}-p2, .${scope}-p3, .${scope}-p4, .${scope}-p5 { animation: none; }
		}
	`;
}

/**
 * The stage's inline style — the dark radial backdrop every consumer draws the SVG onto.
 *
 * @remarks
 * **This shape is pinned from three directions at once**, which is why it is not the obvious
 * `Record<string, string>`:
 *
 *   1. This repo runs `noPropertyAccessFromIndexSignature`, so a bare record forces every caller —
 *      and every test — to write `style['height']`.
 *   2. **React** narrows `overflow` and `position` to unions of keyword literals, not `string`. A
 *      widened `position: string` is not assignable to a React `style` prop at all.
 *   3. **Vue** requires `CSSProperties` to carry an index signature for CSS custom properties, so a
 *      closed interface is rejected by `vue-tsc` with an error naming `` `--${string}` ``.
 *
 * Named keys satisfy (1) and (2); the custom-property index signature satisfies (3) without
 * reintroducing (1), because TS4111 only fires for properties that come FROM an index signature and
 * `height` is declared. Each requirement is invisible from the other two frameworks' typechecks —
 * this landed green on `tsc` and red on `vue-tsc`.
 */
export interface BrainSynapseStageStyle {
	readonly background: string;
	readonly borderRadius: string;
	readonly height: string;
	readonly overflow: 'hidden';
	readonly position: 'relative';
	/**
	 * CSS custom properties. Nothing here sets one — it exists because Vue's `CSSProperties` requires
	 * the signature, and `vue-tsc` rejects a closed interface with an error naming this exact key type.
	 * Its position among the named keys is ESLint's (`perfectionist/sort-interfaces`), not a statement.
	 */
	readonly [customProperty: `--${string}`]: string | undefined;
	readonly width: string;
}

/**
 * Build the stage's inline style for a given rendered width.
 *
 * @param width - Rendered width in pixels; height follows the 660×220 intrinsic aspect.
 * @returns The style properties, spelled so every framework's `style` binding accepts them.
 */
export function brainSynapseStageStyle(width: number): BrainSynapseStageStyle {
	const height = (width * BRAIN_SYNAPSE_INTRINSIC_HEIGHT) / BRAIN_SYNAPSE_INTRINSIC_WIDTH;

	return {
		background: 'radial-gradient(ellipse at center, #151412 0%, #0B0A09 80%)',
		borderRadius: '12px',
		height: `${String(height)}px`,
		overflow: 'hidden',
		position: 'relative',
		width: `${String(width)}px`,
	};
}
