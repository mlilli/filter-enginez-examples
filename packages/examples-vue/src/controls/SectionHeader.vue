<script setup lang="ts">
/**
 * `<SectionHeader>` — the filter-panel section label.
 *
 * @remarks
 * Styling is entirely `fe-filter-section-label` in `@filter-enginez/ui-styles`, shared with every
 * other framework and every dataset. The real-estate panel alone has fourteen sections, so inlining
 * the markup would mean fourteen copies of one heading.
 *
 * Cyan left rule, per the dual-accent contract — a section label names WHAT is being filtered (the
 * data axis). Phosphor here would claim the section is computing.
 *
 * The heading is written on one line, with nothing between its tags but the label and the note: the
 * compiler keeps a space for the line break between an interpolation and the next element, and a
 * heading whose text is `Color ` rather than `Color` no longer matches the exact heading every app
 * renders (`tests/tooling/filterPanelMarkupParity.test.ts`).
 */
defineProps<{
	/** The section's name, e.g. `Price`. */
	label: string;
	/** Optional second line — a unit, a caveat, or a hint about the facet's semantics. */
	note?: string;
}>();
</script>

<template>
	<h3 class="fe-filter-section-label">{{ label }}<template v-if="note"><br /><span class="fe-filter-section-label__note">{{ note }}</span></template></h3>
</template>
