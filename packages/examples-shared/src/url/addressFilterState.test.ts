/**
 * `loadFilterStateFromAddress`: a shared link's state reaches the engine before the page renders, and a
 * link that cannot be read leaves the engine as it was.
 */

import { booksFilterConfig, books as defaultBooks } from '@filter-enginez/mock-data/books';
import { describe, expect, it } from 'vitest';

import { buildBooksEngine } from '../books/buildBooksEngine.js';
import { loadFilterStateFromAddress } from './addressFilterState.js';
import { createLinkSerializer } from './linkSerializer.js';

describe('loadFilterStateFromAddress', () => {
	it('loads a link’s state, in either format, so the first render already shows its count', () => {
		for (const format of ['human-readable', 'compact'] as const) {
			const engine = buildBooksEngine(defaultBooks);
			const search = `?f=${encodeURIComponent(createLinkSerializer(format).encode(booksFilterConfig))}`;

			expect(loadFilterStateFromAddress(engine, search)).toBe(true);
			expect(engine.getResultCount()).toBeLessThan(defaultBooks.length);
			expect(engine.getActiveRuleIds().length).toBeGreaterThan(0);
		}
	});

	it('leaves the engine alone without a state, with an empty one, or with one it cannot read', () => {
		const engine = buildBooksEngine(defaultBooks);

		expect(loadFilterStateFromAddress(engine, '')).toBe(false);
		expect(loadFilterStateFromAddress(engine, '?f=')).toBe(false);
		expect(loadFilterStateFromAddress(engine, '?f=not-a-state')).toBe(false);
		expect(engine.getResultCount()).toBe(defaultBooks.length);
	});

	it('reads the current page’s address by default', () => {
		const engine = buildBooksEngine(defaultBooks);

		window.history.replaceState(null, '', `/books?f=${encodeURIComponent(createLinkSerializer('compact').encode(booksFilterConfig))}`);
		try {
			expect(loadFilterStateFromAddress(engine)).toBe(true);
		} finally {
			window.history.replaceState(null, '', '/');
		}
	});
});
