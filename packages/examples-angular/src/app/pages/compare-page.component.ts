/**
 * `<fe-compare-page>` — one filter state, rendered as a link into each vertical serving the dataset.
 *
 * @remarks
 * Every decision comes from
 * `@filter-enginez/examples-shared/compare-core`: which datasets exist, where each vertical lives, how
 * one serialized state becomes six links, what a cold visit transports. This file contributes Angular
 * idiom and nothing else — which is the page's own claim, applied to the page.
 *
 * ### `toSignal(queryParamMap)` rather than component input binding
 *
 * `main.ts` enables `withComponentInputBinding()`, so query parameters CAN arrive as `input()`s, and
 * that would be the fashionable answer. It is the wrong one here for two reasons. The state parameter
 * is named `f`, so it would need `input(…, { alias: URL_STATE_PARAM })` — pushing a shared constant
 * through the AOT compiler's static-metadata analysis for no gain. And an alias is a fourth place the
 * three parameter names could drift from `compare-core`, which is exactly what keeping them there
 * prevents. `toSignal(…, { requireSync: true })` is what this app already does six times over engine
 * observables, and `queryParamMap` is a `BehaviorSubject` so the sync requirement holds.
 *
 * Reading `route.snapshot` instead would look simpler and be broken: the toggles are `routerLink`s to
 * the same route, so Angular reuses this component instance and the snapshot never updates.
 *
 * ### The toggles are built in the class, not the template
 *
 * Angular templates do not support computed object keys, so `[queryParams]="{ [DATASET_PARAM]: … }"`
 * is not expressible — writing `{ dataset: … }` inline would restate a constant `compare-core` owns.
 * The two `computed()`s below produce ready-made descriptors instead, which also keeps the template
 * free of method calls.
 *
 * ### The rows are plain `[href]`, never `routerLink`
 *
 * Four of the six verticals hydrate `?f` only at mount, so a client-side transition would leave their
 * engines untouched. Five rows are cross-origin and the router could not claim them anyway; it is this
 * app's OWN row where a `routerLink` would silently do nothing — the hardest case to notice, and the
 * reason every shell states this explicitly.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type Params, RouterLink } from '@angular/router';
import {
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	compareHeading,
	compareLinks,
	compareListLabel,
	DATASET_LABELS,
	DATASET_PARAM,
	PRESET_PARAM,
	readCompareDataset,
	resolveCompareState,
	URL_STATE_PARAM,
} from '@filter-enginez/examples-shared/compare-core';

import { urlFormat } from '../url/url-state.js';

/** One control in the dataset or preset strip, ready to render. */
interface CompareToggle {
	/** Whether this is the one currently showing. */
	readonly isSelected: boolean;
	/** Visible text. */
	readonly label: string;
	/** The query this toggle navigates to — built here because templates cannot compute keys. */
	readonly queryParams: Params;
	/** Hover description, or `null` for the dataset toggles, which need none. */
	readonly title: string | null;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterLink],
	selector: 'fe-compare-page',
	template: `
		<main class="fe-compare">
			<p class="fe-compare__eyebrow">Engine portability</p>
			<h1 class="fe-compare__heading">{{ heading() }}</h1>
			<p class="fe-compare__lede">
				Every vertical reads its state from the same <code>?f</code> parameter, through a serializer
				whose decode detects its own format tag. A link built here opens in any of them — React,
				Vue, Svelte, Angular, or no framework at all — and reproduces the identical result set.
			</p>

			<div class="fe-compare__controls">
				<div class="fe-compare__group" role="group" aria-label="Dataset">
					@for (toggle of datasetToggles(); track toggle.label) {
						<a
							class="fe-compare__toggle"
							[class.fe-compare__toggle--selected]="toggle.isSelected"
							[attr.aria-current]="toggle.isSelected ? 'true' : null"
							[routerLink]="[]"
							[queryParams]="toggle.queryParams"
						>
							{{ toggle.label }}
						</a>
					}
				</div>

				@if (inboundState() === null) {
					<div class="fe-compare__group" role="group" aria-label="Example state">
						@for (toggle of presetToggles(); track toggle.label) {
							<a
								class="fe-compare__toggle"
								[class.fe-compare__toggle--selected]="toggle.isSelected"
								[attr.aria-current]="toggle.isSelected ? 'true' : null"
								[attr.title]="toggle.title"
								[routerLink]="[]"
								[queryParams]="toggle.queryParams"
							>
								{{ toggle.label }}
							</a>
						}
					</div>
				}
			</div>

			<div class="fe-compare__state">
				<span class="fe-compare__state-label">{{ state().sourceLabel }}</span>
				<code class="fe-compare__state-value">{{ state().serialized }}</code>
			</div>

			<ul class="fe-compare__list" [attr.aria-label]="listLabel()">
				@for (link of links(); track link.vertical.id) {
					<li class="fe-compare__row">
						<div class="fe-compare__row-head">
							<a class="fe-compare__row-name" [href]="link.href">{{ link.vertical.name }}</a>
							<span class="fe-compare__row-framework">{{ link.vertical.framework }}</span>
						</div>
						<p class="fe-compare__row-blurb">{{ link.vertical.blurb }}</p>
						<p class="fe-compare__row-binding">
							<code>{{ link.vertical.binding ?? 'no binding — bare core' }}</code>
							<span class="fe-compare__row-surface">{{ link.vertical.surface }}</span>
						</p>
					</li>
				}
			</ul>

			<p class="fe-compare__footnote">
				Links are full navigations by design: four of the six hydrate <code>?f</code> only at mount,
				so a client-side transition would leave their engines untouched.
				<a routerLink="/">Back to the dataset hub</a>
			</p>
		</main>
	`,
})
export class ComparePageComponent {
	private readonly _route = inject(ActivatedRoute);

