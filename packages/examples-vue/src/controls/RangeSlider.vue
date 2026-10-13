<script setup lang="ts">
/**
 * `<RangeSlider>` — dual-handle numeric range slider with three-layer track semantics, the Vue port of
 * `react-ui`'s Radix-backed `RangeSlider`. Reuses the `fe-range-slider*` classes verbatim.
 *
 * ### Three layers, one slider
 *   1. **Baseline** — the full corpus min/max; the track always spans this.
 *   2. **Available zone** — the filtered-except-self min/max; handles are constrained to drag within
 *      it, and track segments outside it are dimmed ("no records exist here given your other filters").
 *   3. **Selected range** — the user's current handle positions, a cyan-filled segment.
 *
 * Below the track sit editable min/max text inputs: type a value + Enter (or blur) to commit; the value
 * clamps to the available zone and swaps if max < min.
 *
 * ### The distribution overlay
 *
 * The optional `histogram` renders the corpus distribution above the track, in the same three tiers
 * as the track itself, so the bars and the track read as one control. It is the most legible
 * demonstration of predictive disable in the app: a dimmed chip says "this would give you nothing",
 * a distribution bar says "here is where the data actually lives, given everything else you picked"
 * — and it repaints on every commit.
 *
 * The tier + height arithmetic is NOT here. `histogramBarClassName` and
 * `histogramBarHeightPercent` from the import-free `examples-shared/bounds` subpath own it, shared
 * with the other five verticals; `ui-styles` owns the resulting colors. This file therefore renders
 * bars without knowing what a tier looks like, which is the only way six ports of one overlay stay
 * identical.
 *
 * Radix is replaced with a hand-rolled pointer + keyboard slider — a Filter EngineZ signal-driven Vue
 * app can't reuse React's Radix control, so this reproduces the geometry + behavior natively.
 */
