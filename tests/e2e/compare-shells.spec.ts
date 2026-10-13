/**
 * `/compare`, in every vertical that serves it — and the assertion that they all agree.
 *
 * @remarks
 * Six apps render a comparison page from one shared module, in five different idioms — react-router
 * `<Link>`s, a Svelte store, a Vue ref, an Angular signal, and a hand-built DOM tree over a sixty-line
 * router. The claim is that none of that changed the answer.
 *
 * **The headline is the last test, not the loop.** Each shell's own test captures what that shell put
 * on screen; the final one requires all of them to be byte-identical. That is a stronger statement
 * than six separate "this shell looks right" assertions, and it is the only one that can catch a shell
 * which is self-consistently wrong — a Vue page that encoded in `compact` while the rest used
 * `human-readable`, say, would pass every per-shell check ever written and still hand a visitor a
 * different link than the page next door.
 *
 * ### Which shells run is DERIVED, never listed
 *
 * The loop filters `VERTICALS` on `routes.includes('/compare')`. A seventh vertical that ships the page
 * joins automatically; one that registers the route without shipping the page fails here by name
 * rather than 404-ing inside somebody else's comparison table. The count is asserted too, so a
 * registry edit that silently drops a shell from the run cannot pass as a shorter green suite — the
 * exact shape of the bug `compareLinks`' own six-link assertion exists for, one level up.
 *
 * ### What this deliberately does NOT do
 *
 * It never clicks a row. `compare.spec.ts` owns the cross-origin click-through — the part that proves
 * the links WORK, by booting each destination and requiring one settled result count across all six.
 * This file proves the links AGREE. Both matter and neither implies the other: six identical links
 * that all 404 would pass here, and six working links that differ per shell would pass there.
 *
 * It also never asserts SvelteKit's server rendering or its client-side toggle; `svelte-compare.spec.ts`
 * owns those, because neither behavior exists on the other five.
 *
 * @packageDocumentation
 */

import { expect, type Page, test } from '@playwright/test';

import {
	compareHeading,
	compareListLabel,
} from '../../packages/examples-shared/src/compare/copy.js';
import {
	type CompareDataset,
	DATASET_PARAM,
	DATASET_ROUTES,
	URL_STATE_PARAM,
	verticalsServing,
} from '../../packages/examples-shared/src/compare/links.js';
import { COMPARE_ROUTE } from '../../packages/examples-shared/src/compare/target.js';
import { VERTICALS } from '../../packages/examples-shared/src/verticals/verticals.js';

/** The dataset a cold visit lands on — every shell falls back to the same one. */
const DEFAULT_DATASET = 'books';

/** The one dataset NOT served by all six, and the reason this spec stopped saying "six". */
const WINE_SERVER_DATASET: CompareDataset = 'wine-server';

/** The serialized state, exactly as the six links carry it. */
const COMPARE_STATE_VALUE = '.fe-compare__state-value';

/** The `preset · <label>` provenance line. */
const COMPARE_STATE_LABEL = '.fe-compare__state-label';

/** One row's anchor. */
const COMPARE_ROW_LINK = '.fe-compare__list .fe-compare__row-name';

/**
 * The verticals under test, taken from the registry rather than restated.
 *
 * @remarks
 * `routes` is the same field `compareLinks` filters on, so this loop and the page's own link list can
 * never disagree about who ships `/compare`.
 */
const SHELLS = VERTICALS.filter((descriptor) => descriptor.routes.includes(COMPARE_ROUTE));

/** What one shell put on screen, for the agreement test to compare. */
interface RenderedTable {
	/** Every row's `href`, in render order. */
	readonly hrefs: readonly string[];
	/** The serialized state the page displays. */
	readonly serialized: string;
}

/** Per-shell captures, keyed by vertical id. Read by the final test; see its guard. */
const rendered = new Map<string, RenderedTable>();

/** Load a shell's `/compare` and read back what it rendered. */
async function readTable(page: Page, origin: string, dataset?: CompareDataset): Promise<RenderedTable> {
	// Appended rather than always present, so the default-visit cases keep exercising the COLD url.
	// `readCompareDataset(null)`'s fallback is its own contract, and a helper that always spelled
	// `?dataset=books` would have quietly stopped testing it.
	const query = dataset === undefined ? '' : `?${DATASET_PARAM}=${dataset}`;

	await page.goto(`${origin}${COMPARE_ROUTE}${query}`);

	const value = page.locator(COMPARE_STATE_VALUE);

	// Angular boots a lazy route chunk and the Vite apps boot a module graph; the state readout is the
	// first thing that cannot exist before the page has resolved its query. No engine, no corpus, so
	// this is quick everywhere — but the Angular bundle is the slowest of the five.
	await expect(value).toBeVisible({ timeout: 30_000 });
	await expect(value, 'the shell rendered no state to transport').not.toBeEmpty();

	return {
		hrefs: await page
			.locator(COMPARE_ROW_LINK)
			// The element generic is named for the reason `histogramSignature` names its own: the default
			// is a union whose `className` is `any` in TS 6's lib.dom, which degrades the expression to
			// `any` under typed lint.
			//
			// ⚠ THREE type arguments, and the `undefined` in the middle is load-bearing. Playwright 1.63
			// collapsed `evaluateAll`'s two overloads into one — `<R, Arg, E>(fn, arg?)` — removing the
			// no-arg `<R, E>(fn)` form this was written against (1.60 had both). With two arguments the
			// element type binds to `Arg` and `E` falls back to the union. Here that failed LOUDLY,
			// because `href` does not exist on `SVGElement` at all.
			.evaluateAll<string[], undefined, HTMLAnchorElement>((anchors) => anchors.map((anchor) => anchor.href)),
		serialized: (await value.textContent()) ?? '',
	};
}

