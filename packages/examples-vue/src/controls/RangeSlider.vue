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
 * Below the track sit editable min/max text inputs: type a value + Enter (or blur) to commit. The
 * shared `resolveTypedBound` snaps it to the step and clamps it into the available zone, and the pair
 * is re-ordered if max < min. Text that is not a number, or a value equal to the committed bound,
 * writes nothing and puts the committed value back in the field. Escape reverts the field and commits
 * nothing, including through the blur it causes.
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
 *
 * ### Scales
 *
 * The optional `scale` (a `SliderScale` from the `examples-shared/bounds` subpath) decides where a
 * value sits on the track. Every value → track conversion in this file goes through
 * `scale.toFraction`, and every track → value conversion through `scale.fromFraction` and then
 * `snapToStep`, so the thumbs, the selected fill, the dimmed bands and a pointer press all agree on one
 * mapping. A heavy-tailed field passes a log scale: wine prices run from a few dollars to thousands with
 * half the bottles under $30, and on a linear track that everyday range would be the first sliver of
 * the control.
 *
 * The arrow keys step through `stepScaledValue`. On a linear track that is exactly one `step`; on a log
 * track it is about one percent of the track, never less than one `step`, because a one-dollar step is
 * right at $8 and takes thousands of presses to cross the tail. Home and End jump to the available
 * bounds. Nothing else moves a thumb: no PageUp / PageDown and no Shift acceleration, the same keys in
 * every app.
 *
 * With no `scale` the slider uses `linearSliderScale(baseline)`, which is the plain proportional
 * mapping — the books and real-estate sliders pass none and behave exactly as a linear slider always
 * has.
 */
