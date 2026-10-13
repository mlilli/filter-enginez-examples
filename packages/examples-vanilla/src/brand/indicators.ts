/**
 * The engine-status indicator and the brand loaders it swaps between.
 *
 * @remarks
 * Kept apart from the URL controls — see `../url/urlControls.ts` for why. What is here is
 * everything that renders BRAND: the Synaptic Orbit (idle) and Neural Cluster (computing) loaders,
 * hand-built at the same geometry `@filter-enginez/brand` ships for React, and the indicator that
 * swaps between them.
 *
 * The orbit and cluster geometry is duplicated rather than imported because those two
 * `@filter-enginez/brand` loaders are React components and this app has no React. The numbers are the
 * contract; they are pinned here and in `packages/brand/src/loaders/`, and the app's tests assert the
 * rendered result rather than the source.
 *
 * **{@link createBootLoader} is the exception, and it is the better pattern.** Brain Synapse's
 * geometry lives in a framework-neutral module — `@filter-enginez/brand/loaders/brain-synapse-geometry`,
 * plain data plus one pure string builder — precisely so no consumer has to transcribe 189 lines of
 * SVG by hand. So this file imports it. A transcription error in a `cx` type-checks,
 * lints and tests green in every gate this repo has; the only instrument that reports it is an eye on
 * a rendered page. Where the shared module exists, using it makes that error impossible rather than
 * merely unlikely.
 *
 * @packageDocumentation
 */

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

import { el, setHidden, svg } from '../dom.js';

/**
 * Loader render size in px. Matches the other verticals' books header (30), where the fire + edge
 * pulses stay legible — the 404 renders the same loader far larger.
 */
const LOADER_SIZE = 30;


/** The computing indicator, with a setter for the busy flag. */
export interface ComputingIndicator {
	/** The indicator root. */
	readonly element: HTMLElement;
	/** Swap between the ambient cyan orbit (idle) and the phosphor cluster (recomputing). */
	readonly setComputing: (isComputing: boolean) => void;
}

/**
 * Build the engine-activity indicator.
 *
 * @returns The indicator; call `setComputing` as the engine settles.
 */
export function createComputingIndicator(): ComputingIndicator {
	const orbit = synapticOrbit();
	const cluster = neuralCluster();
	// The label reads "engine · idle" / "engine · computing", matching React. The separator is its own
	// element rather than part of the text because `fe-computing-indicator__sep` dims it independently
	// — flattening this to a single text node loses that, which is how the vanilla app ended up
	// rendering a bare "idle" with no subject.
	const state = el('span', { text: 'idle' });
	const label = el('span', {
		children: [
			document.createTextNode('engine '),
			el('span', { className: 'fe-computing-indicator__sep', text: '·' }),
			document.createTextNode(' '),
			state,
		],
		className: 'fe-computing-indicator__label',
	});
	const element = el('span', {
		children: [el('span', { children: [orbit, cluster], className: 'fe-computing-indicator__icon' }), label],
		className: 'fe-computing-indicator',
	});

	element.setAttribute('aria-live', 'polite');
	element.setAttribute('aria-label', 'Engine idle');
	setHidden(cluster as unknown as HTMLElement, true);

	return {
		element,
		setComputing: (isComputing) => {
			setHidden(orbit as unknown as HTMLElement, isComputing);
			setHidden(cluster as unknown as HTMLElement, !isComputing);
			element.className = isComputing
				? 'fe-computing-indicator fe-computing-indicator--computing'
				: 'fe-computing-indicator';
			element.setAttribute('aria-label', isComputing ? 'Engine computing' : 'Engine idle');
			label.className = isComputing
				? 'fe-computing-indicator__label fe-computing-indicator__label--computing'
				: 'fe-computing-indicator__label';
			state.textContent = isComputing ? 'computing' : 'idle';
		},
	};
}

/**
 * The large phosphor cluster the 404 page renders — the engine perpetually searching, never matching.
 *
 * @remarks
 * The same loader the header uses, at 168px. At that size the canonical tempo reads well, which is why
 * `ui-styles` only doubles the pace for `.fe-computing-indicator` (the 30px header rendering) rather
 * than globally.
 *
 * @returns The phosphor `NeuralCluster` at 404 scale.
 */
