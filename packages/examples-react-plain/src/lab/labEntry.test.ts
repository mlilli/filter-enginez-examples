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
 * `import type` for `DatasetEntry` is load-bearing: a value import of `../datasets.js` would be the
 * real registry, whose entries load real dataset modules (and through them `examples-shared` +
 * `mock-data`'s corpora) — none of which a test of this function needs.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import type { DatasetEntry, DatasetModule } from '../datasets.js';

import { buildLabEntry } from './labEntry.js';

/** A stand-in for the books module, shaped like the real one but booting nothing. */
const booksModule: DatasetModule = {
	// `await`ing a resolved promise is not ceremony here: `require-await` and
	// `promise-function-async` pin each other otherwise, and yielding a microtask is what the real
	// boot does anyway.
	boot: vi.fn(async () => {
		await Promise.resolve();

		return { engine: {} as never };
	}),
	Component: (): null => null,
	getProgressSnapshot: () => null,
	subscribeProgress: () => () => undefined,
};

/** A stand-in for the app's books entry, whose `load` resolves to {@link booksModule}. */
function makeBooksEntry(overrides?: Partial<DatasetEntry>): DatasetEntry {
	return {
		id: 'books',
		label: 'Books',
		load: vi.fn(async () => {
			await Promise.resolve();

			return booksModule;
		}),
		recordNoun: 'books',
		supportsUrlState: true,
		tagline: 'a tagline',
		...overrides,
	};
}

/** A distinguishable stand-in for `<LabPage>`. */
const StubLabPage = (): null => null;

/** Loads {@link StubLabPage}, the way `LabRoute` loads the real page. */
async function loadStubLabPage(): Promise<React.ComponentType> {
	await Promise.resolve();

	return StubLabPage;
}

describe('buildLabEntry', () => {
	it('returns null when the books dataset is absent', () => {
		// A REAL branch, not a defensive one: a typo in the dataset id would otherwise render the lab
		// over no engine at all, which fails as a blank pane rather than as an error.
		expect(buildLabEntry(undefined, loadStubLabPage)).toBeNull();
	});

	it('loads the books module with the lab component swapped in', async () => {
		const loaded = await buildLabEntry(makeBooksEntry(), loadStubLabPage)?.load();

		expect(loaded?.Component).toBe(StubLabPage);
	});

	it('carries the books boot and its progress hooks through unchanged', async () => {
		// The whole argument for reusing `<DatasetRoute>`: the boot path is inherited rather than
		// re-implemented, so the loader, the error screen and the cached engine all come for free.
		const booksEntry = makeBooksEntry();
		const entry = buildLabEntry(booksEntry, loadStubLabPage);
		const loaded = await entry?.load();

		expect(booksEntry.load).toHaveBeenCalledTimes(1);
		expect(loaded?.boot).toBe(booksModule.boot);
		expect(loaded?.getProgressSnapshot).toBe(booksModule.getProgressSnapshot);
		expect(loaded?.subscribeProgress).toBe(booksModule.subscribeProgress);
		expect(entry?.id).toBe('books');
		expect(entry?.recordNoun).toBe('books');
	});

	it('loads nothing until the route asks', () => {
		// The lab page is its own chunk: building the entry at module scope (which `LabRoute` does at
		// startup) must not fetch it, or the books module either.
		const booksEntry = makeBooksEntry();
		const loadPage = vi.fn(loadStubLabPage);

		buildLabEntry(booksEntry, loadPage);

		expect(booksEntry.load).not.toHaveBeenCalled();
		expect(loadPage).not.toHaveBeenCalled();
	});

	it('forces URL state OFF even though the books entry enables it', () => {
		// The assertion that would pass for the wrong reason if the fixture said `false`: books really
		// does set `supportsUrlState: true`, so this proves an OVERRIDE rather than a pass-through.
		// `/lab` has no filter panel, and syncing would write an empty `?f` over a shared link.
		const booksEntry = makeBooksEntry({ supportsUrlState: true });
		const entry = buildLabEntry(booksEntry, loadStubLabPage);

		expect(booksEntry.supportsUrlState).toBe(true);
		expect(entry?.supportsUrlState).toBe(false);
	});

	it('leaves the source entry and its module untouched', async () => {
		// The registry entry is a module-level constant shared with `/books` and the landing page, and
		// the module is the one `/books` renders. Mutating either here would change what those routes
		// render, from a module they do not import.
		const booksEntry = makeBooksEntry();
		const originalLoad = booksEntry.load;

		await buildLabEntry(booksEntry, loadStubLabPage)?.load();

		expect(booksEntry.load).toBe(originalLoad);
		expect(booksEntry.supportsUrlState).toBe(true);
		expect(booksModule.Component).not.toBe(StubLabPage);
	});

	it('returns a NEW object on every call — which is why the caller must call it once', () => {
		// This is the hazard `LabRoute` holds at module scope to avoid. `<DatasetRoute>`'s boot effect
		// is keyed on entry identity, so a caller rebuilding per render re-boots forever — and because
		// the cycle turns on a resolved promise rather than a synchronous setState, React throws
		// nothing and the tab simply spins. Asserted here so the constraint is discoverable from the
		// module it constrains; enforced in `labRoute.test.tsx`.
		const booksEntry = makeBooksEntry();

		expect(buildLabEntry(booksEntry, loadStubLabPage)).not.toBe(buildLabEntry(booksEntry, loadStubLabPage));
	});
});
