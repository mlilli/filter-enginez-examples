<script lang="ts">
	/**
	 * `<SectionHeader>` — the filter-panel section label.
	 *
	 * @remarks
	 * Styling is entirely `fe-filter-section-label` in `@filter-enginez/ui-styles`, shared with every
	 * other framework and every dataset. No scoped copy of those rules lives here, so there is one
	 * definition of the label to update, not one per framework.
	 *
	 * Cyan left rule, per the dual-accent contract — a section label names WHAT is being filtered (the
	 * data axis). Phosphor here would claim the section is computing.
	 */

	const { label, note }: { label: string; note?: string } = $props();
</script>

<h3 class="fe-filter-section-label">
	{label}{#if note}<br /><span class="fe-filter-section-label__note">{note}</span>{/if}
</h3>