export function createNotFoundLoader(): SVGElement {
	return neuralCluster(168);
}

/**
 * Instance counter for {@link createBootLoader}'s CSS scope.
 *
 * @remarks
 * React scopes with `useId`, Svelte with `$props.id()`, Vue with `useId()`. Framework-less there is no
 * such primitive, and a counter is the whole of what those provide here: the scope only has to be
 * unique on the page and made of word characters, because two loaders sharing keyframe names fire in
 * lockstep instead of independently. Nothing serializes it and nothing hydrates against it, so the
 * SSR-stability the framework primitives also buy is not in play.
 *
 * @internal
 */
/**
 * A live segment of a boot caption, in cyan.
 *
 * @remarks
 * The framework-less half of `examples-shared/boot-caption`: that module decides what the caption
 * SAYS, this decides what a `value` segment looks like. React renders the same segment with the same
 * class, as do Vue, Angular and SvelteKit — `.fe-boot-caption__value` is defined once, in
 * `ui-styles`, and cyan rather than phosphor because a corpus arriving is data and the engine is not
 * computing yet.
 *
 * ⚠ **It lives in `brand/` rather than in `wine/bootScreen.ts`.** `/real-estate` renders the same
 * caption, and a helper under `wine/` would make one dataset's slice reach into another's for a
 * brand affordance neither owns.
 *
 * @param text - The already-formatted segment, from a `value` part.
 * @returns The span.
 */
export function bootCaptionValue(text: string): HTMLElement {
	return el('span', { className: 'fe-boot-caption__value', text });
}

let bootLoaderInstance = 0;

/**
 * The Brain Synapse signature loader — the COLD-BOOT loader (a fetch is in flight).
 *
 * @remarks
 * The third member of the taxonomy: orbit for idle, cluster for recompute, **synapse for the rare
 * fetch moment**. A boot screen wearing the cluster speaks the wrong vocabulary — phosphor claims the
 * engine is computing, and during a corpus stream it is not; it is waiting.
 *
 * Geometry, keyframes and stage backdrop all come from the shared module — see this file's docblock
 * for why this one is imported where the other two are transcribed.
 *
 * @param ariaLabel - Announced label, e.g. `'Loading wine reviews'`.
 * @param width - Rendered width in px; the height follows the 660×220 intrinsic aspect.
 * @returns The loader stage, ready to append.
 */
