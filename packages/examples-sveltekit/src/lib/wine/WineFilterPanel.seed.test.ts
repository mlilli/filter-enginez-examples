/**
 * Mount the wine panel over an engine that ALREADY carries rules, and assert the controls reflect them.
 *
 * @remarks
 * Every rule is on the engine before the panel mounts (`routes/wine/+page.svelte` calls
 * `core.loadConfig(urlConfig)` first), so a control that mirrored its state in `$state` initialized to
 * empty would render blank over correct results. React's `WineFilterPanel.test.tsx` asserts predictive
 * DISABLED-ness over a pre-mount rule, and `svelte-wine.spec.ts` asserts the results-header pill and the
 * count after a `?f` reload; this suite asserts the seeded controls' own selected state.
 *
 * The consequence would be worse than cosmetic, which is what the last test here pins: with two values
 * restored and an empty local array, clicking a third chip would write a ONE-element set and silently
 * drop the other two.
 *
 * **A main-thread engine, deliberately.** The behavior is about what a control reads at MOUNT, which is
 * tier-independent; a worker or HTTP engine would add a round trip to every assertion and test the
 * transport instead. `WineView.clearAll.test.ts` is the suite that needs the async tier, and says so.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, fuzzy, inSet, inSetofSets, range } from '@filter-enginez/core';
import {
	buildOriginNodeSpecs,
	type OriginNodeSpec,
	type PickerTreeNode,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import WineFilterPanel from './WineFilterPanel.svelte';

/**
 * A tiny corpus carrying only the fields the panel's vocabularies and rules touch.
 *
 * @remarks
 * The panel derives nothing from the corpus itself — vocabularies and the origin tree arrive as props
 * — so these rows exist to give the engine something to filter, not to shape the controls.
 */
const ROWS = [
	{ abv: 13.5, color: 'red', description: 'cherry and oak', id: 'a', originId: 'France|Bordeaux', points: 92, priceUsd: 40, varietal: 'Merlot', vintage: 2018 },
	{ abv: 12, color: 'white', description: 'citrus and slate', id: 'b', originId: 'France|Burgundy', points: 88, priceUsd: 22, varietal: 'Chardonnay', vintage: 2020 },
	{ abv: 14, color: 'rosé', description: 'strawberry', id: 'c', originId: 'Italy|Tuscany', points: 90, priceUsd: 31, varietal: 'Sangiovese', vintage: 2019 },
];

const VOCABULARIES: WineChipVocabularies = {
	body: [],
	color: ['red', 'white', 'rosé'],
	sweetness: [],
	varietal: ['Chardonnay', 'Merlot', 'Sangiovese'],
};

/**
 * A two-country origin hierarchy.
 *
 * @remarks
 * France has TWO children on purpose. A branch with exactly one leaf shares that leaf's id set, which
 * `deriveOriginSelection` resolves by depth — a real ambiguity, pinned by that function's own tests. A
 * two-child branch has a set no leaf can produce, so a country selection here proves the branch match
 * rather than accidentally matching a leaf.
 */
const ORIGIN_TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'France|Bordeaux', label: 'Bordeaux' },
				{ id: 'France|Burgundy', label: 'Burgundy' },
			],
			id: 'France',
			label: 'France',
		},
		{ children: [{ id: 'Italy|Tuscany', label: 'Tuscany' }], id: 'Italy', label: 'Italy' },
	],
	id: 'world',
	label: 'World',
};

const ORIGIN_SPECS: readonly OriginNodeSpec[] = buildOriginNodeSpecs(ORIGIN_TREE);

// No auto-cleanup in this workspace, so trees would otherwise accumulate across tests.
afterEach(cleanup);

/**
 * Mount the panel over an engine seeded exactly the way a `?f` restore leaves it — rules applied
 * BEFORE the component exists.
 *
 * @param seed - Applies the pre-existing rules.
 * @returns The rendered result plus the engine, so a test can assert against both.
 */
