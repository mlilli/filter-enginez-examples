/**
 * `<fe-range-slider>` — a hand-rolled two-thumb range slider with a predictive **available zone**.
 *
 * @remarks
 * ### The one piece of geometry worth understanding
 *
 * Positions are computed in **baseline** coordinates while values are clamped to the **available**
 * zone. That asymmetry is the whole design: the track always spans the corpus-wide baseline so it
 * doesn't rescale under you as you filter, but the region the engine says still contains records is
 * lit in cyan and the dead ends either side are dimmed — and you cannot drag into them. A slider that
 * rescaled its own axis on every commit would make the handles jump while you were holding one.
 *
 * ### Transient drag state
 *
 * `_dragValue` holds the in-flight position so the thumb tracks the pointer without committing on
 * every pointermove (each commit is an engine recompute). It is cleared whenever a committed value
 * arrives from outside, so an external change — "Clear all", a removed pill, a URL restore — wins over
 * a stale drag.
 *
 * Pointer listeners go on `window`, not the thumb: the pointer routinely leaves a 14px target
 * mid-drag, and losing the gesture there would be maddening. They're removed on pointerup and again on
 * destroy, since a component torn down mid-drag never sees its own pointerup.
 *
 * ### The distribution overlay
 *
 * The optional `histogram` input draws the bundle's per-field distribution above the track, in the
 * same three tiers the track paints, so the bars and the track read as one control. The tier and
 * height arithmetic belongs to `histogramBarClassName` / `histogramBarHeightPercent` on the
 * import-free `examples-shared/bounds` subpath, shared with the other five verticals, and the colors
 * belong to `ui-styles` — this component only decides WHERE the bars go. An Angular template can only
 * call component members, so `barClassName` (a method, because it reads the display signals) and
 * `barHeightPercent` (the shared function bound as a field, because it needs nothing from `this`)
 * exist purely to reach them.
 *
 * The bounds contract is imported from `examples-shared/bounds` rather than `/books-domain`: this is a
 * dataset-neutral control and it renders real estate too, so taking its types from a dataset address
 * would teach the next reader it belongs to books.
 *
 * @packageDocumentation
 */

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	type ElementRef,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import {
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBucket,
	type NumericBounds,
} from '@filter-enginez/examples-shared/bounds';

/** The committed bounds this control emits. */
export interface RangeSliderChange {
	readonly max: number;
	readonly min: number;
}

/** Which handle a gesture is driving. */
type ActiveHandle = 'lower' | 'upper' | null;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-range-slider',
	template: `
		<div class="fe-range-slider">
			<div class="fe-range-slider__header">
				<span class="fe-range-slider__label">{{ label() }}</span>
				<span class="fe-range-slider__summary">
					{{ formatValue(safeLower()) }} — {{ formatValue(safeUpper()) }}
				</span>
			</div>

			<!-- aria-hidden: the bars restate a count the results header already announces, and eighty
			     of them would be eighty announcements. -->
			@if (histogramBuckets().length > 0) {
				<div class="fe-range-histogram" aria-hidden="true">
					@for (bucket of histogramBuckets(); track $index) {
						<div [class]="barClassName(bucket)" [style.height.%]="barHeightPercent(bucket)"></div>
					}
				</div>
			}

			<div class="fe-range-slider__root">
				<!-- \`presentation\` + no keyboard handler is deliberate: the track is a pointer
					     SHORTCUT to a position the two \`role="slider"\` thumbs beside it already expose to
					     the keyboard (arrows, Home/End). A third focusable control announcing a value it
					     does not own helps nobody. -->
				<div
					#track
					class="fe-range-slider__track"
					role="presentation"
					[style.background]="trackBackground()"
					(pointerdown)="trackPointerDown($event)"
				>
					<div
						class="fe-range-slider__range"
						[style.left.%]="selectionLeftPct()"
						[style.width.%]="selectionWidthPct()"
					></div>
				</div>

				<span
					class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
					role="slider"
					tabindex="0"
					[attr.aria-label]="handleLabel('lower')"
					[attr.aria-valuemin]="baseline().min"
					[attr.aria-valuemax]="baseline().max"
					[attr.aria-valuenow]="displayLower()"
					[style.--fe-thumb-pct]="pct(displayLower())"
					(pointerdown)="startDrag('lower', $event)"
					(keydown)="onKeydown('lower', $event)"
				></span>
				<span
					class="fe-range-slider__thumb fe-range-slider__thumb--positioned"
					role="slider"
					tabindex="0"
					[attr.aria-label]="handleLabel('upper')"
					[attr.aria-valuemin]="baseline().min"
					[attr.aria-valuemax]="baseline().max"
					[attr.aria-valuenow]="displayUpper()"
					[style.--fe-thumb-pct]="pct(displayUpper())"
					(pointerdown)="startDrag('upper', $event)"
					(keydown)="onKeydown('upper', $event)"
				></span>
			</div>

			<div class="fe-range-slider__inputs">
				<input
					#lowerField
					type="text"
					inputmode="decimal"
					class="fe-range-slider__input fe-range-slider__input--min"
					[attr.aria-label]="label() + ' lower bound (editable)'"
					[value]="lowerText()"
					(input)="lowerText.set($any($event.target).value)"
					(blur)="commitText('lower', lowerText())"
					(keydown.enter)="lowerField.blur()"
					(keydown.escape)="revertText(); lowerField.blur()"
				/>
				<input
					#upperField
					type="text"
					inputmode="decimal"
					class="fe-range-slider__input fe-range-slider__input--max"
					[attr.aria-label]="label() + ' upper bound (editable)'"
					[value]="upperText()"
					(input)="upperText.set($any($event.target).value)"
					(blur)="commitText('upper', upperText())"
					(keydown.enter)="upperField.blur()"
					(keydown.escape)="revertText(); upperField.blur()"
				/>
			</div>
		</div>
	`,
})
export class RangeSliderComponent {
	/** Accessible name prefix for the thumbs; falls back to {@link label}. */
	public readonly ariaLabel = input<string>();

