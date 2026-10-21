/**
 * Tests for `wine/choiceSections.ts` — the two controls the view suite does not click.
 *
 * @remarks
 * ### 🔴 Only the sites no other suite reaches
 *
 * A throw-mutant probe against the WHOLE `packages/examples-vanilla` suite — not against
 * `wine/view.test.ts` alone, because coverage is transitive — shows the rest of the suite already
 * drives all three vocabulary arms of `chipOptions`, the full-count varietal label, the chip
 * `onToggle`, both arms of `committedSet`, `committedValue`'s empty fallback, and `read`'s
 * absent-rule arm.
 *
 * What remains is not six unrelated sites — it is **two controls**, the exact-color select and the
 * origin picker, and `wine/view.test.ts` clicks neither. That is why this file is short: five cases
 * close those six sites, and the sixth case exists because a verification mutant written against the
 * docblock (X8) would otherwise survive — see the last case here.
 *
 * ### What predicts coverage is WHEN the code runs, not what kind of code it is
 *
 * This module holds real decisions — the canonical vocabulary ordering, the varietal chip limit, the
 * compact-not-closure origin read — but every one of them runs at construction or on the repaint every
 * mount performs, and the panel builds all six sections unconditionally, so any test that mounts
 * drives them. What no other test
 * reaches is what only an interaction reaches.
 *
 * "Holds decisions rather than wiring" and "no test reaches it" are different claims, and only the
 * second is about coverage.
 *
 * ### The two contracts worth pinning, and neither is a percentage
 *
 * **The select must CLEAR by removing the rule.** `ValueRule`'s config IS its value rather than an
 * object wrapping it, so a `ValueRule` holding `''` is not an absent filter — it matches only wines
 * whose color is the empty string, which is none of them. Choosing the placeholder has to remove the
 * rule outright, and the case below asserts `has(...) === false` rather than inspecting a rule that
 * should not exist.
 *
 * **The origin selection must be COMPACT.** `deriveOriginSelection` recovers the highest selected
 * node per branch from the committed leaf sets, never the closure. Both forms render identically —
 * a country whose descendants are all selected resolves `checked` either way — so the difference is
 * observable only in what the NEXT click does. That is what the last case drives: with the compact
 * form one click on a committed country clears the facet; with the closure it would strip the
 * country and leave its provinces filtering.
 *
 * ### 🟢 The row maker and the panel mounter are shared FACTORIES, not shared data
 *
 * The objection to sharing either is that suites differ in their DATA, and that a shared row or a
 * shared corpus would couple separate suites' expectations to one line.
 *
 * **That objection is answered by what gets shared, not by declining to share.** Both live in
 * `test-support/` as a FACTORY over the caller's own data — `createWineMaker(defaults)` and
 * `createWinePanelMounter(data)` layer nothing beneath what a suite passes. The duplicated logic has
 * one home; {@link DATA} and its result counts stay here, where the assertions that read them are.
 * `wine/sliderSections.test.ts` uses the identical panel seam.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { inSet, inSetofSets, type InSetofSetsRule, value, type ValueRule } from '@filter-enginez/core';
import { VARIETAL_CHIP_LIMIT } from '@filter-enginez/examples-shared/wine-domain';
import { afterEach, describe, expect, it } from 'vitest';

import { makeWine } from '../test-support/wineFixture.js';
import { createWinePanelMounter } from '../test-support/winePanelHarness.js';

/**
 * Three wines: an Italian country node with TWO provinces beneath it, and a second country.
 *
 * @remarks
 * The two provinces are what make the last two cases mean anything. With one province, the country
 * and its single branch would cover the same wines, so "the compact node for this set" would be
 * satisfied by whichever node happened to be checked first. With two, the set covering both
 * provinces belongs to `Italy` and to nothing else.
 */
const DATA: readonly Wine[] = [
	makeWine({ id: 'a' }),
	makeWine({
		id: 'b',
		origin: { country: 'Italy', province: 'Piedmont', region: 'Barolo', subregion: '' },
		originId: 'Italy|Piedmont|Barolo',
		varietal: 'Nebbiolo',
	}),
	makeWine({
		color: 'white',
		id: 'c',
		origin: { country: 'France', province: 'Burgundy', region: 'Chablis', subregion: '' },
		originId: 'France|Burgundy|Chablis',
		varietal: 'Chardonnay',
	}),
];

