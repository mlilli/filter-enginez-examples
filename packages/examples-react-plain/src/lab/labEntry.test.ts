/**
 * Tests for {@link buildLabEntry} — the `/lab` route's synthesized `DatasetEntry`.
 *
 * @remarks
 * Pure, so no renderer is needed. The one property this module CANNOT assert on its own is that the
 * caller holds the result at module scope; that guard lives in `labRoute.test.tsx`, which counts
 * `boot` invocations across re-renders. What this file can do is prove the hazard is real — two
 * calls return two objects — so the reason for the other test is written down beside the code
 * rather than only in a docblock.
 *
 * `import type` for `DatasetEntry` is load-bearing: a value import of `../datasets.js` would pull
 * every dataset's boot (and through it `examples-shared` + `mock-data`'s corpora) into a test that
 * needs none of it.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import type { DatasetEntry } from '../datasets.js';

import { buildLabEntry } from './labEntry.js';

/** A stand-in for the app's books entry, shaped like the real one but booting nothing. */
function makeBooksEntry(overrides?: Partial<DatasetEntry>): DatasetEntry {
	return {
		// `await`ing a resolved promise is not ceremony here: `require-await` and
		// `promise-function-async` pin each other otherwise, and yielding a microtask is what the real
		// boot does anyway.
		boot: vi.fn(async () => {
			await Promise.resolve();

			return { engine: {} as never };
		}),
		Component: (): null => null,
		getProgressSnapshot: () => null,
		id: 'books',
		label: 'Books',
		recordNoun: 'books',
		subscribeProgress: () => () => undefined,
		supportsUrlState: true,
		tagline: 'a tagline',
		...overrides,
	};
}

/** A distinguishable stand-in for `<LabPage>`. */
const StubLabPage = (): null => null;

describe('buildLabEntry', () => {
	it('returns null when the books dataset is absent', () => {
		// A REAL branch, not a defensive one: a typo in the dataset id would otherwise render the lab
		// over no engine at all, which fails as a blank pane rather than as an error.
		expect(buildLabEntry(undefined, StubLabPage)).toBeNull();
	});

	it('swaps in the lab component', () => {
		const entry = buildLabEntry(makeBooksEntry(), StubLabPage);

		expect(entry?.Component).toBe(StubLabPage);
	});

	it('carries the books boot and its progress hooks through unchanged', () => {
		// The whole argument for reusing `<DatasetRoute>`: the boot path is inherited rather than
		// re-implemented, so the loader, the error screen and the cached engine all come for free.
		const booksEntry = makeBooksEntry();
		const entry = buildLabEntry(booksEntry, StubLabPage);

		expect(entry?.boot).toBe(booksEntry.boot);
		expect(entry?.getProgressSnapshot).toBe(booksEntry.getProgressSnapshot);
		expect(entry?.subscribeProgress).toBe(booksEntry.subscribeProgress);
		expect(entry?.id).toBe('books');
		expect(entry?.recordNoun).toBe('books');
	});

	it('forces URL state OFF even though the books entry enables it', () => {
		// The assertion that would pass for the wrong reason if the fixture said `false`: books really
		// does set `supportsUrlState: true`, so this proves an OVERRIDE rather than a pass-through.
		// `/lab` has no filter panel, and syncing would write an empty `?f` over a shared link.
		const booksEntry = makeBooksEntry({ supportsUrlState: true });
		const entry = buildLabEntry(booksEntry, StubLabPage);

		expect(booksEntry.supportsUrlState).toBe(true);
		expect(entry?.supportsUrlState).toBe(false);
	});

	it('leaves the source entry untouched', () => {
		// The registry entry is a module-level constant shared with `/books` and the landing page.
		// Mutating it here would change what those routes render, from a module they do not import.
		const booksEntry = makeBooksEntry();

		buildLabEntry(booksEntry, StubLabPage);

		expect(booksEntry.Component).not.toBe(StubLabPage);
		expect(booksEntry.supportsUrlState).toBe(true);
	});

	it('returns a NEW object on every call — which is why the caller must call it once', () => {
		// This is the hazard `LabRoute` holds at module scope to avoid. `<DatasetRoute>`'s boot effect
		// is keyed on entry identity, so a caller rebuilding per render re-boots forever — and because
		// the cycle turns on a resolved promise rather than a synchronous setState, React throws
		// nothing and the tab simply spins. Asserted here so the constraint is discoverable from the
		// module it constrains; enforced in `labRoute.test.tsx`.
		const booksEntry = makeBooksEntry();

		expect(buildLabEntry(booksEntry, StubLabPage)).not.toBe(buildLabEntry(booksEntry, StubLabPage));
	});
});
