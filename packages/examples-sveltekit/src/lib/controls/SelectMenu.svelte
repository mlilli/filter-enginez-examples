<script lang="ts">
	/**
	 * `<SelectMenu>` — a labelled `<select>` over the shared `fe-select` classes.
	 *
	 * @remarks
	 * The Svelte counterpart to react-ui's `<SelectMenu />`. All styling comes from
	 * `@filter-enginez/ui-styles` — the chrome, the focus ring, the suppressed native arrow and the
	 * drawn one — so this component contributes markup and nothing else.
	 *
	 * The placeholder is a real `<option value="">`, not a `disabled` one: for these filters "no
	 * selection" is a legitimate state meaning "this facet is off", so the user has to be able to
	 * return to it. A disabled placeholder would make the filter one-way.
	 */

	const {
		ariaLabel,
		onChange,
		options,
		placeholder,
		value,
	}: {
		ariaLabel: string;
		onChange: (next: string) => void;
		options: readonly { label: string; value: string }[];
		placeholder?: string;
		value: string;
	} = $props();
</script>

<div class="fe-select">
	<select
		class="fe-select__field"
		aria-label={ariaLabel}
		{value}
		onchange={(event) => {
			onChange(event.currentTarget.value);
		}}
	>
		{#if placeholder !== undefined}
			<option value="">{placeholder}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<!--
		`fe-select__chevron`, not a text glyph. ui-styles positions THIS class (absolute, right: 10px);
		a made-up class name renders unstyled and lands flush against the border, which is exactly what
		happened. Geometry copied from React's `<SelectMenu />` so the two match.
	-->
	<svg
		class="fe-select__chevron"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
</div>