	/** The corpus-wide extent. Defines the track's coordinate space and never changes. */
	public readonly baseline = input.required<NumericBounds>();

	/** The engine's projection of where records still exist. Defaults to {@link baseline}. */
	public readonly available = input<NumericBounds>();

	/** Value → display string. */
	public readonly format = input<(value: number) => string>();

	/**
	 * Optional distribution bars above the track.
	 *
	 * @remarks
	 * Buckets come from the engine's predictive-disable bundle via `fieldHistogram`, so they reflect the
	 * corpus under the OTHER active filters — a shape that moves as you filter, not a static picture of
	 * the whole dataset. Leave it unset to render no overlay, which is what a panel should do before its
	 * first bundle resolves.
	 */
	public readonly histogram = input<readonly HistogramBucket[]>();

	/** Visible label. */
	public readonly label = input.required<string>();

	/** Display string → value. */
	public readonly parse = input<(raw: string) => number>();

	/** Snap increment. */
	public readonly step = input<number>(1);

	/** Committed lower bound. */
	public readonly valueMin = input.required<number>();

	/** Committed upper bound. `Infinity` renders as the available maximum. */
	public readonly valueMax = input.required<number>();

	/** Emitted only when the committed bounds actually move. */
	public readonly rangeChange = output<RangeSliderChange>();

	private readonly _destroyRef = inject(DestroyRef);
	private readonly _track = viewChild.required<ElementRef<HTMLDivElement>>('track');

	/** Which thumb the active gesture drives, if any. */
	private _activeHandle: ActiveHandle = null;

	/** In-flight `[lower, upper]` during a drag; `null` when showing committed values. */
	private readonly _dragValue = signal<null | readonly [number, number]>(null);

	/** The available zone, defaulting to the baseline when the engine has no projection. */
	protected readonly effectiveAvailable = computed<NumericBounds>(
		() => this.available() ?? this.baseline(),
	);

	/** Committed upper bound, clamped into the available zone (and resolving `Infinity`). */
	protected readonly safeUpper = computed<number>(() =>
		Number.isFinite(this.valueMax())
			? Math.min(this.valueMax(), this.effectiveAvailable().max)
			: this.effectiveAvailable().max,
	);

	/** Committed lower bound, clamped below the upper and into the available zone. */
	protected readonly safeLower = computed<number>(() =>
		Math.max(this.effectiveAvailable().min, Math.min(this.valueMin(), this.safeUpper())),
	);

	/** What the lower thumb should render at — drag position if dragging, else committed. */
	protected readonly displayLower = computed<number>(
		() => this._dragValue()?.[0] ?? this.safeLower(),
	);

	/** What the upper thumb should render at. */
	protected readonly displayUpper = computed<number>(
		() => this._dragValue()?.[1] ?? this.safeUpper(),
	);

	/**
	 * The bars to draw, or none.
	 *
	 * @remarks
	 * Collapses the optional input to an array so the template can ask `.length` without a non-null
	 * assertion and without reading the signal twice per render.
	 */
	protected readonly histogramBuckets = computed<readonly HistogramBucket[]>(() => this.histogram() ?? []);

	/** Editable text mirrors for the two numeric fields. */
	protected readonly lowerText = signal('');

	/** @see lowerText */
	protected readonly upperText = signal('');

	/** Left edge of the lit selection, in track percent. */
	protected readonly selectionLeftPct = computed<number>(() => this.pct(this.displayLower()));

