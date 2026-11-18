/**
 * `mountWineRoute` shows the wine view only once the panel's first bundle has settled into it.
 *
 * @remarks
 * Appended at once (as it was), the view painted bare chips ("red") that widened a round trip later
 * ("red (1)") and moved the chips after them: a layout shift of up to 0.0004 at a desktop width wherever
 * no prerendered snapshot covered the boot. The boot screen now stays until the first fetch settles, and
 * the view replaces it already holding the counts.
 *
 * The engine answers its bundle query through a promise the case settles, as the worker and server tiers
 * do; `winePage.test.ts` drives the same shell over a main-thread answer.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { createFilterEngine, type FilterBundle, type FilterRule, type RuleId } from '@filter-enginez/core';
import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { signal } from '@preact/signals-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWineMaker } from '../test-support/wineFixture.js';
import { mountWineRoute } from './winePageShell.js';

const makeWine = createWineMaker({
	abv: 13.5,
	body: 'full',
	color: 'red',
	description: 'Cherry and oak.',
	designation: 'Estate',
	labelImage: '',
	name: 'A test wine',
	origin: { country: 'Italy', province: 'Sicily', region: 'Etna', subregion: '' },
	originId: 'Italy|Sicily|Etna',
	points: 92,
	priceUsd: 20,
	sweetness: 'bone-dry',
	tastingNotes: ['cherry'],
	varietal: 'Nebbiolo',
	vintage: 2015,
	winery: 'A test winery',
});

const WINES: readonly Wine[] = [makeWine({ id: 'a' }), makeWine({ color: 'white', id: 'b', varietal: 'Riesling' })];

/** The first bundle: one wine of each color. */
const FIRST_BUNDLE = {
	chipGroups: [
		{
			candidates: [
				{ projectedCount: 1, value: 'red', wouldBeEmpty: false },
				{ projectedCount: 1, value: 'white', wouldBeEmpty: false },
			],
			ruleId: 'color',
		},
	],
	fields: [],
	resultCount: WINES.length,
	resultIndices: new Uint32Array([0, 1]),
} as unknown as FilterBundle;

/** What the case's engine has been asked, each answered when the case says. */
let pending: ((bundle: FilterBundle) => void)[] = [];

/**
 * An engine whose bundle queries wait for the case, over a real core.
 *
 * @returns It.
 */
function asyncAnsweringEngine(): SignalsEngine<Wine> {
	const core = createFilterEngine<Wine>({ sourceData: WINES });

	return {
		activeRules: signal<ReadonlyMap<RuleId, FilterRule>>(core.getRules()),
		asyncEngine: {
			applyFiltersAndQuery: async (): Promise<FilterBundle> =>
				new Promise<FilterBundle>((resolve) => {
					pending.push(resolve);
				}),
		},
		core,
		dispose: (): void => undefined,
		expression: signal(null),
		lastChangeRuleId: signal<RuleId | null>(null),
		resultCount: signal(WINES.length),
		results: signal(core.getResults()),
	} as unknown as SignalsEngine<Wine>;
}

/**
 * Let a settled fetch's callbacks run.
 */
async function flush(): Promise<void> {
	for (let turn = 0; turn < 5; turn += 1) {
		await Promise.resolve();
	}
}

let container: HTMLElement;

beforeEach(() => {
	pending = [];
	window.history.replaceState(null, '', '/wine');
	container = document.createElement('div');
	container.innerHTML = '<main class="boot-screen">booting</main>';
	document.body.replaceChildren(container);
});

afterEach(() => {
	document.body.replaceChildren();
});

/**
 * Mount the route over a fresh engine.
 *
 * @returns Its teardown.
 */
function mount(): () => void {
	return mountWineRoute(container, {
		compareDataset: 'wine',
		engine: asyncAnsweringEngine(),
		footnote: 'test',
		subtitle: appHeaderSubtitle('Wine', 'vanilla', 'worker'),
	});
}

describe('mountWineRoute — the first bundle', () => {
	it('keeps the boot screen until the first bundle settles, then shows the view with the chips’ counts', async () => {
		const teardown = mount();

		expect(container.querySelector('.boot-screen'), 'the view replaced the boot screen before its bundle').not.toBeNull();
		expect(pending).toHaveLength(1);

		pending[0]?.(FIRST_BUNDLE);
		await flush();

		expect(container.querySelector('.boot-screen')).toBeNull();
		expect([...container.querySelectorAll('.fe-chip__count')].map((count) => count.textContent.trim())).toContain('(1)');
		teardown();
	});

	it('never shows the view after a teardown that came before the first bundle', async () => {
		const teardown = mount();

		teardown();
		pending[0]?.(FIRST_BUNDLE);
		await flush();

		expect(container.querySelector('.boot-screen')).not.toBeNull();
		expect(container.querySelector('.fe-chip')).toBeNull();
	});
});
