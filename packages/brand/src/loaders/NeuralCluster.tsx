/**
 * `<NeuralCluster />` — the **active computation** loader. 8-second rotation, dense node
 * graph (13 nodes, 22 edges, 6 firing nodes) with brisk edge-pulse and node-fire keyframes.
 *
 * @remarks
 * Geometry + keyframes ported from `docs/branding/design-system/assets/loaders/index.html`
 * (template `#tpl-b-cluster` plus the `.b-rotate` / `.b-node-fire` / `.b-edge-pulse` rule
 * set). Self-contained — inline `<style>` block, no external CSS dependency.
 *
 * **Dual-accent semantic contract.** Per the design system's load-bearing accent rule, this
 * loader almost always renders in `theme='phosphor'` — it's the visible expression of "the
 * engine is doing work right now," and phosphor is the engine-activity accent. `theme='acid'`
 * is available for consumers wiring their own dashboards where phosphor is taken.
 *
 * **Use for:** filter rebuild after a rule change, query execution, data recomputation,
 * indexing (bitmap index build, MinHash signature pre-compute), "processing your data"
 * affordances.
 *
 * **Don't use for:** ambient/idle states (use `<SynapticOrbit />`), the signature dataset-
 * fetch moment (use `<BrainSynapse />`), or any frequently-recurring state (the dense firing
 * rhythm becomes visual noise when it appears too often).
 *
 * **Accessibility:** respects `prefers-reduced-motion` — pulses freeze, rotation stops.
 *
 * @packageDocumentation
 */

import { useId } from 'react';

/**
 * Props for `<NeuralCluster />`.
 */
export interface NeuralClusterProps {
	/**
	 * Render size in pixels (square). Defaults to 96. Below 32px the cluster firing pattern
	 * loses legibility.
	 */
	readonly size?: number;

	/**
	 * Color theme. Defaults to `'phosphor'` — matches the dual-accent semantic contract
	 * (phosphor = engine activity). `'acid'` is available for consumers wiring their own
	 * dashboards where the phosphor color is taken.
	 */
	readonly theme?: 'acid' | 'phosphor';

	/** Optional `aria-label`. Defaults to `'Computing'`. */
	readonly ariaLabel?: string;

	/** Optional className for layout-context CSS hooks. */
	readonly className?: string;
}

/**
 * Per-theme color tokens — match the design-system `:root` definitions.
 *
 * @internal
 */
const THEME_COLORS = {
	acid: {
		burnt: '#65A30D',
		deep: '#84CC16',
		glow: '#D9F99D',
		line: '#1F2D14',
		loader: '#A3E635',
		node: '#354820',
	},
	phosphor: {
		burnt: '#9A3412',
		deep: '#C2410C',
		glow: '#FED7AA',
		line: '#3A1E0C',
		loader: '#F97316',
		node: '#7C2D12',
	},
} as const;

/**
 * The Neural Cluster loader — active computation.
 *
 * @example
 *   <NeuralCluster size={48} />              // filter rebuild (phosphor by default)
 *   <NeuralCluster size={64} theme="acid" /> // when phosphor is taken in the surrounding UI
 */
