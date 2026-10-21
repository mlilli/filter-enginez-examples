/**
 * Tests for `<ChipToggleGroup>`'s text: a chip reads as its value, then its badge.
 *
 * @remarks
 * The e2e parity cases find a chip by a pattern anchored at its value (`/^red/`) and read its label
 * without the badge, untrimmed, as a browser locator reads it. The template compiler keeps a space for
 * a line break between an interpolation and the next element, so these read `textContent` raw, never
 * through `text()`, which trims.
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ChipToggleGroup from './ChipToggleGroup.vue';

/** Two colors, both reachable, one of them selected. */
const EXCLUSION: ExclusionMap = new Map([
	['red', { projectedCount: 86_914, wouldBeEmpty: false }],
	['white', { projectedCount: 34_127, wouldBeEmpty: false }],
]);

describe('<ChipToggleGroup>', () => {
	it('renders a chip\'s text as its label then its badge, with no whitespace around or between them', () => {
		const chips = mount(ChipToggleGroup, {
			props: { exclusion: EXCLUSION, options: ['red', 'white'], selected: ['white'], showCount: true },
		}).findAll('.fe-chip');

		expect(chips.map((chip) => chip.element.textContent)).toEqual([`red(${(86_914).toLocaleString()})`, 'white']);
	});

	it('renders the bare label when no badge is asked for', () => {
		const chips = mount(ChipToggleGroup, { props: { options: ['red', 'white'], selected: []}}).findAll('.fe-chip');

		expect(chips.map((chip) => chip.element.textContent)).toEqual(['red', 'white']);
	});
});
