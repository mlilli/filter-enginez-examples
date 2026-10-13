/**
 * `/wine` — boots the worker-backed 130k engine and renders the wine demo.
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
 * A wine boot fails for two ordinary local reasons — the worker not spawning, or the 130k corpus not
 * being present, since it is generated locally and gitignored. Both are setup states rather than bugs,
 * so the screen says what to run. An indefinite loader would read as a hang and send someone looking
 * in the wrong place.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';

import { BrainSynapseComponent } from '../brand/brain-synapse.component.js';
import { WineBootStore } from '../wine/wine-boot-store.js';
import { WineViewComponent } from '../wine/wine-view.component.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BrainSynapseComponent, WineViewComponent],
	providers: [WineBootStore],
	selector: 'fe-wine-page',
	// Component-local, matching Vue's and SvelteKit's boot-error and boot-stage rules; `ui-styles` has
	// no boot-stage component.
	styles: [
		`
			.fe-boot-error {
				margin: 3rem auto;
				max-width: 34rem;
				padding: 1.5rem;
				border: 1px solid var(--gray-4);
				border-radius: var(--radius-lg);
				background: var(--gray-1);
			}

			.fe-boot-error__title {
				margin: 0 0 0.5rem;
				color: var(--danger);
				font-weight: 600;
			}

			.fe-boot-error__detail {
				margin: 0;
				color: var(--gray-9);
				font-family: var(--font-mono);
				font-size: 0.8125rem;
			}

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
			<div class="fe-boot-error">
				<p class="fe-boot-error__title">The wine engine could not start.</p>
				<p class="fe-boot-error__detail">{{ message }}</p>
				<p class="fe-boot-error__detail">
					The 130k corpus is generated locally and is not in the repository. In the engine repo, run
					<code>pnpm --filter @filter-enginez/mock-data regen:wine:real --accept-data-license</code>,
					then <code>pnpm link:wine-corpus</code> here.
				</p>
			</div>
		} @else {
			<div class="fe-wine-booting">
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
			</div>
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
	 * `N / M bottles` — freezes on `130,000 / 130,000` for the whole bitmap-index build, which reads as
	 * a hang. The third state exists to prevent that; the vanilla app's `winePage.boot.test.ts` argues
	 * it at length.
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
