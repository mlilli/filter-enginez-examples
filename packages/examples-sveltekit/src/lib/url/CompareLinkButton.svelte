<script lang="ts">
	/**
	 * `<CompareLinkButton>` — opens the comparison page on the landing site, with the filter state you
	 * are looking at.
	 *
	 * @remarks
	 * The Svelte port of examples-shared's React `<CompareLinkButton>`. Copy link beside it hands a
	 * state to another PERSON; this hands it to every other APP: the landing site's `/compare` page
	 * opens the state in all six stacks. Every decision comes from
	 * `@filter-enginez/examples-shared/compare-core`, so this file is idiom and nothing else.
	 *
	 * **The state comes from `serializedFilterState`, not from the address bar.** This app drives the
	 * address bar with `history.replaceState`, which fires no event, so nothing here can observe `?f`
	 * arriving — and the write is debounced besides, so a click-time read could find nothing
	 * milliseconds after a filter landed and send the visitor to a preset instead of their own state.
	 * The store is set by every function in `urlState.ts` that knows the value.
	 *
	 * **The destination is resolved from `$page.url`, so it needs no server-side stand-in.**
	 * `compareTargetHref` is pure and reads only the location's `hostname` and `origin`, which SvelteKit's
	 * `page.url` carries on the server as well as in the browser. The one render that cannot know the
	 * state — the server's, where the store is `null` (no URL sync, no engine) — therefore still links to
	 * the right page, with the dataset and no state: exactly the empty state this button already has a
	 * design for, refused until a state exists.
	 *
	 * **No `data-sveltekit-reload`, and none needed.** The destination is on another origin, so
	 * SvelteKit's router leaves the click to the browser.
	 */

	import {
		COMPARE_BUTTON_LABEL,
		compareButtonTitle,
		type CompareDataset,
		compareEmptyHint,
		compareTargetHref,
		hasComparableState,
	} from '@filter-enginez/examples-shared/compare-core';
	import { page } from '$app/stores';

	import { serializedFilterState } from './urlState.js';

	interface Props {
		/** Which dataset this route filters — the dataset the comparison page should open on. */
		readonly dataset: CompareDataset;
	}

	const { dataset }: Props = $props();

	const serialized = $derived($serializedFilterState);
	const isComparable = $derived(hasComparableState(serialized));
	const href = $derived(compareTargetHref({ dataset, location: $page.url, serialized }));
	const description = $derived(isComparable ? compareButtonTitle(dataset) : compareEmptyHint(dataset));

	/** Refuse the navigation while there is nothing to carry. See the docblock on `aria-disabled`. */
	function handleClick(event: MouseEvent): void {
		if (!isComparable) {
			event.preventDefault();
		}
	}
</script>

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
