/**
 * `<SynapticOrbit />` — the **ambient / passive** loader. 11-second slow-orbit, 8 satellites,
 * 3 concentric rings, central core, 6 synapse-flick lines. Themeable: `acid` (terminal/live)
 * or `phosphor` (vintage-CRT/warm).
 *
 * @remarks
 * Geometry + keyframes ported byte-faithfully from the design-system source at
 * `docs/branding/design-system/assets/loaders/index.html` (template `#tpl-a-orbit` plus the
 * `.a-rotate` / `.a-ring` / `.a-sat` / `.a-syn` rule set). All animations are CSS-driven and
 * inline so the component is self-contained — consumers don't need to import a separate CSS
 * file.
 *
 * **Use for:** app boot, route transitions, idle/listening states, dataset switching,
 * "warming up" affordances. The slow 11s orbit reads as *deliberate*, not busy.
 *
 * **Don't use for:** sub-2-second blocking spinners (the rhythm has no time to read), active
 * filter recomputation (use `<NeuralCluster />`), or the signature dataset-fetch moment (use
 * `<BrainSynapse />`).
 *
 * **Accessibility:** respects `prefers-reduced-motion` — the orbit freezes with the core lit
 * rather than spinning, so the loading affordance is still legible at zero motion.
 *
 * @packageDocumentation
 */

import { useId } from 'react';

/**
 * Props for `<SynapticOrbit />`.
 */
export interface SynapticOrbitProps {
	/**
	 * Render size in pixels (square). Defaults to 96. Below 32px the synapse flicker and
	 * satellite pulse lose legibility — the design system enforces this as the minimum.
	 */
	readonly size?: number;

	/**
	 * Color theme:
	 *
	 * - `'acid'` — `#A3E635` family (terminal/live-signal). Default.
	 * - `'phosphor'` — `#F97316` family (vintage-CRT/warm). Use near other phosphor-marked
	 *   UI (devtools panel, "computing" affordances).
	 *
	 * Pick one per surface; don't mix themes on the same screen.
	 */
	readonly theme?: 'acid' | 'phosphor';

	/** Optional `aria-label`. Defaults to `'Loading'`. Hooks into `aria-live` regions correctly. */
	readonly ariaLabel?: string;

	/** Optional className for layout-context CSS hooks. */
	readonly className?: string;
}

/**
 * Per-theme color tokens — match the design-system `:root` definitions for `theme-acid` and
 * `theme-phosphor`. Kept inline so the component is self-contained (no `tokens.css` required
 * for the loader to render correctly).
 *
 * @internal
 */
const THEME_COLORS = {
	acid: {
		deep: '#84CC16',
		glow: '#D9F99D',
		line: '#1F2D14',
		loader: '#A3E635',
		node: '#354820',
	},
	phosphor: {
		deep: '#C2410C',
		glow: '#FED7AA',
		line: '#3A1E0C',
		loader: '#F97316',
		node: '#7C2D12',
	},
} as const;

/**
 * The Synaptic Orbit loader.
 *
 * @example
 *   <SynapticOrbit size={64} theme="acid" />     // route transition
 *   <SynapticOrbit size={48} theme="phosphor" /> // devtools panel "computing"
 */
