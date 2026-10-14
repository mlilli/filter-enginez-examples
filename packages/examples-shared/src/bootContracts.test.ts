/**
 * The shared boot contract, asserted across every main-thread engine boot.
 *
 * @remarks
 * `bootBooksCore`, `bootBooksConfigEngine` and `bootRealEstateCore` are three copies of one shape:
 * a module-level progress pub/sub feeding a `useSyncExternalStore` bridge, plus a memoized boot. They
 * differ only in their nouns (`bookCount` vs `listingCount`, `core` vs `engine`).
 *
 * The two signals-surface wrappers over those cores (`bootBooksEngine`, `bootRealEstateEngine`) are
 * NOT here: they own nothing but a second, cheap memo, and each has its own file asserting that memo
 * — and, more importantly, asserting that it sits over the shared core rather than beside it.
 *
 * So this is ONE parameterized suite rather than three near-identical files. That is not only less
 * code — it makes the uniformity itself the thing under test. If one boot ever grows a different
 * caching rule or stops reporting progress, it fails here rather than passing a file that was copied
 * alongside it.
 *
 * `wineEngine` has its own file: it is the only boot with a worker path and a size threshold, and its
 * boundary test would not generalize.
 *
 * **The module-singleton hazard applies to all of them.** `cachedBoot` and `currentProgress` live in
 * module scope, so every case re-imports through `vi.resetModules()`. Without that, the first boot in
 * the file would satisfy every later assertion and the caching tests would pass vacuously.
 */

import { loadConfig } from '@filter-enginez/core';
import { booksFilterConfig, books as defaultBooks } from '@filter-enginez/mock-data/books';
import { listings as defaultListings } from '@filter-enginez/mock-data/real-estate';
import { describe, expect, it, vi } from 'vitest';

import { buildBooksEngine } from './books/buildBooksEngine.js';

/** One boot module, reduced to the contract every one of them shares. */
interface BootContract {
	/** Boot and return `{ engineLike, meta }` — `engineLike` is whichever engine the module exposes. */
	readonly boot: () => Promise<{ engineLike: unknown; meta: Record<string, unknown> }>;
	/** How many records the corpus holds, for the count assertion. */
	readonly expectedCount: number;
	/** Read the current progress snapshot. */
	readonly getSnapshot: () => unknown;
	/** The meta key carrying the record count (they disagree on the noun). */
	readonly countKey: string;
	/** Subscribe to progress; returns an unsubscribe. */
	readonly subscribe: (listener: (progress: unknown) => void) => () => void;
}

/**
 * Freshly import a boot module and adapt it to {@link BootContract}.
 *
 * @param name - Which boot to load.
 * @returns The adapted contract over a module-scope-reset copy.
 */
async function loadBoot(
	name: 'books-config' | 'books-core' | 'real-estate-core',
): Promise<BootContract> {
	vi.resetModules();

	if (name === 'books-core') {
		const mod = await import('./books/bootBooksCore.js');

		return {
			boot: async () => {
				const bundle = await mod.bootBooksCore();

				return { engineLike: bundle.core, meta: bundle.meta as unknown as Record<string, unknown> };
			},
			countKey: 'bookCount',
			expectedCount: defaultBooks.length,
			getSnapshot: () => mod.getBooksBootProgressSnapshot(),
			subscribe: (listener) => mod.subscribeBooksBootProgress(listener),
		};
	}
	if (name === 'books-config') {
		const mod = await import('./books/bootBooksConfigEngine.js');

		return {
			boot: async () => {
				const bundle = await mod.bootBooksConfigEngine();

				return { engineLike: bundle.engine, meta: bundle.meta as unknown as Record<string, unknown> };
			},
			countKey: 'bookCount',
			expectedCount: defaultBooks.length,
			getSnapshot: () => mod.getBooksConfigBootProgressSnapshot(),
			subscribe: (listener) => mod.subscribeBooksConfigBootProgress(listener),
		};
	}

	const mod = await import('./real-estate/bootRealEstateCore.js');

	return {
		boot: async () => {
			const bundle = await mod.bootRealEstateCore();

			return { engineLike: bundle.core, meta: bundle.meta as unknown as Record<string, unknown> };
		},
		countKey: 'listingCount',
		expectedCount: defaultListings.length,
		getSnapshot: () => mod.getRealEstateBootProgressSnapshot(),
		subscribe: (listener) => mod.subscribeRealEstateBootProgress(listener),
	};
}

const boots = ['books-core', 'books-config', 'real-estate-core'] as const;

