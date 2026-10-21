/**
 * Tests for `controls/controls.ts` — the six sites the five panel builders never reach.
 *
 * @remarks
 * ### 🔴 Only the sites no other suite reaches
 *
 * This module is composed by FIVE others across three datasets, so a single sibling spec is the
 * narrow instrument by construction. A throw-mutant probe against the WHOLE `packages/examples-vanilla`
 * suite shows the rest of it already drives the capped chip group, both class pushes, the count
 * badge's text, the chip `onToggle`, all three `chipTitle` arms, the per-keystroke `onChange`, the
 * Enter commit, the checkbox `change` handler, and a chip group fed exclusion data.
 *
 * What remains is four search-input interactions, one checkbox state, and one CONJUNCTION. Every
 * per-variant option is passed by some vertical — `showCount: true` (real estate's school districts),
 * `showCount: facetId === 'color'` and `scrollable: facetId === 'varietal'` (wine's choice sections),
 * `formatLabel` (books' genre + format chips, real estate's three chip groups, wine's smart filters)
 * — and the mutants on those paths are FATAL, which is the measurement saying the same thing.
 *
 * ### The residue has a third shape, and K5 is it
 *
 * The axis predicting coverage is WHEN code runs — construction versus interaction — not what kind
 * of code it is. Five of these six sites are the interaction half of that: blur, Escape, the
 * clear-X, an external re-sync, and a disabled checkbox.
 *
 * **The sixth is neither.** `fe-chip__count--unavailable` needs a chip that is simultaneously
 * would-be-empty AND inside a `showCount` group AND unselected. Unavailable chips render (K3 is fatal)
 * and count badges render (K4 is fatal) — the two states are each reached, just never at the same
 * time. That is not an unperformed interaction and not a module nobody builds; it is a **conjunction
 * no other suite assembles**, and no reading of "when does this run" predicts it, because both
 * halves run.
 *
 * ### 🔴 A probe finds unreached SITES; coverage finds unreached ARMS a probe cannot see
 *
 * Three branch ARMS are reached only by the cases here: the implicit `else` of the Enter / Escape
 * chain, and the `?? null` fallbacks behind `ariaLabel` and `placeholder`.
 *
 * **A throw-mutant is structurally unable to find any of them.** It replaces an expression and asks
 * whether anything runs it; all three of these live inside expressions that run on every keystroke
 * and every construction. The mutant is fatal either way, so the arm reads as reached — blind not
 * because nothing CALLS the code, but because everything does, and only one arm is taken.
 *
 * So the two instruments are not redundant and neither is sufficient alone: **the probe says which
 * sites to write cases for, coverage says which arms remain.**
 *
 * ### ⚠ A listener throw reads as FATAL, which matters for verification mutants
 *
 * A throw inside a jsdom event listener surfaces through Vitest's unhandled-error channel rather than
 * as a failing assertion — every test passes, but the process exits non-zero, and the stack trace
 * names the spec that reached it (`real-estate/panel.test.ts`, for K11).
 *
 * For a PROBE that is the right verdict: the question is "does anything reach this site", and
 * something did. **For a VERIFICATION mutant it would be a false FATAL** — the suite would be red
 * because the mutant threw, not because a test noticed wrong behavior. It is also why the sites
 * covered here can be trusted as unreached elsewhere: a listener throw does turn the run red, so
 * K10 / K13 / K14 staying green means no other test dispatches those events at all.
 *
 * ### Parity with the React twin — identical code, identical consequence
 *
 * `react-ui`'s `SearchInput` has byte-equivalent Enter / Escape / blur handling. That component is
 * CONTROLLED — its `value` is the text its parent mirrors from each keystroke — while this one is
 * uncontrolled and the field owns its text, but the consequence is the same: Escape blurs, the blur
 * commits what the user typed, and the caller's typeahead flushes it (writing nothing when it equals
 * the last commit). Pinned below as the behavior it is, rather than assumed from Escape's usual
 * meaning.
 *
 * @packageDocumentation
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/books-domain';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	type Control,
	createCheckboxControl,
	createCheckboxList,
	createChipToggleGroup,
	createSearchInput,
	TOGGLE_DISABLED_TITLE,
} from './controls.js';

/**
 * Options in render order: available-selected, would-be-empty, no-exclusion-datum, available-unselected.
 *
 * @remarks
 * Deliberately the same four-state fixture as `react-ui`'s `ChipToggleGroup.test.ts`. The two controls
 * render the same markup from the same contract, so a divergent fixture would make the two suites
 * incomparable for no gain — and it is the `white` row (would-be-empty AND counted) that this file
 * exists for.
 */
