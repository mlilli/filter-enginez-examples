/**
 * The two URL controls that sit in every app header: the format toggle and the copy-link button.
 *
 * @remarks
 * These are about the shareable `?f` link; the computing indicator and brand loaders are about
 * engine state and live in `../brand/indicators.ts`. A dataset route wants both, but for entirely
 * different reasons, and one file exporting both would mean importing a loader drags the URL-format
 * subscription in beside it.
 *
 * Neither control is dataset-specific.
 *
 * @packageDocumentation
 */

import {
	COMPARE_BUTTON_LABEL,
	compareButtonTitle,
	type CompareDataset,
	compareEmptyHint,
	compareTargetHref,
	hasComparableState,
} from '@filter-enginez/examples-shared/compare-core';
import { el, svg } from '@filter-enginez/examples-shared/dom';

import {
	cycleUrlFormat,
	getSerializedFilterState,
	getUrlFormat,
	subscribeSerializedFilterState,
	subscribeUrlFormat,
	URL_FORMAT_LABELS,
} from './urlState.js';

/** A mounted header control with its teardown. */
export interface HeaderControl {
	/** The control's root element. */
	readonly element: HTMLElement;
	/** Detach any subscriptions. */
	readonly dispose: () => void;
}

/**
 * Build the three-way shareable-URL format toggle.
 *
 * @returns The toggle, re-labelling itself whenever the app-wide format cycles.
 */
export function createUrlFormatToggle(): HeaderControl {
	const label = el('span', { text: URL_FORMAT_LABELS[getUrlFormat()] });
	const element = el('button', {
		attrs: { 'aria-label': 'Cycle the shareable-URL format', type: 'button' },
		// `URL`, matching the other five verticals. This kicker is a hardcoded literal in six
		// framework-specific components over the same shared `.fe-url-format-toggle` block. Six copies
		// of one word is under the extraction threshold only because no two of them can share a
		// module; `urlControls.test.ts` pins this one.
		children: [el('span', { className: 'fe-url-format-toggle__kicker', text: 'URL' }), label],
		className: 'fe-url-format-toggle',
		on: {
			click: () => {
				cycleUrlFormat();
			},
		},
	});

	const dispose = subscribeUrlFormat((format) => {
		label.textContent = URL_FORMAT_LABELS[format];
	});

	return { dispose, element };
}

/**
 * The chain-link glyph on the copy-link button.
 *
 * @remarks
 * Geometry copied verbatim from the React `<CopyLinkButton>` so the two read as the same control.
 * `stroke="currentColor"` rather than a literal — the button's color is the cyan accent and shifts on
 * hover, and a hardcoded stroke would leave the icon behind when it does.
 *
 * @returns The icon, marked `aria-hidden` since the button already carries its own label.
 *
 * @internal
 */
function linkIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			fill: 'none',
			height: 16,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 16,
		},
		[
			svg('path', { d: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1' }),
			svg('path', { d: 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1' }),
		],
	);
}

/**
 * Build the copy-current-link button.
 *
 * @returns The button; it flashes "Copied" for 1.5s on success.
 */
export function createCopyLinkButton(): HeaderControl {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const label = el('span', { text: 'Copy link' });
	const element = el('button', {
		attrs: { 'aria-live': 'polite', type: 'button' },
		children: [linkIcon(), label],
		className: 'fe-copy-link',
		on: {
			click: () => {
				void navigator.clipboard.writeText(window.location.href).then(
					() => {
						label.textContent = 'Copied';
						if (timer !== null) {
							clearTimeout(timer);
						}
						timer = setTimeout(() => {
							label.textContent = 'Copy link';
							timer = null;
						}, 1500);
					},
					() => {
						// Clipboard denied (insecure origin / permission) — leave the label alone.
					},
				);
			},
		},
	});

	return {
		dispose: () => {
			if (timer !== null) {
				clearTimeout(timer);
			}
		},
		element,
	};
}

/**
 * The exchange glyph on the Compare button.
 *
 * @remarks
 * Two arrows passing in opposite directions — "the same thing, on the other side" — deliberately
 * distinct from the chain link on Copy link, which the two controls sitting side by side would
 * otherwise blur together. Same geometry as the React, Svelte and Vue ports.
 *
 * @returns The icon, marked `aria-hidden` since the anchor carries its own label.
 *
 * @internal
 */
function exchangeIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			fill: 'none',
			height: 16,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 16,
		},
		[
			svg('path', { d: 'M3 9h15' }),
			svg('path', { d: 'M15 6l3 3-3 3' }),
			svg('path', { d: 'M21 15H6' }),
			svg('path', { d: 'M9 18l-3-3 3-3' }),
		],
	);
}

/**
 * Build the header Compare button — the link that carries this route's filter state to the comparison
 * page on the landing site, `filterenginez.com/compare`.
 *
 * @remarks
 * Copy link beside it hands a state to another PERSON; this hands it to every APP. Every decision
 * comes from `@filter-enginez/examples-shared/compare-core`; this function contributes DOM and
 * nothing else.
 *
 * **It subscribes rather than reading the URL when clicked.** This app drives the address bar with
 * `history.replaceState`, which fires no event, and the write is debounced — so a click-time read
 * could find nothing milliseconds after a filter landed and send the visitor to the comparison page
 * with a preset instead of their own state. {@link subscribeSerializedFilterState} is the source, and it
 * fires immediately with the current value, so the first paint is already correct.
 *
 * **An anchor with `aria-disabled`, never the `disabled` attribute** — anchors do not honor it, and
 * it would drop the control out of the tab order, leaving a visible affordance a keyboard user
 * cannot reach to discover why it does nothing. It stays focusable, the click is refused in the
 * listener, and the accessible NAME carries the reason rather than the action.
 *
 * **The href is absolute, which is what keeps the hand-rolled router out of it.** That router
 * intercepts a click only when the href starts with `/`, and `compareTargetHref` returns a full URL on
 * the landing site's origin — the deployed apex, or the local site server in development — so the
 * browser owns the navigation and no opt-out is needed.
 *
 * @param dataset - Which dataset this route filters.
 * @returns The control, re-targeting itself whenever the serialized state changes.
 */
export function createCompareLinkButton(dataset: CompareDataset): HeaderControl {
	const element = el('a', {
		children: [exchangeIcon(), el('span', { text: COMPARE_BUTTON_LABEL })],
		className: 'fe-compare-link',
		on: {
			click: (event) => {
				if (!hasComparableState(getSerializedFilterState())) {
					event.preventDefault();
				}
			},
		},
	});

	const dispose = subscribeSerializedFilterState((serialized) => {
		const isComparable = hasComparableState(serialized);
		const description = isComparable ? compareButtonTitle(dataset) : compareEmptyHint(dataset);

		element.href = compareTargetHref({
			dataset,
			location: window.location,
			serialized,
		});
		element.setAttribute('aria-label', description);
		element.setAttribute('title', description);
		// Set-or-REMOVE, and neither shortcut works here. `setAttribute('aria-disabled', String(…))`
		// would leave `aria-disabled="false"` behind — valid ARIA, but the stylesheet and the e2e both
		// select on `[aria-disabled='true']`, so an enabled button would carry an attribute matching
		// neither and the state would be invisible to both. `toggleAttribute` is worse in the opposite
		// direction: forced on, it sets the value to the EMPTY STRING, which also misses `='true'` —
		// so the button would look enabled while announcing itself disabled.
		if (isComparable) {
			element.removeAttribute('aria-disabled');
		} else {
			element.setAttribute('aria-disabled', 'true');
		}
	});

	return { dispose, element };
}