describe.each(boots)('%s boot contract', (name) => {
	it('reports no progress before booting', async () => {
		const contract = await loadBoot(name);

		expect(contract.getSnapshot()).toBeNull();
	});

	it('publishes a single-shot progress update to subscribers', async () => {
		// Each of these boots on the main thread from a bundled corpus, so there is nothing to stream —
		// but the boot screen still reads through useSyncExternalStore, and with no update at all it
		// would sit at "loading" forever behind a fully-ready engine.
		const contract = await loadBoot(name);
		const seen: unknown[] = [];

		contract.subscribe((progress) => seen.push(progress));
		await contract.boot();

		expect(seen).toHaveLength(1);
		expect(seen[0]).toEqual({ loaded: contract.expectedCount, source: 'default-tier', total: contract.expectedCount });
	});

	it('leaves the snapshot agreeing with what subscribers were told', async () => {
		// `useSyncExternalStore` bails out when the snapshot has not changed, so a notification that
		// fires while the snapshot still holds the old value drops the re-render entirely.
		const contract = await loadBoot(name);
		let last: unknown = null;

		contract.subscribe((progress) => {
			last = progress;
		});
		await contract.boot();

		expect(contract.getSnapshot()).toEqual(last);
	});

	it('stops notifying after unsubscribe', async () => {
		const contract = await loadBoot(name);
		const seen: unknown[] = [];

		contract.subscribe((progress) => seen.push(progress))();
		await contract.boot();

		expect(seen).toEqual([]);
	});

	it('reports the corpus size and the main-thread mode', async () => {
		const contract = await loadBoot(name);
		const { meta } = await contract.boot();

		expect(meta[contract.countKey]).toBe(contract.expectedCount);
		expect(meta['mode']).toBe('main-thread');
		expect(meta['source']).toBe('default-tier');
		expect(meta['bootMs']).toBeGreaterThanOrEqual(0);
	});

	it('memoizes — every caller gets the SAME engine instance', async () => {
		// Routes mount and unmount freely, and several call this. A second boot would build a second
		// engine over the whole corpus, and filters set through one would be invisible to the other:
		// the panel and the results would silently disagree.
		const contract = await loadBoot(name);
		const [first, second] = await Promise.all([contract.boot(), contract.boot()]);

		expect(first.engineLike).toBe(second.engineLike);
		expect((await contract.boot()).engineLike).toBe(first.engineLike);
	});

	it('does not re-publish progress on a cached boot', async () => {
		// The memoized promise must not re-run the body. If it did, a late-mounting route would push a
		// duplicate progress event at a boot screen that had already finished.
		const contract = await loadBoot(name);

		await contract.boot();

		const seen: unknown[] = [];

		contract.subscribe((progress) => seen.push(progress));
		await contract.boot();

		expect(seen).toEqual([]);
	});
});

describe('books config boot', () => {
	it('arrives with the declarative config already applied', async () => {
		// The distinguishing behavior of this boot versus bootBooksCore: it loads `booksFilterConfig`
		// onto the core BEFORE wrapping it in signals, so /books-config renders an already-configured
		// engine rather than an empty one that populates a tick later.
		const mod = await import('./books/bootBooksConfigEngine.js');
		const { engine } = await mod.bootBooksConfigEngine();

		expect(engine.activeRuleIds.value.length).toBeGreaterThan(0);
	});

	it('boots the same engine a static import of the dataset and its config would build', async () => {
		// The boot loads the books and `booksFilterConfig` with a dynamic `import()`, so the dataset is a
		// chunk of its own instead of part of every page's startup. Built directly from the statically
		// imported values instead, the engine must hold the same records under the same rules.
		vi.resetModules();

		const mod = await import('./books/bootBooksConfigEngine.js');
		const { config, engine } = await mod.bootBooksConfigEngine();
		const eager = buildBooksEngine(defaultBooks);

		loadConfig(eager, booksFilterConfig);

		expect(config).toEqual(booksFilterConfig);
		expect(engine.core.getSourceData()).toEqual(defaultBooks);
		expect(engine.core.exportConfig()).toEqual(eager.exportConfig());
		expect(engine.core.getResultIndices()).toEqual(eager.getResultIndices());
	});

	it('hands the page the config it booted from, and refuses before the boot resolves', async () => {
		// The page shell renders this config beside the panel generated from it. It reads it from the
		// boot rather than importing the dataset, and it renders only after the boot — so a read ahead
		// of the boot is a wiring mistake that fails loudly instead of rendering an empty panel.
		vi.resetModules();

		const mod = await import('./books/bootBooksConfigEngine.js');

		expect(() => mod.getBootedBooksFilterConfig()).toThrow(/bootBooksConfigEngine\(\) to have resolved/u);

		const bundle = await mod.bootBooksConfigEngine();

		expect(mod.getBootedBooksFilterConfig()).toBe(bundle.config);
		expect(mod.getBootedBooksFilterConfig()).toEqual(booksFilterConfig);
	});
});

describe('books core boot', () => {
	it('returns a BARE engine with no rules — the surface-neutral contract', async () => {
		// bootBooksCore deliberately hands back an unwrapped `FilterEngine` so each vertical can apply
		// its own reactive surface. It must also start rule-free: the panels add rules on first
		// interaction, and a pre-seeded rule would make every first click read as a CHANGE rather than
		// an ADD in the devtools action log.
		vi.resetModules();

		const mod = await import('./books/bootBooksCore.js');
		const { core } = await mod.bootBooksCore();

		expect(core.getActiveRuleIds()).toEqual([]);
		expect(core.getResultCount()).toBe(defaultBooks.length);
	});
});

describe('real estate core boot', () => {
	it('returns a BARE engine with no rules — the surface-neutral contract', async () => {
		// Same contract `bootBooksCore` holds, and asserted separately for the same reason: this is the
		// entry point the Angular resolver calls, and it must hand back an unwrapped `FilterEngine` so
		// `createRxJsEngine` can wrap it without `@preact/signals-core` ever entering that bundle. It
		// must also start rule-free — the panel adds rules on first interaction, and a pre-seeded rule
		// would make every first click read as a CHANGE rather than an ADD in the devtools action log.
		vi.resetModules();

		const mod = await import('./real-estate/bootRealEstateCore.js');
		const { core } = await mod.bootRealEstateCore();

		expect(core.getActiveRuleIds()).toEqual([]);
		expect(core.getResultCount()).toBe(defaultListings.length);
	});
});
