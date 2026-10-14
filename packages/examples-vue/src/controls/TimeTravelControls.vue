<script setup lang="ts" generic="TItem">
/**
 * `<TimeTravelControls>` — the header cluster: undo, redo, and the devtools toggle.
 *
 * @remarks
 * The Vue member of a set of five: React's `examples-shared/devtools`, SvelteKit's
 * `$lib/controls/TimeTravelControls.svelte`, and the Angular and vanilla ports beside it. All five
 * render the same three controls with the same icons — undo `↩`, redo `↪`, devtools `>_` — because
 * someone who learns this header on `/books` should not have to re-learn it one vertical over.
 *
 * **These are the engine's own devtools, not Redux's.** `engine.core.devtools` is an LRU action log
 * plus a time-travel cursor implemented in `@filter-enginez/core`, with no store library in the path.
 * That is exactly why every vertical can carry the surface: only the VIEW is framework-shaped.
 *
 * The keyboard binding is the SAME binding, not a second one — `attachUndoRedoKeyboard` from
 * `@filter-enginez/core/keyboard/browser`, which the React hook also wraps. It is attached here,
 * beside the buttons whose tooltips advertise it, which is the only arrangement that keeps the two
 * together: wiring it in one app-level component instead would let a route render a tooltip promising
 * a shortcut nothing had attached.
 *
 * Undo and redo stay in the header rather than inside the panel because they are ordinary
 * post-misclick affordances, and they render always (going `disabled`) because a control that
 * vanishes when it cannot act teaches nobody that time travel exists.
 */
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { attachUndoRedoKeyboard } from '@filter-enginez/core/keyboard/browser';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, onUnmounted } from 'vue';

const props = defineProps<{
	/** The engine whose time-travel cursor these controls drive. */
	engine: SignalsEngine<TItem>;
	/** Whether the devtools panel is open — drives the toggle's pressed state. */
	isDevtoolsOpen: boolean;
	/**
	 * Bump the dataset's busy version, so the computing indicator lights on the same frame.
	 *
	 * @remarks
	 * A prop because the busy tracker is per-dataset. Undo and redo are engine mutations like any
	 * other — an undo over 150k rows costs what the filter it reverses cost — and skipping this makes
	 * the app look frozen for the duration rather than busy.
	 */
	markBusy: () => void;
}>();

const emit = defineEmits<{ toggleDevtools: []}>();

const { lastChange } = useEngineRefs(props.engine);

// `devtools` is a public core API but is not on the narrowed core surface this component is typed
// against, so it is reached through an explicit structural cast — as in `<DevtoolsPanel>`.
const devtools = (props.engine.core as unknown as { devtools: unknown }).devtools as {
	canRedo: boolean;
	canUndo: boolean;
	redo: () => void;
	undo: () => void;
};

/**
 * Whether there is a step behind the cursor.
 *
 * @remarks
 * `canUndo` is a plain getter on a mutable object, so it is not reactive on its own. Touching
 * `lastChange` first is what re-evaluates the computed — the "pointless" read is the dependency, and
 * it is the same idiom `<DevtoolsPanel>` uses for the log itself.
 */
const canUndo = computed((): boolean => {
	void lastChange.value;

	return devtools.canUndo;
});

/** Whether there is a step ahead of the cursor. */
const canRedo = computed((): boolean => {
	void lastChange.value;

	return devtools.canRedo;
});

// Attached at setup rather than in `onMounted`: the binding touches `document.body` only when the
// listener is registered, and this component is browser-only. The detach is what matters, and it is
// the function `attachUndoRedoKeyboard` already hands back.
const detachKeyboard = attachUndoRedoKeyboard(devtools);

onUnmounted(detachKeyboard);

/** Step one action back, marking busy first so the indicator lights on the click's own frame. */
function handleUndo(): void {
	if (!canUndo.value) {
		return;
	}
	props.markBusy();
	devtools.undo();
}

/** Step one action forward. */
function handleRedo(): void {
	if (!canRedo.value) {
		return;
	}
	props.markBusy();
	devtools.redo();
}
</script>

<template>
	<button
		type="button"
		class="fe-icon-button"
		title="Undo (Cmd/Ctrl+Z)"
		aria-label="Undo (Cmd/Ctrl+Z)"
		:disabled="!canUndo"
		@click="handleUndo"
	>
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M9 14 4 9l5-5" />
			<path d="M4 9h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3" />
		</svg>
	</button>

	<button
		type="button"
		class="fe-icon-button"
		title="Redo (Cmd/Ctrl+Shift+Z)"
		aria-label="Redo (Cmd/Ctrl+Shift+Z)"
		:disabled="!canRedo"
		@click="handleRedo"
	>
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m15 14 5-5-5-5" />
			<path d="M20 9H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3" />
		</svg>
	</button>

	<!-- These three are one cluster, but stepping and inspecting are different jobs. -->
	<span aria-hidden="true" class="fe-icon-button-divider"></span>

	<!-- The toggle is CYAN when open, per the dual-accent contract: it names a surface you are looking
	     at (identity), not work the engine is doing (which would be phosphor). -->
	<button
		type="button"
		class="fe-icon-button fe-icon-button--raised"
		:title="isDevtoolsOpen ? 'Hide devtools' : 'Show devtools (action log + time-travel)'"
		:aria-label="isDevtoolsOpen ? 'Hide devtools' : 'Show devtools'"
		:aria-pressed="isDevtoolsOpen"
		@click="emit('toggleDevtools')"
	>
		<!-- A terminal prompt, `>_` — the most legible eight-pixel shorthand for "developer surface"
		     available, and it needs no text label beside it. -->
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m5 8 4 4-4 4" />
			<path d="M13 16h6" />
		</svg>
	</button>
</template>
