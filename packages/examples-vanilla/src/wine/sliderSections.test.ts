/**
 * Tests for `wine/sliderSections.ts` — the five facets no other suite drives or commits to.
 *
 * @remarks
 * ### 🔴 Only the sites no other suite reaches
 *
 * A throw-mutant probe against the WHOLE `packages/examples-vanilla` suite — not against any one
 * sibling, because coverage is transitive — shows the rest of the suite already drives the adopt on
 * repaint, `committedSpan`'s absent arm, both baseline fallbacks on the range facet, both `available`
 * arms on BOTH sliders, both formatters, and `read`'s absent arm.
 *
 * The sixteen sites that remain are not sixteen unrelated sites. They are **two properties**, and
 * every case below drives one of them:
 *
 * - **Nothing in this package performs one of these interactions.** No test moves a slider handle,
 *   chooses a comparison operator, or types a threshold. (R1, R14, R21–R24.)
 * - **Nothing in this package ever repaints this panel with a committed rule on one of these five
 *   facets.** Every read-back arm — the committed span, both derived handle values on both sliders,
 *   both constructor seeds, the operator adopt and the conditional threshold overwrite — needs a rule
 *   that no suite ever commits. (R3, R5, R7, R12, R15, R16, R19, R20, R25, R26.)
 *
 * ### 🔴 The LIVE `available` arms are reached by the page, not by a spec that passes a bundle
 *
 * R9 and R17 — the LIVE arms of `available` on both sliders — look unreachable, because every spec
 * that passes a bundle passes `null`. **They are reached by `pages/winePage.test.ts`, which does not
 * pass a bundle at all — it drives the page, and the page FETCHES one.** A grep for `bundle:` across
 * the specs finds only `bundle: null`, which is an instrument answering a narrower question than the
 * one being asked; only a mutant run answers the real one.
 *
 * ### ⚠ What the shared-link case does NOT prove
 *
 * `opens on the comparison a shared link already committed` drives both constructor seeds (R19, R20),
 * but it cannot prove the CONSTRUCTOR read is what put the values there — and no test in this package
 * can. The controls render nothing until `update` runs, and `update` adopts the operator and
 * overwrites the threshold from the same rule on that first pass, so a blank seed lands in the
 * identical place. The seeds are load-bearing in the reactive verticals, where the first render comes
 * straight from local state; here they are belt-and-braces. Written down rather than asserted,
 * because an assertion that passes on a mechanism other than the one it names is indistinguishable
 * from green.
 *
 * ### The contracts worth pinning, and none of them is a percentage
 *
 * **A range facet's rule id and its FIELD are different strings.** `price` constrains `priceUsd`. A
 * plausible wrong field commits a rule that matches nothing while looking correct in the rule map, so
 * the result count is asserted beside it.
 *
 * **Vintage's rule type and its control disagree on purpose.** The control is a slider; the rule is an
 * `InSetRule<number>` of discrete years. The round trip is lossy in one direction, deliberately — a
 * set with a GAP reads back as its outer bounds — which is why the case below seeds a gapped set.
 * With a contiguous one, "the outer bounds" and "the set" are the same assertion.
 *
 * **An infinite maximum reads back as the baseline edge.** It reaches this route only through a `?f`
 * link from React's open-ended price slider. The arm it takes is already covered by the no-rule path
 * (R8), so this is the accidental-coverage category: a branch reached by accident of another case
 * rather than by anything asserting the contract the source comment names.
 *
 * **Editing the threshold must not switch the facet on, and must not be forgotten either.** With no
 * operator there is no rule, and typing a number is not a request to create one. The case drives both
 * halves: no rule appears, and the number survives to be used when an operator finally arrives.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	inSet,
	type InSetRule,
	numCompare,
	type NumericComparisonRule,
	range,
	type RangeRule,
} from '@filter-enginez/core';
import { NON_VINTAGE_YEAR } from '@filter-enginez/examples-shared/wine-domain';
import { afterEach, describe, expect, it } from 'vitest';

import { makeWine } from '../test-support/wineFixture.js';
import { createWinePanelMounter } from '../test-support/winePanelHarness.js';

/**
 * Three wines chosen so every baseline is readable at a glance.
 *
 * @remarks
 * Price 20/30/40, points 88/90/92, ABV 12/13.5/15, vintage 2015/2018/2020. The baselines are the
 * outer values of each — `SLIDER_STEPS` is all zeros deliberately, so nothing is padded outward (the
 * module docblock explains how padding would display a `$4` minimum as `$0`).
 *
 * The vintages are NOT contiguous, which the vintage case depends on: 2015, 2018 and 2020 leaves a
 * baseline of 2015–2020 with room for a seeded set that is gapped AND strictly inside it. Both
 * properties are needed — see that case.
 */