export function createBootLoader(ariaLabel: string, width = 520): HTMLElement {
	bootLoaderInstance += 1;

	const scope = `bs-v${String(bootLoaderInstance)}`;
	const stage = brainSynapseStageStyle(width);

	return el('div', {
		attrs: { 'aria-label': ariaLabel, role: 'img' },
		children: [
			svg(
				'svg',
				{
					preserveAspectRatio: 'xMidYMid slice',
					style: 'display:block;height:100%;width:100%',
					viewBox: BRAIN_SYNAPSE_VIEW_BOX,
					xmlns: 'http://www.w3.org/2000/svg',
				},
				[
					// The rules must be injected into the SVG's own `<defs>` rather than authored in a
					// stylesheet: they are scope-prefixed per instance, so there is no static text to author.
					// `textContent` on a namespaced <style>, never `innerHTML` — the scope is the only
					// interpolation and it is built from a counter, but the habit is the point.
					svg('defs', {}, [svg('style', {}, [document.createTextNode(buildBrainSynapseCss(scope))])]),
					// Edges first: SVG has no z-index, so document order IS the stacking order and the nodes
					// have to paint on top.
					...BRAIN_SYNAPSE_EDGES.map((edge) =>
						svg('line', { class: `${scope}-edge`, x1: edge.x1, x2: edge.x2, y1: edge.y1, y2: edge.y2 }),
					),
					...BRAIN_SYNAPSE_FIRING_NODES.map((node) =>
						svg('circle', {
							class: `${scope}-node ${scope}-node-fire`,
							cx: node.cx,
							cy: node.cy,
							r: BRAIN_SYNAPSE_NODE_RADIUS,
							style: `animation-delay: ${node.delay}`,
						}),
					),
					...BRAIN_SYNAPSE_QUIET_NODES.map((node) =>
						svg('circle', {
							class: `${scope}-node`,
							cx: node.cx,
							cy: node.cy,
							r: BRAIN_SYNAPSE_NODE_RADIUS,
						}),
					),
					// The pulses all sit at the origin; their entire path is a `transform: translate`
					// animation, so they never carry per-frame coordinates.
					...BRAIN_SYNAPSE_PULSE_INDICES.map((index) =>
						svg('circle', {
							class: `${scope}-pulse ${scope}-p${String(index)}`,
							cx: 0,
							cy: 0,
							r: BRAIN_SYNAPSE_NODE_RADIUS,
						}),
					),
				],
			),
		],
		// `fe-boot-loader` is the ONLY shared rule this loader has: it caps the fixed 520px stage at the
		// viewport width with `!important`, which is what makes it survive on a phone. The rest of the
		// stage is inline because the shared builder returns it that way for all six verticals.
		className: 'fe-boot-loader',
		// Spelled key by key rather than spread: `BrainSynapseStageStyle` carries a `--${string}` index
		// signature (Vue's `CSSProperties` requires one) whose value type includes `undefined`, and that
		// is not assignable to `el()`'s `Record<string, string>`.
		style: {
			background: stage.background,
			borderRadius: stage.borderRadius,
			height: stage.height,
			overflow: stage.overflow,
			position: stage.position,
			width: stage.width,
		},
	});
}

/**
 * The ambient acid orbit — the IDLE loader (data at rest).
 *
 * @remarks
 * Geometry is byte-faithful to the brand `SynapticOrbit` (3 rings, 8 satellites, 6 synapse lines
 * around a pulsing core) so this vertical animates identically to the others. The animations come
 * from the shared `fe-orbit*` rules in `ui-styles`.
 *
 * @internal
 */
function synapticOrbit(): SVGElement {
	/** Satellites: `[cx, cy, r, isGlow, delaySeconds]`. */
	const satellites: readonly (readonly [number, number, number, boolean, number])[] = [
		[178, 100, 3.5, true, 0],
		[61, 167.6, 3, false, 0],
		[61, 32.4, 3.5, true, 0.5],
		[127.5, 52.4, 3, false, 0],
		[72.5, 147.6, 3.5, true, 0.2],
		[134, 100, 2.5, false, 0],
		[83, 129.4, 2.5, false, 0],
		[83, 70.6, 3, true, 0.7],
	];
	/** Synapse lines: `[x1, y1, x2, y2]`, in `--1`…`--6` order. */
	const synapses: readonly (readonly [number, number, number, number])[] = [
		[178, 100, 127.5, 52.4],
		[127.5, 52.4, 61, 32.4],
		[72.5, 147.6, 61, 167.6],
		[83, 70.6, 134, 100],
		[178, 100, 134, 100],
		[83, 129.4, 72.5, 147.6],
	];

	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			class: 'fe-orbit',
			height: LOADER_SIZE,
			// Acid theme — the idle half of the dual-accent contract.
			style:
				'--orbit-loader:#A3E635;--orbit-glow:#D9F99D;--orbit-deep:#84CC16;--orbit-node:#354820;--orbit-line:#1F2D14;',
			viewBox: '0 0 200 200',
			width: LOADER_SIZE,
			xmlns: 'http://www.w3.org/2000/svg',
		},
		[
			svg('g', { class: 'fe-orbit__rotate' }, [
				...[78, 55, 34].map((r) => svg('circle', { class: 'fe-orbit__ring', cx: 100, cy: 100, r })),
				...satellites.map(([cx, cy, r, isGlow, delay]) =>
					svg('circle', {
						class: isGlow ? 'fe-orbit__sat-glow' : 'fe-orbit__sat',
						cx,
						cy,
						r,
						...(delay > 0 ? { style: `animation-delay: ${delay}s` } : {}),
					}),
				),
				...synapses.map(([x1, y1, x2, y2], index) =>
					svg('line', { class: `fe-orbit__syn fe-orbit__syn--${index + 1}`, x1, x2, y1, y2 }),
				),
			]),
			svg('circle', { class: 'fe-orbit__core', cx: 100, cy: 100, r: 5 }),
		],
	);
}

