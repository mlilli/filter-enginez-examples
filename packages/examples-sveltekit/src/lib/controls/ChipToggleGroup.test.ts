/**
 * Tests for `<ChipToggleGroup>`'s text: a chip reads as its value, then its badge.
 *
 * @remarks
 * The e2e parity cases find a chip by a pattern anchored at its value (`/^red/`) and read its label
 * without the badge, untrimmed, as a browser locator reads it. Svelte keeps one space where a line
 * break separates two nodes, so these read `textContent` raw: `red(86,914)`, as in every app.
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import ChipToggleGroup from './ChipToggleGroup.svelte';

// Not automatic in this app's vitest setup; see `HierarchicalPicker.test.ts`.
afterEach(cleanup);

/** Two colors, both reachable. */
const EXCLUSION: ExclusionMap = new Map([
	['red', { projectedCount: 86_914, wouldBeEmpty: false }],
	['white', { projectedCount: 34_127, wouldBeEmpty: false }],
]);

describe('<ChipToggleGroup>', () => {
	it('renders a chip\'s text as its label then its badge, with no whitespace around or between them', () => {
		const { container } = render(ChipToggleGroup, {
			exclusion: EXCLUSION,
			onToggle: () => undefined,
			options: ['red', 'white'],
			selected: ['white'],
			showCount: true,
		});
		const texts = [...container.querySelectorAll('.fe-chip')].map((chip) => chip.textContent);

		expect(texts).toEqual([`red(${(86_914).toLocaleString()})`, 'white']);
	});
});