	/** Width of the lit selection, in track percent. */
	protected readonly selectionWidthPct = computed<number>(() =>
		Math.max(0, this.pct(this.displayUpper()) - this.pct(this.displayLower())),
	);

	/** Three-stop gradient: dead zone, available zone, dead zone. */
	protected readonly trackBackground = computed<string>(() => {
		const from = this.pct(this.effectiveAvailable().min);
		const to = this.pct(this.effectiveAvailable().max);

		return (
			`linear-gradient(to right, var(--fe-slider-track-dim) 0% ${from}%, `
			+ `var(--fe-slider-track-available) ${from}% ${to}%, `
			+ `var(--fe-slider-track-dim) ${to}% 100%)`
		);
	});

	public constructor() {
		// Re-seed the text fields from committed state, and drop any transient drag: an external
		// change (Clear all, a removed pill, a URL restore) must win over a stale gesture.
		effect(() => {
			this.lowerText.set(this.formatValue(this.safeLower()));
			this.upperText.set(this.formatValue(this.safeUpper()));
			this._dragValue.set(null);
		});

		// A component torn down mid-drag never sees its own pointerup, so window would keep our
		// listeners (and the closure behind them) alive forever.
		this._destroyRef.onDestroy(() => {
			this._detachPointerListeners();
		});
	}

	/** Apply {@link format}, or fall back to the plain number. */
	protected formatValue(value: number): string {
		return this.format()?.(value) ?? value.toString();
	}

	/** Accessible name for a thumb. */
	protected handleLabel(handle: 'lower' | 'upper'): string {
		return `${this.ariaLabel() ?? this.label()} ${handle} bound`;
	}

	/**
	 * One histogram bar's class list.
	 *
	 * @remarks
	 * A wrapper, not logic: an Angular template can only call component members, so reaching the shared
	 * helper needs a method. Reads the two display signals HERE rather than taking them as arguments,
	 * which is what makes the bars repaint mid-drag along with the thumbs.
	 *
	 * @param bucket - The bucket to classify.
	 * @returns The space-separated class list.
	 */
	protected barClassName(bucket: HistogramBucket): string {
		return histogramBarClassName(bucket, this.effectiveAvailable(), this.displayLower(), this.displayUpper());
	}

	/**
	 * One histogram bar's height, in percent.
	 *
	 * @remarks
	 * The shared function itself, bound as a field rather than wrapped in a method: unlike
	 * {@link barClassName} it needs nothing from `this`, and a method that ignores `this` is what
	 * `class-methods-use-this` exists to catch. Templates call it exactly the same way.
	 */
	protected readonly barHeightPercent = histogramBarHeightPercent;

	/**
	 * Position a value on the track, in percent of the BASELINE span.
	 *
	 * @param value - A value in baseline coordinates.
	 * @returns A 0-100 percentage, clamped.
	 */
	protected pct(value: number): number {
		const span = this.baseline().max - this.baseline().min;

		if (span <= 0) {
			return 0;
		}

		return Math.max(0, Math.min(100, ((value - this.baseline().min) / span) * 100));
	}