export const NeuralCluster = (props: NeuralClusterProps): React.ReactElement => {
	const {
		ariaLabel = 'Computing',
		className,
		size = 96,
		theme = 'phosphor',
	} = props;

	const rawId = useId();
	const scope = `nc-${rawId.replace(/:/g, '')}`;
	const colors = THEME_COLORS[theme];

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			width={size}
			height={size}
			role="img"
			aria-label={ariaLabel}
			className={className}
		>
			<defs>
				<style>{`
					.${scope}-rotate { transform-origin: 100px 100px; animation: ${scope}-spin 8s linear infinite; }
					@keyframes ${scope}-spin { to { transform: rotate(360deg) } }
					.${scope}-edge { stroke: ${colors.line}; stroke-width: 0.5; fill: none; }
					.${scope}-node { fill: ${colors.node}; }
					.${scope}-node-fire {
						fill: ${colors.glow};
						filter: drop-shadow(0 0 3px ${colors.loader}) drop-shadow(0 0 7px ${colors.deep});
						animation: ${scope}-fire 1.4s ease-out infinite;
						transform-box: fill-box; transform-origin: center;
					}
					@keyframes ${scope}-fire {
						0%, 70%, 100% { opacity: 0.3; transform: scale(1); }
						75% { opacity: 1; transform: scale(1.6); }
						85% { opacity: 0.7; transform: scale(1.1); }
					}
					.${scope}-edge-pulse { animation: ${scope}-edge-pulse 1.5s ease-in-out infinite; }
					@keyframes ${scope}-edge-pulse {
						0%, 78%, 100% { stroke: ${colors.line}; stroke-width: 0.5; opacity: 0.5; filter: none; }
						85% { stroke: ${colors.loader}; stroke-width: 1; opacity: 1; filter: drop-shadow(0 0 2px ${colors.loader}); }
						95% { stroke: ${colors.burnt}; stroke-width: 0.7; opacity: 0.6; }
					}
					@media (prefers-reduced-motion: reduce) {
						.${scope}-rotate, .${scope}-node-fire, .${scope}-edge-pulse {
							animation: none;
						}
						.${scope}-node-fire { opacity: 0.8; }
					}
				`}
				</style>
			</defs>
			<g className={`${scope}-rotate`}>
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="62" y1="58" x2="88" y2="42" style={{ animationDelay: '0.0s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="88" y1="42" x2="125" y2="50" style={{ animationDelay: '0.3s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="125" y1="50" x2="148" y2="76" style={{ animationDelay: '0.5s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="148" y1="76" x2="155" y2="112" style={{ animationDelay: '0.8s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="155" y1="112" x2="140" y2="148" style={{ animationDelay: '1.0s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="140" y1="148" x2="108" y2="160" style={{ animationDelay: '1.3s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="108" y1="160" x2="72" y2="152" style={{ animationDelay: '1.5s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="72" y1="152" x2="48" y2="122" style={{ animationDelay: '1.8s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="48" y1="122" x2="45" y2="88" style={{ animationDelay: '2.0s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="45" y1="88" x2="62" y2="58" style={{ animationDelay: '2.3s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="88" y1="42" x2="100" y2="92" style={{ animationDelay: '0.4s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="148" y2="76" style={{ animationDelay: '0.7s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="155" y2="112" style={{ animationDelay: '0.9s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="108" y2="160" style={{ animationDelay: '1.4s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="48" y2="122" style={{ animationDelay: '1.9s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="62" y2="58" style={{ animationDelay: '2.4s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="72" y2="118" style={{ animationDelay: '0.2s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="100" y1="92" x2="118" y2="130" style={{ animationDelay: '1.6s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="72" y1="118" x2="48" y2="122" style={{ animationDelay: '1.2s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="72" y1="118" x2="72" y2="152" style={{ animationDelay: '0.3s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="118" y1="130" x2="140" y2="148" style={{ animationDelay: '0.9s' }} />
				<line className={`${scope}-edge ${scope}-edge-pulse`} x1="118" y1="130" x2="108" y2="160" style={{ animationDelay: '2.1s' }} />
				<circle className={`${scope}-node-fire`} cx="62" cy="58" r="3" style={{ animationDelay: '0s' }} />
				<circle className={`${scope}-node`} cx="88" cy="42" r="2.5" />
				<circle className={`${scope}-node-fire`} cx="125" cy="50" r="3" style={{ animationDelay: '0.9s' }} />
				<circle className={`${scope}-node`} cx="148" cy="76" r="2.5" />
				<circle className={`${scope}-node-fire`} cx="155" cy="112" r="3" style={{ animationDelay: '0.3s' }} />
				<circle className={`${scope}-node`} cx="140" cy="148" r="2.5" />
				<circle className={`${scope}-node-fire`} cx="108" cy="160" r="3" style={{ animationDelay: '1.4s' }} />
				<circle className={`${scope}-node`} cx="72" cy="152" r="2.5" />
				<circle className={`${scope}-node-fire`} cx="48" cy="122" r="3" style={{ animationDelay: '0.6s' }} />
				<circle className={`${scope}-node`} cx="45" cy="88" r="2.5" />
				<circle className={`${scope}-node`} cx="72" cy="118" r="2.5" />
				<circle className={`${scope}-node`} cx="118" cy="130" r="2.5" />
				<circle className={`${scope}-node-fire`} cx="100" cy="92" r="4" style={{ animationDelay: '1.7s' }} />
			</g>
		</svg>
	);
};
