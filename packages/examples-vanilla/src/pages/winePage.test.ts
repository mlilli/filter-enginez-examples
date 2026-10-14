/**
 * The wine page's SUBSCRIPTION WIRING — specifically, that an expression-only change repaints.
 *
 * @remarks
 * ## The failure this exists to prevent
 *
 * Without the expression subscription, applying a smart-filter preset from a clean panel would move
 * the result count and nothing else: the results header would go on reading "No filters active"
 * over a visibly narrowed corpus, and no active-filter pill would appear.
 *
 * The cause would be an asymmetry in the async adapter, not in this page's DOM.
 * `createSignalsEngineFromAsync` routes an `expression` `ChangeEvent` to
 * `refreshExpressionAndResults`, which updates the expression, mode, results and result-count
 * mirrors and **deliberately not** the active-rules mirror — correctly, since the rule map really
 * did not change. A page that repainted its summaries only from the bundle fetch triggered by
 * `activeRules` would let an expression-only change reach the count and never reach the pills.
 *
 * **It only reproduces from a CLEAN panel.** With any facet rule active, applying a preset first
 * calls `clearAllFacetRules`, whose `rule:removed` events repaint as a side effect — so a manual
 * pass that tries a filter before a preset never sees it.
 *
 * ## Why the engine here is a hand-driven fake
 *
 * The failure is a WORKER-TIER asymmetry: two mirrors that move independently. A real main-thread
 * engine cannot exhibit it, because `createSignalsEngine` updates every mirror from one event and
 * an expression change would repaint through some other signal anyway. So the mirrors are plain
 * signals driven by hand, which is the only way to reproduce "expression moved, rules did not" —
 * the same reasoning that puts `facetState.test.ts`'s stale-rule-map cases against the adopter
 * rather than against a mounted panel.
 *
 * The `core` underneath is a REAL engine, so `getExpression()`, `getRules()` and
 * `applyFiltersAndQuery()` answer truthfully rather than from a stub that could agree with a bug.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { and, createFilterEngine, type FilterEngine, type FilterRule, inSet, type RuleId } from '@filter-enginez/core';
import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWineMaker } from '../test-support/wineFixture.js';

/** The mounted page's teardown, captured so each test can drop its subscriptions. */
type Teardown = () => void;

/**
 * This page's own row — a fuller, drier Nebbiolo at 92 points and $20.
 *
 * @remarks
 * Its defaults are NOT the canonical ones and must not become them: the header, card and preset
 * assertions below read this score and this price. `createWineMaker` layers nothing beneath what is
 * passed here, which is what keeps this suite independent of the other two.
 */
const makeWine = createWineMaker({
	abv: 13.5,
	body: 'full',
	color: 'red',
	description: 'Cherry and oak, a long finish.',
	designation: 'Estate',
	labelImage: '',
	name: 'A test wine',
	origin: { country: 'Italy', province: 'Sicily', region: 'Etna', subregion: '' },
	originId: 'Italy|Sicily|Etna',
	points: 92,
	priceUsd: 20,
	sweetness: 'bone-dry',
	tastingNotes: ['cherry', 'oak'],
	varietal: 'Nebbiolo',
	vintage: 2015,
	winery: 'A test winery',
});

const WINES: readonly Wine[] = [
	makeWine({ id: 'a' }),
	makeWine({ color: 'white', id: 'b', varietal: 'Riesling' }),
	makeWine({ id: 'c', priceUsd: 400 }),
];

/** The real core plus the hand-driven mirrors, shared between the mock factory and the tests. */
const core: FilterEngine<Wine> = createFilterEngine<Wine>({ sourceData: WINES });
const activeRules = signal<ReadonlyMap<RuleId, FilterRule>>(core.getRules());
const expression = signal<ReturnType<FilterEngine<Wine>['getExpression']>>(null);
const results = signal<readonly Wine[]>(core.getResults());
const resultCount = signal<number>(core.getResults().length);
const lastChangeRuleId = signal<RuleId | null>(null);

const fakeEngine = {
	activeRules,
	core,
	// Present because the page's teardown calls it. Deliberately NOT `core.destroy` — the core is
	// shared across tests here, and disposing it would make the teardown case's own cleanup break
	// every case that ran after it, which reads as a flaky suite rather than as the wiring bug.
	dispose: (): void => undefined,
	expression,
	lastChangeRuleId,
	resultCount,
	results,
};

