<script lang="ts">
	/**
	 * `<SearchInput>` — canonical search input with magnifier icon + clear-X affordance. The Svelte port
	 * of `react-ui`'s `SearchInput`, reusing the `fe-search-input*` classes verbatim so it's visually
	 * identical. Pure presentational + stateless: the caller owns `value` + `onChange`.
	 *
	 * `onChange` fires per keystroke (parent mirrors the text); `onCommit` fires on blur / Enter / clear
	 * (so expensive engine work runs once, not per keystroke). The focus border-swap + halo and the
	 * clear-X hover are pure CSS (`:focus-within` / `:hover`), so this holds no state.
	 */

	interface Props {
		/** Current input value. */
		readonly value: string;
		/** Called on every keystroke so the parent can mirror the typed text. */
		readonly onChange: (value: string) => void;
		/** Called on commit — blur, Enter, or clear-X. The clear path fires `onChange('')` then `onCommit('')`. */
		readonly onCommit?: (value: string) => void;
		/** Placeholder text. */
		readonly placeholder?: string;
		/** Optional accessible name for the input. */
		readonly ariaLabel?: string;
	}

	const { ariaLabel, onChange, onCommit, placeholder, value }: Props = $props();

	/** Commit on Enter (blurring after), or bail out of the field on Escape. */
	function handleKeydown(event: KeyboardEvent): void {
		const target = event.currentTarget as HTMLInputElement;

		if (event.key === 'Enter') {
			event.preventDefault();
			onCommit?.(target.value);
			target.blur();
		} else if (event.key === 'Escape') {
			target.blur();
		}
	}
</script>

<div class="fe-search-input">
	<!-- Magnifier -->
	<svg
		class="fe-search-input__icon"
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
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	</svg>
	<!-- Input — commits on blur / Enter (not per keystroke). -->
	<input
		type="search"
		class="fe-search-input__field"
		{value}
		{placeholder}
		aria-label={ariaLabel}
		oninput={(event) => onChange(event.currentTarget.value)}
		onblur={(event) => onCommit?.(event.currentTarget.value)}
		onkeydown={handleKeydown}
	/>
	<!-- Clear-X — visible only when there's text; clears the parent mirror + commits empty. -->
	{#if value.length > 0}
		<button
			type="button"
			class="fe-search-input__clear"
			onclick={() => {
				onChange('');
				onCommit?.('');
			}}
			aria-label="Clear search"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>
