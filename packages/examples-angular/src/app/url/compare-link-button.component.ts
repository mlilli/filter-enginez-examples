/**
 * `<fe-compare-link-button>` — takes the filter state you are looking at to `/compare`.
 *
 * @remarks
 * The Angular port of examples-shared's React `<CompareLinkButton>`; every one of the six apps has
 * one. `<fe-copy-link-button>` beside it hands a state to another PERSON; this hands it to
 * another APP. Every decision lives in `@filter-enginez/examples-shared/compare-core`, so this file
 * is idiom and nothing else.
 *
 * **The state comes from {@link serializedFilterState}, not from `window.location`.** This app drives
 * the address bar with `history.replaceState`, which fires no event, so nothing here could observe
 * `?f` arriving — and the write is debounced besides, so a click-time read could find nothing
 * milliseconds after a filter landed and send the visitor to a preset instead of their own state.
 *
 * ### Not a `routerLink`, and not a `[queryParams]` binding
 *
 * `compareTargetHref` returns an ABSOLUTE URL, because under the `paths` production layout each
 * vertical is served beneath its own base and a root-relative `/compare` would leave the app and
 * 404. Handing an absolute URL to `routerLink` is a category error; the browser should own it. Vue
 * made the same call for the same reason. Nor is there a `[queryParams]` object to build — which is
 * just as well, since Angular templates cannot express computed keys, the constraint that forced
 * `CompareView`'s toggles to be built as descriptors in the class.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
	COMPARE_BUTTON_LABEL,
	compareButtonTitle,
	type CompareDataset,
	compareEmptyHint,
	compareTargetHref,
	hasComparableState,
} from '@filter-enginez/examples-shared/compare-core';

import { serializedFilterState } from './url-state.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-compare-link-button',
	template: `
		<!--
			\`aria-disabled\`, never the \`disabled\` attribute — anchors do not honor it, and it would drop
			the control out of the tab order, leaving a visible affordance a keyboard user cannot reach
			to discover why it does nothing. It stays focusable, the click is refused in script, and the
			accessible NAME carries the reason rather than the action.

			Bound to \`'true' | null\`, not to a boolean. Angular removes an attribute bound to \`null\`,
			which is the state wanted here; binding \`false\` would render \`aria-disabled="false"\` —
			valid ARIA, but both \`ui-styles\` and the e2e select on \`[aria-disabled='true']\`, so the
			enabled state would be invisible to both. The vanilla shell hit both halves of this
			imperatively and its comment records them.
		-->
		<a
			class="fe-compare-link"
			[href]="href()"
			[attr.aria-disabled]="isComparable() ? null : 'true'"
			[attr.aria-label]="description()"
			[title]="description()"
			(click)="handleClick($event)"
		>
			<svg
				viewBox="0 0 24 24"
				width="16"
				height="16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 9h15" />
				<path d="M15 6l3 3-3 3" />
				<path d="M21 15H6" />
				<path d="M9 18l-3-3 3-3" />
			</svg>
			{{ label }}
		</a>
	`,
})
export class CompareLinkButtonComponent {
	/** Which dataset this route filters — the dataset `/compare` should open on. */
	public readonly dataset = input.required<CompareDataset>();

	/** The visible label. One shared constant, so six shells cannot drift into six synonyms. */
	protected readonly label = COMPARE_BUTTON_LABEL;

	/** Whether there is state worth carrying. Drives both the href and the inert state. */
	protected readonly isComparable = computed(() => hasComparableState(serializedFilterState()));

	/** Where the button points. Absolute — see the class docblock. */
	protected readonly href = computed(() =>
		compareTargetHref({
			currentVerticalId: 'angular',
			dataset: this.dataset(),
			location: window.location,
			serialized: serializedFilterState(),
		}),
	);

	/** The accessible name: the action when there is something to do, the reason when there is not. */
	protected readonly description = computed(() =>
		this.isComparable() ? compareButtonTitle(this.dataset()) : compareEmptyHint(this.dataset()),
	);

	/**
	 * Refuse the navigation while there is nothing to carry.
	 *
	 * @param event - The click to refuse.
	 */
	protected handleClick(event: MouseEvent): void {
		if (!this.isComparable()) {
			event.preventDefault();
		}
	}
}
