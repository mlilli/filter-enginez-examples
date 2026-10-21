/**
 * `/wine` — boots the worker-backed 150,000-wine engine and renders the wine demo.
 *
 * @remarks
 * The route owns the boot; `<fe-wine-view>` owns everything after it. Same split as `/real-estate`,
 * with one structural difference: **there is no resolver.**
 *
 * `WineBootStore`'s docblock carries the argument in full. In short: a resolver blocks navigation, and
 * on a tier where booting takes seconds that means clicking "Wine" does nothing visible for the whole
 * boot. So this page navigates immediately and renders one of three states over the store.
 *
 * ## The store is provided HERE and the view reads it
 *
 * That is what lets the view's `provideFilterEngineFactory` reach an engine that did not exist when
 * the page was created — the `@if (store.isReady())` below is the guarantee those factories rely on.
 * Rendering the view unconditionally would throw out of `requireEngine()`, which is the point of it
 * throwing rather than returning null.
 *
 * ## The failure screen names the fix
 *
 * The worker generates the 150,000 synthetic wines itself (or streams the local real corpus when one
 * is linked), so there is no data file to be missing: a failed boot almost always means the worker
 * could not start. The shared `<fe-boot-failure>` says so in `BOOT_FAILURE_COPY.wine`'s words, the
 * same in every app, and this page follows its hint with the switch that boots the 10,000-wine
 * default tier on the main thread instead — `WINE_DATASET_SIZE` in `wineBoot.ts`, the Angular
 * equivalent of the Vite apps' `VITE_WINE_TIER=default`. An indefinite loader would read as a hang and
 * send someone looking in the wrong place.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';

import { BrainSynapseComponent } from '../brand/brain-synapse.component.js';
import { BootFailureComponent } from '../shell/boot-failure.component.js';
import { WineBootStore } from '../wine/wine-boot-store.js';
import { WineViewComponent } from '../wine/wine-view.component.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BootFailureComponent, BrainSynapseComponent, WineViewComponent],
	providers: [WineBootStore],
	selector: 'fe-wine-page',
	// Component-local, matching Vue's and SvelteKit's boot-stage rules; `ui-styles` has no boot-stage
	// component. The failure screen's rules live with `<fe-boot-failure>`.
	styles: [
		`
			.fe-wine-booting {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 16px;
				min-height: 60vh;
				padding: 24px;
			}

			/* The caption element is styled by .fe-boot-caption--hero in ui-styles, shared by all six
			 * verticals' /wine screens and both React DatasetRoutes, so every hero caption is uppercase
			 * and tracked the same way. The layout above stays local; ui-styles has no boot-stage
			 * component. (No backticks in this comment: it lives inside the template literal Angular's
			 * styles array is written as.)
			 *
			 * A GLOBAL class inside a component that uses Angular's default emulated encapsulation is
			 * fine and is worth stating, because the instinct is to reach for ::ng-deep: emulation
			 * scopes the selectors this component AUTHORS, not the classes its template applies. A
			 * class defined in a global stylesheet still matches. */
		`,
	],
	template: `
		@if (store.isReady()) {
			<fe-wine-view />
		} @else if (store.error(); as message) {
			<!-- Each state below is a main landmark: until the engine boots, it is the page's main content. -->
			<fe-boot-failure dataset="wine" [message]="message">
				To boot the 10,000-wine default tier on the main thread instead, set
				<code>WINE_DATASET_SIZE</code> to <code>10_000</code> in <code>src/app/wine/wineBoot.ts</code>.
			</fe-boot-failure>
		} @else {
			<main class="fe-wine-booting">
				<fe-brain-synapse loaderLabel="Loading wine reviews" [width]="520" />
				<p class="fe-boot-caption fe-boot-caption--hero">
					@for (part of bootCaption(); track part.kind + part.text) {
						@if (part.kind === 'value') {
							<span class="fe-boot-caption__value">{{ part.text }}</span>
						} @else {
							{{ part.text }}
						}
					}
				</p>
			</main>
		}
	`,
})
export class WinePageComponent {
	/** Provided here, read by the view — see the class remarks. */
	protected readonly store = inject(WineBootStore);

	/**
	 * The cold-boot caption, from the one module every vertical renders.
	 *
	 * @remarks
	 * Three states, not two. A two-state caption — `Booting the wine engine…` plus an optional
	 * `N / M bottles` — freezes on `150,000 / 150,000` for the whole bitmap-index build, which reads as
	 * a hang. The third state exists to prevent that; the vanilla app's `winePage.boot.test.ts` argues
	 * it at length.
	 *
	 * The store's progress snapshot reaches the builder unchanged, `isTotalEstimated` included, so the
	 * total carries a `~` only while the local real corpus streams — the one source that cannot know
	 * its length up front.
	 *
	 * A `computed` rather than a template call, because `@for` re-evaluates its source expression on
	 * every change-detection pass and rebuilding the array each time would defeat `track`.
	 */
	protected readonly bootCaption = computed(() =>
		bootCaptionParts(this.store.progress(), { recordNoun: 'bottles' }),
	);

	public constructor() {
		// Deliberately not awaited: the boot reports through the store's signals, and awaiting here
		// would only move the same asynchronous boot somewhere less visible. Its promise never rejects — a
		// failed boot lands in `store.error()`.
		void this.store.boot();

		inject(DestroyRef).onDestroy(() => {
			this.store.dispose();
		});
	}
}
