/**
 * Tests for `createWineSmartFilters` — the expression-mode preset strip.
 *
 * @remarks
 * ### What is vanilla-only here, and what is deliberately NOT tested
 *
 * A DRY survey came first, and it cut this file roughly in half. `buildSmartFilterExpression`,
 * `deriveSelectedPresetIds` and `sameSelection` live in `examples-shared` and are already covered
 * there (`wine-domain/commit.test.ts`, `smartFilters.test.ts`), which is in the root coverage
 * report. Re-asserting the expression algebra from here would duplicate a suite rather than add
 * one. They appear below only as FIXTURES — building a realistic committed expression to feed
 * `update()` — never as expectations.
 *
 * What is vanilla's alone is the strip's local state: the `isMulti` seed, its ONE-WAY adopt, which
 * of `[...current, id]` / `[id]` a click produces, the order the engine is written in, and the
 * paint-before-settle rule this whole route depends on.
 *
 * ### The fake is an ORDERED call log, not three separate spies
 *
 * `examples-shared`'s `commit.test.ts` established the structural-fake shape and this follows it,
 * with one change: the calls land in one array in order. Two of the decisions here are ORDERING
 * decisions — the flat facet rules must be dropped BEFORE the expression is committed, and clearing
 * must not drop them at all — and separate `toHaveBeenCalled` spies cannot see the difference
 * between "both happened" and "both happened in the right order".
 *
 * ### Why a focus assertion pins the adopt guard
 *
 * `update()` returns early when `adopt` reports no change. Every obvious consequence of removing
 * that guard is invisible: `repaint()` reads the PAINTED value, so a redundant repaint paints the
 * same thing, and `isMulti` is already whatever it would be set to. The one real consequence is
 * that `chips.update()` calls `replaceChildren`, so a redundant repaint destroys and rebuilds the
 * buttons — and a keyboard user mid-tab through the strip loses focus every time an unrelated facet
 * settles. That is user-visible, so it is what the guard is asserted through.
 *
 * @packageDocumentation
 */

import type { CompositeRule } from '@filter-enginez/core';

import {
	buildSmartFilterExpression,
	WINE_SMART_FILTERS,
	type WineEngineHost,
} from '@filter-enginez/examples-shared/wine-domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { createWineSmartFilters } from './smartFilters.js';

/** Every engine write this strip makes, in order. */
let calls: string[] = [];

/** What the fake engine reports as its committed expression. */
let committed: CompositeRule | null = null;

/** Two preset ids that exist in the shared catalog, taken from it rather than written by hand. */
const [FIRST_PRESET, SECOND_PRESET] = WINE_SMART_FILTERS;

/**
 * A structural stand-in for the engine facade.
 *
 * @remarks
 * Follows `examples-shared`'s `commit.test.ts`: the strip decides WHICH engine calls to make and in
 * what order, and reads nothing back but `getExpression`. A real engine would add a 150k corpus and
 * a worker round trip without sharpening one assertion.
 *
 * @returns The fake host.
 */
function fakeHost(): WineEngineHost {
	return {
		core: {
			addRule: (id: string) => {
				calls.push(`addRule:${id}`);
			},
			getExpression: () => committed,
			removeRule: (id: string) => {
				calls.push(`removeRule:${id}`);
			},
			setExpression: (expression: CompositeRule | null) => {
				calls.push(expression === null ? 'setExpression:null' : 'setExpression:tree');
			},
		},
	} as unknown as WineEngineHost;
}

/**
 * Mount the strip over a fake engine holding `initial`.
 *
 * @param initial - The expression the engine reports at construction.
 * @returns The strip plus readers over its DOM.
 */
function mountStrip(initial: CompositeRule | null = null) {
	committed = initial;

	const strip = createWineSmartFilters({ host: fakeHost() });

	document.body.replaceChildren(strip.element);
	calls = [];

	const modeInput = strip.element.querySelector<HTMLInputElement>('.fe-wine-smart__mode input');
	const pausedNotice = strip.element.querySelector<HTMLElement>('.fe-wine-smart__paused');

	if (modeInput === null || pausedNotice === null) {
		throw new Error('the strip must render the OR-mode checkbox and the paused notice');
	}

	return {
		chip: (label: string): HTMLElement => {
			const found = Array.from<HTMLElement>(strip.element.querySelectorAll('.fe-chip-toggle button')).find(
				(button) => button.textContent === label,
			);

			if (found === undefined) {
				throw new Error(`no preset chip labelled ${label}`);
			}

			return found;
		},
		clearButton: strip.element.querySelector<HTMLElement>('.fe-wine-smart__clear'),
		lit: (): string[] =>
			Array.from<HTMLElement>(strip.element.querySelectorAll('.fe-chip-toggle button'))
				.filter((button) => button.getAttribute('aria-pressed') === 'true')
				.map((button) => button.textContent),
		modeInput,
		pausedNotice,
		strip,
	};
}

/**
 * Flip the OR-mode checkbox the way a user would.
 *
 * @param modeInput - The checkbox.
 * @param isChecked - Its new state.
 */
function setMode(modeInput: HTMLInputElement, isChecked: boolean): void {
	modeInput.checked = isChecked;
	modeInput.dispatchEvent(new Event('change'));
}

beforeEach(() => {
	calls = [];
	committed = null;
	document.body.replaceChildren();
});

