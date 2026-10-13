/**
 * `<BrainSynapse />` — the **signature** loader. Wide-aspect (660×220), locked to brand cyan,
 * the piece-that-gets-screenshot. Reserved for the rare "we're fetching your data" hero
 * moment.
 *
 * @remarks
 * Geometry + keyframes ported from `docs/branding/design-system/assets/loaders/index.html`
 * (the `.bs-stage` / `.bs-node-fire` / `.bs-pulse` rule set) and the standalone preview
 * source at `docs/branding/design-system/preview/brain-synapse-loader.html`. Locked to brand
 * cyan — there's no theme prop because this IS the primary brand identity in motion. Fixed
 * dark-radial background per the design (the stage is part of the loader).
 *
 * **Use for:** the initial dataset fetch ("loading 1,442 of 1,679 wines…"), full-screen
 * dataset switching, cold-start splash, marketing-page hero animation.
 *
 * **Don't use for:** spaces narrower than 480px (the wide-aspect SVG truncates badly —
 * switch to `<SynapticOrbit />`); ambient idle states (use `<SynapticOrbit />`); active
 * filter recomputation (use `<NeuralCluster />`); anything that recurs frequently — this is
 * the rare "big moment" piece. Reserve it.
 *
 * The accompanying caption (e.g., "loading filters · 1,442 / 1,679") is wired separately by
 * the consumer — `<BrainSynapse>` is the visual; the consumer composes the progress
 * indicator alongside it.
 *
 * **Accessibility:** respects `prefers-reduced-motion` — pulses freeze in their start
 * positions, nodes hold their "lit" state.
 *
 * @packageDocumentation
 */

import { useId } from 'react';

import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_NODE_RADIUS,
	BRAIN_SYNAPSE_PULSE_INDICES,
	BRAIN_SYNAPSE_QUIET_NODES,
	BRAIN_SYNAPSE_VIEW_BOX,
	brainSynapseStageStyle,
	buildBrainSynapseCss,
} from './brainSynapseGeometry.js';

/**
 * Props for `<BrainSynapse />`.
 */
export interface BrainSynapseProps {
	/**
	 * Render width in pixels. Defaults to 660 (the design-system canonical width). The SVG
	 * uses `preserveAspectRatio="xMidYMid slice"` over a 660×220 viewBox, so width is the
	 * controlling dimension; height scales to ~1/3 of width.
	 *
	 * Minimum recommended: 480px. Below that the node graph truncates badly — consider
	 * `<SynapticOrbit />` for narrower surfaces.
	 */
	readonly width?: number;

	/** Optional `aria-label`. Defaults to `'Loading'`. */
	readonly ariaLabel?: string;

	/** Optional className for layout-context CSS hooks. */
	readonly className?: string;
}

/**
 * The Brain Synapse signature loader — the piece-that-gets-screenshot.
 *
 * @example
 *   <BrainSynapse width={660} />
 *   <p className="bs-lbl">
 *     <span className="bs-lbl-dot" /> loading filters · {loaded} / {total}
 *   </p>
 */
export const BrainSynapse = (props: BrainSynapseProps): React.ReactElement => {
	const { ariaLabel = 'Loading', className, width = 660 } = props;
	const rawId = useId();
	const scope = `bs-${rawId.replace(/:/g, '')}`;

	return (
		<div
			role="img"
			aria-label={ariaLabel}
			className={className}
			style={brainSynapseStageStyle(width)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox={BRAIN_SYNAPSE_VIEW_BOX}
				preserveAspectRatio="xMidYMid slice"
				style={{ display: 'block', height: '100%', width: '100%' }}
			>
				<defs>
					{/* Instance-scoped: two loaders on one page would otherwise share keyframe names and fire in
					    lockstep. Built from module constants and this component's own `useId` — nothing else
					    reaches it. */}
					<style>{buildBrainSynapseCss(scope)}</style>
				</defs>
				{/* edges — graph topology, painted first so the nodes sit on top (SVG has no z-index) */}
				{BRAIN_SYNAPSE_EDGES.map((edge) => (
					<line
						key={`${String(edge.x1)}-${String(edge.y1)}-${String(edge.x2)}-${String(edge.y2)}`}
						className={`${scope}-edge`}
						x1={edge.x1}
						y1={edge.y1}
						x2={edge.x2}
						y2={edge.y2}
					/>
				))}
				{/* nodes — 11 firing in cascade, 6 quiet */}
				{BRAIN_SYNAPSE_FIRING_NODES.map((node) => (
					<circle
						key={`${String(node.cx)}-${String(node.cy)}`}
						className={`${scope}-node ${scope}-node-fire`}
						cx={node.cx}
						cy={node.cy}
						r={BRAIN_SYNAPSE_NODE_RADIUS}
						style={{ animationDelay: node.delay }}
					/>
				))}
				{BRAIN_SYNAPSE_QUIET_NODES.map((node) => (
					<circle
						key={`${String(node.cx)}-${String(node.cy)}`}
						className={`${scope}-node`}
						cx={node.cx}
						cy={node.cy}
						r={BRAIN_SYNAPSE_NODE_RADIUS}
					/>
				))}
				{/* travelling pulses — 5 staggered cascades */}
				{BRAIN_SYNAPSE_PULSE_INDICES.map((index) => (
					<circle
						key={index}
						className={`${scope}-pulse ${scope}-p${String(index)}`}
						cx="0"
						cy="0"
						r={BRAIN_SYNAPSE_NODE_RADIUS}
					/>
				))}
			</svg>
		</div>
	);
};
