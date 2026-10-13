/**
 * `<fe-synaptic-orbit>` — the brand ambient loader: an 11s orbit of three rings, satellites and
 * synapse flicks around a pulsing core.
 *
 * @remarks
 * Geometry is byte-faithful to the React / Vue / Svelte versions. The theme swaps between **acid**
 * (idle) and **phosphor** (computing) purely through CSS custom properties, so there is one rule set
 * in `@filter-enginez/ui-styles` and no duplicated markup. Note this respects the dual-accent contract:
 * phosphor means *the engine is firing right now*.
 *
 * Unlike `<fe-neural-cluster>` the element list here is short and irregular, so it stays as literal
 * markup — turning nine hand-placed satellites into a data table would obscure more than it saved.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Phosphor tokens — the engine is computing. */
const COMPUTING_THEME =
	'--orbit-loader:#F97316;--orbit-glow:#FED7AA;--orbit-deep:#C2410C;--orbit-node:#7C2D12;--orbit-line:#3A1E0C;';

/** Acid tokens — the engine is idle. */
const IDLE_THEME =
	'--orbit-loader:#A3E635;--orbit-glow:#D9F99D;--orbit-deep:#84CC16;--orbit-node:#354820;--orbit-line:#1F2D14;';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-synaptic-orbit',
	template: `
		<svg
			class="fe-orbit"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			[attr.width]="size()"
			[attr.height]="size()"
			role="img"
			[attr.aria-label]="isComputing() ? 'Engine computing' : 'Engine idle'"
			[style]="theme()"
		>
			<g class="fe-orbit__rotate">
				<circle class="fe-orbit__ring" cx="100" cy="100" r="78" />
				<circle class="fe-orbit__ring" cx="100" cy="100" r="55" />
				<circle class="fe-orbit__ring" cx="100" cy="100" r="34" />
				<circle class="fe-orbit__sat-glow" cx="178" cy="100" r="3.5" />
				<circle class="fe-orbit__sat" cx="61" cy="167.6" r="3" />
				<circle class="fe-orbit__sat-glow" cx="61" cy="32.4" r="3.5" style="animation-delay: 0.5s" />
				<circle class="fe-orbit__sat" cx="127.5" cy="52.4" r="3" />
				<circle
					class="fe-orbit__sat-glow"
					cx="72.5"
					cy="147.6"
					r="3.5"
					style="animation-delay: 0.2s"
				/>
				<circle class="fe-orbit__sat" cx="134" cy="100" r="2.5" />
				<circle class="fe-orbit__sat" cx="83" cy="129.4" r="2.5" />
				<circle class="fe-orbit__sat-glow" cx="83" cy="70.6" r="3" style="animation-delay: 0.7s" />
				<line class="fe-orbit__syn fe-orbit__syn--1" x1="178" y1="100" x2="127.5" y2="52.4" />
				<line class="fe-orbit__syn fe-orbit__syn--2" x1="127.5" y1="52.4" x2="61" y2="32.4" />
				<line class="fe-orbit__syn fe-orbit__syn--3" x1="72.5" y1="147.6" x2="61" y2="167.6" />
				<line class="fe-orbit__syn fe-orbit__syn--4" x1="83" y1="70.6" x2="134" y2="100" />
				<line class="fe-orbit__syn fe-orbit__syn--5" x1="178" y1="100" x2="134" y2="100" />
				<line class="fe-orbit__syn fe-orbit__syn--6" x1="83" y1="129.4" x2="72.5" y2="147.6" />
			</g>
			<circle class="fe-orbit__core" cx="100" cy="100" r="5" />
		</svg>
	`,
})
export class SynapticOrbitComponent {
	/** Phosphor (computing) vs acid (idle). */
	public readonly isComputing = input<boolean>(false);

	/** Render size in px (square). */
	public readonly size = input<number>(40);

	/** The inline custom properties the shared CSS reads. */
	protected readonly theme = computed<string>(() =>
		this.isComputing() ? COMPUTING_THEME : IDLE_THEME,
	);
}