describe('seeding from the committed expression', () => {
	it('boots neutral when the engine holds no expression', () => {
		const { lit, modeInput, pausedNotice } = mountStrip(null);

		expect(lit()).toEqual([]);
		expect(modeInput.checked).toBe(false);
		expect(pausedNotice.style.display).toBe('none');
	});

	it('lights the chip a single committed preset came from', () => {
		const { lit, modeInput } = mountStrip(buildSmartFilterExpression([FIRST_PRESET?.id ?? '']));

		expect(lit()).toEqual([FIRST_PRESET?.label]);
		expect(modeInput.checked).toBe(false);
	});

	it('seeds OR MODE ON when two presets are already committed', () => {
		// A `?f=` link carrying two presets can only have been built in OR mode. Booting the
		// checkbox off would leave the chips multi-selected while the control claims single-select,
		// and the next click would silently drop the others.
		const { lit, modeInput } = mountStrip(
			buildSmartFilterExpression([FIRST_PRESET?.id ?? '', SECOND_PRESET?.id ?? '']),
		);

		expect(lit()).toHaveLength(2);
		expect(modeInput.checked).toBe(true);
	});
});

describe('single-select mode', () => {
	it('REPLACES the selection rather than adding to it', () => {
		const { chip, lit } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();
		chip(SECOND_PRESET?.label ?? '').click();

		expect(lit()).toEqual([SECOND_PRESET?.label]);
	});

	it('clicking a lit chip turns it OFF', () => {
		// Without the deselect branch a lit chip re-applies itself, so the only route out of
		// expression mode is the clear button — and the chips look like radio buttons that lie.
		const { chip, lit } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();
		chip(FIRST_PRESET?.label ?? '').click();

		expect(lit()).toEqual([]);
	});

	it('paints the chip IMMEDIATELY, without waiting for the engine to settle', () => {
		// The rule this whole route is built on: `.core` mutations are fire-and-forget and the
		// expression lands a worker round trip later. Painting from the engine would blank the chip
		// between click and settle, on every click, against 150k records.
		const { chip, lit } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();

		expect(lit()).toEqual([FIRST_PRESET?.label]);
	});
});

describe('OR mode', () => {
	it('switching modes CLEARS the selection', () => {
		// The two modes mean different things by the same chips, so carrying a selection across
		// would apply an expression the user never built.
		const { chip, lit, modeInput } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();
		setMode(modeInput, true);

		expect(lit()).toEqual([]);
		expect(calls).toContain('setExpression:null');
	});

	it('unions the presets once it is on', () => {
		const { chip, lit, modeInput } = mountStrip();

		setMode(modeInput, true);
		chip(FIRST_PRESET?.label ?? '').click();
		chip(SECOND_PRESET?.label ?? '').click();

		expect(lit()).toEqual([FIRST_PRESET?.label, SECOND_PRESET?.label]);
	});
});

describe('what it writes to the engine, and in what order', () => {
	it('drops every flat facet rule BEFORE committing the expression', () => {
		// Ordering, not merely occurrence. An expression and a leftover flat rule both apply, so the
		// results come back narrower than the preset describes with no control on screen explaining
		// why — and committing first leaves exactly that window open.
		const { chip } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();

		const commitIndex = calls.indexOf('setExpression:tree');
		const lastRemovalIndex = calls.map((call) => call.startsWith('removeRule:')).lastIndexOf(true);

		expect(commitIndex).toBeGreaterThan(-1);
		expect(lastRemovalIndex).toBeGreaterThan(-1);
		expect(lastRemovalIndex).toBeLessThan(commitIndex);
	});

	it('clearing commits null and does NOT touch the flat rules', () => {
		// Leaving expression mode must give the manual controls back, not wipe them a second time.
		const { chip } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();
		calls = [];
		chip(FIRST_PRESET?.label ?? '').click();

		expect(calls).toEqual(['setExpression:null']);
	});
});

describe('the paused notice', () => {
	it('appears only while a preset is live', () => {
		const { chip, pausedNotice } = mountStrip();

		expect(pausedNotice.style.display).toBe('none');

		chip(FIRST_PRESET?.label ?? '').click();

		expect(pausedNotice.style.display).toBe('');
	});

	it('its clear button empties the selection and leaves expression mode', () => {
		// It lives OUTSIDE the panel body precisely so it stays interactive while every section
		// below dims — a preset that greyed out its own escape hatch would be a trap.
		const { chip, clearButton, lit, pausedNotice } = mountStrip();

		chip(FIRST_PRESET?.label ?? '').click();
		calls = [];
		clearButton?.click();

		expect(lit()).toEqual([]);
		expect(pausedNotice.style.display).toBe('none');
		expect(calls).toEqual(['setExpression:null']);
	});
});

describe('adopting the engine', () => {
	it('turns OR mode on when the engine reports two presets, and never turns it back off', () => {
		// One-way, deliberately. Deriving `length > 1` outright would flip the checkbox OFF the
		// moment a user in OR mode deselected down to one preset, silently changing the mode they
		// chose. Turning it ON when the selection proves it was already on cannot be wrong.
		const { modeInput, strip } = mountStrip();

		strip.update(buildSmartFilterExpression([FIRST_PRESET?.id ?? '', SECOND_PRESET?.id ?? '']));

		expect(modeInput.checked).toBe(true);

		strip.update(buildSmartFilterExpression([FIRST_PRESET?.id ?? '']));

		expect(modeInput.checked).toBe(true);
		expect(strip.selected()).toEqual([FIRST_PRESET?.id]);
	});

	it('an UNCHANGED expression does not rebuild the chips, so keyboard focus survives', () => {
		// See the file remarks: every other consequence of dropping the adopt guard is invisible,
		// because a redundant repaint paints the same values. This is the one a user feels — the
		// panel settles on every unrelated facet change, and each rebuild would steal focus.
		const expression = buildSmartFilterExpression([FIRST_PRESET?.id ?? '']);
		const { chip, strip } = mountStrip(expression);
		const focused = chip(FIRST_PRESET?.label ?? '');

		focused.focus();

		expect(document.activeElement).toBe(focused);

		strip.update(expression);

		expect(document.activeElement).toBe(focused);
	});
});