import {
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBucket,
	type NumericBounds,
} from '@filter-enginez/examples-shared/bounds';
import { computed, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
	defineProps<{
		/** Section label shown in the header row. */
		label: string;
		/** Baseline bounds — the full corpus min/max the track always spans. */
		baseline: NumericBounds;
		/** Available bounds — filtered-except-self min/max; handles drag within, outside is dimmed. */
		available?: NumericBounds;
		/**
		 * Optional distribution bars above the track.
		 *
		 * @remarks
		 * Buckets come from the engine's predictive-disable bundle via `fieldHistogram`, so they reflect
		 * the corpus under the OTHER active filters — a shape that moves as you filter, not a static
		 * picture of the whole dataset. Omit it (or pass `undefined`) to render no overlay at all, which
		 * is what a panel should do before its first bundle resolves.
		 */
		histogram?: readonly HistogramBucket[];
		/** Step granularity. Defaults to 1. */
		step?: number;
		/** Current lower handle value. */
		valueMin: number;
		/** Current upper handle value. `Infinity` displays as the available max. */
		valueMax: number;
		/** Value → display string. Defaults to `String`. */
		format?: (value: number) => string;
		/** Raw input string → number. Defaults to `parseFloat`. */
		parse?: (raw: string) => number;
		/** Accessible name for the slider group. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
		sliderLabel?: string;
	}>(),
	{
		available: undefined,
		format: (n: number) => n.toString(),
		histogram: undefined,
		parse: (raw: string) => parseFloat(raw),
		sliderLabel: undefined,
		step: 1,
	},
);

const emit = defineEmits<{
	/** Emitted when either handle moves or a text input commits. */
	change: [next: { readonly max: number; readonly min: number }];
}>();

/** The available zone falls back to the full baseline until a filtered-except-self subset exists. */
const effectiveAvailable = computed<NumericBounds>(() => props.available ?? props.baseline);

/** The upper handle, coerced finite + clamped into the available zone for the geometry. */
const safeUpper = computed(() =>
	Number.isFinite(props.valueMax)
		? Math.min(props.valueMax, effectiveAvailable.value.max)
		: effectiveAvailable.value.max,
);
/** The lower handle, clamped into the available zone and never above `safeUpper`. */
const safeLower = computed(() => Math.max(effectiveAvailable.value.min, Math.min(props.valueMin, safeUpper.value)));

/** Transient drag position; `null` when idle (display falls back to the committed values). */
const dragValue = ref<null | readonly [number, number]>(null);
const displayLower = computed(() => (dragValue.value !== null ? dragValue.value[0] : safeLower.value));
const displayUpper = computed(() => (dragValue.value !== null ? dragValue.value[1] : safeUpper.value));

/** Controlled-but-deferred text-input mirror state, re-synced on external commit. */
const lowerText = ref('');
const upperText = ref('');

// Re-sync the local input strings + drop transient drag state whenever the committed values change
// from outside (a handle commit landed, or a sibling filter reset the rule).
watch(
	[safeLower, safeUpper],
	([lo, hi]) => {
		lowerText.value = props.format(lo);
		upperText.value = props.format(hi);
		dragValue.value = null;
	},
	{ immediate: true },
);

const trackEl = ref<HTMLDivElement | null>(null);
let activeHandle: 'lower' | 'upper' | null = null;

const baselineSpan = computed(() => props.baseline.max - props.baseline.min);

/** Convert a baseline-coordinate value to a 0..100% track position. */
function pct(value: number): number {
	if (baselineSpan.value <= 0) {
		return 0;
	}

	return Math.max(0, Math.min(100, ((value - props.baseline.min) / baselineSpan.value) * 100));
}

/** Snap a raw value to the step grid, then clamp into the available zone. */
function snapClamp(value: number): number {
	const snapped = props.step > 0 ? Math.round(value / props.step) * props.step : value;

	return Math.max(effectiveAvailable.value.min, Math.min(snapped, effectiveAvailable.value.max));
}

const availableMinPct = computed(() => pct(effectiveAvailable.value.min));
const availableMaxPct = computed(() => pct(effectiveAvailable.value.max));

// Three-tier track gradient (dim → subdued-cyan available → dim), computed inline so it repaints the
// moment `available` narrows — identical tiers to the React slider's `trackBackground`.
const trackBackground = computed(
	() =>
		`linear-gradient(to right, ` +
		`var(--fe-slider-track-dim) 0% ${availableMinPct.value}%, ` +
		`var(--fe-slider-track-available) ${availableMinPct.value}% ${availableMaxPct.value}%, ` +
		`var(--fe-slider-track-dim) ${availableMaxPct.value}% 100%)`,
);

const selectionLeftPct = computed(() => pct(displayLower.value));
const selectionWidthPct = computed(() => Math.max(0, pct(displayUpper.value) - pct(displayLower.value)));

/** Commit a candidate `[min, max]` through `change`, clamped + ordered. No-ops when unchanged. */
function commit(rawMin: number, rawMax: number): void {
	const nextMin = snapClamp(Math.min(rawMin, rawMax));
	const nextMax = snapClamp(Math.max(rawMin, rawMax));

	if (nextMin === safeLower.value && nextMax === safeUpper.value) {
		dragValue.value = null;

		return;
	}
	emit('change', { max: nextMax, min: nextMin });
}

/** Map a pointer clientX to a snapped, clamped value on the track. */
function valueFromPointer(clientX: number): number {
	if (trackEl.value === null) {
		return safeLower.value;
	}
	const rect = trackEl.value.getBoundingClientRect();
	const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

	return snapClamp(props.baseline.min + Math.max(0, Math.min(1, ratio)) * baselineSpan.value);
}

function handlePointerMove(event: PointerEvent): void {
	if (activeHandle === null) {
		return;
	}
	const value = valueFromPointer(event.clientX);

	if (activeHandle === 'lower') {
		dragValue.value = [Math.min(value, displayUpper.value), displayUpper.value];
	} else {
		dragValue.value = [displayLower.value, Math.max(value, displayLower.value)];
	}
}

function handlePointerUp(): void {
	if (activeHandle === null) {
		return;
	}
	activeHandle = null;
	window.removeEventListener('pointermove', handlePointerMove);
	window.removeEventListener('pointerup', handlePointerUp);
	if (dragValue.value !== null) {
		commit(dragValue.value[0], dragValue.value[1]);
	}
}

function startDrag(handle: 'lower' | 'upper', event: PointerEvent): void {
	event.preventDefault();
	activeHandle = handle;
	dragValue.value = [displayLower.value, displayUpper.value];
	window.addEventListener('pointermove', handlePointerMove);
	window.addEventListener('pointerup', handlePointerUp);
}

/**
 * Which thumb a click at `value` should move.
 *
 * @remarks
 * Nearest wins, with the two outside cases resolved first so a click beyond either end always extends
 * rather than inverts the selection. Without that, a click left of both thumbs when they sit together
 * would be equidistant, and the tie could pick `upper` — dragging the top of the range down past the
 * bottom, which `commit` then silently re-orders into something the user did not ask for.
 *
 * @param value - The value under the pointer.
 * @returns The handle to move.
 */
function pickHandle(value: number): 'lower' | 'upper' {
	if (value <= displayLower.value) {
		return 'lower';
	}
	if (value >= displayUpper.value) {
		return 'upper';
	}

	return value - displayLower.value <= displayUpper.value - value ? 'lower' : 'upper';
}

/**
 * Jump the nearest thumb to a click on the track — and keep dragging from there.
 *
 * @remarks
 * **Every hand-rolled slider needs this; React gets it free.** React's is Radix-backed, and Radix moves
 * the closest thumb on a track press; a port that binds `pointerdown` only to the thumbs leaves the
 * entire track inert. On a 400px track with two 16px thumbs that is ~96% of the control doing nothing,
 * and it reads as "the slider is broken" rather than as a missing affordance.
 *
 * Reusing `startDrag` plus one synthetic `handlePointerMove` is what makes press-and-drag work as a
 * single gesture: the move positions the thumb for a plain click, and any real dragging that follows
 * continues through the same listeners. Handling only `click` would jump the thumb but leave the user
 * unable to drag on without lifting and re-pressing.
 *
 * The thumbs are SIBLINGS of the track, not children, so a press on a thumb never reaches here.
 *
 * @param event - The pointer event on the track.
 */
function handleTrackPointerDown(event: PointerEvent): void {
	startDrag(pickHandle(valueFromPointer(event.clientX)), event);
	handlePointerMove(event);
}

// Defensive teardown if the component unmounts mid-drag (the handlers self-detach on pointerup).
onUnmounted(() => {
	window.removeEventListener('pointermove', handlePointerMove);
	window.removeEventListener('pointerup', handlePointerUp);
});

/** Arrow-key → step direction (-1 / +1); 0 for keys that don't step. */
function keyboardDelta(key: string): number {
	if (key === 'ArrowLeft' || key === 'ArrowDown') {
		return -1;
	}
	if (key === 'ArrowRight' || key === 'ArrowUp') {
		return 1;
	}

	return 0;
}

/** Keyboard stepping on a thumb — arrows nudge by `step`, Home/End jump to the available bounds. */
function handleKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
	const delta = keyboardDelta(event.key);

	if (delta === 0 && event.key !== 'Home' && event.key !== 'End') {
		return;
	}
	event.preventDefault();
	const current = handle === 'lower' ? displayLower.value : displayUpper.value;
	let next = current + delta * props.step;

	if (event.key === 'Home') {
		next = effectiveAvailable.value.min;
	} else if (event.key === 'End') {
		next = effectiveAvailable.value.max;
	}
	if (handle === 'lower') {
		commit(Math.min(next, displayUpper.value), displayUpper.value);
	} else {
		commit(displayLower.value, Math.max(next, displayLower.value));
	}
}