	/**
	 * The live query string.
	 *
	 * @remarks
	 * `requireSync` holds because `ActivatedRoute.queryParamMap` is backed by a `BehaviorSubject` — it
	 * emits the current value on subscribe. If that ever stops being true this fails loudly at
	 * construction rather than rendering a page with no state.
	 */
	private readonly _query = toSignal(this._route.queryParamMap, { requireSync: true });

	/** Which dataset the table is showing. */
	protected readonly dataset = computed(() => readCompareDataset(this._query().get(DATASET_PARAM)));

	/** A `?f=` the visitor arrived with, or `null` when they came in cold. */
	protected readonly inboundState = computed(() => this._query().get(URL_STATE_PARAM));

	/** The `?preset=` they chose, or `null` for this dataset's default. */
	protected readonly presetId = computed(() => this._query().get(PRESET_PARAM));

	/** What the links carry, and where it came from. Shared with all four other shells. */
	protected readonly state = computed(() =>
		resolveCompareState({
			dataset: this.dataset(),
			format: urlFormat(),
			inboundState: this.inboundState(),
			presetId: this.presetId(),
		}),
	);

	/** The page heading and the list's accessible name — both count the rows, so both are derived. */
	protected readonly heading = computed(() => compareHeading(this.dataset()));

	/** @see heading — the assistive-tech half of the same claim. */
	protected readonly listLabel = computed(() => compareListLabel(this.dataset()));

	/** One row per vertical, in registry order. */
	protected readonly links = computed(() =>
		compareLinks({
			dataset: this.dataset(),
			location: window.location,
			serialized: this.state().serialized,
		}),
	);

	/** The dataset strip. */
	protected readonly datasetToggles = computed<readonly CompareToggle[]>(() =>
		COMPARE_DATASETS.map((candidate) => ({
			isSelected: candidate === this.dataset(),
			label: DATASET_LABELS[candidate],
			queryParams: { [DATASET_PARAM]: candidate },
			title: null,
		})),
	);

	/** The preset strip, for a visitor who arrived without state of their own. */
	protected readonly presetToggles = computed<readonly CompareToggle[]>(() => {
		const dataset = this.dataset();
		const presets = COMPARE_PRESETS[dataset];
		const selectedId = this.presetId() ?? presets[0].id;

		return presets.map((preset) => ({
			isSelected: preset.id === selectedId,
			label: preset.label,
			queryParams: { [DATASET_PARAM]: dataset, [PRESET_PARAM]: preset.id },
			title: preset.description,
		}));
	});
}
