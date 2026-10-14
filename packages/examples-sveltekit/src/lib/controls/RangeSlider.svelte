<script lang="ts">
	/**
	 * `<RangeSlider>` — dual-handle numeric range slider with three-layer track semantics, the Svelte
	 * port of `react-ui`'s Radix-backed `RangeSlider`. Reuses the `fe-range-slider*` classes verbatim.
	 *
	 * ### Three layers, one slider
	 *   1. **Baseline** — the full corpus min/max; the track always spans this.
	 *   2. **Available zone** — the filtered-except-self min/max; handles are constrained to drag within
	 *      it, and track segments outside it are dimmed ("no books exist here given your other filters").
	 *   3. **Selected range** — the user's current handle positions, a cyan-filled segment.
	 *
	 * Below the track sit editable min/max text inputs: type a value + Enter (or blur) to commit; the
	 * value clamps to the available zone and swaps if max < min.
	 *
	 * The optional `histogram` overlay renders the corpus distribution above the track, in the same
	 * three tiers as the track itself — selected, available-but-unselected, out of range — so the bars
	 * and the track read as one control. Every panel that renders this slider passes one.
	 *
	 * The tier + height arithmetic is NOT here. It is `histogramBarClassName` /
	 * `histogramBarHeightPercent` from the import-free `examples-shared/bounds` subpath, shared with
	 * the other five apps, and it tiers off the drag-aware DISPLAYED handle values rather than the
	 * committed ones, so the bars repaint mid-drag.
	 *
	 * ### The scale
	 *
	 * The optional `scale` (a `SliderScale` from `examples-shared/bounds`) decides where a value sits on
	 * the track. Every value → position conversion here goes through `scale.toFraction`, every pointer
	 * position → value conversion through `scale.fromFraction` (then onto the `step` grid), and the arrow
	 * keys move a thumb by `stepScaledValue`. With no scale the slider builds a linear one over its
	 * baseline, and a linear scale reproduces the plain proportional track exactly, so books and real
	 * estate — which pass none — keep the slider they always had.
	 *
	 * A log scale exists for heavy-tailed fields such as wine prices, where a linear track would squeeze
	 * every everyday bottle into the first sliver of the control. There one arrow press moves a thumb
	 * about one percent of the TRACK (never less than one `step`), because a value-sized step would take
	 * thousands of presses to cross the tail. Each thumb also carries `aria-valuetext`, so a screen
	 * reader announces the formatted value (`$25`, `NV`) rather than the raw number.
	 *
	 * Radix is replaced with a hand-rolled pointer + keyboard slider — a Filter EngineZ signal-driven
	 * Svelte app can't reuse React's Radix control, so this reproduces the geometry + behavior natively.
	 */

	import {
		histogramBarClassName,
		histogramBarHeightPercent,
		type HistogramBucket,
		linearSliderScale,
		type NumericBounds,
		type SliderScale,
		snapToStep,
		stepScaledValue,
	} from '@filter-enginez/examples-shared/bounds';

	interface Props {
		/** Section label shown in the header row. */
		readonly label: string;
		/** Baseline bounds — the full corpus min/max the track always spans. */
		readonly baseline: NumericBounds;
		/** Available bounds — filtered-except-self min/max; handles drag within, outside is dimmed. */
		readonly available?: NumericBounds;
		/**
		 * Optional distribution bars above the track.
		 *
		 * @remarks
		 * Buckets come from the engine's predictive-disable bundle via `bundleHistogramToBuckets`, so
		 * they reflect the corpus under the OTHER active filters — a shape that moves as you filter,
		 * not a static picture of the whole dataset.
		 *
		 * The bars are equal-width slices of the TRACK, so under a non-linear `scale` they must already
		 * be sliced for that scale (`wineSliderHistogram` does this for the wine sliders).
		 */
		readonly histogram?: readonly HistogramBucket[];
		/**
		 * How values map onto the track. Defaults to a linear scale over `baseline`, which is the plain
		 * proportional track; pass a log scale for a heavy-tailed field. See the component docblock.
		 */
		readonly scale?: SliderScale;
		/** Step granularity. Defaults to 1. */
		readonly step?: number;
		/** Current lower handle value. */
		readonly valueMin: number;
		/** Current upper handle value. `Infinity` displays as the available max. */
		readonly valueMax: number;
		/** Called when either handle moves or a text input commits. */
		readonly onChange: (next: { readonly max: number; readonly min: number }) => void;
		/** Value → display string. Defaults to `String`. */
		readonly format?: (value: number) => string;
		/** Raw input string → number. Defaults to `parseFloat`. */
		readonly parse?: (raw: string) => number;
		/** Optional accessible name for the slider group. */
		readonly ariaLabel?: string;
	}

	const {
		ariaLabel,
		available,
		baseline,
		format = (n: number) => n.toString(),
		histogram,
		label,
		onChange,
		parse = (raw: string) => parseFloat(raw),
		scale,
		step = 1,
		valueMax,
		valueMin,
	}: Props = $props();

	/** The available zone falls back to the full baseline until a filtered-except-self subset exists. */
	const effectiveAvailable = $derived<NumericBounds>(available ?? baseline);

	/** The upper handle, coerced finite + clamped into the available zone for the geometry. */
	const safeUpper = $derived(
		Number.isFinite(valueMax) ? Math.min(valueMax, effectiveAvailable.max) : effectiveAvailable.max,
	);
	/** The lower handle, clamped into the available zone and never above `safeUpper`. */
	const safeLower = $derived(Math.max(effectiveAvailable.min, Math.min(valueMin, safeUpper)));

	/** Transient drag position; `null` when idle (display falls back to the committed values). */
	let dragValue = $state<null | readonly [number, number]>(null);
	const displayLower = $derived(dragValue !== null ? dragValue[0] : safeLower);
	const displayUpper = $derived(dragValue !== null ? dragValue[1] : safeUpper);

	/** Controlled-but-deferred text-input mirror state, re-synced on external commit. */
	let lowerText = $state('');
	let upperText = $state('');

	// Re-sync the local input strings + drop transient drag state whenever the committed values change
	// from outside (a handle commit landed, or a sibling filter reset the rule).
	$effect(() => {
		lowerText = format(safeLower);
		upperText = format(safeUpper);
		dragValue = null;
	});

	let trackEl = $state<HTMLDivElement | null>(null);
	let activeHandle: 'lower' | 'upper' | null = null;

	/**
	 * The scale the track is drawn with — the caller's, or a linear one over the baseline.
	 *
	 * @remarks
	 * Rebuilt when the baseline changes, so a caller that passes no scale still gets a track spanning
	 * the current baseline. A degenerate baseline (min equal to max) maps every value to position 0.
	 */
	const trackScale = $derived<SliderScale>(scale ?? linearSliderScale(baseline));

	/** Convert a value to a 0..100% track position, through the scale. */
	function pct(value: number): number {
		return trackScale.toFraction(value) * 100;
	}

	/**
	 * Snap a raw value to the step grid, then clamp into the available zone.
	 *
	 * @remarks
	 * `snapToStep` also trims the float noise a multiply leaves (`0.1 * 135` is not `13.5`), so a
	 * committed ABV reads back as the number the readout shows.
	 */
	function snapClamp(value: number): number {
		return Math.max(effectiveAvailable.min, Math.min(snapToStep(value, step), effectiveAvailable.max));
	}

	const availableMinPct = $derived(pct(effectiveAvailable.min));
	const availableMaxPct = $derived(pct(effectiveAvailable.max));

	// Three-tier track gradient (dim → subdued-cyan available → dim), computed inline so it repaints the
	// moment `available` narrows — identical tiers to the React slider's `trackBackground`.
	const trackBackground = $derived(
		`linear-gradient(to right, `
			+ `var(--fe-slider-track-dim) 0% ${availableMinPct}%, `
			+ `var(--fe-slider-track-available) ${availableMinPct}% ${availableMaxPct}%, `
			+ `var(--fe-slider-track-dim) ${availableMaxPct}% 100%)`,
	);

	const selectionLeftPct = $derived(pct(displayLower));
	const selectionWidthPct = $derived(Math.max(0, pct(displayUpper) - pct(displayLower)));

	/** Commit a candidate `[min, max]` through `onChange`, clamped + ordered. No-ops when unchanged. */
	function commit(rawMin: number, rawMax: number): void {
		const nextMin = snapClamp(Math.min(rawMin, rawMax));
		const nextMax = snapClamp(Math.max(rawMin, rawMax));

		if (nextMin === safeLower && nextMax === safeUpper) {
			dragValue = null;

			return;
		}
		onChange({ max: nextMax, min: nextMin });
	}

	/**
	 * Map a pointer clientX to a snapped, clamped value on the track.
	 *
	 * @remarks
	 * The pointer's share of the track width is a track POSITION, so it is read back through the scale
	 * (`fromFraction`) before it is snapped to `step` — on a log track the same pixel distance covers a
	 * few dollars near the anchor and hundreds in the tail.
	 */
	function valueFromPointer(clientX: number): number {
		if (trackEl === null) {
			return safeLower;
		}
		const rect = trackEl.getBoundingClientRect();
		const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

		return snapClamp(trackScale.fromFraction(Math.max(0, Math.min(1, ratio))));
	}

	function handlePointerMove(event: PointerEvent): void {
		if (activeHandle === null) {
			return;
		}
		const value = valueFromPointer(event.clientX);

		if (activeHandle === 'lower') {
			dragValue = [Math.min(value, displayUpper), displayUpper];
		} else {
			dragValue = [displayLower, Math.max(value, displayLower)];
		}
	}

	function handlePointerUp(): void {
		if (activeHandle === null) {
			return;
		}
		activeHandle = null;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		if (dragValue !== null) {
			commit(dragValue[0], dragValue[1]);
		}
	}

	function startDrag(handle: 'lower' | 'upper', event: PointerEvent): void {
		event.preventDefault();
		activeHandle = handle;
		dragValue = [displayLower, displayUpper];
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	/**
	 * Which thumb a click at `value` should move.
	 *
	 * @remarks
	 * Nearest wins, with the two outside cases resolved first so a click beyond either end always
	 * extends rather than inverts the selection. Without that, a click left of both thumbs when they sit
	 * together would be equidistant, and the tie could pick `upper` — dragging the top of the range down
	 * past the bottom, which `commit` then silently re-orders into something the user did not ask for.
	 *
	 * @param value - The value under the pointer.
	 * @returns The handle to move.
	 */
	function pickHandle(value: number): 'lower' | 'upper' {
		if (value <= displayLower) {
			return 'lower';
		}
		if (value >= displayUpper) {
			return 'upper';
		}

		return value - displayLower <= displayUpper - value ? 'lower' : 'upper';
	}

	/**
	 * Jump the nearest thumb to a click on the track — and keep dragging from there.
	 *
	 * @remarks
	 * **This is what Radix gives React for free.** React's slider is Radix-backed, and Radix moves the
	 * closest thumb on a track press; a hand-rolled slider that bound `pointerdown` only to the thumbs
	 * would leave the entire track inert. On a 400px track with two 16px thumbs that is ~96% of the
	 * control doing nothing, and it reads as "the slider is broken" rather than as a missing affordance.
	 *
	 * Reusing `startDrag` + one synthetic `handlePointerMove` is what makes press-and-drag work as one
	 * gesture: the move positions the thumb for a plain click, and any real dragging that follows just
	 * continues through the same listeners. Handling only `click` would jump the thumb but leave the
	 * user unable to drag on without lifting and re-pressing.
	 *
	 * The thumbs are SIBLINGS of the track, not children, so a press on a thumb never reaches here and
	 * there is no double-handling to guard against.
	 *
	 * @param event - The pointer event on the track.
	 */
	function handleTrackPointerDown(event: PointerEvent): void {
		startDrag(pickHandle(valueFromPointer(event.clientX)), event);
		handlePointerMove(event);
	}

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
	 * Keyboard stepping on a thumb — arrows nudge, Home/End jump to the available bounds.
	 *
	 * @remarks
	 * An arrow press moves by `stepScaledValue`: exactly one `step` on a linear track, about one percent
	 * of the track (never less than one `step`) on a log track. `commit` then snaps and clamps.
	 */
	function handleKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
		const delta = keyboardDelta(event.key);

		if (delta === 0 && event.key !== 'Home' && event.key !== 'End') {
			return;
		}
		event.preventDefault();
		const current = handle === 'lower' ? displayLower : displayUpper;
		let next = delta === 0 ? current : stepScaledValue(trackScale, current, delta, step);

		if (event.key === 'Home') {
			next = effectiveAvailable.min;
		} else if (event.key === 'End') {
			next = effectiveAvailable.max;
		}
		if (handle === 'lower') {
			commit(Math.min(next, displayUpper), displayUpper);
		} else {
			commit(displayLower, Math.max(next, displayLower));
		}
	}

	/** Commit an edited text field, clamping to the available zone + swapping to keep ordering coherent. */
	function commitText(which: 'lower' | 'upper', raw: string): void {
		const parsed = parse(raw);
		const other = which === 'lower' ? safeUpper : safeLower;
		const clamped = Number.isFinite(parsed) ? snapClamp(parsed) : (which === 'lower' ? safeLower : safeUpper);

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
				lowerText = format(safeLower);
			} else {
				upperText = format(safeUpper);
			}
			target.blur();
		}
	}