/** Commit an edited text field, clamping to the available zone + swapping to keep ordering coherent. */
function commitText(which: 'lower' | 'upper', raw: string): void {
	const parsed = props.parse(raw);
	const other = which === 'lower' ? safeUpper.value : safeLower.value;
	const clamped = Number.isFinite(parsed) ? snapClamp(parsed) : which === 'lower' ? safeLower.value : safeUpper.value;

	commit(which === 'lower' ? clamped : other, which === 'lower' ? other : clamped);
}

function handleInputKeydown(which: 'lower' | 'upper', event: KeyboardEvent): void {
	const target = event.currentTarget as HTMLInputElement;

	if (event.key === 'Enter') {
		event.preventDefault();
		commitText(which, target.value);
		target.blur();
	} else if (event.key === 'Escape') {
		if (which === 'lower') {
			lowerText.value = props.format(safeLower.value);
		} else {
			upperText.value = props.format(safeUpper.value);
		}
		target.blur();
	}
}
</script>

<template>
	<div class="fe-range-slider">
		<div class="fe-range-slider__header">
			<span class="fe-range-slider__label">{{ label }}</span>
			<span class="fe-range-slider__summary">{{ format(safeLower) }} — {{ format(safeUpper) }}</span>
		</div>

		<!-- aria-hidden: the bars restate the result count a screen reader already gets from the
		     results header, and eighty of them would be eighty announcements. -->
		<div v-if="histogram !== undefined && histogram.length > 0" class="fe-range-histogram" aria-hidden="true">
			<div
				v-for="(bucket, index) in histogram"
				:key="index"
				:class="histogramBarClassName(bucket, effectiveAvailable, displayLower, displayUpper)"
				:style="{ height: `${histogramBarHeightPercent(bucket)}%` }"
			/>
		</div>

		<div class="fe-range-slider__root">
			<!-- `presentation` + no keyboard handler is deliberate: the track is a pointer SHORTCUT to a
			     position the two `role="slider"` thumbs beside it already expose to the keyboard (arrows,
			     Home/End). A third focusable control announcing a value it does not own helps nobody. -->
			<div
				ref="trackEl"
				class="fe-range-slider__track"
				role="presentation"
				:style="{ background: trackBackground }"
				@pointerdown="handleTrackPointerDown"
			>
				<div class="fe-range-slider__range" :style="{ left: `${selectionLeftPct}%`, width: `${selectionWidthPct}%` }" />
			</div>
			<span
				class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
				role="slider"
				tabindex="0"
				:aria-label="sliderLabel ? `${sliderLabel} lower bound` : `${label} lower bound`"
				:aria-valuemin="baseline.min"
				:aria-valuemax="baseline.max"
				:aria-valuenow="displayLower"
				:style="{ left: `${pct(displayLower)}%` }"
				@pointerdown="startDrag('lower', $event)"
				@keydown="handleKeydown('lower', $event)"
			/>
			<span
				class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
				role="slider"
				tabindex="0"
				:aria-label="sliderLabel ? `${sliderLabel} upper bound` : `${label} upper bound`"
				:aria-valuemin="baseline.min"
				:aria-valuemax="baseline.max"
				:aria-valuenow="displayUpper"
				:style="{ left: `${pct(displayUpper)}%` }"
				@pointerdown="startDrag('upper', $event)"
				@keydown="handleKeydown('upper', $event)"
			/>
		</div>

		<div class="fe-range-slider__inputs">
			<input
				v-model="lowerText"
				type="text"
				inputmode="decimal"
				class="fe-range-slider__input fe-range-slider__input--min"
				:aria-label="`${label} lower bound (editable)`"
				@blur="commitText('lower', lowerText)"
				@keydown="handleInputKeydown('lower', $event)"
			/>
			<input
				v-model="upperText"
				type="text"
				inputmode="decimal"
				class="fe-range-slider__input fe-range-slider__input--max"
				:aria-label="`${label} upper bound (editable)`"
				@blur="commitText('upper', upperText)"
				@keydown="handleInputKeydown('upper', $event)"
			/>
		</div>
	</div>
</template>
