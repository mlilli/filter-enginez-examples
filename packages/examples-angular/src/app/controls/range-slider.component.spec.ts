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
 * @packageDocumentation
 */

import type { HistogramBucket } from '@filter-enginez/examples-shared/bounds';

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
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
		field.dispatchEvent(new Event('blur'));
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

		it('ignores unparseable text and keeps the current bound', () => {
			const before = host.commits().length;

			commitText(0, 'not a number');

			expect(host.commits()).toHaveLength(before);
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