const CHIP_OPTIONS: readonly string[] = ['red', 'white', 'rose', 'orange'];

/** Exclusion data for three of the four options — `rose` is intentionally absent. */
const CHIP_EXCLUSION: ExclusionMap = new Map([
	['orange', { projectedCount: 7, wouldBeEmpty: false }],
	['red', { projectedCount: 12, wouldBeEmpty: false }],
	['white', { projectedCount: 0, wouldBeEmpty: true }],
]);

/** A mounted search input plus the handles a case needs to drive and observe it. */
interface MountedSearch {
	/** The clear-X button. */
	readonly clearButton: HTMLButtonElement;
	/** The control itself, for `update`. */
	readonly control: Control<string>;
	/** The text field. */
	readonly field: HTMLInputElement;
	/** Per-keystroke mirror callback. */
	readonly onChange: ReturnType<typeof vi.fn>;
	/** Commit callback — blur / Enter / clear. */
	readonly onCommit: ReturnType<typeof vi.fn>;
}

/**
 * Query one descendant, failing loudly rather than returning `null` into an assertion.
 *
 * @param root - The element to search within.
 * @param selector - The CSS selector.
 * @returns The matched element.
 */
function queryOrThrow<MatchedElement extends Element>(root: HTMLElement, selector: string): MatchedElement {
	const found = root.querySelector<MatchedElement>(selector);

	if (found === null) {
		throw new Error(`expected an element matching ${selector}`);
	}

	return found;
}

/**
 * Mount a search input in the document and seed its text.
 *
 * @remarks
 * Mounted rather than detached because `focus()` and `blur()` are no-ops on an element outside the
 * document, and four of the six cases here are about exactly those two events.
 *
 * @param initialText - Text to seed through `update`, standing in for a hydrated URL or a repaint.
 * @returns The control plus its field, clear-X and callbacks.
 */
