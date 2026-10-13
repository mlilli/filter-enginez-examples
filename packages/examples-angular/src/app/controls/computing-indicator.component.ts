/**
 * `<fe-computing-indicator>` — the "engine · computing / idle" status pill in the results header.
 *
 * @remarks
 * The two states swap the animation **type**, not just its color: `<fe-synaptic-orbit>` drifts while
 * idle (acid), `<fe-neural-cluster>` fires while computing (phosphor). That distinction is the
 * dual-accent contract made literal — phosphor means the engine is working *right now*.
 *
 * `aria-live="polite"` on the root announces the transition without stealing focus; the loaders
 * themselves are `aria-hidden`, since the label already carries the meaning.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { NeuralClusterComponent } from '../brand/neural-cluster.component.js';
import { SynapticOrbitComponent } from '../brand/synaptic-orbit.component.js';

/** Loader size inside the header pill — small enough that the shared CSS doubles its tempo. */
const INDICATOR_LOADER_SIZE = 30;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NeuralClusterComponent, SynapticOrbitComponent],
	selector: 'fe-computing-indicator',
	template: `
		<span
			class="fe-computing-indicator"
			[class.fe-computing-indicator--computing]="isComputing()"
			aria-live="polite"
			[attr.aria-label]="isComputing() ? 'Engine computing' : 'Engine idle'"
		>
			<span aria-hidden="true" class="fe-computing-indicator__icon">
				@if (isComputing()) {
					<fe-neural-cluster [size]="loaderSize" />
				} @else {
					<fe-synaptic-orbit [size]="loaderSize" />
				}
			</span>
			<span
				class="fe-computing-indicator__label"
				[class.fe-computing-indicator__label--computing]="isComputing()"
			>
				engine
				<span class="fe-computing-indicator__sep">·</span>
				{{ isComputing() ? 'computing' : 'idle' }}
			</span>
		</span>
	`,
})
export class ComputingIndicatorComponent {
	/** Whether the engine is mid-recompute. */
	public readonly isComputing = input.required<boolean>();

	/** Loader size, exposed for the template. */
	protected readonly loaderSize = INDICATOR_LOADER_SIZE;
}