</script>

<div class="fe-range-slider">
	<div class="fe-range-slider__header">
		<span class="fe-range-slider__label">{label}</span>
		<span class="fe-range-slider__summary">{format(safeLower)} — {format(safeUpper)}</span>
	</div>

	{#if histogram !== undefined && histogram.length > 0}
		<div class="fe-range-histogram" aria-hidden="true">
			{#each histogram as bucket, index (index)}
				<div
					class={histogramBarClassName(bucket, effectiveAvailable, displayLower, displayUpper)}
					style:height="{histogramBarHeightPercent(bucket)}%"
				></div>
			{/each}
		</div>
	{/if}

	<div class="fe-range-slider__root">
		<!-- `presentation` + no keyboard handler is deliberate: the track is a pointer SHORTCUT to a
		     position the two `role="slider"` thumbs beside it already expose to the keyboard (arrows,
		     Home/End). Giving it its own tab stop and key bindings would add a third focusable control
		     announcing a value it does not own. -->
		<div
			class="fe-range-slider__track"
			role="presentation"
			bind:this={trackEl}
			style:background={trackBackground}
			onpointerdown={handleTrackPointerDown}
		>
			<div
				class="fe-range-slider__range"
				style:left="{selectionLeftPct}%"
				style:width="{selectionWidthPct}%"
			></div>
		</div>
		<span
			class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
			role="slider"
			tabindex="0"
			aria-label={ariaLabel ? `${ariaLabel} lower bound` : `${label} lower bound`}
			aria-valuemin={baseline.min}
			aria-valuemax={baseline.max}
			aria-valuenow={displayLower}
			aria-valuetext={format(displayLower)}
			style:--fe-thumb-pct={pct(displayLower)}
			onpointerdown={(event) => startDrag('lower', event)}
			onkeydown={(event) => handleKeydown('lower', event)}
		></span>
		<span
			class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
			role="slider"
			tabindex="0"
			aria-label={ariaLabel ? `${ariaLabel} upper bound` : `${label} upper bound`}
			aria-valuemin={baseline.min}
			aria-valuemax={baseline.max}
			aria-valuenow={displayUpper}
			aria-valuetext={format(displayUpper)}
			style:--fe-thumb-pct={pct(displayUpper)}
			onpointerdown={(event) => startDrag('upper', event)}
			onkeydown={(event) => handleKeydown('upper', event)}
		></span>
	</div>

	<div class="fe-range-slider__inputs">
		<input
			type="text"
			inputmode="decimal"
			class="fe-range-slider__input fe-range-slider__input--min"
			bind:value={lowerText}
			onblur={(event) => commitText('lower', event.currentTarget.value)}
			onkeydown={(event) => handleInputKeydown('lower', event)}
			aria-label="{label} lower bound (editable)"
		/>
		<input
			type="text"
			inputmode="decimal"
			class="fe-range-slider__input fe-range-slider__input--max"
			bind:value={upperText}
			onblur={(event) => commitText('upper', event.currentTarget.value)}
			onkeydown={(event) => handleInputKeydown('upper', event)}
			aria-label="{label} upper bound (editable)"
		/>
	</div>
</div>
