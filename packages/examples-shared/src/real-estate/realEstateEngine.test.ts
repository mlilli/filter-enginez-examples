/**
 * Tests for the real-estate signals-surface boot wrapper.
 *
 * @remarks
 * Direct mirror of `booksEngine.test.ts`, because the module is a direct mirror of `booksEngine.ts`:
 * thin on purpose, with the acceleration init and engine construction living in
 * `bootRealEstateCore`. What this layer owns is the **cache**, and the cache is what these tests are
 * about.
 *
 * Booting twice must return the identical bundle, not an equivalent one. Two calls that each built
 * their own engine would work — the route would render, filters would apply, nothing would throw. It
 * would just rebuild every acceleration structure over the corpus a second time and hand different
 * components engines whose rule state diverges the moment one of them is mutated: a chip pressed in
 * the panel filtering nothing in the results grid.
 *
 * The cache is assigned with `??=` rather than a null check, which matters for a reason a
 * single-await test would miss: the PROMISE is cached, not the resolved bundle, so two callers racing
 * before the first resolves must still share one boot. That case is asserted without awaiting in
 * between.
 *
 * The last test is the one this split was written for. `bootRealEstateCore` and
 * `bootRealEstateEngine` hold SEPARATE caches, which is correct — but only because the second sits
 * over the first. If someone later inlines the boot body back into the wrapper, both caches still
 * behave, both suites above still pass, and the only symptom is that acceleration initializes twice,
 * the corpus builds twice, and the Angular route and the React routes filter two different engines.
 */

import { inSet } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { bootRealEstateCore } from './bootRealEstateCore.js';
import { bootRealEstateEngine } from './realEstateEngine.js';

describe('bootRealEstateEngine', () => {
	it('returns a signals-wrapped engine over a populated corpus', async () => {
		const { engine, meta } = await bootRealEstateEngine();

		expect(engine.core.getResults().length).toBeGreaterThan(0);
		expect(meta.listingCount).toBe(engine.core.getResults().length);
		expect(meta.mode).toBe('main-thread');
	});

	it('exposes the signals surface, not just the bare core', async () => {
		// The whole reason this wrapper exists. A regression to returning the core would typecheck at
		// every call site that only reads `.core`, and fail at the first component that subscribes.
		const { engine } = await bootRealEstateEngine();

		expect(engine.results).toBeDefined();
		expect(engine.resultCount).toBeDefined();
	});

	it('returns the SAME bundle on a second boot', async () => {
		const first = await bootRealEstateEngine();
		const second = await bootRealEstateEngine();

		expect(second).toBe(first);
		expect(second.engine.core).toBe(first.engine.core);
	});

	it('shares one boot between callers that race before it resolves', async () => {
		// `??=` caches the PROMISE, so this holds even though neither caller has a bundle yet. Caching
		// the resolved value instead would let two concurrent route mounts each build their own engine.
		const [a, b] = await Promise.all([bootRealEstateEngine(), bootRealEstateEngine()]);

		expect(a).toBe(b);
	});

	it('keeps rule state shared across boots', async () => {
		// The consequence that actually reaches the user. Separate engines would leave a filter applied
		// in one component invisible to another — the chip looks pressed, the grid ignores it.
		const { engine } = await bootRealEstateEngine();
		const before = engine.core.getResults().length;

		engine.core.addRule('probe', inSet<string>('id', ['no-such-listing-id']));

		const { engine: again } = await bootRealEstateEngine();

		expect(again.core.getResults().length).toBe(0);

		again.core.removeRule('probe');

		expect(engine.core.getResults().length).toBe(before);
	});

	it('wraps the SAME core the bare boot hands out — one corpus build, two surfaces', async () => {
		// The invariant `core.ts`'s docblock warns about in capitals. Angular boots through
		// `bootRealEstateCore` and React through `bootRealEstateEngine`; if those ever stop sharing a
		// core, acceleration initializes twice, the corpus builds twice, and the two verticals filter
		// engines that cannot see each other's rules.
		const { core } = await bootRealEstateCore();
		const { engine } = await bootRealEstateEngine();

		expect(engine.core).toBe(core);
	});

	it('reports the same metadata object the bare boot produced', async () => {
		// The wrapper passes `meta` straight through rather than rebuilding it, so `bootMs` measures the
		// real corpus build rather than the microseconds spent wrapping it.
		const { meta: coreMeta } = await bootRealEstateCore();
		const { meta } = await bootRealEstateEngine();

		expect(meta).toBe(coreMeta);
	});
});
