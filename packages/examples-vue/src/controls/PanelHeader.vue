<script setup lang="ts">
/**
 * `<PanelHeader>` — the filter aside's title zone.
 *
 * @remarks
 * Matched to the React and Svelte `<PanelHeader>`, including the measurements, which are load-bearing:
 * the aside deliberately has NO internal padding so the scroll container's scrollbar hugs its right
 * edge, which means the header supplies its own `0 18px 14px` inset and a `20px` top margin (both from
 * `fe-filter-panel__header` in `ui-styles`). Get those wrong and the header either collides with the
 * aside edge or floats away from the sections.
 *
 * It sits OUTSIDE the scroll container in normal flow, so it stays put while the sections scroll — no
 * `position: sticky` needed.
 *
 * **Deliberately no "clear all" here.** The canonical clear-all lives in the results header's
 * active-filters bar, where one action produces one engine call and one log entry.
 */
withDefaults(
	defineProps<{
		/** The panel's title. */
		label?: string;
	}>(),
	{
		label: 'Filters',
	},
);
</script>

<template>
	<div class="fe-filter-panel__header">
		<h2 class="fe-filter-panel__title">{{ label }}</h2>
	</div>
</template>
