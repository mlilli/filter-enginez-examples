/**
 * The claim this whole vertical exists to make, asserted.
 *
 * @remarks
 * `/books` and `/books-raw` render the same view and write through the same engine; only the READ
 * path differs. These tests pin the two properties that make that comparison meaningful:
 *
 *   1. **Same write path.** The panel and pills mutate a bare `FilterEngine`. The signals engine's
 *      `.core` IS that same engine, so a mutation made through the adapter's core is observable on
 *      the bare engine and vice versa — there is no second source of truth.
 *   2. **The subscription asymmetry is real.** A signal fires immediately on subscribe (so first paint
 *      is free), whereas `core.subscribe` does not (so the bare-core page needs an explicit initial
 *      paint). This is the concrete trade-off the demo illustrates, and it is easy to regress.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { describe, expect, it } from 'vitest';

/** Two books across two genres — enough to observe a filter narrowing the set. */
const DATA = [
	{ genre: 'fantasy', id: 'a', title: 'A' },
	{ genre: 'mystery', id: 'b', title: 'B' },
] as unknown as readonly Book[];

describe('the two reactive surfaces over one engine', () => {
	it('shares ONE engine — the signals adapter wraps the same core the panel writes through', () => {
		const core = createFilterEngine<Book>({ sourceData: DATA });
		const engine = createSignalsEngine(core);

		// `.core` is the very same instance, which is why the view/panel can be surface-agnostic.
		expect(engine.core).toBe(core);

		// A write through the bare engine is visible on the signal…
		core.addRule('genre', inSet('genre', ['fantasy']));
		expect(engine.resultCount.value).toBe(1);

		// …and the bare engine agrees, because there is no mirrored state to drift.
		expect(core.getResultCount()).toBe(1);

		engine.dispose();
	});

	it('signals fire on subscribe; the bare core does NOT (hence the explicit first paint)', () => {
		const core = createFilterEngine<Book>({ sourceData: DATA });
		const engine = createSignalsEngine(core);

		const signalValues: number[] = [];
		const unsubscribeSignal = engine.resultCount.subscribe((count) => {
			signalValues.push(count);
		});

		// The signal delivered the CURRENT value at subscribe time — no initial render pass needed.
		expect(signalValues).toEqual([2]);

		let coarseEvents = 0;
		const unsubscribeCore = core.subscribe(() => {
			coarseEvents += 1;
		});

		// The bare engine stayed silent on attach. This asymmetry is exactly why `booksRawPage` calls
		// `repaint()` once before subscribing — without it the UI would be blank until first input.
		expect(coarseEvents).toBe(0);

		core.addRule('genre', inSet('genre', ['fantasy']));

		// Now both report the change.
		expect(signalValues.at(-1)).toBe(1);
		expect(coarseEvents).toBeGreaterThan(0);

		unsubscribeSignal();
		unsubscribeCore();
		engine.dispose();
	});

	it('exposes per-field signals, so a coarse listener sees changes a field-level one ignores', () => {
		const core = createFilterEngine<Book>({ sourceData: DATA });
		const engine = createSignalsEngine(core);

		let countChanges = 0;
		const unsubscribe = engine.resultCount.subscribe(() => {
			countChanges += 1;
		});
		const initialChanges = countChanges;

		// Re-committing an equivalent rule leaves the RESULT COUNT untouched. The fine-grained
		// subscriber can therefore skip repainting the count, while a coarse `core.subscribe` listener
		// would repaint everything — the granularity difference the two demo routes make visible.
		core.addRule('genre', inSet('genre', ['fantasy']));
		core.addRule('genre', inSet('genre', ['fantasy']));

		expect(engine.resultCount.value).toBe(1);
		// One meaningful transition (2 → 1), not one per mutation.
		expect(countChanges - initialChanges).toBe(1);

		unsubscribe();
		engine.dispose();
	});
});
