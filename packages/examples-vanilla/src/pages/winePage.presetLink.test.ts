/**
 * A smart-filter preset restored from a shared `?f` link, then cleared through the panel.
 *
 * @remarks
 * The round trip every vertical must survive: a link carrying a preset's expression opens with the
 * preset lit and the corpus narrowed, and clearing the preset in the panel brings back the WHOLE
 * corpus with no rule left registered. Run twice — once over a config whose expression leaves carry
 * the `inline: true` mark the current engine writes, and once over the same config with the marks
 * stripped, which is how engine 0.0.3 wrote them (the reserved `__inline_<n>` ids alone). If either
 * form registered the leaves as ordinary rules, clearing the preset would leave them filtering with
 * no control on screen to explain why.
 *
 * Mounted through the real `mountWineRoute` over a main-thread signals engine, so the URL hydration,
 * the bundle fetcher, the busy wiring and the panel are the production ones.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngineConfig } from '@filter-enginez/core';
import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { buildSmartFilterExpression, wineBusyCore } from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RouteTeardown } from '../router.js';

import { makeWine } from '../test-support/wineFixture.js';
import { mountWineRoute } from './winePageShell.js';

/** Two bottles the "Bold reds" preset keeps (red, ≤ $25, ≥ 88 pts) and two it drops. */
const WINES: readonly Wine[] = [
	makeWine({ id: 'bold-1', points: 90, priceUsd: 20 }),
	makeWine({ id: 'bold-2', points: 92, priceUsd: 24 }),
	makeWine({ id: 'pricey', points: 95, priceUsd: 80 }),
	makeWine({ color: 'white', id: 'white', points: 91, priceUsd: 18 }),
];

/** The preset the link carries. */
const PRESET_ID = 'bold-reds';

let teardown: RouteTeardown | null = null;

afterEach(() => {
	teardown?.();
	teardown = null;
	wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());
	window.history.replaceState(null, '', '/');
	document.body.replaceChildren();
});

/**
 * Export the preset's config the way a shared link carries it.
 *
 * @param hasInlineMarks - `true` for the current engine's `inline: true` marks; `false` strips them,
 *   as engine 0.0.3 wrote the same config.
 * @returns The config.
 */
function presetConfig(hasInlineMarks: boolean): FilterEngineConfig {
	const source = createFilterEngine<Wine>({ sourceData: WINES });

	source.setExpression(buildSmartFilterExpression([PRESET_ID]));

	const config = source.exportConfig();

	if (hasInlineMarks) {
		return config;
	}

	return {
		...config,
		rules: config.rules.map((entry) => {
			const unmarked = { ...entry };

			delete unmarked.inline;

			return unmarked;
		}),
	};
}

/**
 * Open `/wine?f=<config>` and mount the route over a fresh main-thread engine.
 *
 * @param config - The config the link carries.
 * @returns The engine's core and the mounted container.
 */
function openLink(config: FilterEngineConfig) {
	window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(`h~${JSON.stringify(config)}`)}`);

	const core = createFilterEngine<Wine>({ sourceData: WINES });
	const container = document.createElement('div');

	document.body.append(container);
	teardown = mountWineRoute(container, {
		compareDataset: 'wine',
		engine: createSignalsEngine(core),
		footnote: 'test',
		subtitle: appHeaderSubtitle('Wine', 'vanilla'),
	});

	return { container, core };
}

/** The "Bold reds" preset chip. */
function presetChip(container: HTMLElement): HTMLButtonElement {
	const chip = [...container.querySelectorAll<HTMLButtonElement>('.fe-chip')].find(
		(node) => node.textContent === 'Bold reds',
	);

	if (chip === undefined) {
		throw new Error('expected the "Bold reds" preset chip');
	}

	return chip;
}

describe.each([
	{ form: 'with inline marks (the current engine)', hasInlineMarks: true },
	{ form: 'without inline marks (as engine 0.0.3 wrote it)', hasInlineMarks: false },
])('a preset link $form', ({ hasInlineMarks }) => {
	it('carries the preset as inline leaves, the form the round trip below depends on', () => {
		const config = presetConfig(hasInlineMarks);

		expect(config.expression).toBeDefined();
		expect(config.rules.length).toBeGreaterThan(0);
		expect(config.rules.every((entry) => entry.id.startsWith('__inline_'))).toBe(true);
		expect(config.rules.some((entry) => entry.inline === true)).toBe(hasInlineMarks);
	});

	it('opens with the preset lit, the corpus narrowed and no rule registered', () => {
		const { container, core } = openLink(presetConfig(hasInlineMarks));

		expect(core.getExpression()).not.toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResults().map((wine) => wine.id)).toEqual(['bold-1', 'bold-2']);
		expect(presetChip(container).getAttribute('aria-pressed')).toBe('true');
	});

	it('gets the full corpus back with no rules registered once the preset is cleared in the panel', () => {
		const { container, core } = openLink(presetConfig(hasInlineMarks));

		container.querySelector<HTMLButtonElement>('.fe-wine-smart__clear')?.click();

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResults()).toHaveLength(WINES.length);
		expect(presetChip(container).getAttribute('aria-pressed')).toBe('false');
		expect(container.querySelector('.fe-filter-panel__body')?.hasAttribute('inert')).toBe(false);
		expect(container.querySelector('.fe-active-filters__empty')?.getAttribute('style') ?? '').not.toContain('none');
	});

	it('does the same when the lit preset chip itself is toggled off', () => {
		const { container, core } = openLink(presetConfig(hasInlineMarks));

		presetChip(container).click();

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResults()).toHaveLength(WINES.length);
	});
});

describe('busy marking through the mounted route', () => {
	it('lights on the click, holds through one painted frame after the bundle settles, then clears', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']});

		try {
			window.history.replaceState(null, '', '/wine');

			const core = createFilterEngine<Wine>({ sourceData: WINES });
			const container = document.createElement('div');

			document.body.append(container);
			teardown = mountWineRoute(container, {
				compareDataset: 'wine',
				engine: createSignalsEngine(core),
				footnote: 'test',
				subtitle: appHeaderSubtitle('Wine', 'vanilla'),
			});
			vi.advanceTimersToNextFrame();
			vi.advanceTimersToNextFrame();

			const indicator = container.querySelector('.fe-computing-indicator');
			const body = container.querySelector('.fe-filter-panel__body');

			presetChip(container).click();

			expect(indicator?.getAttribute('aria-label')).toBe('Engine computing');
			expect(body?.getAttribute('aria-busy')).toBe('false');
			expect(wineBusyCore.getIsEngineBusy()).toBe(true);

			vi.advanceTimersToNextFrame();
			expect(wineBusyCore.getIsEngineBusy()).toBe(true);

			vi.advanceTimersToNextFrame();
			expect(wineBusyCore.getIsEngineBusy()).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('marks busy for undo from the devtools, which the engine then settles', () => {
		window.history.replaceState(null, '', '/wine');

		const core = createFilterEngine<Wine>({ sourceData: WINES });
		const container = document.createElement('div');

		document.body.append(container);
		teardown = mountWineRoute(container, {
			compareDataset: 'wine',
			engine: createSignalsEngine(core),
			footnote: 'test',
			subtitle: appHeaderSubtitle('Wine', 'vanilla'),
		});
		presetChip(container).click();
		wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());

		container.querySelector<HTMLButtonElement>('[aria-label="Undo (Cmd/Ctrl+Z)"]')?.click();

		expect(wineBusyCore.getIsEngineBusy()).toBe(true);
		expect(core.getExpression()).toBeNull();
	});
});
