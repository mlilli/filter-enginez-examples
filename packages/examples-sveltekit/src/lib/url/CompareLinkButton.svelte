<script lang="ts">
	/**
	 * `<CompareLinkButton>` — takes the filter state you are looking at to `/compare`.
	 *
	 * @remarks
	 * The Svelte port of examples-shared's React `<CompareLinkButton>`. Copy link beside it hands a
	 * state to another PERSON; this hands it to another APP. Every decision comes from
	 * `@filter-enginez/examples-shared/compare-core`, so this file is idiom and nothing else.
	 *
	 * **The state comes from `serializedFilterState`, not from `window.location`.** This app drives
	 * the address bar with `history.replaceState`, which fires no event, so nothing here can observe
	 * `?f` arriving — and the write is debounced besides, so a click-time read could find nothing
	 * milliseconds after a filter landed and send the visitor to a preset instead of their own state.
	 * The store is set by every function in `urlState.ts` that knows the value.
	 *
	 * **SSR renders it inert, which is correct rather than a compromise.** The store is `null` on the
	 * server (no URL, no engine, no writes), and `window` does not exist to resolve an origin from —
	 * so the pre-hydration frame is exactly the empty state this button already has a design for. It
	 * carries the bare route as its href in that frame so the markup is never an anchor without one.
	 *
	 * No `$app/*` import, deliberately: `vitest.config.ts` here aliases `$lib` and nothing else, so a
	 * component reaching for `$app/stores` cannot be mounted by a component test at all.
	 */

	import {
		COMPARE_BUTTON_LABEL,
		COMPARE_ROUTE,
		compareButtonTitle,
		type CompareDataset,
		compareEmptyHint,
		compareTargetHref,
		hasComparableState,
	} from '@filter-enginez/examples-shared/compare-core';

	import { serializedFilterState } from './urlState.js';

	interface Props {
		/** Which dataset this route filters — the dataset `/compare` should open on. */
		readonly dataset: CompareDataset;
	}

	const { dataset }: Props = $props();

	/**
	 * The destination, or the bare route while there is no `window` to resolve an origin from.
	 *
	 * @param forDataset - Which dataset `/compare` should open on.
	 * @param serialized - The state to carry, or `null`.
	 * @returns An absolute URL in the browser; {@link COMPARE_ROUTE} during SSR.
	 */
	function resolveHref(forDataset: CompareDataset, serialized: string | null): string {
		if (typeof window === 'undefined') {
			return COMPARE_ROUTE;
		}

		return compareTargetHref({
			currentVerticalId: 'sveltekit',
			dataset: forDataset,
			location: window.location,
			serialized,
		});
	}

	const serialized = $derived($serializedFilterState);
	const isComparable = $derived(hasComparableState(serialized));
	const href = $derived(resolveHref(dataset, serialized));
	const description = $derived(isComparable ? compareButtonTitle(dataset) : compareEmptyHint(dataset));

	/** Refuse the navigation while there is nothing to carry. See the docblock on `aria-disabled`. */
	function handleClick(event: MouseEvent): void {
		if (!isComparable) {
			event.preventDefault();
		}
	}
</script>

<!-- **No `data-sveltekit-reload`, and the asymmetry with the page it points at is the point.**
     `CompareView`'s six ROW links carry it because they land on DATASET routes, which hydrate `?f`
     once at mount — a client-side navigation there would arrive with the state unread. This link
     lands on `/compare`, whose route derives its parameters from `$page.url` (see
     `routes/compare/+page.svelte`), and that IS reactive to a client-side navigation. Adding the
     attribute here by analogy would trade a fast transition for a full document load and buy
     nothing. Verified against the route, not reasoned about. -->
<a
	class="fe-compare-link"
	{href}
	aria-disabled={isComparable ? undefined : true}
	aria-label={description}
	title={description}
	onclick={handleClick}
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
	{COMPARE_BUTTON_LABEL}
</a>
