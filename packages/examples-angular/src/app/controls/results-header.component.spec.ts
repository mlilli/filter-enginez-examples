/**
 * Tests for `<fe-results-header>` — specifically for its two write paths.
 *
 * @remarks
 * Both paths are pinned because wine overrides the writes and the other routes use the fallback:
 * "clicking × removes the rule" has to hold on the fallback while the override branch does something
 * else. Adding a branch to unpinned behavior is how you end up fixing one route and quietly changing
 * the others.
 *
 * These run over a REAL engine rather than a mock, matching `books-filter-panel.spec.ts`. It matters
 * more than usual here, because the assertions the override tests actually make are about what the
 * engine is NOT asked to do — and a mock would happily report a call that a real engine would have
 * ignored.
 *
 * The summarizer is supplied rather than defaulted so the chip list is exact and includes the case
 * this override exists for: **a chip whose `ruleId` names no rule at all.** That is wine's
 * expression-mode chip, and `core.removeRule()` on it is a silent no-op — the failure mode with no
 * error attached to it.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { InSetRule, type RuleId } from '@filter-enginez/core';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import {
	createEngineBusyStream,
	createRxJsEngine,
	type EngineBusyStream,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ResultsHeaderComponent, type RuleSummarizer } from './results-header.component.js';

/** A rule id the engine really holds. */
const REAL_RULE_ID = 'genre';

/**
 * A chip id naming NO rule — a stand-in for wine's `SMART_FILTER_CHIP_ID`.
 *
 * @remarks
 * Spelled locally rather than imported so this spec keeps testing the general case: any summarizer is
 * free to emit a synthetic chip, and the contract is that the handler receives whatever it emitted.
 */
const SYNTHETIC_CHIP_ID = '__synthetic__';

/** Two books, enough for a corpus with something to filter. */
const FIXTURE_BOOKS: readonly Book[] = [
	{ genre: 'fantasy', id: 'b0', title: 'One' },
	{ genre: 'mystery', id: 'b1', title: 'Two' },
] as readonly unknown[] as readonly Book[];

/**
 * One chip per rule, plus a synthetic chip that corresponds to nothing.
 *
 * @param rules - The engine's active rules.
 * @returns The chip list.
 */
const summarize: RuleSummarizer = (rules) => [
	...[...rules.keys()].map((ruleId) => ({
		isNumeric: false,
		label: String(ruleId),
		ruleId,
		value: 'any',
	})),
	{ isNumeric: false, label: 'Preset', ruleId: SYNTHETIC_CHIP_ID, value: 'Bold reds' },
];

/** Host that can supply, or withhold, the two override handlers. */
@Component({
	imports: [ResultsHeaderComponent],
	template: `
		<fe-results-header
			[clearAllHandler]="clearAllHandler()"
			noun="books"
			[removeRuleHandler]="removeRuleHandler()"
			[summarize]="summarize"
		/>
	`,
})
class HostComponent {
	/** Set to override the per-chip × write. */
	public readonly removeRuleHandler = signal<((ruleId: RuleId) => void) | undefined>(undefined);

	/** Set to override the "Clear all" write. */
	public readonly clearAllHandler = signal<(() => void) | undefined>(undefined);

	/** Every id the remove handler was called with, in order. */
	public readonly removedIds = signal<readonly RuleId[]>([]);

	/** How many times the clear-all handler ran. */
	public readonly clearAllCount = signal(0);

	/** The chip builder — see the module remarks. */
	public readonly summarize = summarize;
}

describe('<fe-results-header> write paths', () => {
	let busy: EngineBusyStream;
	let engine: RxJsEngine<Book>;
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/**
	 * The × button of the chip with the given label.
	 *
	 * @param label - The chip's label text.
	 * @returns The remove button.
	 */
	function removeButton(label: string): HTMLButtonElement {
		const button = fixture.nativeElement.querySelector(
			`button[aria-label="Remove ${label} filter"]`,
		) as HTMLButtonElement | null;

		if (button === null) {
			throw new Error(`no remove button for chip "${label}"`);
		}

		return button;
	}

	/**
	 * The "Clear all" button.
	 *
	 * @returns The button.
	 */
	function clearAllButton(): HTMLButtonElement {
		return fixture.nativeElement.querySelector('.fe-active-filters__clear') as HTMLButtonElement;
	}

	beforeEach(async () => {
		engine = createRxJsEngine(buildBooksEngine(FIXTURE_BOOKS));
		busy = createEngineBusyStream();
		engine.core.addRule(REAL_RULE_ID, new InSetRule<string>('genre', ['fantasy']));

		await TestBed.configureTestingModule({
			imports: [HostComponent],
			providers: [provideEngineBusy(busy), provideFilterEngine(engine)],
		}).compileComponents();

		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	afterEach(() => {
		busy.dispose();
	});

	describe('with no handlers — the books / real-estate path', () => {
		it('removes the clicked rule off the engine', () => {
			expect(engine.core.getRules().has(REAL_RULE_ID)).toBe(true);

			removeButton(REAL_RULE_ID).click();

			expect(engine.core.getRules().has(REAL_RULE_ID)).toBe(false);
		});

		it('marks the busy tracker, so the indicator catches the recompute', () => {
			expect(busy.getIsBusy()).toBe(false);

			removeButton(REAL_RULE_ID).click();

			expect(busy.getIsBusy()).toBe(true);
		});

		it('clears every rule on "Clear all"', () => {
			clearAllButton().click();

			expect(engine.core.getRules().size).toBe(0);
		});
	});

	describe('with handlers — the wine path', () => {
		beforeEach(() => {
			host.removeRuleHandler.set((ruleId) => {
				host.removedIds.update((ids) => [...ids, ruleId]);
			});
			host.clearAllHandler.set(() => {
				host.clearAllCount.update((count) => count + 1);
			});
			fixture.detectChanges();
		});

		it('routes the × to the handler and leaves the engine alone', () => {
			removeButton(REAL_RULE_ID).click();

			expect(host.removedIds()).toEqual([REAL_RULE_ID]);
			// The point of the whole change: wine's removal is `removeFacet`, not `core.removeRule`.
			expect(engine.core.getRules().has(REAL_RULE_ID)).toBe(true);
		});

		it('routes a SYNTHETIC chip id to the handler', () => {
			// The case the override exists for. Down the default path this click reaches
			// `core.removeRule('__synthetic__')`, which matches nothing and reports nothing — the chip
			// would simply never go away, silently.
			removeButton('Preset').click();

			expect(host.removedIds()).toEqual([SYNTHETIC_CHIP_ID]);
		});

		it('routes "Clear all" to the handler and leaves the engine alone', () => {
			clearAllButton().click();

			expect(host.clearAllCount()).toBe(1);
			expect(engine.core.getRules().size).toBe(1);
		});

		it('does NOT mark the busy tracker — the handler owns that', () => {
			// Wine's handlers ARE the shared `wine-domain` commit helpers, and those bump `wineBusyCore`
			// themselves. Marking here as well would be a second increment on one counter through two
			// doors.
			removeButton(REAL_RULE_ID).click();
			clearAllButton().click();

			expect(busy.getIsBusy()).toBe(false);
		});
	});
});