/**
 * Every origin id selecting `Italy` matches, in the pre-order the spec walk emits them.
 *
 * @remarks
 * A node matches its own id as well as every id beneath it, because a wine's `originId` stops at the
 * deepest level the wine names (`OriginNodeSpec.leafIds` explains why). Siblings are ordered by wine
 * count, and these two provinces hold one wine each, so the tie falls to `localeCompare` and Piedmont
 * precedes Sicily. `deriveOriginSelection` keys on a SORTED copy, so this order is a readability
 * choice rather than a load-bearing one — but the commit-side assertion compares the array as
 * written, and that one does depend on it.
 */
const ITALY_ORIGIN_IDS: readonly string[] = [
	'Italy',
	'Italy|Piedmont',
	'Italy|Piedmont|Barolo',
	'Italy|Sicily',
	'Italy|Sicily|Etna',
];

/**
 * Mount the wine panel over a fresh engine, optionally pre-seeded.
 *
 * @remarks
 * The mount itself lives in `test-support/winePanelHarness`, which documents the three properties
 * every caller leans on — the hand-driven repaint, the seed running BEFORE construction, and the one
 * repaint at mount. What stays here is {@link DATA}: the factory is shared, the corpus is not.
 */
const mountPanel = createWinePanelMounter(DATA);

/**
 * The exact-color `<select>`, found by its accessible name.
 *
 * @remarks
 * By `aria-label` rather than by walking to the section heading: the score-comparison facet renders a
 * `.fe-select__field` too, so the class alone is ambiguous, and the accessible name is what a user
 * would identify this control by anyway.
 *
 * @param root - The mounted root.
 * @returns The select element.
 */
function colorSelect(root: HTMLElement): HTMLSelectElement {
	const field = root.querySelector<HTMLSelectElement>(
		'select[aria-label="Filter by exact wine color"]',
	);

	if (field === null) {
		throw new Error('expected the exact-color select');
	}

	return field;
}

/**
 * Choose a value in the exact-color select the way a user does.
 *
 * @param root - The mounted root.
 * @param next - The color, or `''` for the placeholder.
 */
