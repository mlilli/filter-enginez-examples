/**
 * Tests for `<fe-range-slider>` — mostly for its geometry, which is the subtlest code in the app.
 *
 * @remarks
 * The slider carries a deliberate asymmetry: **positions are computed in BASELINE coordinates while
 * values are clamped to the AVAILABLE zone.** The track keeps a stable axis as you filter (so handles
 * never jump mid-drag) while the engine's live projection lights the region that still contains
 * records. Every off-by-one in this component hides in the gap between those two coordinate spaces,
 * which is exactly why it gets a spec and a `title`-string component does not.
 *
 * The other thing pinned here is the transient-drag contract: an external change — Clear all, a
 * removed pill, a URL restore — must beat a stale in-flight drag, or the thumb silently disagrees
 * with the engine.
 *
 * The `scale` suite pins the optional log track wine's price and vintage use: positions, pointer
 * presses and arrow keys all go through the same scale, and a slider given no scale keeps the linear
 * mapping books and real estate rely on. A track press moves the thumb nearer ON SCREEN (the shared
 * `nearestThumb`), which on a log track is not always the one nearer in value.
 *
 * The typed-bound cases pin the shared contract: junk, or a value equal to the committed bound, puts
 * the committed value back in the field and writes nothing, and Escape reverts and commits nothing,
 * including on the blur it causes.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { createSliderScale, type HistogramBucket, type SliderScale } from '@filter-enginez/examples-shared/bounds';
import { beforeEach, describe, expect, it } from 'vitest';

import { type RangeSliderChange, RangeSliderComponent } from './range-slider.component.js';

/** Host driving one slider over a 0-100 baseline. */
@Component({
	imports: [RangeSliderComponent],
	template: `
		<fe-range-slider
			label="Pages"
			[baseline]="baseline()"
			[available]="available()"
			[histogram]="histogram()"
			[scale]="scale()"
			[step]="step()"
			[valueMin]="valueMin()"
			[valueMax]="valueMax()"
			[format]="format"
			(rangeChange)="commits.set([...commits(), $event])"
		/>
	`,
})
class HostComponent {
	/** Corpus-wide extent — the track's coordinate space. */
	public readonly baseline = signal({ max: 100, min: 0 });
	/** Where the engine says records still exist. */
	public readonly available = signal<{ max: number; min: number } | undefined>(undefined);
	/** The distribution overlay's buckets; unset renders no overlay. */
	public readonly histogram = signal<undefined | readonly HistogramBucket[]>(undefined);
	/** The track's scale; unset means the slider's linear default. */
	public readonly scale = signal<SliderScale | undefined>(undefined);
	/** Snap increment. */
	public readonly step = signal(1);
	/** Committed lower bound. */
	public readonly valueMin = signal(0);
	/** Committed upper bound. */
	public readonly valueMax = signal(100);
	/** Every emission, in order. */
	public readonly commits = signal<readonly RangeSliderChange[]>([]);
	/** Suffix so the summary/inputs are distinguishable from bare numbers. */
	public readonly format = (value: number): string => `${value.toFixed(0)} pp`;
}

