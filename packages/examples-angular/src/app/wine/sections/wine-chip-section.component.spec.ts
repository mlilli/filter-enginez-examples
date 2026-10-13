/**
 * Tests for `<fe-wine-chip-section>` — and specifically for the one thing about it that is easy to
 * "simplify" into a bug.
 *
 * @remarks
 * The selection is a `linkedSignal` over the committed rule, not a `computed`. Every other Angular
 * panel in this repo derives read-only and is right to; `real-estate-filter-panel.component.ts` even
 * states that as the house rule. Wine is the exception because it is worker-backed: `.core` mutations
 * are fire-and-forget and `activeRules$` only re-emits after a round trip against 130k records, so a
 * `computed` would flick the chip back OFF for the length of that trip.
 *
 * **That failure is invisible to every other gate.** It typechecks, it lints, it renders, and it only
 * misbehaves against a real worker — where the symptom is a chip that visibly un-ticks itself for a
 * few hundred milliseconds after each click. The first test is the regression guard.
 *
 * ## The fake engine is shaped like the boundary it stands in for
 *
 * `activeRules$` is a `BehaviorSubject`, because that is what `reactive-rxjs`'s replay contract
 * guarantees and what `toSignal(…, { requireSync: true })` requires. `core.addRule` is a spy that does
 * **not** push to that subject — which is not a shortcut, it is the point: fire-and-forget writes with
 * a lagging read stream ARE the worker tier, and a fake that updated the subject synchronously would
 * be modelling the main-thread engine and would let a `computed` pass.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { type FilterRule, inSet, type RuleId } from '@filter-enginez/core';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WineChipSectionComponent } from './wine-chip-section.component.js';

/** The rules map the section reads. Swapped per test to stand in for an engine settle. */
let activeRules: BehaviorSubject<ReadonlyMap<RuleId, FilterRule>>;

/** The fire-and-forget write. Deliberately does not touch {@link activeRules} — see the remarks. */
const addRule = vi.fn();

/** Present so a clear path exists; the same fire-and-forget contract applies. */
const removeRule = vi.fn();

/**
 * A structural stand-in for the engine facade. Only the two members this section touches are real.
 *
 * @returns The fake.
 */
function fakeEngine(): RxJsEngine<Wine> {
	return {
		activeRules$: activeRules.asObservable(),
		core: { addRule, removeRule },
	} as unknown as RxJsEngine<Wine>;
}

/** Host rendering one color section. */
@Component({
	imports: [WineChipSectionComponent],
	template: `
		<fe-wine-chip-section
			label="Color"
			[leaveExpressionMode]="leaveExpressionMode"
			[options]="options"
			ruleId="color"
		/>
	`,
})
class HostComponent {
	/** The candidate chips. */
	public readonly options: readonly string[] = ['red', 'white', 'rosé'];

	/** Counts calls, so the "a facet edit leaves expression mode" wiring is pinned too. */
	public readonly leaveCount = signal(0);

	/** Passed straight through as the section's required input. */
	public readonly leaveExpressionMode = (): void => {
		this.leaveCount.update((count) => count + 1);
	};
}

describe('<fe-wine-chip-section>', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/**
	 * Mount the section over the current {@link activeRules}.
	 *
	 * @returns Nothing; sets {@link fixture}.
	 */
	async function mountSection(): Promise<void> {
		await TestBed.configureTestingModule({
			imports: [HostComponent],
			providers: [provideFilterEngine(fakeEngine())],
		}).compileComponents();

		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	}

	/** The chip buttons, in vocabulary order. */
	const chips = (): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('.fe-chip'));

	/** The labels of the chips currently rendered as selected. */
	const selectedLabels = (): string[] =>
		Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.fe-chip--selected')).map(
			(chip) => chip.textContent.trim(),
		);

	/**
	 * Stand in for an engine settle — a NEW map, as `activeRules$` really emits.
	 *
	 * @param rule - The rule now committed for `color`, or `undefined` for none.
	 */
	function settle(rule?: FilterRule): void {
		const next = new Map<RuleId, FilterRule>();

		if (rule !== undefined) {
			next.set('color', rule);
		}
		activeRules.next(next);
		fixture.detectChanges();
	}

	beforeEach(() => {
		activeRules = new BehaviorSubject<ReadonlyMap<RuleId, FilterRule>>(new Map());
		addRule.mockClear();
		removeRule.mockClear();
	});

	it('keeps a clicked chip lit while the engine round trip is still in flight', async () => {
		// THE regression guard. The rules map deliberately never updates, which is what the worker tier
		// looks like between the click and the settle. A `computed` selection would read the stale map
		// and render nothing selected here.
		await mountSection();

		chips()[0]?.click();
		fixture.detectChanges();

		expect(addRule).toHaveBeenCalled();
		expect(
			selectedLabels(),
			'the chip un-ticked itself — the selection was derived read-only from the engine',
		).toEqual(['red']);
	});

	it('leaves expression mode on a facet edit', async () => {
		await mountSection();

		chips()[1]?.click();
		fixture.detectChanges();

		expect(host.leaveCount()).toBe(1);
	});

	it('adopts an engine-side change, so a ?f restore and a clear-all both land', async () => {
		// The other half. Local state that never re-seeded would ignore `loadConfig` and clear-all alike,
		// leaving chips lit over results that no longer match them.
		await mountSection();

		expect(selectedLabels()).toEqual([]);

		settle(inSet<string>('color', ['white']));

		expect(selectedLabels()).toEqual(['white']);

		settle();

		expect(selectedLabels(), 'a clear-all left stale chips lit').toEqual([]);
	});

	it('does NOT re-seed when an unrelated facet settles mid-flight', async () => {
		// The reference-stability contract `adopted-rule-state.ts` documents. Every section reads the
		// same `activeRules$`, so a varietal commit re-runs this section's source computation too. It
		// must produce the SAME absent value (`EMPTY_SELECTION`) rather than a fresh `[]`, or the local
		// paint is clobbered by a settle that had nothing to do with this facet.
		await mountSection();

		chips()[0]?.click();
		fixture.detectChanges();

		const unrelated = new Map<RuleId, FilterRule>([
			['varietal', inSet<string>('varietal', ['merlot'])],
		]);

		activeRules.next(unrelated);
		fixture.detectChanges();

		expect(selectedLabels(), 'an unrelated settle wiped the pending selection').toEqual(['red']);
	});

	it('seeds from a rule that was committed before it mounted', async () => {
		// `/wine` calls `core.loadConfig(urlConfig)` before this ever mounts. Seeding at first read is
		// what makes a shared link arrive with the right chips lit rather than blank over correct results.
		activeRules.next(new Map<RuleId, FilterRule>([['color', inSet<string>('color', ['rosé'])]]));

		await mountSection();

		expect(selectedLabels()).toEqual(['rosé']);
	});
});