function mountSearch(initialText: string): MountedSearch {
	const onChange = vi.fn();
	const onCommit = vi.fn();
	const control = createSearchInput({
		ariaLabel: 'Search listing descriptions',
		onChange,
		onCommit,
		placeholder: 'waterfront, remodeled, cul-de-sac...',
	});

	document.body.append(control.element);
	control.update(initialText);

	return {
		clearButton: queryOrThrow<HTMLButtonElement>(control.element, '.fe-search-input__clear'),
		control,
		field: queryOrThrow<HTMLInputElement>(control.element, '.fe-search-input__field'),
		onChange,
		onCommit,
	};
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('createChipToggleGroup', () => {
	it('subdues the COUNT BADGE as well as the chip, and prefers the dead-end title over "0 would match"', () => {
		// The one conjunction no vertical assembles in a test: a chip that is would-be-empty AND inside
		// a group showing projected counts. Both halves are reached separately — real estate's school
		// districts show counts, wine's color chips go unavailable — so each looked covered.
		//
		// Two decisions live in the overlap and neither is cosmetic. A subdued, disabled chip carrying a
		// FULL-BRIGHTNESS badge reads as "this many results are waiting behind this chip" at exactly the
		// moment the answer is none, so the badge has to carry the unavailable variant too. And
		// `chipTitle` checks `isUnavailable` FIRST: the tooltip must explain the dead end rather than
		// announce "0 would match", which is technically true and useless — it tells the user the count
		// without telling them the chip is off the table.
		const control = createChipToggleGroup({ onToggle: vi.fn(), showCount: true });

		document.body.append(control.element);
		control.update({ exclusion: CHIP_EXCLUSION, options: CHIP_OPTIONS, selected: ['red']});

		const white = [...control.element.querySelectorAll<HTMLButtonElement>('.fe-chip')][1];

		if (white === undefined) {
			throw new Error('expected a chip per option');
		}

		expect(white.disabled).toBe(true);
		expect(queryOrThrow(white, '.fe-chip__count').className).toBe('fe-chip__count fe-chip__count--unavailable');
		expect(white.getAttribute('title')).toBe('No matches for white given your other filters');
	});

	it('leaves a SELECTED chip clickable even when its own datum says would-be-empty', () => {
		// 🟢 This case exists because a VERIFICATION mutant designed against the docblock would have
		// survived without it, and the site it guards was already at 100% — so no coverage number was
		// ever going to ask for it. The contract is stated outright in the source: "Selected chips always
		// stay clickable so the user can deselect to escape a dead end."
		//
		// The state is real rather than hypothetical. Exclusion data is computed per candidate against
		// the OTHER active rules, so the chip a user just selected can report `wouldBeEmpty` the moment
		// another facet narrows past it — and that is precisely the moment they need to click it again.
		// Dropping the `&& !isSelected` guard disables the only control that can undo the dead end, and
		// the panel would look, correctly, as though nothing were wrong.
		const onToggle = vi.fn();
		const control = createChipToggleGroup({ onToggle, showCount: true });

		document.body.append(control.element);
		control.update({
			exclusion: new Map([['red', { projectedCount: 0, wouldBeEmpty: true }]]),
			options: ['red'],
			selected: ['red'],
		});

		const red = queryOrThrow<HTMLButtonElement>(control.element, '.fe-chip');

		expect(red.disabled).toBe(false);
		expect(red.className).toBe('fe-chip fe-chip--selected');

		red.click();

		expect(onToggle, 'the escape hatch out of a dead end must still fire').toHaveBeenCalledWith('red');
	});

	it('caps a long vocabulary with a MODIFIER, keeping the base class', () => {
		// Also written for a docblock mutant rather than for a percentage. `scrollable` is documented as
		// a modifier "rather than a second control", and `ui-styles` authors `.fe-chip-toggle--capped`
		// to add only the height cap and the overflow — the flex layout, gap and wrapping all live on the
		// base block. Emitting the modifier alone yields a scroll container with no chip layout inside
		// it, which is the kind of defect that renders as a plausible-looking column of buttons.
		//
		// Both arms in one case: wine's varietals are the only caller that passes it, so the plain arm is
		// what every other group in every vertical gets.
		const capped = createChipToggleGroup({ onToggle: vi.fn(), scrollable: true });
		const plain = createChipToggleGroup({ onToggle: vi.fn() });

		expect(capped.element.className).toBe('fe-chip-toggle fe-chip-toggle--capped');
		expect(plain.element.className).toBe('fe-chip-toggle');
	});
});

describe('createSearchInput', () => {
	it('commits on blur — the field is uncontrolled, so leaving it is what reaches the engine', () => {
		// Every caller passes an `onChange` that deliberately does nothing with the engine (books and
		// real estate pass `() => undefined`; wine paints local state only), because a substring scan of
		// the corpus per keystroke is the thing this split exists to prevent. Blur is therefore not a
		// tidy-up path — it is one of only three ways a typed query ever becomes a filter.
		const { field, onCommit } = mountSearch('waterfront');

		field.focus();
		field.blur();

		expect(onCommit).toHaveBeenCalledWith('waterfront');
	});

	it('mirrors each keystroke WITHOUT committing — the split this control exists to make', () => {
		// ⚠ This case closes no coverage gap: the site is reached, and mutant W6 (typing also commits) is
		// FATAL against the whole package without it. It is here because of WHERE the observer lives.
		//
		// Without it, the only thing watching this contract is `real-estate/panel.test.ts`'s "does not
		// filter while the query is still being typed", which asserts the CONSEQUENCE in one dataset — no
		// rule in the engine — rather than this control's own behavior. The module's central documented
		// decision ("the engine recomputes once per committed query rather than once per character")
		// would be observed only for as long as real estate keeps a description search. That is the
		// accidental-coverage shape: a branch covered by something unrelated staying the way it is.
		//
		// On wine's 150k worker tier the cost of losing this is one full Comlink round trip per
		// character, so it is worth an assertion that names it rather than one that implies it.
		const { field, onChange, onCommit } = mountSearch('');

		field.value = 'water';
		field.dispatchEvent(new Event('input', { bubbles: true }));

		expect(onChange).toHaveBeenCalledWith('water');
		expect(onCommit, 'a keystroke reached the engine').not.toHaveBeenCalled();
	});

	it('ignores every key that is neither Enter nor Escape — no commit, no blur', () => {
		// ⚠ Found by coverage, not by the probe, and the distinction is the point — see the file
		// docblock. This is the implicit `else` of the `else if`, an arm of a branch whose other
		// arms all execute, so no throw-mutant could reach it: the expression it guards runs on every
		// keystroke.
		//
		// The contract is that ordinary typing is inert here. The keydown handler is bound to the same
		// field the `input` handler is, and a version that fell through would blur the field mid-word —
		// which reads to a user as a search box that ejects them after the first letter.
		const { field, onCommit } = mountSearch('water');

		field.focus();
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));

		expect(onCommit).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(field);
	});

	it('OMITS the accessible name and the placeholder when neither is supplied', () => {
		// The other two arms coverage finds and the probe cannot: `ariaLabel ?? null` and
		// `placeholder ?? null` both fall back for a caller that passes neither, and all four callers in
		// this vertical pass both — so these two options, unlike the others, no vertical omits.
		//
		// What the fallback has to do is OMIT rather than render. `el` skips null attributes, so this
		// stays absent; the two failure modes it avoids are `placeholder="null"` — the stringified-null
		// classic — and, worse, `aria-label=""`, which does not mean "no accessible name" but "an empty
		// one", suppressing whatever a surrounding label would otherwise have contributed.
		const control = createSearchInput({ onChange: vi.fn(), onCommit: vi.fn() });

		document.body.append(control.element);

		const field = queryOrThrow<HTMLInputElement>(control.element, '.fe-search-input__field');

		expect(field.hasAttribute('aria-label')).toBe(false);
		expect(field.hasAttribute('placeholder')).toBe(false);
		expect(field.getAttribute('type')).toBe('search');
	});

	it('leaves the field on Escape — and that COMMITS, because the resulting blur does', () => {
		// 🔴 Read the parity note in the file docblock before "fixing" this. `react-ui`'s SearchInput
		// runs the identical branch: in both, Escape blurs and the blur commits whatever was typed
		// rather than discarding it. This control is UNCONTROLLED, so the text comes from the field
		// itself rather than from a prop.
		//
		// Asserted as the behavior that ships, not as the behavior Escape conventionally implies. If it
		// should instead revert to the last committed value, that is a shared decision across six
		// verticals and a change to the React original — not something to change in one vertical alone.
		const { field, onCommit } = mountSearch('waterfront');

		field.focus();
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

		expect(document.activeElement).not.toBe(field);
		expect(onCommit).toHaveBeenCalledWith('waterfront');
	});

	it('clears the field, hides its own X, and fires BOTH onChange and onCommit', () => {
		// Both callbacks, and the pairing is the contract rather than belt-and-braces. `onChange` alone
		// would empty the box and leave the engine filtering on the old query — a panel showing no
		// search text beside a result count that says otherwise, with nothing on screen to explain it.
		// `onCommit` alone would leave the caller's mirrored text stale, which is what wine paints from.
		const { clearButton, field, onChange, onCommit } = mountSearch('waterfront');

		expect(clearButton.style.display, 'the clear-X should be visible while there is text').toBe('');

		clearButton.click();

		expect(field.value).toBe('');
		expect(clearButton.style.display).toBe('none');
		expect(onChange).toHaveBeenCalledWith('');
		expect(onCommit).toHaveBeenCalledWith('');
	});

	it('adopts an external change but never clobbers what the user is actively typing', () => {
		// The guard `update` opens with, and the reason this control reads the field before writing it.
		// A repaint is not user input: `/wine` repaints on every settle of a 150k-record worker round
		// trip, and an unconditional `field.value = value` resets the caret to the end of the box each
		// time — which nobody reports as a render bug, only as a keyboard that occasionally jumps.
		//
		// Asserted on the WRITE rather than on the caret, matching `numberField.test.ts`: the mechanism
		// is what is observable, and it is the thing that would regress.
		const { control, field } = mountSearch('');
		const writes = vi.fn();

		field.value = 'water';
		vi.spyOn(field, 'value', 'set').mockImplementation(writes);

		control.update('water');
		expect(writes, 'a repaint rewrote the text the user was mid-way through typing').not.toHaveBeenCalled();

		control.update('remodeled');
		expect(writes).toHaveBeenCalledWith('remodeled');
	});
});