describe('RangeSliderComponent', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/** The two thumbs, lower first. */
	const thumbs = (): HTMLElement[] =>
		Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-range-slider__thumb'));

	/** The two editable bound inputs, lower first. */
	const inputs = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('.fe-range-slider__input'));

	/** A thumb's rendered position, as a number of percent.
	 *
	 * @remarks
	 * Reads `--fe-thumb-pct`, the custom property the shared `--positioned` class consumes, rather than
	 * `left` — the class derives `left` (and an inset transform) FROM that property so the thumb stays
	 * inside the track at the extremes, so `style.left` does not hold the authored value. */
	const leftPct = (index: number): number =>
		Number.parseFloat(thumbs()[index]?.style.getPropertyValue('--fe-thumb-pct') || 'NaN');

	/** Type into a bound input and blur, which is how the control commits text. */
	const commitText = (index: number, text: string): void => {
		const field = inputs()[index];

		if (field === undefined) {
			throw new Error('missing input');
		}
		field.value = text;
		field.dispatchEvent(new Event('input'));
		// Change detection runs between the keystrokes and the blur in a browser, so the field's binding
		// holds the typed text when the blur puts the committed value back.
		fixture.detectChanges();
		field.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
	};

	/** Press an arrow key on one thumb and let the commit propagate. */
	const pressKey = (index: number, key: string): void => {
		thumbs()[index]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
		fixture.detectChanges();
	};

	/**
	 * Give the track a 200px layout box at x = 0, which jsdom does not lay out.
	 *
	 * @remarks
	 * The control reads the track's `getBoundingClientRect()` to turn a pointer x into a share of the
	 * track; jsdom reports a zero-width box, which the control treats as "the left end".
	 */
	const layOutTrack = (): void => {
		const track = fixture.nativeElement.querySelector('.fe-range-slider__track') as HTMLElement;

		track.getBoundingClientRect = (): DOMRect => DOMRect.fromRect({ height: 8, width: 200, x: 0, y: 0 });
	};

	/**
	 * Press the track at `clientX` and release, the gesture a plain click on the track makes.
	 *
	 * @remarks
	 * `MouseEvent` stands in for `PointerEvent`, which jsdom does not implement; the control reads only
	 * `clientX` and `preventDefault()`, both of which a `MouseEvent` carries under the same event type.
	 */
	const clickTrack = (clientX: number): void => {
		const track = fixture.nativeElement.querySelector('.fe-range-slider__track') as HTMLElement;

		track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX }));
		window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX }));
		fixture.detectChanges();
	};

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	describe('geometry', () => {
		it('positions thumbs as a percentage of the BASELINE, not the available zone', () => {
			// The load-bearing asymmetry. With an available zone of 40-60, a value of 50 must still
			// render at 50% of the 0-100 track — NOT at 50% of the 40-60 window (which would be 25%).
			host.available.set({ max: 60, min: 40 });
			host.valueMin.set(50);
			host.valueMax.set(60);
			fixture.detectChanges();

			expect(leftPct(0)).toBeCloseTo(50, 5);
			expect(leftPct(1)).toBeCloseTo(60, 5);
		});

		it('clamps a committed value INTO the available zone', () => {
			// Mirror image of the above: the engine says nothing exists below 40, so a committed 10
			// displays at the floor rather than out in the dead region.
			host.available.set({ max: 60, min: 40 });
			host.valueMin.set(10);
			fixture.detectChanges();

			expect(leftPct(0)).toBeCloseTo(40, 5);
		});

		it('renders Infinity as the available maximum', () => {
			// A range rule with no upper bound is legal and must not produce NaN% or a runaway thumb.
			host.available.set({ max: 80, min: 0 });
			host.valueMax.set(Number.POSITIVE_INFINITY);
			fixture.detectChanges();

			expect(leftPct(1)).toBeCloseTo(80, 5);
			expect(thumbs()[1]?.getAttribute('aria-valuenow')).toBe('80');
		});

		it('survives a degenerate baseline without dividing by zero', () => {
			host.baseline.set({ max: 5, min: 5 });
			host.valueMin.set(5);
			host.valueMax.set(5);
			fixture.detectChanges();

			expect(leftPct(0)).toBe(0);
			expect(leftPct(1)).toBe(0);
		});

		it('advertises the BASELINE as the aria range, so assistive tech sees a stable axis', () => {
			host.available.set({ max: 60, min: 40 });
			fixture.detectChanges();

			expect(thumbs()[0]?.getAttribute('aria-valuemin')).toBe('0');
			expect(thumbs()[0]?.getAttribute('aria-valuemax')).toBe('100');
		});
	});

	describe('committing', () => {
		it('snaps to the step', () => {
			host.step.set(10);
			// `detectChanges()` is REQUIRED here, not decoration: a signal `input()` doesn't reach the
			// component until change detection runs, so committing first would snap against the old
			// step of 1 and quietly assert nothing. (The arrow-key test below got this right, which is
			// what made the inconsistency findable.)
			fixture.detectChanges();
			commitText(0, '23 pp');

			expect(host.commits().at(-1)).toEqual({ max: 100, min: 20 });
		});

		it('swaps inverted bounds rather than emitting a backwards range', () => {
			// Typing a lower bound above the upper is a normal human slip, not an error state.
			commitText(0, '90 pp');

			expect(host.commits().at(-1)).toEqual({ max: 100, min: 90 });

			host.valueMin.set(90);
			fixture.detectChanges();
			commitText(1, '20 pp');

			const last = host.commits().at(-1);

			expect(last?.min).toBeLessThanOrEqual(last?.max ?? 0);
		});

		it('does NOT emit when the committed value is unchanged', () => {
			// Every emission costs an engine recompute, so a no-op edit must stay silent.
			const before = host.commits().length;

			commitText(0, '0 pp');

			expect(host.commits()).toHaveLength(before);
		});

		it('ignores unparseable text, keeps the current bound, and puts it back in the field', () => {
			const before = host.commits().length;

			commitText(0, 'not a number');

			expect(host.commits()).toHaveLength(before);
			expect(inputs()[0]?.value).toBe('0 pp');
		});

		it('puts the committed value back when the text resolves to the committed bound', () => {
			// `0.4` snaps to the committed `0`: nothing changed, so nothing is written, and the field
			// shows the formatted bound rather than the text typed.
			host.valueMin.set(20);
			fixture.detectChanges();
			commitText(0, '20.4');

			expect(host.commits()).toEqual([]);
			expect(inputs()[0]?.value).toBe('20 pp');
		});

		it('reverts on Escape and commits nothing, including on the blur that follows', () => {
			const field = inputs()[0];

			if (field === undefined) {
				throw new Error('missing input');
			}
			field.focus();
			field.value = '40 pp';
			field.dispatchEvent(new Event('input'));
			fixture.detectChanges();
			field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
			fixture.detectChanges();

			expect(host.commits()).toEqual([]);
			expect(field.value).toBe('0 pp');
			expect(document.activeElement).not.toBe(field);

			// The field still commits normally afterwards.
			commitText(0, '40 pp');

			expect(host.commits().at(-1)).toEqual({ max: 100, min: 40 });
		});

		it('moves by one step on arrow keys', () => {
			host.step.set(5);
			host.valueMin.set(50);
			fixture.detectChanges();

			thumbs()[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
			fixture.detectChanges();

			expect(host.commits().at(-1)).toEqual({ max: 100, min: 55 });
		});

		it('jumps to the available extremes on Home/End', () => {
			host.available.set({ max: 70, min: 30 });
			host.valueMin.set(50);
			fixture.detectChanges();

			thumbs()[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
			fixture.detectChanges();

			expect(host.commits().at(-1)?.min).toBe(30);
		});

		it('leaves unrelated keys alone', () => {
			const before = host.commits().length;

			thumbs()[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
			fixture.detectChanges();

			expect(host.commits()).toHaveLength(before);
		});
	});

	describe('display', () => {
		it('formats the summary and both inputs through the supplied formatter', () => {
			host.valueMin.set(25);
			host.valueMax.set(75);
			fixture.detectChanges();

			const summary = fixture.nativeElement.querySelector('.fe-range-slider__summary') as HTMLElement;

			expect(summary.textContent).toContain('25 pp');
			expect(summary.textContent).toContain('75 pp');
			expect(inputs()[0]?.value).toBe('25 pp');
			expect(inputs()[1]?.value).toBe('75 pp');
		});

		it('announces each thumb through aria-valuetext, in the formatted form', () => {
			host.valueMin.set(25);
			host.valueMax.set(75);
			fixture.detectChanges();

			expect(thumbs()[0]?.getAttribute('aria-valuetext')).toBe('25 pp');
			expect(thumbs()[1]?.getAttribute('aria-valuetext')).toBe('75 pp');
		});

		it('re-seeds the inputs when the committed value changes externally', () => {
			// This is what makes "Clear all", pill removal and URL restore reach into the slider: the
			// text mirrors are seeded FROM the committed inputs, so a change arriving from the engine
			// overwrites whatever is sitting in the field.
			host.valueMin.set(40);
			fixture.detectChanges();
			expect(inputs()[0]?.value).toBe('40 pp');

			host.valueMin.set(0);
			fixture.detectChanges();

			expect(inputs()[0]?.value).toBe('0 pp');
		});
	});

	describe('scale', () => {
		/** A price-like baseline: a $4 floor and a long tail to $3,242. */
		const priceBaseline = { max: 3242, min: 4 } as const;

		/** The log scale wine's price slider uses, anchored at its dense minimum, over a $1 grid. */
		const priceScale = (): SliderScale => createSliderScale({ anchor: 'min', kind: 'log' }, priceBaseline, 1);

		/** Put the host on the price-like log track with the full range selected. */
		const useLogTrack = (): void => {
			host.baseline.set(priceBaseline);
			host.scale.set(priceScale());
			host.valueMin.set(priceBaseline.min);
			host.valueMax.set(priceBaseline.max);
			fixture.detectChanges();
		};

		it('keeps the linear mapping when no scale is given', () => {
			// Books and real estate pass no scale; their thumbs must sit where they always have.
			host.valueMin.set(25);
			fixture.detectChanges();

			expect(leftPct(0)).toBeCloseTo(25, 5);
		});

		it('positions thumbs through a log scale, giving the dense end most of the track', () => {
			useLogTrack();
			host.valueMin.set(30);
			fixture.detectChanges();

			expect(leftPct(0)).toBeCloseTo(priceScale().toFraction(30) * 100, 5);
			// $30 is under 1% of the way along a linear $4–$3,242 track; the log track gives it over a fifth.
			expect(leftPct(0)).toBeGreaterThan(20);
			expect(leftPct(1)).toBeCloseTo(100, 5);
		});

		it('maps a track press back through the scale and snaps it to the step', () => {
			useLogTrack();
			layOutTrack();
			clickTrack(100);

			// The press at mid-track lands on the log scale's midpoint value, snapped to whole dollars —
			// about $174 — nowhere near the linear midpoint of $1,623.
			const expected = Math.round(priceScale().fromFraction(0.5));

			expect(host.commits().at(-1)).toEqual({ max: priceBaseline.max, min: expected });
			expect(expected).toBeLessThan(400);
		});

		it('moves the thumb nearer ON SCREEN on a log track, not the one nearer in value', () => {
			useLogTrack();
			host.valueMin.set(10);
			host.valueMax.set(1000);
			fixture.detectChanges();
			layOutTrack();

			const scale = priceScale();
			const lowerAt = scale.toFraction(10);
			const upperAt = scale.toFraction(1000);
			// Just past the midpoint between the thumbs on screen: nearer the upper thumb there, while
			// the value under it is far nearer $10 than $1,000.
			const pressAt = (lowerAt + upperAt) / 2 + 0.02;
			const pressed = scale.fromFraction(pressAt);

			expect(pressed - 10).toBeLessThan(1000 - pressed);

			clickTrack(pressAt * 200);

			const last = host.commits().at(-1);

			expect(last?.min).toBe(10);
			expect(last?.max).toBeLessThan(1000);
			expect(last?.max).toBeGreaterThan(10);
		});

		it('maps a track press linearly when no scale is given', () => {
			layOutTrack();
			clickTrack(50);

			expect(host.commits().at(-1)).toEqual({ max: 100, min: 25 });
		});

		it('moves about one percent of the track per arrow press on a log track', () => {
			useLogTrack();
			host.valueMin.set(100);
			fixture.detectChanges();
			pressKey(0, 'ArrowRight');

			const next = host.commits().at(-1)?.min ?? Number.NaN;
			const moved = priceScale().toFraction(next) - priceScale().toFraction(100);

			// Several dollars at $100, not the single dollar a value-space step would move.
			expect(next).toBeGreaterThan(101);
			// One $1 grid step is about 0.2% of the track here, so the snap keeps the move within that of 1%.
			expect(moved).toBeGreaterThan(0.008);
			expect(moved).toBeLessThan(0.012);
		});

		it('moves back down by the same rule', () => {
			useLogTrack();
			host.valueMax.set(1000);
			fixture.detectChanges();
			pressKey(1, 'ArrowLeft');

			const next = host.commits().at(-1)?.max ?? Number.NaN;

			expect(next).toBeLessThan(1000);
			expect(priceScale().toFraction(1000) - priceScale().toFraction(next)).toBeCloseTo(0.01, 2);
		});

		it('never moves less than one step, even where one percent of the track rounds to nothing', () => {
			// At the anchor of a 0–10,000 log track, one percent is under a dollar, which a $5 step would
			// snap straight back to 0. The press must still move the thumb.
			host.baseline.set({ max: 10_000, min: 0 });
			host.scale.set(createSliderScale({ anchor: 'min', kind: 'log' }, { max: 10_000, min: 0 }, 1));
			host.step.set(5);
			host.valueMin.set(0);
			host.valueMax.set(10_000);
			fixture.detectChanges();
			pressKey(0, 'ArrowRight');

			expect(host.commits().at(-1)).toEqual({ max: 10_000, min: 5 });
		});
	});

	describe('distribution overlay', () => {
		/**
		 * Three buckets over the 0-100 baseline: `[0,20)` empty, `[40,60)` tallest, `[80,100)` populated.
		 *
		 * @returns The buckets.
		 */
		const buckets = (): readonly HistogramBucket[] => [
			{ bucketMax: 20, bucketMin: 0, count: 0, heightFraction: 0, inSelection: false },
			{ bucketMax: 60, bucketMin: 40, count: 8, heightFraction: 1, inSelection: false },
			{ bucketMax: 100, bucketMin: 80, count: 2, heightFraction: 0.25, inSelection: false },
		];

		/** The rendered bars, left to right. */
		const bars = (): HTMLElement[] =>
			Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-range-histogram__bar'));

		it('renders no overlay at all when no buckets are supplied', () => {
			// Not an empty container: `.fe-range-histogram` is an authored 32px flex row plus 6px of
			// margin, so rendering it empty leaves a visible band above the track before the first bundle.
			expect(fixture.nativeElement.querySelector('.fe-range-histogram')).toBeNull();
		});

		it('renders one aria-hidden bar per bucket', () => {
			host.histogram.set(buckets());
			fixture.detectChanges();

			expect(bars()).toHaveLength(3);
			expect(
				(fixture.nativeElement.querySelector('.fe-range-histogram') as HTMLElement).getAttribute('aria-hidden'),
			).toBe('true');
		});

		it('heights each bar, flooring the empty bucket below the populated minimum', () => {
			host.histogram.set(buckets());
			fixture.detectChanges();

			expect(bars()[0]?.style.height).toBe('4%');
			expect(bars()[1]?.style.height).toBe('100%');
			// 25% clears the 18% populated floor, so the fraction is used as-is.
			expect(bars()[2]?.style.height).toBe('25%');
		});

		it('tiers the bars against the SELECTION, and repaints when it moves', () => {
			host.histogram.set(buckets());
			host.valueMin.set(0);
			host.valueMax.set(50);
			fixture.detectChanges();

			// [0,20) and [40,60) overlap [0,50]; [80,100) does not.
			expect(bars()[0]?.className).toContain('--selected');
			expect(bars()[1]?.className).toContain('--selected');
			expect(bars()[2]?.className).toContain('--available');

			// Both handles, deliberately: raising only `valueMin` past `valueMax` collapses the selection
			// to a point (the slider clamps lower below upper), which tests the clamp rather than the bars.
			host.valueMin.set(70);
			host.valueMax.set(100);
			fixture.detectChanges();

			// The whole point of the overlay: it moves with the handles rather than describing the corpus.
			expect(bars()[0]?.className).toContain('--available');
			expect(bars()[2]?.className).toContain('--selected');
		});

		it('dims the bars outside the engine\'s available zone', () => {
			host.histogram.set(buckets());
			host.available.set({ max: 65, min: 30 });
			fixture.detectChanges();

			// [0,20) is wholly below availableMin, so it reads as dead space rather than as unselected.
			expect(bars()[0]?.className).toContain('--outside');
			expect(bars()[1]?.className).not.toContain('--outside');
		});

		it('flags an empty bucket so the stylesheet can knock it back within its tier', () => {
			host.histogram.set(buckets());
			fixture.detectChanges();

			expect(bars()[0]?.className).toContain('--empty');
			expect(bars()[1]?.className).not.toContain('--empty');
		});
	});
});