const DATA: readonly Wine[] = [
	makeWine({ abv: 12, id: 'a', points: 88, priceUsd: 20, vintage: 2015 }),
	makeWine({ abv: 13.5, id: 'b', points: 90, priceUsd: 30, vintage: 2018 }),
	makeWine({ abv: 15, id: 'c', points: 92, priceUsd: 40, vintage: 2020 }),
];

const mountPanel = createWinePanelMounter(DATA);

/**
 * A second corpus whose youngest wine is non-vintage, for the `NV` case alone.
 *
 * @remarks
 * Kept apart from {@link DATA} so no other case's baselines or counts move: the vintage baseline here
 * runs 2015 to the non-vintage year, and only the `NV` reading is asserted against it.
 */
const mountNonVintagePanel = createWinePanelMounter([
	makeWine({ id: 'vintage', vintage: 2015 }),
	makeWine({ id: 'non-vintage', vintage: NON_VINTAGE_YEAR }),
]);

/**
 * One slider thumb, by the accessible name `createRangeSlider` builds from the facet's `ariaLabel`.
 *
 * @param root - The mounted root.
 * @param ariaLabel - The facet's slider label, e.g. `Filter by price`.
 * @param bound - Which handle.
 * @returns The `role="slider"` thumb.
 */
function thumb(root: HTMLElement, ariaLabel: string, bound: 'lower' | 'upper'): HTMLElement {
	const node = root.querySelector<HTMLElement>(
		`[role="slider"][aria-label="${ariaLabel} ${bound} bound"]`,
	);

	if (node === null) {
		throw new Error(`expected a ${bound} thumb for "${ariaLabel}"`);
	}

	return node;
}

/**
 * The pair of values a slider is currently showing, read off ARIA rather than off the formatted text.
 *
 * @remarks
 * `aria-valuenow` carries the raw number; the editable inputs carry the FORMATTED one (`$25`, `2015`).
 * The raw pair is what these cases are about — both formatters are already reached by other suites.
 *
 * @param root - The mounted root.
 * @param ariaLabel - The facet's slider label.
 * @returns `[lower, upper]` as numbers.
 */
function handles(root: HTMLElement, ariaLabel: string): readonly [number, number] {
	return [
		Number(thumb(root, ariaLabel, 'lower').getAttribute('aria-valuenow')),
		Number(thumb(root, ariaLabel, 'upper').getAttribute('aria-valuenow')),
	];
}

/**
 * Nudge a slider handle with the keyboard — the one interaction jsdom can drive.
 *
 * @remarks
 * The POINTER paths resolve against `getBoundingClientRect`, which jsdom reports as 0×0; the keyboard
 * paths read only local state, which is why the keyboard half of `controls/rangeSlider.ts` is
 * reachable under jsdom and the pointer half is not. `ArrowUp` steps by the facet's `DRAG_STEPS` value.
 *
 * @param root - The mounted root.
 * @param ariaLabel - The facet's slider label.
 * @param bound - Which handle.
 * @param key - The key to press.
 */
function pressOnThumb(
	root: HTMLElement,
	ariaLabel: string,
	bound: 'lower' | 'upper',
	key: string,
): void {
	thumb(root, ariaLabel, bound).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
}

/** The comparison operator `<select>`, by its accessible name. */
function operatorSelect(root: HTMLElement): HTMLSelectElement {
	const node = root.querySelector<HTMLSelectElement>(
		'select[aria-label="Points comparison operator"]',
	);

	if (node === null) {
		throw new Error('expected the points-comparison operator select');
	}

	return node;
}

/** The comparison threshold `<input type="number">`, by its accessible name. */
function thresholdField(root: HTMLElement): HTMLInputElement {
	const node = root.querySelector<HTMLInputElement>(
		'input[aria-label="Points comparison threshold"]',
	);

	if (node === null) {
		throw new Error('expected the points-comparison threshold field');
	}

	return node;
}

/**
 * Set a control's value the way a user does — assign, then fire the event the control listens for.
 *
 * @param field - The select or number input.
 * @param next - The new value.
 */