function chooseColor(root: HTMLElement, next: string): void {
	const field = colorSelect(root);

	field.value = next;
	field.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * The origin picker's selection button for one node, by its visible label.
 *
 * @remarks
 * The row's own text would also carry the tri-state mark glyph and, once a bundle has settled, a
 * projected count — so the label span is what gets compared, not the button.
 *
 * @param root - The mounted root.
 * @param label - The node's label, e.g. `Italy`.
 * @returns The `role="checkbox"` button for that node.
 */
function originRow(root: HTMLElement, label: string): HTMLButtonElement {
	const group = root.querySelector('[role="group"][aria-label="Origin"]');
	const row = Array.from(group?.querySelectorAll<HTMLButtonElement>('[role="checkbox"]') ?? []).find(
		(node) => node.querySelector('.fe-tree__label')?.textContent === label,
	);

	if (row === undefined) {
		throw new Error(`expected an origin row labelled "${label}"`);
	}

	return row;
}

/**
 * One more varietal than the chip limit, with the extra one the rarest.
 *
 * @remarks
 * Every common varietal carries two wines and `Rare Grape` carries one, so the frequency ranking puts
 * it last whatever the tie-break among the others — the one varietal the limit leaves out.
 */
const MANY_VARIETALS: readonly Wine[] = [
	...Array.from({ length: VARIETAL_CHIP_LIMIT }, (_, index) => {
		const varietal = `Grape ${String(index).padStart(2, '0')}`;

		return [makeWine({ id: `${varietal} a`, varietal }), makeWine({ id: `${varietal} b`, varietal })];
	}).flat(),
	makeWine({ id: 'rare', varietal: 'Rare Grape' }),
];

const mountManyVarietals = createWinePanelMounter(MANY_VARIETALS);

/**
 * The varietal chips' labels, in render order.
 *
 * @param root - The mounted root.
 * @returns Each chip's text.
 */
function varietalChips(root: HTMLElement): readonly string[] {
	const heading = Array.from(root.querySelectorAll('h3')).find((node) => node.textContent.startsWith('Varietal'));

	return Array.from(heading?.parentElement?.querySelectorAll('.fe-chip') ?? []).map((chip) => chip.textContent);
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('the varietal chips', () => {
	it('shows the most-reviewed varietals up to the limit, under a heading with the full count', () => {
		const { root } = mountManyVarietals();
		const chips = varietalChips(root);

		expect(chips).toHaveLength(VARIETAL_CHIP_LIMIT);
		expect(chips).not.toContain('Rare Grape');
		expect(root.textContent).toContain(`Varietal (${String(VARIETAL_CHIP_LIMIT + 1)})`);
	});

	it('keeps a selected varietal beyond the limit visible, so it can be cleared where it is shown', () => {
		// The shared-link shape: a rare grape committed before the panel exists. Without its chip the
		// facet would filter with nothing on screen to say so, and nothing to click to undo it.
		const { core, root } = mountManyVarietals((engine) => {
			engine.addRule('varietal', inSet<string>('varietal', ['Rare Grape']));
		});

		expect(varietalChips(root)).toContain('Rare Grape');

		const rareChip = Array.from(root.querySelectorAll<HTMLButtonElement>('.fe-chip')).find(
			(chip) => chip.textContent === 'Rare Grape',
		);

		expect(rareChip?.getAttribute('aria-pressed')).toBe('true');

		expect(core.getResultCount()).toBe(1);

		rareChip?.click();

		expect(core.getRules().has('varietal')).toBe(false);
		expect(core.getResultCount()).toBe(MANY_VARIETALS.length);
	});
});

describe('the exact-color select', () => {
	it('commits the chosen color as a ValueRule, beside the chips rather than instead of them', () => {
		const { core, root } = mountPanel();

		chooseColor(root, 'white');

		const rule = core.getRules().get('color-value') as ValueRule<string> | undefined;

		// The FIELD as well as the value. This facet and the color chips constrain the same `color`
		// property under two different rule ids, and that is the whole reason the section exists — it
		// contrasts an exact-match rule with a set-membership one. A rule id that collided, or a field
		// that did not, would leave the two facets silently fighting over one filter.
		expect(rule?.field).toBe('color');
		expect(rule?.config).toBe('white');
		expect(core.getRules().has('color')).toBe(false);
		expect(core.getResultCount()).toBe(1);
	});

	it('REMOVES the rule when the placeholder is chosen', () => {
		// Not a `ValueRule` holding `''` — see the file docblock. `ValueRule`'s config IS its value, so
		// the empty string is a filter for wines with no color at all, and the results would go to zero
		// while the panel shows the facet switched off.
		const { core, root } = mountPanel();

		chooseColor(root, 'white');

		expect(core.getRules().has('color-value')).toBe(true);

		chooseColor(root, '');

		expect(core.getRules().has('color-value')).toBe(false);
		expect(core.getResultCount()).toBe(DATA.length);
	});

	it('opens on a color a shared link already committed', () => {
		// 🔴 What this proves, and — the more useful half — what it does NOT.
		//
		// It proves the panel renders the committed color rather than the placeholder when the rule was
		// in the engine before construction, which is the `/wine` shared-link shape: the route calls
		// `core.loadConfig(urlConfig)` and only then builds the panel.
		//
		// It does NOT prove that the CONSTRUCTOR read is what put it there, and no test in this package
		// can. Mutant X4 (`createFacetAdopter<string>('')` — seed blank) survives against the whole
		// package, because the seed is unobservable through this seam: the select renders nothing until
		// `update` runs, and `update` adopts first — so a blank seed adopts `white` on that same pass
		// and lands in the identical place. The seed is load-bearing in the reactive verticals, where
		// the first render comes straight from local state; here it is belt-and-braces.
		//
		// Written down rather than asserted, because an assertion that passes on a mechanism other than
		// the one it names is indistinguishable from green.
		const { root } = mountPanel((engine) => {
			engine.addRule('color-value', value<string>('color', 'white'));
		});

		expect(colorSelect(root).value).toBe('white');
	});

	it('does not un-paint a choice when a repaint carries a STALE rule map', () => {
		// The worker-lag shape, reproduced on a main-thread engine, and the reason every facet in this
		// panel holds local state at all. `/wine` filters 150,000 records behind Comlink, so the settle in
		// flight when the user picks a color always carries the PRE-choice rule map. A select that
		// adopted it unconditionally would snap back to the placeholder on every single interaction —
		// invisible here, glaring over a worker.
		//
		// `wine/view.test.ts` pins this for the chips; this is the same contract on the control it does
		// not click.
		const { core, repaint, root } = mountPanel();
		// Copied, not aliased: `getRules()` may hand back the engine's live map, which would contain the
		// choice by the time it is read back — and the case would then pass without asserting anything.
		const stale = new Map(core.getRules());

		chooseColor(root, 'white');
		repaint(stale);

		expect(stale.has('color-value')).toBe(false);
		expect(colorSelect(root).value).toBe('white');
	});
});

describe('canonical option order', () => {
	// `dessert` streams first and `sparkling` before `red`, so raw vocabulary order and alphabetical
	// order would both put them ahead of red; the canonical order does not.
	const mountMixed = createWinePanelMounter([
		makeWine({ color: 'dessert', id: 'x1' }),
		makeWine({ color: 'sparkling', id: 'x2' }),
		makeWine({ color: 'red', id: 'x3' }),
	]);

	it('lists the single-color menu in COLOR_ORDER, like the chips above it', () => {
		const { root } = mountMixed();
		const select = root.querySelector<HTMLSelectElement>('select[aria-label="Filter by exact wine color"]');
		const values = [...(select?.options ?? [])].map((option) => option.value).filter((entry) => entry !== '');

		expect(values).toEqual(['red', 'sparkling', 'dessert']);
	});

	it('lists the color chips in the same order', () => {
		const { root } = mountMixed();
		const colorSection = [...root.querySelectorAll('section')].find(
			(node) => node.querySelector('.fe-filter-section-label')?.textContent === 'Color',
		);
		const chips = [...(colorSection?.querySelectorAll('.fe-chip') ?? [])].map((chip) => chip.firstChild?.textContent);

		expect(chips).toEqual(['red', 'sparkling', 'dessert']);
	});
});

describe('the origin picker', () => {
	it('is the shared origin tree: its group name and its viewport height', () => {
		const { root } = mountPanel();
		const tree = root.querySelector<HTMLElement>('.fe-tree');

		expect(tree?.getAttribute('role')).toBe('group');
		expect(tree?.getAttribute('aria-label')).toBe('Origin');
		expect(tree?.style.getPropertyValue('--fe-tree-max-height')).toBe('16rem');
	});

	it('commits a country as the set of origin ids at and beneath it', () => {
		// One click covers a whole subtree without the rule understanding hierarchy: the set-of-sets is
		// what flattens the tree for the engine. The result count is asserted alongside the field
		// because a plausible wrong field (`origin`, the object) would commit a rule that matches
		// nothing while looking correct in the rule map.
		const { core, root } = mountPanel();

		originRow(root, 'Italy').click();

		const rule = core.getRules().get('origin') as InSetofSetsRule<string> | undefined;

		expect(rule?.field).toBe('originId');
		expect(rule?.config.set).toEqual([ITALY_ORIGIN_IDS]);
		expect(core.getResultCount()).toBe(2);
	});

	it('derives the committed leaf sets back to the COMPACT node, so one click clears the facet', () => {
		// The contract `deriveOriginSelection` exists for, and the only way to observe it. Both the
		// compact form (`['Italy']`) and the closure (`['Italy', 'Italy|Piedmont', …]`) render this row
		// as checked, so no assertion about the DOM can tell them apart. The next click can: from the
		// compact form it removes the country and empties the selection; from the closure it would strip
		// `Italy` and leave its two provinces still committed, so the facet would keep filtering after
		// the user switched it off.
		const { core, root } = mountPanel((engine) => {
			engine.addRule('origin', inSetofSets<string>('originId', [ITALY_ORIGIN_IDS]));
		});

		expect(originRow(root, 'Italy').getAttribute('aria-checked')).toBe('true');

		originRow(root, 'Italy').click();

		expect(core.getRules().has('origin')).toBe(false);
		expect(core.getResultCount()).toBe(DATA.length);
	});
});