/**
 * The phosphor node-graph cluster — the ACTIVE-computation loader.
 *
 * @remarks
 * Byte-faithful to the brand `NeuralCluster`: all 13 nodes and 22 edges, with the same per-element
 * `animation-delay` stagger. The `--nc-*` custom properties set the phosphor theme, and the
 * animations (8s spin / 1.4s node fire / 1.5s edge pulse) come from the single shared `fe-cluster*`
 * rule set in `ui-styles` — so this is provably the same busy animation every other vertical runs.
 *
 * @internal
 */
function neuralCluster(size: number = LOADER_SIZE): SVGElement {
	/** Every node: `[cx, cy, r, isFiring, delaySeconds]`. */
	const nodes: readonly (readonly [number, number, number, boolean, number])[] = [
		[62, 58, 3, true, 0],
		[88, 42, 2.5, false, 0],
		[125, 50, 3, true, 0.9],
		[148, 76, 2.5, false, 0],
		[155, 112, 3, true, 0.3],
		[140, 148, 2.5, false, 0],
		[108, 160, 3, true, 1.4],
		[72, 152, 2.5, false, 0],
		[48, 122, 3, true, 0.6],
		[45, 88, 2.5, false, 0],
		[72, 118, 2.5, false, 0],
		[118, 130, 2.5, false, 0],
		[100, 92, 4, true, 1.7],
	];
	/** Every edge: `[x1, y1, x2, y2, delaySeconds]` — the ring, then the hub spokes. */
	const edges: readonly (readonly [number, number, number, number, number])[] = [
		[62, 58, 88, 42, 0],
		[88, 42, 125, 50, 0.3],
		[125, 50, 148, 76, 0.5],
		[148, 76, 155, 112, 0.8],
		[155, 112, 140, 148, 1],
		[140, 148, 108, 160, 1.3],
		[108, 160, 72, 152, 1.5],
		[72, 152, 48, 122, 1.8],
		[48, 122, 45, 88, 2],
		[45, 88, 62, 58, 2.3],
		[88, 42, 100, 92, 0.4],
		[100, 92, 148, 76, 0.7],
		[100, 92, 155, 112, 0.9],
		[100, 92, 108, 160, 1.4],
		[100, 92, 48, 122, 1.9],
		[100, 92, 62, 58, 2.4],
		[100, 92, 72, 118, 0.2],
		[100, 92, 118, 130, 1.6],
		[72, 118, 48, 122, 1.2],
		[72, 118, 72, 152, 0.3],
		[118, 130, 140, 148, 0.9],
		[118, 130, 108, 160, 2.1],
	];

	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			class: 'fe-cluster',
			height: size,
			// Phosphor theme — "the engine is firing right now".
			style:
				'--nc-loader:#F97316;--nc-glow:#FED7AA;--nc-deep:#C2410C;--nc-node:#7C2D12;--nc-line:#3A1E0C;--nc-burnt:#9A3412;',
			viewBox: '0 0 200 200',
			width: size,
			xmlns: 'http://www.w3.org/2000/svg',
		},
		[
			svg('g', { class: 'fe-cluster__rotate' }, [
				...edges.map(([x1, y1, x2, y2, delay]) =>
					svg('line', {
						class: 'fe-cluster__edge fe-cluster__edge-pulse',
						style: `animation-delay: ${delay}s`,
						x1,
						x2,
						y1,
						y2,
					}),
				),
				...nodes.map(([cx, cy, r, isFiring, delay]) =>
					svg('circle', {
						class: isFiring ? 'fe-cluster__node-fire' : 'fe-cluster__node',
						cx,
						cy,
						r,
						...(isFiring ? { style: `animation-delay: ${delay}s` } : {}),
					}),
				),
			]),
		],
	);
}
