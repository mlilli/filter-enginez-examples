<script setup lang="ts">
/**
 * `<SearchInput>` — canonical search input with magnifier icon + clear-X affordance. The Vue port of
 * `react-ui`'s `SearchInput`, reusing the `fe-search-input*` classes verbatim so it's visually
 * identical. Pure presentational + stateless: the caller owns `value` + reacts to `change` / `commit`.
 *
 * `change` fires per keystroke (the parent shows the text and re-arms its debounced commit);
 * `commit` fires ONCE per blur, Enter or clear-X, carrying the text to commit now. Each search section
 * binds the two to `useTypeaheadSearch`, which owns the timing. The focus border-swap + halo and the
 * clear-X hover are pure CSS (`:focus-within` / `:hover`).
 */
defineProps<{
	/** Current input value. */
	value: string;
	/** Placeholder text. */
	placeholder?: string;
	/** Optional accessible name for the input. */
	inputLabel?: string;
}>();

const emit = defineEmits<{
	/** Emitted on every keystroke, with the field's text. */
	change: [value: string];
	/** Emitted once per blur, Enter or clear-X, with the text to commit (`''` for the clear-X). */
	commit: [value: string];
}>();

/**
 * Set while a keydown blurs the field itself, so the blur it causes does not commit a second time.
 *
 * @remarks
 * `blur()` dispatches the blur event synchronously, so the flag is only ever up for the length of
 * that call.
 */
let isBlurFromKeydown = false;

/**
 * Commit on Enter, or leave the field on Escape (which commits through the blur), then blur.
 *
 * @param event - The keydown.
 */
function handleKeydown(event: KeyboardEvent): void {
	const target = event.currentTarget as HTMLInputElement;

	if (event.key === 'Enter') {
		event.preventDefault();
		emit('commit', target.value);
		isBlurFromKeydown = true;
		target.blur();
		isBlurFromKeydown = false;
	} else if (event.key === 'Escape') {
		target.blur();
	}
}

/**
 * Forward a keystroke.
 *
 * @param event - The input event.
 */
function onInput(event: Event): void {
	emit('change', (event.target as HTMLInputElement).value);
}

/**
 * Commit on blur, unless Enter already committed this text.
 *
 * @param event - The blur event.
 */
function onBlur(event: FocusEvent): void {
	if (isBlurFromKeydown) {
		return;
	}
	emit('commit', (event.target as HTMLInputElement).value);
}

/** Clear the field: one `commit('')`, which the parent both shows and commits. */
function onClear(): void {
	emit('commit', '');
}
</script>

<template>
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
		<!-- Input — keystrokes reach the parent's debounce; blur / Enter commit once. -->
		<input
			type="search"
			class="fe-search-input__field"
			:value="value"
			:placeholder="placeholder"
			:aria-label="inputLabel"
			@input="onInput"
			@blur="onBlur"
			@keydown="handleKeydown"
		/>
		<!-- Clear-X — visible only when there's text; commits the empty query. -->
		<button
			v-if="value.length > 0"
			type="button"
			class="fe-search-input__clear"
			aria-label="Clear search"
			@click="onClear"
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
	</div>
</template>