describe('createCheckboxControl', () => {
	it('disables the input AND marks the label, then takes BOTH back', () => {
		// The disabled state means "checking this would empty the results". Half-applying it is the
		// defect worth pinning in each direction: a disabled input with an unmarked label is an
		// unexplained dead control, and a marked label over a live input invites a click that works
		// while looking forbidden.
		//
		// The second half — clearing it — is the arm a set-without-clear bug leaves behind, and it is
		// also the `disabled = false` destructuring default, which every caller relies on by omission:
		// no vertical passes `disabled` to a checkbox at all.
		const control = createCheckboxControl({ label: 'In print', onToggle: vi.fn() });

		document.body.append(control.element);

		const input = queryOrThrow<HTMLInputElement>(control.element, 'input');

		control.update({ checked: true, disabled: true });

		expect(input.disabled).toBe(true);
		expect(control.element.className).toBe('fe-books-checkbox fe-books-checkbox--disabled');

		control.update({ checked: true });

		expect(input.disabled).toBe(false);
		expect(control.element.className).toBe('fe-books-checkbox');
	});

	it('explains a disabled box in its title, and drops the title when it is enabled again', () => {
		const control = createCheckboxControl({ label: 'In print only', onToggle: vi.fn() });

		control.update({ checked: false, disabled: true });
		expect(control.element.getAttribute('title')).toBe(TOGGLE_DISABLED_TITLE);
		expect(TOGGLE_DISABLED_TITLE).toBe('No matches given your other filters');

		control.update({ checked: false });
		expect(control.element.hasAttribute('title')).toBe(false);
	});
});