vi.mock('@filter-enginez/examples-shared/wine-core', () => ({
	bootWineAsyncEngine: async (): Promise<unknown> => {
		await Promise.resolve();

		return { asyncEngine: {}, meta: { source: 'synthetic-full-tier' }};
	},
	describeWineCorpusTier: (): string => 'full corpus · synthetic',
	getWineBootProgressSnapshot: (): null => null,
	subscribeWineBootProgress: (): (() => void) => () => undefined,
}));

vi.mock('@filter-enginez/examples-shared/wine-worker-spawn', () => ({
	spawnWineWorker: (): unknown => ({}),
}));

vi.mock('@filter-enginez/reactive-signals/worker', () => ({
	createSignalsEngineFromAsync: async (): Promise<unknown> => {
		await Promise.resolve();

		return fakeEngine;
	},
}));

const { renderWinePage } = await import('./winePage.js');

/**
 * Let the bundle fetch and its `onSettled` repaint run.
 *
 * @returns Nothing; resolves after the microtask queue drains.
 */
async function settle(): Promise<void> {
	for (let index = 0; index < 5; index += 1) {
		await Promise.resolve();
	}
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe('vanilla wine page — repaint triggers', () => {
	let container: HTMLElement;
	let teardown: Teardown;

	beforeEach(async () => {
		document.body.replaceChildren();
		// The shell reads `?f` at mount, so the URL is part of this fixture — left dirty, one test's
		// shared link hydrates the next one's engine.
		window.history.replaceState(null, '', '/wine');
		core.clearRules();
		core.setExpression(null);
		activeRules.value = core.getRules();
		expression.value = null;
		container = document.createElement('div');
		document.body.append(container);
		teardown = await renderWinePage(container);
		await settle();
	});

	it('boots with exactly ONE bundle fetch, not one per subscription', async () => {
		// `@preact/signals-core` invokes a subscriber immediately with the current value, so an
		// expression subscription without its first-emission skip makes boot request the bundle TWICE
		// — once from `activeRules` and once from an expression that has not changed.
		//
		// The second request is a real round trip against 150,000 records on the worker tier, and its
		// settle repaints every panel section a few hundred milliseconds after the page already
		// looks interactive. In e2e that shows as a chip detaching from the DOM mid-click; the
		// user-visible version is a panel that flickers once, just as you reach for it.
		//
		// Counted on the ENGINE rather than on the fetcher, because the fetcher is shared code and
		// this is a claim about THIS page's wiring.
		const applyFiltersAndQuery = vi.spyOn(core, 'applyFiltersAndQuery');

		// Re-mount so the spy sees the boot itself; `beforeEach` has already mounted one.
		teardown();
		container.replaceChildren();
		teardown = await renderWinePage(container);
		await settle();

		expect(applyFiltersAndQuery).toHaveBeenCalledTimes(1);
		applyFiltersAndQuery.mockRestore();
	});

	it('offers the BROWSER-tier comparison, which is the half `/wine-server` inverts', () => {
		// `mountWineRoute` is shared verbatim by `/wine` and `/wine-server`, so a hardcoded
		// `createCompareLinkButton('wine')` would make the server route's Compare button offer the
		// six-way browser comparison instead of the two-row server one it exists to demonstrate.
		// Nothing would fail, because a wrong-but-valid target renders exactly like a right one.
		//
		// The chrome field is REQUIRED, so a caller cannot omit it; this asserts the remaining half,
		// that the shell passes the caller's value through rather than a literal. `/wine-server`'s side
		// is covered end-to-end in `vanilla-wine-server.spec.ts`, since asserting it here would mean
		// standing up the HTTP transport to prove a string.
		const compareLink = container.querySelector<HTMLAnchorElement>('a.fe-compare-link');

		expect(compareLink, 'the wine header lost its Compare button').not.toBeNull();
		expect(new URL(compareLink?.href ?? '').searchParams.get('dataset')).toBe('wine');
	});

	it('an EXPRESSION-only change repaints the active-filter pills', async () => {
		// The clean-panel precondition is the whole point — see the docblock. No facet rule is set,
		// so nothing will emit on `activeRules` and this page's other repaint trigger stays silent.
		expect(activeRules.value.size).toBe(0);
		expect(container.querySelectorAll('.fe-filter-chip')).toHaveLength(0);

		// Exactly what a preset does: an expression on the real core, and the expression mirror
		// moving WITHOUT the rule mirror. Reproducing that split is why the mirrors are hand-driven.
		core.setExpression(and(inSet<string>('color', ['red'])));
		expression.value = core.getExpression();

		await settle();

		expect(activeRules.value.size, 'the rule map must stay empty, or this tests the wrong path').toBe(0);
		expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);
	});

	it('clearing the expression takes the pill back down', async () => {
		core.setExpression(and(inSet<string>('color', ['red'])));
		expression.value = core.getExpression();
		await settle();
		expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);

		core.setExpression(null);
		expression.value = null;
		await settle();

		expect(container.querySelectorAll('.fe-filter-chip')).toHaveLength(0);
	});

	it('tears the expression subscription down', async () => {
		// **Prove the subscription is LIVE first.** Asserting only that nothing repaints after
		// teardown passes just as happily against a page that never subscribed at all — verified by
		// mutation: with the subscription deleted, the absence-only version of this case stayed
		// green while the two above went red. A teardown test that cannot tell "unsubscribed" from
		// "never subscribed" is testing nothing.
		core.setExpression(and(inSet<string>('color', ['red'])));
		expression.value = core.getExpression();
		await settle();
		expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);

		teardown();

		core.setExpression(null);
		expression.value = null;
		await settle();

		// Still up: the repaint that would have cleared it is exactly what teardown dropped.
		expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);
	});

	/**
	 * Re-mount the page over the current URL.
	 *
	 * @remarks
	 * `beforeEach` has already mounted one against a clean `/wine`, and the shell reads `?f` exactly
	 * once at boot — so a shared-link test has to tear that down and come back through the front door
	 * rather than poke the engine.
	 *
	 * @returns Nothing; resolves once the boot and its first bundle have settled.
	 */
	async function remount(): Promise<void> {
		teardown();
		container.replaceChildren();
		teardown = await renderWinePage(container);
		await settle();
	}

	it('hydrates a shared ?f link into the engine before wiring the write-back', async () => {
		// The order is the point, and it is why the shell does this before subscribing: hydrate after
		// wiring and the first write-back re-serializes the neutral state over the link that was just
		// opened, so the URL a user pasted is gone before they can read it.
		core.addRule('color', inSet<string>('color', ['red']));

		const serialized = `h~${JSON.stringify(core.exportConfig())}`;

		core.clearRules();
		window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(serialized)}`);
		await remount();

		expect(core.getRules().size).toBe(1);
		expect(core.getRules().has('color')).toBe(true);
	});

	it('boots neutral on a MALFORMED ?f rather than failing to render', async () => {
		// A link from an older build, a truncated paste, a hand-edited query. The route has to come up
		// filterless — a page that throws here is a blank screen for a URL the user cannot see is bad.
		window.history.replaceState(
			null,
			'',
			`/wine?f=${encodeURIComponent('h~{"version":1,"rules":[{"id":"x","type":"not-a-real-rule","config":{}}]}')}`,
		);
		await remount();

		expect(core.getRules().size).toBe(0);
		expect(container.querySelector('.fe-books-app')).not.toBeNull();
	});

	it('logs a failed bundle fetch and keeps the panel usable', async () => {
		// Predictive disable is an ENHANCEMENT: a failed round trip must leave the previous hints and
		// a working panel, not an error state. The `onError` handler is the one branch of the
		// fetcher's three that no other case reaches.
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const applyFiltersAndQuery = vi.spyOn(core, 'applyFiltersAndQuery').mockImplementation(() => {
			throw new Error('bundle boom');
		});

		core.addRule('color', inSet<string>('color', ['red']));
		activeRules.value = core.getRules();
		await settle();

		expect(applyFiltersAndQuery).toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith('[wine] bundle fetch failed:', expect.any(Error));
		// The panel is still there — `onSettled` repaints from the new rules with the previous bundle.
		expect(container.querySelector('.fe-filter-panel')).not.toBeNull();

		applyFiltersAndQuery.mockRestore();
		consoleError.mockRestore();
	});
});