export const SynapticOrbit = (props: SynapticOrbitProps): React.ReactElement => {
	const {
		ariaLabel = 'Loading',
		className,
		size = 96,
		theme = 'acid',
	} = props;

	// Unique CSS scope per component instance — prevents two loaders on the same page from
	// fighting over class names (or animations colliding when one is acid + one is phosphor).
	// `useId` returns a colon-containing id which we kebab-case for CSS-class friendliness.
	const rawId = useId();
	const scope = `so-${rawId.replace(/:/g, '')}`;
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
					.${scope}-rotate { transform-origin: 100px 100px; animation: ${scope}-spin 11s linear infinite; }
					@keyframes ${scope}-spin { to { transform: rotate(360deg) } }
					.${scope}-ring { fill: none; stroke: ${colors.line}; stroke-width: 0.5; opacity: 0.4; }
					.${scope}-sat { fill: ${colors.node}; }
					.${scope}-sat-glow {
						fill: ${colors.glow};
						filter: drop-shadow(0 0 3px ${colors.loader}) drop-shadow(0 0 6px ${colors.deep});
						animation: ${scope}-sat-pulse 1.4s ease-in-out infinite;
						transform-box: fill-box; transform-origin: center;
					}
					@keyframes ${scope}-sat-pulse { 0%, 100% { opacity: 0.6 } 50% { opacity: 1 } }
					.${scope}-core {
						fill: ${colors.glow};
						filter: drop-shadow(0 0 4px ${colors.loader}) drop-shadow(0 0 10px ${colors.deep});
						animation: ${scope}-core-pulse 1.6s ease-in-out infinite;
						transform-origin: 100px 100px;
					}
					@keyframes ${scope}-core-pulse { 0%, 100% { transform: scale(1); opacity: 0.8 } 50% { transform: scale(1.3); opacity: 1 } }
					.${scope}-syn {
						stroke: ${colors.loader}; stroke-width: 0.6; fill: none; opacity: 0;
						filter: drop-shadow(0 0 2px ${colors.loader});
					}
					.${scope}-syn-1 { animation: ${scope}-flick 2.4s ease-out infinite 0.0s; }
					.${scope}-syn-2 { animation: ${scope}-flick 2.4s ease-out infinite 0.6s; }
					.${scope}-syn-3 { animation: ${scope}-flick 2.4s ease-out infinite 1.2s; }
					.${scope}-syn-4 { animation: ${scope}-flick 2.8s ease-out infinite 0.4s; }
					.${scope}-syn-5 { animation: ${scope}-flick 2.8s ease-out infinite 1.6s; }
					.${scope}-syn-6 { animation: ${scope}-flick 3.2s ease-out infinite 0.9s; }
					@keyframes ${scope}-flick {
						0%, 8%, 100% { opacity: 0; stroke-width: 0.6; }
						10% { opacity: 1; stroke-width: 1.2; }
						18% { opacity: 0.6; stroke-width: 0.8; }
						26% { opacity: 0; }
					}
					@media (prefers-reduced-motion: reduce) {
						.${scope}-rotate, .${scope}-sat-glow, .${scope}-core,
						.${scope}-syn-1, .${scope}-syn-2, .${scope}-syn-3,
						.${scope}-syn-4, .${scope}-syn-5, .${scope}-syn-6 {
							animation: none;
						}
						.${scope}-syn-1, .${scope}-syn-2, .${scope}-syn-3,
						.${scope}-syn-4, .${scope}-syn-5, .${scope}-syn-6 { opacity: 0.6; }
					}
				`}
				</style>
			</defs>
			<g className={`${scope}-rotate`}>
				<circle className={`${scope}-ring`} cx="100" cy="100" r="78" />
				<circle className={`${scope}-ring`} cx="100" cy="100" r="55" />
				<circle className={`${scope}-ring`} cx="100" cy="100" r="34" />
				<circle className={`${scope}-sat-glow`} cx="178" cy="100" r="3.5" style={{ animationDelay: '0s' }} />
				<circle className={`${scope}-sat`} cx="61" cy="167.6" r="3" />
				<circle className={`${scope}-sat-glow`} cx="61" cy="32.4" r="3.5" style={{ animationDelay: '0.5s' }} />
				<circle className={`${scope}-sat`} cx="127.5" cy="52.4" r="3" />
				<circle className={`${scope}-sat-glow`} cx="72.5" cy="147.6" r="3.5" style={{ animationDelay: '0.2s' }} />
				<circle className={`${scope}-sat`} cx="134" cy="100" r="2.5" />
				<circle className={`${scope}-sat`} cx="83" cy="129.4" r="2.5" />
				<circle className={`${scope}-sat-glow`} cx="83" cy="70.6" r="3" style={{ animationDelay: '0.7s' }} />
				<line className={`${scope}-syn ${scope}-syn-1`} x1="178" y1="100" x2="127.5" y2="52.4" />
				<line className={`${scope}-syn ${scope}-syn-2`} x1="127.5" y1="52.4" x2="61" y2="32.4" />
				<line className={`${scope}-syn ${scope}-syn-3`} x1="72.5" y1="147.6" x2="61" y2="167.6" />
				<line className={`${scope}-syn ${scope}-syn-4`} x1="83" y1="70.6" x2="134" y2="100" />
				<line className={`${scope}-syn ${scope}-syn-5`} x1="178" y1="100" x2="134" y2="100" />
				<line className={`${scope}-syn ${scope}-syn-6`} x1="83" y1="129.4" x2="72.5" y2="147.6" />
			</g>
			<circle className={`${scope}-core`} cx="100" cy="100" r="5" />
		</svg>
	);
};
