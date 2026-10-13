/**
 * Tests for the books signals-surface boot wrapper.
 *
 * @remarks
 * The module is thin on purpose — the acceleration init and engine construction live in
 * `bootBooksCore`, and this layer only adds the `reactive-signals` wrapper. What it owns is the
 * **cache**, and the cache is what these tests are about.
 *
 * Booting twice must return the identical bundle, not an equivalent one. Two calls that each built
 * their own engine would work: the route would render, filters would apply, nothing would throw. It
 * would just rebuild every acceleration structure over the corpus a second time and, worse, hand
 * different components engines whose rule state diverges the moment one of them is mutated — a chip
 * pressed in the panel filtering nothing in the results grid.
 *
 * The cache is assigned with `??=` rather than a null check, which matters for a reason a
 * single-await test would miss: the PROMISE is cached, not the resolved bundle, so two callers racing
 * before the first resolves must still share one boot. That case is asserted without awaiting in
 * between.
 */

import { inSet } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { bootBooksEngine } from './booksEngine.js';

describe('bootBooksEngine', () => {
	it('returns a signals-wrapped engine over a populated corpus', async () => {
		const { engine, meta } = await bootBooksEngine();

		expect(engine.core.getResults().length).toBeGreaterThan(0);
		expect(meta.bookCount).toBe(engine.core.getResults().length);
		expect(meta.mode).toBe('main-thread');
	});

	it('exposes the signals surface, not just the bare core', async () => {
		// The whole reason this wrapper exists. A regression to returning the core would typecheck at
		// every call site that only reads `.core`, and fail at the first component that subscribes.
		const { engine } = await bootBooksEngine();

		expect(engine.results).toBeDefined();
		expect(engine.resultCount).toBeDefined();
	});

	it('returns the SAME bundle on a second boot', async () => {
		const first = await bootBooksEngine();
		const second = await bootBooksEngine();

		expect(second).toBe(first);
		expect(second.engine.core).toBe(first.engine.core);
	});

	it('shares one boot between callers that race before it resolves', async () => {
		// `??=` caches the PROMISE, so this holds even though neither caller has a bundle yet. Caching
		// the resolved value instead would let two concurrent route mounts each build their own engine.
		const [a, b] = await Promise.all([bootBooksEngine(), bootBooksEngine()]);

		expect(a).toBe(b);
	});

	it('keeps rule state shared across boots', async () => {
		// The consequence that actually reaches the user. Separate engines would leave a filter applied
		// in one component invisible to another — the chip looks pressed, the grid ignores it.
		const { engine } = await bootBooksEngine();
		const before = engine.core.getResults().length;

		engine.core.addRule('probe', inSet<string>('id', ['no-such-book-id']));

		const { engine: again } = await bootBooksEngine();

		expect(again.core.getResults().length).toBe(0);

		again.core.removeRule('probe');

		expect(engine.core.getResults().length).toBe(before);
	});
});
