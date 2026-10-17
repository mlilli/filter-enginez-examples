/**
 * The histogram bar's tier contract, pinned in the stylesheet that owns it.
 *
 * @remarks
 * The bars' background / glow / opacity live in `fe-range-histogram__bar--*` modifiers rather than
 * in render code, because six verticals render this overlay and five of them would otherwise carry
 * their own copy of the same literals. The win is real; the cost is that the VALUES are out of reach
 * of every unit test. `RangeHistogram.test.ts` can assert that the right
 * modifier lands on the right bar, and does — but nothing downstream of it can tell whether
 * `--empty` still resolves to a different opacity than its tier, because jsdom never loads the sheet.
 *
 * Two of these assertions are the ones worth having. The empty-bucket modifier has the SAME
 * specificity as the two tier modifiers it must override, so **source order is the whole mechanism**;
 * and the outside-and-empty pair is a compound selector that must outrank both. Reorder the block
 * while tidying and every empty bucket silently renders at its tier's opacity — a bar that reads
 * "there is data here" when there is none, which is the one thing the overlay exists to get right.
 *
 * Deliberately in `tests/tooling` rather than in `ui-styles`: the package ships plain CSS with no
 * build and no test harness, and the standing rule here is to move the test out rather than widen the
 * package (see the `tooling` vitest project).
 */

import { describe, expect, it } from 'vitest';

import { readUiStyles } from './support/uiStylesSheet.js';

const BASE = '.fe-range-histogram__bar';
const SELECTED = `${BASE}--selected`;
const AVAILABLE = `${BASE}--available`;
const OUTSIDE = `${BASE}--outside`;
const EMPTY = `${BASE}--empty`;
const OUTSIDE_EMPTY = `${OUTSIDE}${EMPTY}`;

/**
 * Strip CSS comments, so prose describing a selector is never mistaken for one.
 *
 * @remarks
 * Same guard, and same reason, as `cascadeLayers.test.ts`: the comments in this very block name
 * every selector asserted below. A test that matches its own documentation passes against a deleted
 * rule.
 *
 * @param css - Raw stylesheet text.
 * @returns The text with comment blocks removed.
 */
function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//gu, '');
}

/** The whole `ui-styles` sheet, its partials inlined in cascade order, comment-stripped. */
const SHEET = stripComments(readUiStyles());

/**
 * Match a selector's rule, as authored and standing alone.
 *
 * @remarks
 * The leading lookbehind is load-bearing: without it this file passes falsely.
 * `.fe-range-histogram__bar--empty` occurs TWICE in the sheet — once as its own rule
 * and once as the right half of the compound — so an unanchored pattern still finds a match after
 * the standalone rule is deleted, and every assertion below keeps passing while empty buckets render
 * at their tier's opacity. Requiring a non-identifier character before the leading `.` is what makes
 * "this selector has its own rule" the thing actually being measured.
 *
 * @param selector - The exact selector text.
 * @returns The `RegExp` match, with the declaration body in group 1.
 */
function ruleFor(selector: string): RegExpExecArray {
	const pattern = new RegExp(`(?<![\\w-])${selector.replace(/[.]/gu, '\\.')}\\s*\\{([^}]*)\\}`, 'u');
	const match = pattern.exec(SHEET);

	expect(match, `no standalone rule found for ${selector}`).not.toBeNull();

	/* v8 ignore next -- the expect above throws first; this satisfies the null-check compiler-side */
	return match ?? ([] as unknown as RegExpExecArray);
}

/**
 * The declaration block for one selector.
 *
 * @param selector - The exact selector text, as authored.
 * @returns Everything between its braces.
 */
function blockFor(selector: string): string {
	return ruleFor(selector)[1] ?? '';
}

/**
 * Source position of a selector's rule.
 *
 * @param selector - The exact selector text.
 * @returns Its index in the comment-stripped sheet.
 */
function offsetOf(selector: string): number {
	return ruleFor(selector).index;
}

describe('fe-range-histogram__bar tier modifiers', () => {
	it('declares a rule for the base class and all four modifiers', () => {
		for (const selector of [BASE, SELECTED, AVAILABLE, OUTSIDE, EMPTY, OUTSIDE_EMPTY]) {
			expect(offsetOf(selector)).toBeGreaterThan(-1);
		}
	});

	it('resolves the four opacity outcomes the two-tier design specifies', () => {
		// Populated: full inside the available zone, knocked back outside it.
		expect(blockFor(SELECTED)).toContain('opacity: 1;');
		expect(blockFor(AVAILABLE)).toContain('opacity: 1;');
		expect(blockFor(OUTSIDE)).toContain('opacity: 0.35;');
		// Empty: visible but quiet, and quietest of all when also outside.
		expect(blockFor(EMPTY)).toContain('opacity: 0.55;');
		expect(blockFor(OUTSIDE_EMPTY)).toContain('opacity: 0.2;');
	});

	it('orders the empty modifier after the tiers it must override', () => {
		// Equal specificity, so this ordering IS the override. Nothing else enforces it.
		expect(offsetOf(EMPTY)).toBeGreaterThan(offsetOf(SELECTED));
		expect(offsetOf(EMPTY)).toBeGreaterThan(offsetOf(AVAILABLE));
		expect(offsetOf(EMPTY)).toBeGreaterThan(offsetOf(OUTSIDE));
		// The compound outranks `--empty` by specificity, but keep it later anyway so the block reads
		// in cascade order.
		expect(offsetOf(OUTSIDE_EMPTY)).toBeGreaterThan(offsetOf(EMPTY));
	});

	it('paints only the selected tier in the data accent, and never in phosphor', () => {
		// Dual-accent semantics (the brand contract): cyan `--accent` is DATA / identity, phosphor `--engine`
		// is ACTIVITY / computation. A distribution bar is data, so cyan is correct and phosphor here
		// would claim the engine is recomputing.
		expect(blockFor(SELECTED)).toContain('var(--accent)');
		expect(blockFor(AVAILABLE)).not.toContain('var(--accent)');
		expect(blockFor(OUTSIDE)).not.toContain('var(--accent)');

		for (const selector of [BASE, SELECTED, AVAILABLE, OUTSIDE, EMPTY, OUTSIDE_EMPTY]) {
			expect(blockFor(selector)).not.toContain('--engine');
		}
	});

	it('gives the base class a neutral background, so an unmodified bar is still visible', () => {
		// The tier modifiers only override `background` for `--selected`; the other two inherit this.
		expect(blockFor(BASE)).toContain('background: var(--gray-5);');
	});
});
