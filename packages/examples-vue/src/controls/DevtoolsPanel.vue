<script setup lang="ts" generic="TItem">
/**
 * `<DevtoolsPanel>` — the engine's action log and time-travel timeline, for the Vue vertical.
 *
 * @remarks
 * **This is core's devtools, not Redux's.** It reads `engine.core.devtools.actionLog` and
 * `.currentIndex`, and time-travels with `.jumpTo()` — all three live in `@filter-enginez/core`
 * beside `TimeTravel`, `Replay` and `Diff`, with no store library anywhere in the path. That is
 * exactly why this port is possible at all: only the VIEW is framework-specific.
 *
 * ### What this file is, and what it deliberately is not
 *
 * Every decision that is not markup comes from `@filter-enginez/examples-shared/devtools-core` —
 * flattening a log record, the row tone, the short label, `HH:MM:SS`, the drag-scrub arithmetic and
 * the keyboard step. Five verticals rendering five templates over one set of rules is the whole
 * point; a port that re-derived the scrub math would differ from React's at the strip's ends, and the
 * difference would be easy to miss.
 *
 * The styling is shared too — `ui-styles` carries the entire `.fe-devtools-*` block for every vertical.
 *
 * ### The optimistic cursor
 *
 * Clicking a row tints it immediately rather than waiting for the engine round trip; the engine
 * cursor catches up a beat later and the watcher re-syncs. Without it the timeline feels broken on
 * the worker tier, where a jump is a message round trip — the user clicks, nothing moves, they click
 * again. Re-syncing on every external change is also what makes keyboard undo / redo move the cursor.
 *
 * Vue spells this as `ref` + `watch` rather than Svelte's writable `$derived`, because Vue has no
 * writable-derived construct. The watcher is deliberately one-way: it adopts the ENGINE's cursor and
 * never writes back, so a local scrub is not immediately overwritten by the value it was diverging
 * from.
 */
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	actionTypeLabel,
	actionTypeTone,
	type DevtoolsEntry,
	formatLogTime,
	indexFromScrubPointer,
	normalizeEntry,
	scrubIndexForKey,
} from '@filter-enginez/examples-shared/devtools-core';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
	/** The engine whose action log this renders. */
	engine: SignalsEngine<TItem>;
	/** Dims the panel and blocks jumps while a recompute is in flight. */
	isComputing?: boolean;
	/** Bump the dataset's busy version, so the indicator lights on the same frame as the click. */
	markBusy: () => void;
}>();

const emit = defineEmits<{ close: []}>();

const { lastChange } = useEngineRefs(props.engine);

// `devtools` is a public core API but is not on the narrowed core surface this component is typed
// against, so it is reached through an explicit structural cast.
const devtools = (props.engine.core as unknown as { devtools: unknown }).devtools as {
	actionLog: { toArray: () => readonly unknown[] };
	currentIndex: number;
	jumpTo: (index: number) => void;
};

/**
 * The log, re-read on every engine change.
 *
 * @remarks
 * Touching `lastChange` is what registers the dependency; the value itself is unused, so the read
 * looks pointless and is load-bearing.
 */
const entries = computed((): readonly DevtoolsEntry[] => {
	void lastChange.value;

	return devtools.actionLog.toArray().map(normalizeEntry);
});

/** Where the ENGINE's cursor is. */
const engineCursor = computed((): number => {
	void lastChange.value;

	return devtools.currentIndex;
});

/** Where the panel PAINTS the cursor — see the docblock on the optimistic cursor. */
const activeCursor = ref(engineCursor.value);

watch(engineCursor, (next) => {
	activeCursor.value = next;
});

const stripEl = ref<HTMLDivElement | null>(null);
const scrollEl = ref<HTMLDivElement | null>(null);
let isDragging = false;
let lastScrubIndex = 0;

// Keep the active row on screen. Covers click-to-jump, a scrub commit, keyboard undo/redo, and a
// fresh action appended below the fold. Deferred a tick so the row exists at its new position.
watch([activeCursor, () => entries.value.length], () => {
	void nextTick(() => {
		scrollEl.value
			?.querySelector<HTMLElement>('[aria-current="true"]')
			?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	});
});

/**
 * Time-travel the engine to an index.
 *
 * @remarks
 * Paints first, then marks busy, then calls the engine — the order the React container uses, and it
 * matters on the worker tier where the jump is a round trip.
 *
 * @param index - The log index to jump to.
 */
function commitTo(index: number): void {
	if (props.isComputing === true) {
		return;
	}
	activeCursor.value = index;
	props.markBusy();
	devtools.jumpTo(index);
}

/**
 * Which index a pointer is over.
 *
 * @param clientX - The pointer's viewport x.
 * @returns The index, or the current cursor when the strip has not been measured.
 */
function indexAt(clientX: number): number {
	const strip = stripEl.value;

	if (strip === null) {
		return activeCursor.value;
	}

	return indexFromScrubPointer(clientX, strip.getBoundingClientRect(), entries.value.length);
}

/**
 * Latch the scrub gesture and snap to the pressed position.
 *
 * @param event - The pointer-down.
 */
function handleStripPointerDown(event: PointerEvent): void {
	if (props.isComputing === true) {
		return;
	}
	event.preventDefault();
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	isDragging = true;
	lastScrubIndex = indexAt(event.clientX);
	activeCursor.value = lastScrubIndex;
}