	/** Keyboard nudges: arrows by one step, Home/End to the available extremes. */
	protected onKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
		const current = handle === 'lower' ? this.displayLower() : this.displayUpper();
		let next: number | null = null;

		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			next = current - this.step();
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			next = current + this.step();
		} else if (event.key === 'Home') {
			next = this.effectiveAvailable().min;
		} else if (event.key === 'End') {
			next = this.effectiveAvailable().max;
		}

		if (next === null) {
			return;
		}
		event.preventDefault();

		if (handle === 'lower') {
			this._commit(Math.min(next, this.displayUpper()), this.displayUpper());
		} else {
			this._commit(this.displayLower(), Math.max(next, this.displayLower()));
		}
	}

	/** Restore both text fields to the committed values (Escape). */
	protected revertText(): void {
		this.lowerText.set(this.formatValue(this.safeLower()));
		this.upperText.set(this.formatValue(this.safeUpper()));
	}

	/** Begin a pointer drag on one thumb. */
	protected startDrag(handle: 'lower' | 'upper', event: PointerEvent): void {
		event.preventDefault();
		this._activeHandle = handle;
		this._dragValue.set([this.displayLower(), this.displayUpper()]);
		window.addEventListener('pointermove', this._handlePointerMove);
		window.addEventListener('pointerup', this._handlePointerUp);
	}

	/**
	 * Which thumb a click at `value` should move.
	 *
	 * @remarks
	 * Nearest wins, with the two outside cases resolved first so a click beyond either end always
	 * extends rather than inverts the selection. Without that, a click left of both thumbs when they
	 * sit together would be equidistant, and the tie could pick `upper` — dragging the top of the range
	 * down past the bottom, which `_commit` then silently re-orders into something the user did not ask
	 * for.
	 *
	 * @param value - The value under the pointer.
	 * @returns The handle to move.
	 */
	private _pickHandle(value: number): 'lower' | 'upper' {
		if (value <= this.displayLower()) {
			return 'lower';
		}
		if (value >= this.displayUpper()) {
			return 'upper';
		}

		return value - this.displayLower() <= this.displayUpper() - value ? 'lower' : 'upper';
	}

	/**
	 * Jump the nearest thumb to a click on the track — and keep dragging from there.
	 *
	 * @remarks
	 * **This is what Radix gives React for free.** React's slider is Radix-backed, and Radix moves the
	 * closest thumb on a track press; the SvelteKit, Vue, Angular and vanilla sliders are hand-rolled,
	 * so each binds it explicitly. With `pointerdown` bound only to the thumbs, the entire track would
	 * be inert: on a 400px track with two 16px thumbs that is ~96% of the control doing nothing, and it
	 * reads as "the slider is broken" rather than as a missing affordance.
	 *
	 * Reusing `startDrag` plus one synthetic `_handlePointerMove` is what makes press-and-drag work as
	 * a single gesture: the move positions the thumb for a plain click, and any real dragging that
	 * follows continues through the same listeners. Handling only `click` would jump the thumb but
	 * leave the user unable to drag on without lifting and re-pressing.
	 *
	 * The thumbs are SIBLINGS of the track, not children, so a press on a thumb never reaches here.
	 *
	 * @param event - The pointer event on the track.
	 */
	protected trackPointerDown(event: PointerEvent): void {
		this.startDrag(this._pickHandle(this._valueFromPointer(event.clientX)), event);
		this._handlePointerMove(event);
	}

	/**
	 * Commit a text field's contents.
	 *
	 * @param which - Which bound was edited.
	 * @param raw - The raw field text.
	 */
	protected commitText(which: 'lower' | 'upper', raw: string): void {
		const parsed = (this.parse() ?? Number.parseFloat)(raw);
		const fallback = which === 'lower' ? this.safeLower() : this.safeUpper();
		const clamped = Number.isFinite(parsed) ? this._snapClamp(parsed) : fallback;

		if (which === 'lower') {
			this._commit(clamped, this.safeUpper());
		} else {
			this._commit(this.safeLower(), clamped);
		}
	}

	/**
	 * Emit a committed range, snapping and swapping as needed. No-ops when nothing moved — every
	 * emission costs an engine recompute.
	 *
	 * @param rawMin - Candidate lower bound (may exceed `rawMax`).
	 * @param rawMax - Candidate upper bound.
	 */
	private _commit(rawMin: number, rawMax: number): void {
		const nextMin = this._snapClamp(Math.min(rawMin, rawMax));
		const nextMax = this._snapClamp(Math.max(rawMin, rawMax));

		if (nextMin === this.safeLower() && nextMax === this.safeUpper()) {
			this._dragValue.set(null);

			return;
		}
		this.rangeChange.emit({ max: nextMax, min: nextMin });
	}

	/** Drop the window-level gesture listeners. Safe to call when none are attached. */
	private _detachPointerListeners(): void {
		window.removeEventListener('pointermove', this._handlePointerMove);
		window.removeEventListener('pointerup', this._handlePointerUp);
	}

	/** Bound so add/removeEventListener see one stable reference. */
	private readonly _handlePointerMove = (event: PointerEvent): void => {
		if (this._activeHandle === null) {
			return;
		}
		const value = this._valueFromPointer(event.clientX);

		this._dragValue.set(
			this._activeHandle === 'lower'
				? [Math.min(value, this.displayUpper()), this.displayUpper()]
				: [this.displayLower(), Math.max(value, this.displayLower())],
		);
	};

	/** @see handlePointerMove */
	private readonly _handlePointerUp = (): void => {
		this._activeHandle = null;
		this._detachPointerListeners();

		const drag = this._dragValue();

		if (drag !== null) {
			this._commit(drag[0], drag[1]);
		}
	};

	/** Snap to {@link step}, then clamp into the available zone. */
	private _snapClamp(value: number): number {
		const step = this.step();
		const snapped = step > 0 ? Math.round(value / step) * step : value;

		return Math.max(
			this.effectiveAvailable().min,
			Math.min(snapped, this.effectiveAvailable().max),
		);
	}

	/** Translate a viewport x-coordinate into a snapped, clamped value. */
	private _valueFromPointer(clientX: number): number {
		const rect = this._track().nativeElement.getBoundingClientRect();
		const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		const span = this.baseline().max - this.baseline().min;

		return this._snapClamp(this.baseline().min + Math.max(0, Math.min(1, ratio)) * span);
	}
}