function choose(field: HTMLInputElement | HTMLSelectElement, next: string): void {
	field.value = next;
	field.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('the range sliders', () => {
	it('commits a RangeRule over the facet FIELD, which is not the facet id', () => {
		// `price` is the rule id and the key into the baselines; `priceUsd` is the Wine property. The
		// result count is asserted beside the field because a rule over `price` would look perfectly
		// correct in the rule map while matching nothing.
		const { core, root } = mountPanel();

		pressOnThumb(root, 'Filter by price', 'lower', 'ArrowUp');

		const rule = core.getRules().get('price') as RangeRule | undefined;

		expect(rule?.field).toBe('priceUsd');
		// Baseline 20–40, drag step 1 for price on a log track: one percent of this narrow track is a
		// fraction of a dollar, so the press moves the floor of one whole step, 20 → 21.
		expect(rule?.config).toEqual({ max: 40, min: 21 });
		expect(core.getResultCount()).toBe(2);
	});

	it('opens on the span a shared link already committed', () => {
		// The `/wine` shared-link shape: the route calls `core.loadConfig(urlConfig)` and only then
		// constructs the panel. Both handles come from the committed rule rather than from the baseline,
		// which is the whole of `committedSpan`'s live arm and both derived values above it.
		const { root } = mountPanel((engine) => {
			engine.addRule('price', range('priceUsd', { max: 35, min: 25 }));
		});

		expect(handles(root, 'Filter by price')).toEqual([25, 35]);
	});

	it('reads an INFINITE committed maximum back as the baseline edge', () => {
		// Only reachable here through a `?f` link from React's open-ended price slider, which serializes
		// "no upper limit" as Infinity. The lower handle still comes from the rule; the upper falls back
		// to the baseline rather than rendering an infinite handle.
		//
		// The arm this takes is already exercised by every no-rule repaint, so this case does not move
		// the number. It is here because the contract the source comment names is otherwise pinned by
		// nothing, and a branch covered by accident of another case is one a refactor can silently take
		// back out.
		//
		// 🔴 What it CANNOT do is prove the guard produced this value, and verification mutant V3 is
		// the proof of that — it survived at BOTH scopes (this spec and the whole package). Deleting
		// `Number.isFinite` from the source leaves this assertion green, because `createRangeSlider`
		// re-clamps on the way in: `Number.isFinite(state.valueMax) ? … : available.max`. The display
		// path is guarded twice and only the second guard is observable here.
		//
		// ⚠ That is NOT an argument for deleting the first one. `valueMax` also feeds
		// `wineSliderHistogram(bundle, ruleId, baseline, valueMin, valueMax)`, which the slider does not
		// re-clamp, and
		// no test in this package ever combines an infinite committed maximum with a RESOLVED bundle —
		// the one suite that resolves one (`pages/winePage.test.ts`) never commits an open-ended span.
		// So "unobservable" here is scoped to the paths tests exercise; it is not evidence the guard is
		// dead code.
		const { root } = mountPanel((engine) => {
			engine.addRule('price', range('priceUsd', { max: Number.POSITIVE_INFINITY, min: 25 }));
		});

		expect(handles(root, 'Filter by price')).toEqual([25, 40]);
	});
});

describe('the vintage slider', () => {
	it('commits a SET of years rather than the span the control displays', () => {
		// The facet exists to make this disagreement visible: the control is a slider, the rule is an
		// `InSetRule<number>`. Asserting the rule TYPE and its members is the point — a `RangeRule` here
		// would filter identically on this corpus and be the wrong demonstration.
		const { core, root } = mountPanel();

		pressOnThumb(root, 'Filter by vintage year', 'lower', 'End');

		const rule = core.getRules().get('vintage') as InSetRule<number> | undefined;

		expect(rule?.field).toBe('vintage');
		// `End` jumps the lower handle to the available maximum, collapsing the span onto 2020 — so the
		// year set is the single year, not the range it was dragged from.
		expect(rule?.config.set).toEqual([2020]);
		expect(core.getResultCount()).toBe(1);
	});

	it('reads a GAPPED committed year set back as its outer bounds', () => {
		// Lossy on purpose, and only in this direction. A set with a gap is reachable through a
		// hand-written JSON config and never through this control, so the slider shows a span WIDER than
		// the rule — the honest rendering of "this control cannot express what is committed" — and the
		// next drag replaces it.
		//
		// Two properties of the seeded set are load-bearing, and the second was nearly missed.
		//
		// It is GAPPED (2017 and 2018 absent), so "its outer bounds" is a claim distinguishable from
		// "the set" — with a contiguous set the two assertions are the same one.
		//
		// 🔴 And BOTH bounds differ from the baseline (2015–2020). A seed of `[2015, 2020]` has outer
		// bounds that ARE the baseline — so a mutant that ignored the committed set entirely and fell
		// back to the baseline would pass. The assertion would be green for a reason other than the one
		// it names, which is the failure mode this whole file's docblock is about (verification mutant
		// V4).
		const { root } = mountPanel((engine) => {
			engine.addRule('vintage', inSet<number>('vintage', [2016, 2019]));
		});

		expect(handles(root, 'Filter by vintage year')).toEqual([2016, 2019]);
	});

	it('reads the non-vintage year as NV, and reads a typed NV back as that year', () => {
		// The non-vintage year is a number to the engine and `NV` to a person. Both directions matter:
		// a field showing `NV` that parsed as `NaN` would silently revert on blur, which reads as the
		// field ignoring the user.
		const { core, root } = mountNonVintagePanel();
		const upper = thumb(root, 'Filter by vintage year', 'upper');
		const lowerField = root.querySelector<HTMLInputElement>(
			'input[aria-label="Vintage lower bound (editable)"]',
		);

		expect(upper.getAttribute('aria-valuenow')).toBe(String(NON_VINTAGE_YEAR));
		expect(upper.getAttribute('aria-valuetext')).toBe('NV');
		expect(root.querySelector<HTMLInputElement>('input[aria-label="Vintage upper bound (editable)"]')?.value).toBe('NV');

		if (lowerField === null) {
			throw new Error('expected the vintage lower-bound field');
		}
		lowerField.value = 'nv';
		lowerField.dispatchEvent(new FocusEvent('blur'));

		const rule = core.getRules().get('vintage') as InSetRule<number> | undefined;

		expect(rule?.config.set).toEqual([NON_VINTAGE_YEAR]);
		expect(core.getResultCount()).toBe(1);
	});
});

describe('the score-comparison facet', () => {
	it('commits the chosen operator at the default threshold', () => {
		const { core, root } = mountPanel();

		choose(operatorSelect(root), '>=');

		const rule = core.getRules().get('points-compare') as NumericComparisonRule | undefined;

		expect(rule?.field).toBe('points');
		expect(rule?.config).toEqual({ op: '>=', value: 90 });
		expect(core.getResultCount()).toBe(2);
	});

	it('REMOVES the rule when the placeholder is chosen', () => {
		// Not a rule holding `''`. There is no such comparison operator, so the rule would either match
		// nothing or throw, while the panel showed the facet switched off — the same failure shape the
		// exact-color select's clear arm exists to avoid.
		const { core, root } = mountPanel();

		choose(operatorSelect(root), '>');

		expect(core.getRules().has('points-compare')).toBe(true);

		choose(operatorSelect(root), '');

		expect(core.getRules().has('points-compare')).toBe(false);
		expect(core.getResultCount()).toBe(DATA.length);
	});

	it('does not switch the facet on when the threshold is edited — but does REMEMBER the number', () => {
		// Both halves of the contract, and the second is why the first is safe. With no operator the
		// user has not said *how* to compare, so typing a number must not create a rule. If the number
		// were also discarded, the guard would be silently destructive instead of merely inert.
		const { core, root } = mountPanel();

		choose(thresholdField(root), '95');

		expect(core.getRules().has('points-compare')).toBe(false);

		choose(operatorSelect(root), '>');

		// 95, not the 90 default: the typed value survived the round trip through a facet that was off.
		expect(
			(core.getRules().get('points-compare') as NumericComparisonRule | undefined)?.config,
		).toEqual({ op: '>', value: 95 });
	});

	it('re-commits at the new threshold while an operator is live', () => {
		const { core, root } = mountPanel();

		choose(operatorSelect(root), '>=');
		choose(thresholdField(root), '92');

		expect(
			(core.getRules().get('points-compare') as NumericComparisonRule | undefined)?.config,
		).toEqual({ op: '>=', value: 92 });
		expect(core.getResultCount()).toBe(1);
	});

	it('opens on the comparison a shared link already committed', () => {
		// See the file docblock for what this does NOT prove: it drives both constructor seeds, but
		// cannot distinguish them from the adopt on the same first `update`.
		const { root } = mountPanel((engine) => {
			engine.addRule('points-compare', numCompare('points', { op: '>', value: 88 }));
		});

		expect(operatorSelect(root).value).toBe('>');
		expect(thresholdField(root).value).toBe('88');
	});

	it('lets a committed threshold overwrite a typed one, and an ABSENT rule leave it alone', () => {
		// The asymmetry the source calls "conditional by design", driven in both directions in one case
		// because neither direction means much alone.
		const { core, repaint, root } = mountPanel();

		choose(thresholdField(root), '95');
		// A settle arriving with a rule the user did not type: the committed value wins.
		repaint(new Map([['points-compare', numCompare('points', { op: '>=', value: 88 })]]));

		expect(operatorSelect(root).value).toBe('>=');
		expect(thresholdField(root).value).toBe('88');

		// A settle arriving with NO rule: the operator drops to the placeholder, but the number stays.
		// Resetting it here would throw away a value the user is mid-way through using.
		repaint(new Map());

		expect(operatorSelect(root).value).toBe('');
		expect(thresholdField(root).value).toBe('88');
		expect(core.getRules().has('points-compare')).toBe(false);
	});
});
