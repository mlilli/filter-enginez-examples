<script lang="ts">
	/**
	 * `<NeuralCluster>` — the Svelte port of the brand ACTIVE-computation loader: a 16s-rotating dense
	 * node graph (13 nodes, 22 edges, firing nodes + edge pulses). Geometry is byte-faithful to the
	 * React `NeuralCluster`. Rendered while the engine is recomputing (phosphor), swapping in for the
	 * ambient `<SynapticOrbit>` — same idle/computing loader distinction as the React app. Animations
	 * live in `@filter-enginez/ui-styles` (app-wide; Svelte's component-CSS parser can't take the
	 * `drop-shadow` + multi-keyframe rule set); theme colors come from inline `--nc-*` properties.
	 */


	interface Props {
		/** Render size in px (square). */
		readonly size?: number;
	}

	const { size = 40 }: Props = $props();

	// Phosphor theme (engine-activity accent) — the loader's default per the dual-accent contract.
	const theme =
		'--nc-loader:#F97316;--nc-glow:#FED7AA;--nc-deep:#C2410C;--nc-node:#7C2D12;--nc-line:#3A1E0C;--nc-burnt:#9A3412;';
</script>

<svg
	class="fe-cluster"
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 200 200"
	width={size}
	height={size}
	role="img"
	aria-label="Computing"
	style={theme}
>
	<g class="fe-cluster__rotate">
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="62" y1="58" x2="88" y2="42" style="animation-delay: 0s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="88" y1="42" x2="125" y2="50" style="animation-delay: 0.3s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="125" y1="50" x2="148" y2="76" style="animation-delay: 0.5s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="148" y1="76" x2="155" y2="112" style="animation-delay: 0.8s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="155" y1="112" x2="140" y2="148" style="animation-delay: 1s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="140" y1="148" x2="108" y2="160" style="animation-delay: 1.3s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="108" y1="160" x2="72" y2="152" style="animation-delay: 1.5s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="72" y1="152" x2="48" y2="122" style="animation-delay: 1.8s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="48" y1="122" x2="45" y2="88" style="animation-delay: 2s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="45" y1="88" x2="62" y2="58" style="animation-delay: 2.3s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="88" y1="42" x2="100" y2="92" style="animation-delay: 0.4s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="148" y2="76" style="animation-delay: 0.7s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="155" y2="112" style="animation-delay: 0.9s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="108" y2="160" style="animation-delay: 1.4s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="48" y2="122" style="animation-delay: 1.9s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="62" y2="58" style="animation-delay: 2.4s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="72" y2="118" style="animation-delay: 0.2s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="100" y1="92" x2="118" y2="130" style="animation-delay: 1.6s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="72" y1="118" x2="48" y2="122" style="animation-delay: 1.2s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="72" y1="118" x2="72" y2="152" style="animation-delay: 0.3s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="118" y1="130" x2="140" y2="148" style="animation-delay: 0.9s" />
		<line class="fe-cluster__edge fe-cluster__edge-pulse" x1="118" y1="130" x2="108" y2="160" style="animation-delay: 2.1s" />
		<circle class="fe-cluster__node-fire" cx="62" cy="58" r="3" style="animation-delay: 0s" />
		<circle class="fe-cluster__node" cx="88" cy="42" r="2.5" />
		<circle class="fe-cluster__node-fire" cx="125" cy="50" r="3" style="animation-delay: 0.9s" />
		<circle class="fe-cluster__node" cx="148" cy="76" r="2.5" />
		<circle class="fe-cluster__node-fire" cx="155" cy="112" r="3" style="animation-delay: 0.3s" />
		<circle class="fe-cluster__node" cx="140" cy="148" r="2.5" />
		<circle class="fe-cluster__node-fire" cx="108" cy="160" r="3" style="animation-delay: 1.4s" />
		<circle class="fe-cluster__node" cx="72" cy="152" r="2.5" />
		<circle class="fe-cluster__node-fire" cx="48" cy="122" r="3" style="animation-delay: 0.6s" />
		<circle class="fe-cluster__node" cx="45" cy="88" r="2.5" />
		<circle class="fe-cluster__node" cx="72" cy="118" r="2.5" />
		<circle class="fe-cluster__node" cx="118" cy="130" r="2.5" />
		<circle class="fe-cluster__node-fire" cx="100" cy="92" r="4" style="animation-delay: 1.7s" />
	</g>
</svg>