import {
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBucket,
	linearSliderScale,
	nearestThumb,
	type NumericBounds,
	resolveTypedBound,
	type SliderScale,
	snapClampToBounds,
	stepScaledValue,
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
		 * Buckets come from the engine's predictive-disable bundle, so they reflect the corpus under the
		 * OTHER active filters — a shape that moves as you filter, not a static picture of the whole
		 * dataset. Omit it (or pass `undefined`) to render no overlay at all, which is what a panel should
		 * do before its first bundle resolves.
		 *
		 * The bars render at equal widths, so each bucket must be an equal slice of the TRACK. Under a
		 * linear scale that is the engine's equal-width histogram (`fieldHistogram`); under a log scale
		 * it is the fine histogram summed into track slices (`rebinHistogram`, which
		 * `wineSliderHistogram` applies for every wine slider).
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
		/**
		 * How values sit on the track. Defaults to `linearSliderScale(baseline)`.
		 *
		 * @remarks
		 * Build it over the SAME baseline passed here (for wine, `wineSliderScale(field, baseline)`);
		 * a scale over a different extent would put the thumbs and the bars in different places.
		 */
		scale?: SliderScale;
		/** Accessible name for the slider group. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
		sliderLabel?: string;
	}>(),
	{
		available: undefined,
		format: (n: number) => n.toString(),
		histogram: undefined,
		parse: (raw: string) => parseFloat(raw),
		scale: undefined,
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

/**
 * The mapping the track is drawn with — the caller's `scale`, or linear over the baseline.
 *
 * @remarks
 * A `computed`, so a linear default is rebuilt only when the baseline changes. The linear scale maps a
 * degenerate baseline (max ≤ min) to `0`, which is the guard this file once spelled out by hand.
 */
const trackScale = computed<SliderScale>(() => props.scale ?? linearSliderScale(props.baseline));

/**
 * Convert a value to a 0..100% track position, through the scale.
 *
 * @param value - A value in the baseline's units.
 * @returns Its position on the track, clamped to `0..100`.
 */
function pct(value: number): number {
	return Math.max(0, Math.min(100, trackScale.value.toFraction(value) * 100));
}

/**
 * Snap a raw value to the step grid, then clamp into the available zone.
 *
 * @remarks
 * The shared `snapClampToBounds`, which snaps through `snapToStep` rather than a bare
 * `Math.round(value / step) * step`: the bare form leaves float noise on a fractional step
 * (`132 * 0.1` is `13.200000000000001`), which would then reach the committed rule.
 *
 * @param value - The raw value.
 * @returns The value on the step grid, inside the available zone.
 */
function snapClamp(value: number): number {
	return snapClampToBounds(value, props.step, effectiveAvailable.value);
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

/**
 * Map a pointer clientX to a snapped, clamped value on the track.
 *
 * @remarks
 * The pointer gives a track FRACTION; the scale turns it into a value. Under a log scale the same
 * pixel distance is a few dollars near the floor and hundreds in the tail, which is the point.
 *
 * @param clientX - The pointer's viewport x coordinate.
 * @returns The value under the pointer, on the step grid and inside the available zone.
 */
function valueFromPointer(clientX: number): number {
	if (trackEl.value === null) {
		return safeLower.value;
	}
	const rect = trackEl.value.getBoundingClientRect();
	const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

	return snapClamp(trackScale.value.fromFraction(Math.max(0, Math.min(1, ratio))));
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
	// The shared `nearestThumb`: the thumb nearer the click ON SCREEN (track fractions, so a log track
	// moves the thumb the pointer is visibly closer to), a click outside both moving the end it is
	// beyond, and a tie moving the lower thumb.
	const value = valueFromPointer(event.clientX);

	startDrag(nearestThumb(value, displayLower.value, displayUpper.value, trackScale.value.toFraction), event);
	handlePointerMove(event);
}

// Defensive teardown if the component unmounts mid-drag (the handlers self-detach on pointerup).
onUnmounted(() => {
	window.removeEventListener('pointermove', handlePointerMove);
	window.removeEventListener('pointerup', handlePointerUp);
});

/** Arrow-key → step direction (-1 / +1); 0 for keys that don't step. */
function keyboardDelta(key: string): -1 | 0 | 1 {
	if (key === 'ArrowLeft' || key === 'ArrowDown') {
		return -1;
	}
	if (key === 'ArrowRight' || key === 'ArrowUp') {
		return 1;
	}

	return 0;
}

/**
 * Keyboard stepping on a thumb — arrows nudge through `stepScaledValue`, Home/End jump to the available
 * bounds.
 *
 * @remarks
 * `stepScaledValue` is exactly `current ± step` on a linear track. On a log track it moves about one
 * percent of the track, never less than one `step`, so a press always moves the thumb and the tail is
 * a hundred presses away rather than thousands.
 *
 * @param handle - Which thumb has focus.
 * @param event - The keydown.
 */
function handleKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
	const delta = keyboardDelta(event.key);

	if (delta === 0 && event.key !== 'Home' && event.key !== 'End') {
		return;
	}
	event.preventDefault();
	const current = handle === 'lower' ? displayLower.value : displayUpper.value;
	let next = delta === 0 ? current : stepScaledValue(trackScale.value, current, delta, props.step);

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

/**
 * Put a field back to its committed bound, formatted.
 *
 * @param which - The field.
 */
function resetText(which: 'lower' | 'upper'): void {
	if (which === 'lower') {
		lowerText.value = props.format(safeLower.value);
	} else {
		upperText.value = props.format(safeUpper.value);
	}
}

/**
 * Commit an edited text field through the shared `resolveTypedBound`.
 *
 * @remarks
 * Text that is not a number, or a value that snaps to the bound already committed, writes nothing and
 * puts the committed value back in the field: leaving `abc` or `40.2` in a field that filters on `40`
 * would show a bound that is not the one filtering. Anything else commits, the pair re-ordered so
 * min ≤ max, and the field takes the committed value when the engine answers.
 *
 * @param which - The field that was edited.
 * @param raw - The field's text.
 */
function commitText(which: 'lower' | 'upper', raw: string): void {
	const committedBound = which === 'lower' ? safeLower.value : safeUpper.value;
	const resolved = resolveTypedBound(props.parse(raw), props.step, effectiveAvailable.value);

	if (resolved === null || resolved === committedBound) {
		resetText(which);

		return;
	}
	const other = which === 'lower' ? safeUpper.value : safeLower.value;

	commit(which === 'lower' ? resolved : other, which === 'lower' ? other : resolved);
}

/**
 * Set while a keydown blurs a field itself, so the blur it causes commits nothing.
 *
 * @remarks
 * Enter has already committed the text, and Escape must commit nothing; without this the blur that
 * follows either would run `commitText` a second time. `blur()` dispatches synchronously, so the flag
 * is only ever up for the length of that call.
 */
let isBlurFromKeydown = false;

/**
 * Commit a field on blur, unless a keydown is the reason it lost focus.
 *
 * @param which - The field.
 */
function handleInputBlur(which: 'lower' | 'upper'): void {
	if (isBlurFromKeydown) {
		return;
	}
	commitText(which, which === 'lower' ? lowerText.value : upperText.value);
}

/**
 * Enter commits the field and Escape reverts it; both then leave the field.
 *
 * @param which - The field.
 * @param event - The keydown.
 */
function handleInputKeydown(which: 'lower' | 'upper', event: KeyboardEvent): void {
	const target = event.currentTarget as HTMLInputElement;

	if (event.key === 'Enter') {
		event.preventDefault();
		commitText(which, target.value);
	} else if (event.key === 'Escape') {
		resetText(which);
	} else {
		return;
	}
	isBlurFromKeydown = true;
	target.blur();
	isBlurFromKeydown = false;
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
				:aria-valuetext="format(displayLower)"
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
				:aria-valuetext="format(displayUpper)"
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
				@blur="handleInputBlur('lower')"
				@keydown="handleInputKeydown('lower', $event)"
			/>
			<input
				v-model="upperText"
				type="text"
				inputmode="decimal"
				class="fe-range-slider__input fe-range-slider__input--max"
				:aria-label="`${label} upper bound (editable)`"
				@blur="handleInputBlur('upper')"
				@keydown="handleInputKeydown('upper', $event)"
			/>
		</div>
	</div>
</template>