describe('createSearchInput — Enter', () => {
	it('commits ONCE on Enter, not again on the blur that Enter causes', () => {
		const { field, onCommit } = mountSearch('oak');

		field.focus();
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

		expect(document.activeElement).not.toBe(field);
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith('oak');

		// A later, ordinary blur still commits.
		field.focus();
		field.blur();
		expect(onCommit).toHaveBeenCalledTimes(2);
	});
});

describe('createChipToggleGroup — in place, keyed by value', () => {
	it('keeps the SAME button, and its focus, across a repaint that changes its state', () => {
		const control = createChipToggleGroup({ onToggle: vi.fn() });

		document.body.append(control.element);
		control.update({ options: ['red', 'white'], selected: []});

		const red = queryOrThrow<HTMLButtonElement>(control.element, 'button');

		red.focus();
		control.update({ options: ['red', 'white'], selected: ['red']});

		expect(control.element.querySelector('button')).toBe(red);
		expect(document.activeElement).toBe(red);
		expect(red.getAttribute('aria-pressed')).toBe('true');
		expect(red.className).toBe('fe-chip fe-chip--selected');
	});

	it('adds and drops chips around the ones that stay, in the new order', () => {
		const control = createChipToggleGroup({ onToggle: vi.fn() });

		document.body.append(control.element);
		control.update({ options: ['a', 'b', 'c'], selected: []});

		const b = control.element.children[1];

		b?.setAttribute('data-probe', 'kept');
		control.update({ options: ['c', 'b', 'd'], selected: []});

		expect([...control.element.children].map((chip) => chip.textContent)).toEqual(['c', 'b', 'd']);
		expect(control.element.children[1]).toBe(b);
	});

	it('takes a chip\'s title away again once it is no longer a dead end', () => {
		const control = createChipToggleGroup({ onToggle: vi.fn() });
		const exclusion = new Map([['red', { projectedCount: 0, wouldBeEmpty: true }]]);

		control.update({ exclusion, options: ['red'], selected: []});

		const red = queryOrThrow<HTMLButtonElement>(control.element, 'button');

		expect(red.disabled).toBe(true);
		expect(red.getAttribute('title')).toBe('No matches for red given your other filters');

		control.update({ options: ['red'], selected: []});
		expect(red.disabled).toBe(false);
		expect(red.hasAttribute('title')).toBe(false);
	});
});