test.describe.serial('/compare — every shell agrees', () => {
	// Module state outlives a worker's first project. Playwright normally spawns a fresh worker per
	// project, so this is belt-and-braces — but an agreement test comparing captures left behind by the
	// DESKTOP run while claiming to describe the mobile one would be a silent pass, and one line removes
	// the possibility rather than reasoning about it.
	test.beforeAll(() => {
		rendered.clear();
	});

	test('the registry lists every shell that was built', () => {
		// Cheap, and it fails first. Without it, a registry edit that drops a shell would leave the loop
		// below running five tests instead of six and the agreement test passing over a shorter set —
		// green, and quietly measuring less than it says.
		expect(
			SHELLS.map((descriptor) => descriptor.id),
			'a vertical that ships /compare must declare it in `routes`, or compareLinks will not link to it',
		).toEqual(VERTICALS.map((descriptor) => descriptor.id));
	});

	for (const descriptor of SHELLS) {
		test(`${descriptor.name} renders one link per serving vertical, from a cold visit`, async ({ page }) => {
			const table = await readTable(page, descriptor.devOrigin);
			const parsed = table.hrefs.map((href) => new URL(href));
			// `verticalsServing`, not `VERTICALS`: `DEFAULT_DATASET` is served by all six, so this is the
			// same assertion — but a dataset is not NECESSARILY six-wide (`wine-server` is two), and a
			// spec that says "six" would become wrong the moment this constant moved.
			// Deriving is safe HERE, unlike in `core.test.ts`: this compares a RENDERED page against the
			// registry, which is a different pair, and it is exactly how a shell that dropped a row gets
			// caught. See `verticalsServing`'s docblock.
			const serving = verticalsServing(DEFAULT_DATASET);

			expect(parsed).toHaveLength(serving.length);
			expect(parsed.map((url) => url.origin)).toEqual(serving.map((entry) => entry.devOrigin));
			expect(parsed.map((url) => url.pathname)).toEqual(serving.map(() => DATASET_ROUTES[DEFAULT_DATASET]));
			expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(
				serving.map(() => table.serialized),
			);

			// A cold visit must fall back to a preset, not to the empty state. `from your link` here
			// would mean a stale `?f=` leaked in from somewhere.
			await expect(page.locator(COMPARE_STATE_LABEL)).toHaveText(/^preset · /u);

			rendered.set(descriptor.id, table);
		});

		test(`${descriptor.name} renders the TWO wine-server rows, not six`, async ({ page }) => {
			// The point of the whole `wine-server` dataset, asserted where it can actually be wrong: in
			// a rendered shell. `verticalsServing` drops the four verticals with no server-filtered wine
			// route, leaving SvelteKit (the core in-process in its own server tier) and vanilla (the
			// same core across a process boundary over HTTP), and nothing else.
			//
			// It fans out to every shell rather than running once, because each of the four non-React
			// shells builds its own `/compare` over the shared core, and a two-row table is precisely
			// the case where a shell that assumed six breaks — a hardcoded "six" in a list label or
			// heading would read wrong over a two-row table. Cheap to fan out — `/compare` mounts no engine and loads no corpus, by design.
			const serving = verticalsServing(WINE_SERVER_DATASET);

			// Not derived: the roster is spelled out so this fails if the registry loses a server route,
			// rather than agreeing with whatever it now says. `core.test.ts` makes the same argument.
			expect(serving.map((entry) => entry.id)).toEqual(['sveltekit', 'vanilla']);

			const table = await readTable(page, descriptor.devOrigin, WINE_SERVER_DATASET);
			const parsed = table.hrefs.map((href) => new URL(href));

			expect(parsed).toHaveLength(serving.length);
			expect(parsed.map((url) => url.origin)).toEqual(serving.map((entry) => entry.devOrigin));
			expect(parsed.map((url) => url.pathname)).toEqual(
				serving.map(() => DATASET_ROUTES[WINE_SERVER_DATASET]),
			);

			// The assistive-tech half, which no visual assertion reaches and so the half most likely to go
			// stale. `getByRole('list', { name })` resolves the `<ul>` BY its accessible
			// name, so a stale "six" label fails to match rather than matching something else.
			await expect(page.getByRole('list', { name: compareListLabel(WINE_SERVER_DATASET) })).toBeVisible();
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(compareHeading(WINE_SERVER_DATASET));
		});
	}

	test('every shell serialized the identical state', () => {
		expect(
			rendered.size,
			'each shell contributes one capture — this test only means anything after the whole describe has run',
		).toBe(SHELLS.length);

		const byShell = [...rendered].map(([id, table]) => `${id}: ${table.serialized}`);

		expect(new Set([...rendered.values()].map((table) => table.serialized)).size, byShell.join('\n')).toBe(1);
	});

	test('every shell built the identical link list', () => {
		expect(rendered.size).toBe(SHELLS.length);

		// Compared as one joined string per shell rather than array-by-array: a mismatch then prints both
		// full link lists side by side, which names the offending row without the test having to.
		const joined = [...rendered].map(([id, table]) => [id, table.hrefs.join('\n')] as const);
		const [reference] = joined;

		expect(reference).toBeDefined();
		for (const [id, hrefs] of joined) {
			expect(hrefs, `${id} disagrees with ${reference?.[0]}`).toBe(reference?.[1]);
		}
	});
});
