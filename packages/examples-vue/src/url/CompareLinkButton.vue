<script setup lang="ts">
/**
 * `<CompareLinkButton>` — takes the filter state you are looking at to `/compare`.
 *
 * @remarks
 * The Vue port of examples-shared's React `<CompareLinkButton>`. Copy link beside it hands a state to
 * another PERSON; this hands it to another APP. Every decision comes from
 * `@filter-enginez/examples-shared/compare-core`, so this file is idiom and nothing else.
 *
 * **The state comes from `serializedFilterState`, not from `window.location`.** This app drives the
 * address bar with `history.replaceState`, which fires no event, so nothing here can observe `?f`
 * arriving — and the write is debounced besides, so a click-time read could find nothing
 * milliseconds after a filter landed and send the visitor to a preset instead of their own state.
 *
 * **A plain `<a>`, not a `<RouterLink>`**, which is the same call `CompareView.vue`'s six row links
 * make and for the same reason: this leaves the SPA. A `RouterLink` to `/compare` would work — the
 * route is in this app — but the href is built as an ABSOLUTE URL by `compareTargetHref`, since
 * under the `paths` production layout each vertical lives beneath its own base. Handing an absolute
 * URL to `RouterLink` is a category error; the browser should own it.
 */
import {
	COMPARE_BUTTON_LABEL,
	compareButtonTitle,
	type CompareDataset,
	compareEmptyHint,
	compareTargetHref,
	hasComparableState,
} from '@filter-enginez/examples-shared/compare-core';
import { computed } from 'vue';

import { serializedFilterState } from './urlState.js';

const props = defineProps<{
	/** Which dataset this route filters — the dataset `/compare` should open on. */
	dataset: CompareDataset;
}>();

const isComparable = computed(() => hasComparableState(serializedFilterState.value));
const href = computed(() =>
	compareTargetHref({
		currentVerticalId: 'vue',
		dataset: props.dataset,
		location: window.location,
		serialized: serializedFilterState.value,
	}),
);
const description = computed(() => (isComparable.value ? compareButtonTitle(props.dataset) : compareEmptyHint(props.dataset)));

/** Refuse the navigation while there is nothing to carry. See the template's `aria-disabled` note. */
function handleClick(event: MouseEvent): void {
	if (!isComparable.value) {
		event.preventDefault();
	}
}
</script>

<template>
	<!-- `aria-disabled`, never the `disabled` attribute — anchors do not honor it, and it would drop
	     the control out of the tab order, leaving a visible affordance a keyboard user cannot reach to
	     discover why it does nothing. It stays focusable, the click is refused in script, and the
	     accessible NAME carries the reason rather than the action. -->
	<a
		class="fe-compare-link"
		:href="href"
		:aria-disabled="isComparable ? undefined : 'true'"
		:aria-label="description"
		:title="description"
		@click="handleClick"
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
		{{ COMPARE_BUTTON_LABEL }}
	</a>
</template>