describe('createCheckboxList', () => {
	/**
	 * Mount a list of three districts.
	 *
	 * @param showCount - Whether the count column is on.
	 * @returns The control and its toggle spy.
	 */
	function mountList(showCount?: boolean) {
		const onToggle = vi.fn();
		const control = createCheckboxList({ maxHeight: '220px', onToggle, ...(showCount === undefined ? {} : { showCount }) });

		document.body.append(control.element);

		return { control, onToggle };
	}

	/** The rows, in order. */
	function rowsOf(element: HTMLElement): HTMLLabelElement[] {
		return [...element.querySelectorAll<HTMLLabelElement>('.fe-checkbox-list__row')];
	}

	it('renders one labelled box per value inside a height-capped list', () => {
		const { control } = mountList();

		control.update({ options: ['Austin ISD', 'Round Rock ISD'], selected: ['Round Rock ISD']});

		expect(control.element.className).toBe('fe-checkbox-list');
		expect(control.element.style.maxHeight).toBe('220px');
		expect(rowsOf(control.element).map((row) => row.textContent)).toEqual(['Austin ISD', 'Round Rock ISD']);
		expect(rowsOf(control.element).map((row) => row.querySelector('input')?.checked)).toEqual([false, true]);
		expect(rowsOf(control.element)[1]?.className).toBe('fe-checkbox-list__row fe-checkbox-list__row--selected');
	});

	it('hands back the toggled value', () => {
		const { control, onToggle } = mountList();

		control.update({ options: ['Austin ISD'], selected: []});
		queryOrThrow<HTMLInputElement>(control.element, 'input').click();

		expect(onToggle).toHaveBeenCalledWith('Austin ISD');
	});

	it('shows projected counts on unselected rows only, and disables a dead end with its reason', () => {
		const { control } = mountList(true);
		const exclusion = new Map([
			['Austin ISD', { projectedCount: 1204, wouldBeEmpty: false }],
			['Round Rock ISD', { projectedCount: 0, wouldBeEmpty: true }],
			['Leander ISD', { projectedCount: 9, wouldBeEmpty: false }],
		]);

		control.update({ exclusion, options: ['Austin ISD', 'Round Rock ISD', 'Leander ISD'], selected: ['Leander ISD']});

		const [austin, roundRock, leander] = rowsOf(control.element);

		expect(austin?.querySelector('.fe-checkbox-list__count')?.textContent).toBe('1,204');
		expect(roundRock?.querySelector('input')?.disabled).toBe(true);
		expect(roundRock?.className).toContain('fe-checkbox-list__row--unavailable');
		expect(roundRock?.getAttribute('title')).toBe('No matches for Round Rock ISD given your other filters');
		expect(roundRock?.querySelector('.fe-checkbox-list__count')?.className).toBe(
			'fe-checkbox-list__count fe-checkbox-list__count--unavailable',
		);
		expect(leander?.querySelector('.fe-checkbox-list__count')).toBeNull();
	});

	it('keeps the focused box through a repaint, and drops a count it no longer shows', () => {
		const { control } = mountList(true);
		const exclusion = new Map([['Austin ISD', { projectedCount: 12, wouldBeEmpty: false }]]);

		control.update({ exclusion, options: ['Austin ISD'], selected: []});

		const box = queryOrThrow<HTMLInputElement>(control.element, 'input');

		box.focus();
		control.update({ exclusion, options: ['Austin ISD'], selected: ['Austin ISD']});

		expect(document.activeElement).toBe(box);
		expect(control.element.querySelector('.fe-checkbox-list__count')).toBeNull();
		expect(rowsOf(control.element)[0]?.hasAttribute('title')).toBe(false);
	});

	it('never shows counts when the column is off', () => {
		const { control } = mountList();
		const exclusion = new Map([['Austin ISD', { projectedCount: 12, wouldBeEmpty: false }]]);

		control.update({ exclusion, options: ['Austin ISD'], selected: []});

		expect(control.element.querySelector('.fe-checkbox-list__count')).toBeNull();
	});
});