function renderSeededPanel(seed: (core: FilterEngine<Wine>) => void) {
	const core = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });

	seed(core);

	const engine = createSignalsEngine(core);
	const view = render(WineFilterPanel, {
		props: { engine, originSpecs: ORIGIN_SPECS, originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
	});

	return { ...view, engine };
}

describe('<WineFilterPanel> over an engine with pre-existing rules', () => {
	it('lights the chips named by a committed InSet rule', async () => {
		const { getByRole } = renderSeededPanel((core) => {
			core.addRule('color', inSet<string>('color', ['red', 'white']));
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'red' }).getAttribute('aria-pressed')).toBe('true');
		});
		expect(getByRole('button', { name: 'white' }).getAttribute('aria-pressed')).toBe('true');
		// The negative half. A panel that marked everything selected would pass the two above.
		expect(getByRole('button', { name: 'rosé' }).getAttribute('aria-pressed')).toBe('false');
	});

	it('positions a range slider from a committed RangeRule', async () => {
		const { getByDisplayValue } = renderSeededPanel((core) => {
			core.addRule('price', range('priceUsd', { max: 35, min: 25 }));
		});

		// The slider's editable readouts, which is where the committed bounds surface as text.
		await waitFor(() => {
			expect(getByDisplayValue('$25')).toBeTruthy();
		});
		expect(getByDisplayValue('$35')).toBeTruthy();
	});

	it('checks the origin node a committed inSetOfSets rule describes', async () => {
		// End-to-end over `deriveOriginSelection`: the rule stores LEAF-ID SETS, and only matching those
		// back against the flattened specs recovers which node the user picked. A branch is the hard
		// case — its set is its own id plus its children's, which no single leaf can produce. The set is
		// read off the built specs rather than restated, so it is exactly what selecting France commits.
		const franceIds = ORIGIN_SPECS.find((spec) => spec.value === 'France')?.leafIds ?? [];

		expect(franceIds).toEqual(['France', 'France|Bordeaux', 'France|Burgundy']);
		const { getByRole } = renderSeededPanel((core) => {
			core.addRule('origin', inSetofSets<string>('originId', [franceIds]));
		});

		await waitFor(() => {
			expect(getByRole('checkbox', { name: /France/ }).getAttribute('aria-checked')).toBe('true');
		});
		expect(getByRole('checkbox', { name: /Italy/ }).getAttribute('aria-checked')).toBe('false');
	});

	it('fills the search box from a committed fuzzy rule', async () => {
		// The writable-`$derived` path. A plain `$state` here would leave the input blank after a shared
		// link restored the filter, so the user could not see what they were searching for.
		const { getByLabelText } = renderSeededPanel((core) => {
			core.addRule('notes', fuzzy('description', { keys: ['description'], query: 'cherry', threshold: 0.45 }));
		});

		await waitFor(() => {
			expect((getByLabelText('Search tasting notes') as HTMLInputElement).value).toBe('cherry');
		});
	});

	it('ADDS to a restored selection rather than replacing it', async () => {
		// The consequence, and the only test here that fails loudly rather than looking cosmetic. With
		// two values on the engine and an empty local array, a toggle handler would compute its next
		// selection from the empty array and commit a ONE-element set, silently discarding the two
		// restored values. The count still moves, so nothing else in the suite would notice.
		const { engine, getByRole } = renderSeededPanel((core) => {
			core.addRule('color', inSet<string>('color', ['red', 'white']));
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'red' }).getAttribute('aria-pressed')).toBe('true');
		});
		await fireEvent.click(getByRole('button', { name: 'rosé' }));

		await waitFor(() => {
			const rule = engine.core.getRules().get('color') as { config: { set: readonly string[] }} | undefined;

			expect([...(rule?.config.set ?? [])].sort()).toEqual(['red', 'rosé', 'white']);
		});
	});
});