/**
 * Re-snap mid-drag, painting without committing.
 *
 * @param event - The pointer-move.
 */
function handleStripPointerMove(event: PointerEvent): void {
	if (!isDragging) {
		return;
	}
	const next = indexAt(event.clientX);

	if (next !== lastScrubIndex) {
		lastScrubIndex = next;
		activeCursor.value = next;
	}
}

/**
 * Commit the scrub.
 *
 * @param event - The pointer-up.
 */
function handleStripPointerUp(event: PointerEvent): void {
	if (!isDragging) {
		return;
	}
	isDragging = false;
	try {
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	} catch {
		// Tolerated: the pointer can be gone already if the gesture ended off-window.
	}
	commitTo(lastScrubIndex);
}

/**
 * Step the cursor with the keyboard.
 *
 * @param event - The key-down.
 */
function handleStripKeyDown(event: KeyboardEvent): void {
	const next = scrubIndexForKey(event.key, activeCursor.value, entries.value.length);

	// `null` means a key this control does not own — let the browser have it, so Tab still moves
	// focus out of the scrubber.
	if (next === null) {
		return;
	}
	event.preventDefault();
	commitTo(next);
}

/**
 * A stable key for one row.
 *
 * @param entry - The row.
 * @param index - Its position in the log.
 * @returns The key.
 */
function rowKey(entry: DevtoolsEntry, index: number): string {
	return `${String(entry.timestamp)}-${entry.type}-${entry.summary}-${String(index)}`;
}
</script>

<template>
	<section aria-label="Devtools action log" class="fe-devtools-panel">
		<header class="fe-devtools-panel__header">
			<div class="fe-devtools-panel__header-top">
				<h2 class="fe-devtools-panel__title">
					Devtools <span class="fe-devtools-panel__title-sep">·</span> Action Log
				</h2>
				<button
					type="button"
					class="fe-devtools-panel__close"
					aria-label="Close devtools"
					@click="emit('close')"
				>
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="fe-devtools-panel__meta">
				{{ entries.length }}
				{{ entries.length === 1 ? 'action' : 'actions' }}
				<span class="fe-devtools-panel__meta-sep">·</span>
				at step <span class="fe-devtools-panel__step">#{{ activeCursor + 1 }}</span>
			</div>
		</header>

		<div
			ref="scrollEl"
			class="fe-devtools-log"
			:class="{ 'fe-devtools-log--computing': isComputing }"
		>
			<div v-if="entries.length === 0" class="fe-devtools-log__empty">
				No actions yet. Interact with a filter to record one.
			</div>
			<!-- A real `<button>`, not a clickable div: keyboard focus and Enter/Space come free. -->
			<button
				v-for="(entry, index) in entries"
				v-else
				:key="rowKey(entry, index)"
				type="button"
				class="fe-devtools-row"
				:class="{ 'fe-devtools-row--active': index === activeCursor }"
				:aria-label="`Jump to action ${actionTypeLabel(entry.type)} at ${formatLogTime(entry.timestamp)}`"
				:aria-current="index === activeCursor ? 'true' : undefined"
				@click="commitTo(index)"
			>
				<span class="fe-devtools-row__time">{{ formatLogTime(entry.timestamp) }}</span>
				<span class="fe-devtools-row__type" :class="`fe-devtools-row__type--${actionTypeTone(entry.type)}`">
					{{ actionTypeLabel(entry.type) }}
				</span>
				<span class="fe-devtools-row__summary" :title="entry.summary">{{ entry.summary }}</span>
				<span aria-hidden="true" class="fe-devtools-row__marker">{{ index === activeCursor ? '●' : '→' }}</span>
			</button>
		</div>

		<footer v-if="entries.length === 0" class="fe-devtools-timeline fe-devtools-timeline--empty">
			scrub timeline · click an action to jump
		</footer>
		<footer
			v-else
			class="fe-devtools-timeline"
			:class="{ 'fe-devtools-timeline--computing': isComputing }"
		>
			<!-- ONE pointer-capture strip owns the whole gesture: down latches and snaps, move re-snaps,
			     up commits. The dots are `pointer-events: none` in ui-styles, so a press near a dot still
			     resolves through the strip's arithmetic rather than hitting the dot. -->
			<div
				ref="stripEl"
				class="fe-devtools-timeline__strip"
				role="slider"
				aria-label="Action log scrubber — drag to time-travel"
				:aria-valuemin="0"
				:aria-valuemax="entries.length - 1"
				:aria-valuenow="activeCursor"
				tabindex="0"
				@pointerdown="handleStripPointerDown"
				@pointermove="handleStripPointerMove"
				@pointerup="handleStripPointerUp"
				@pointercancel="isDragging = false"
				@keydown="handleStripKeyDown"
			>
				<div aria-hidden="true" class="fe-devtools-timeline__line"></div>
				<div class="fe-devtools-timeline__dots">
					<span
						v-for="(entry, index) in entries"
						:key="`${String(entry.timestamp)}-${entry.type}-${String(index)}`"
						aria-hidden="true"
						class="fe-devtools-dot"
						:class="{ 'fe-devtools-dot--active': index === activeCursor }"
					></span>
				</div>
			</div>
			<div class="fe-devtools-timeline__caption">
				scrub timeline <span class="fe-devtools-timeline__caption-sep">·</span>
				click an action to jump
			</div>
		</footer>
	</section>
</template>
