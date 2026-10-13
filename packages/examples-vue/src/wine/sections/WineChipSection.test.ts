/**
 * Tests for `<WineChipSection>` — and specifically for the one thing about it that is easy to
 * "simplify" into a bug.
 *
 * @remarks
 * The selection is a `ref` seeded from the engine plus a one-way `watch`, not a `computed`. Every
 * other Vue panel in this repo uses a plain `computed` and is right to; wine is the exception because
 * it is worker-backed, so `.core` mutations are fire-and-forget and `activeRules` reassigns only after
 * a round trip. A `computed` would flicker the chip back OFF for the length of that trip.
 *
 * **That failure is invisible to every other gate.** It typechecks, it lints, it renders, and it only
 * misbehaves against a real worker — where the symptom is a chip that visibly un-ticks itself for a
 * few hundred milliseconds after each click. The first test below is the regression guard: it drives a
 * click against an engine whose rule map has NOT yet updated, which is exactly the worker's mid-flight
 * state, and requires the chip to stay lit.
 *
 * The second is the other half of the same contract — the watch must still adopt an engine-side
 * change, or a `?f` restore and a clear-all would leave stale chips lit.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { inSet, type InSetRule } from '@filter-enginez/core';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import WineChipSection from './WineChipSection.vue';

/** The rule signal every instance of the section subscribes to, swappable per test. */
const ruleRef = shallowRef<InSetRule<string> | undefined>(undefined);

// The section reaches the engine through `useEngineRefs(engine).rule(id)`. Faking that one call keeps
// the test about the section's own state machine rather than about the reactive adapter, which has its
// own suite. `addRule` is a spy rather than a real write for the same reason — and, crucially, so the
// rule signal does NOT update on commit. That is precisely the worker's mid-flight state.
const addRule = vi.fn();

vi.mock('@filter-enginez/vue-signals', () => ({
	useEngineRefs: () => ({ rule: () => ruleRef }),
}));

/** A structural stand-in for the engine facade; only `core.addRule` is exercised. */
function fakeEngine(): SignalsEngine<Wine> {
	return { core: { addRule, removeRule: vi.fn() }} as unknown as SignalsEngine<Wine>;
}

/**
 * Mount the section over the current `ruleRef`.
 *
 * @returns The mounted wrapper.
 */
function mountSection(): ReturnType<typeof mount> {
	return mount(WineChipSection, {
		props: {
			engine: fakeEngine(),
			label: 'Color',
			leaveExpressionMode: (): void => undefined,
			options: ['red', 'white', 'rosé'],
			ruleId: 'color',
		},
	});
}

/**
 * Read which chips are currently rendered as selected.
 *
 * @param wrapper - The mounted section.
 * @returns The selected chips' text.
 */
function selectedLabels(wrapper: ReturnType<typeof mount>): string[] {
	return wrapper.findAll('.fe-chip--selected').map((chip) => chip.text().trim());
}

describe('<WineChipSection>', () => {
	it('keeps a clicked chip lit while the engine round trip is still in flight', async () => {
		// THE regression guard. The rule signal deliberately never updates, which is what the worker tier
		// looks like between the click and the settle. A `computed` selection would read the stale rule
		// and render nothing selected here.
		ruleRef.value = undefined;

		const wrapper = mountSection();

		await wrapper.findAll('.fe-chip')[0]?.trigger('click');
		await flushPromises();

		expect(addRule).toHaveBeenCalled();
		expect(
			selectedLabels(wrapper),
			'the chip un-ticked itself — the selection was derived read-only from the engine',
		).toEqual(['red']);
	});

	it('adopts an engine-side change, so a ?f restore and a clear-all both land', async () => {
		// The other half. A local ref that never adopted would ignore `loadConfig` and clear-all alike,
		// leaving chips lit over results that no longer match them.
		ruleRef.value = undefined;

		const wrapper = mountSection();

		expect(selectedLabels(wrapper)).toEqual([]);

		ruleRef.value = inSet<string>('color', ['white']);
		await flushPromises();

		expect(selectedLabels(wrapper)).toEqual(['white']);

		ruleRef.value = undefined;
		await flushPromises();

		expect(selectedLabels(wrapper), 'a clear-all left stale chips lit').toEqual([]);
	});

	it('seeds from a rule that was committed before it mounted', async () => {
		// `/wine` calls `core.loadConfig(urlConfig)` before this ever mounts. Seeding at mount is what
		// makes a shared link arrive with the right chips lit rather than blank over correct results.
		ruleRef.value = inSet<string>('color', ['rosé']);

		const wrapper = mountSection();

		await flushPromises();

		expect(selectedLabels(wrapper)).toEqual(['rosé']);
	});
});
