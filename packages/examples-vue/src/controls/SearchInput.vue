<script setup lang="ts">
/**
 * `<SearchInput>` — canonical search input with magnifier icon + clear-X affordance. The Vue port of
 * `react-ui`'s `SearchInput`, reusing the `fe-search-input*` classes verbatim so it's visually
 * identical. Pure presentational + stateless: the caller owns `value` + reacts to `change` / `commit`.
 *
 * `change` fires per keystroke (parent mirrors the text); `commit` fires on blur / Enter / clear (so
 * expensive engine work runs once, not per keystroke). The focus border-swap + halo and the clear-X
 * hover are pure CSS (`:focus-within` / `:hover`), so this holds no state.
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
	/** Emitted on every keystroke so the parent can mirror the typed text. */
	change: [value: string];
	/** Emitted on commit — blur, Enter, or clear-X. The clear path emits `change('')` then `commit('')`. */
	commit: [value: string];
}>();

/** Commit on Enter (blurring after), or bail out of the field on Escape. */
function handleKeydown(event: KeyboardEvent): void {
	const target = event.currentTarget as HTMLInputElement;

	if (event.key === 'Enter') {
		event.preventDefault();
		emit('commit', target.value);
		target.blur();
	} else if (event.key === 'Escape') {
		target.blur();
	}
}

function onInput(event: Event): void {
	emit('change', (event.target as HTMLInputElement).value);
}

function onBlur(event: FocusEvent): void {
	emit('commit', (event.target as HTMLInputElement).value);
}

function onClear(): void {
	emit('change', '');
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
		<!-- Input — commits on blur / Enter (not per keystroke). -->
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
		<!-- Clear-X — visible only when there's text; clears the parent mirror + commits empty. -->
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
