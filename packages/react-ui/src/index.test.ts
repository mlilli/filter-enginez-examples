/**
 * Barrel export-presence test for `@filter-enginez/react-ui`.
 *
 * @remarks
 * Mirrors the `brand` / `worker-bridge` barrel convention: assert every runtime value the public
 * surface promises is actually re-exported. Type-only exports (props interfaces, `NumericBounds`,
 * `ExclusionMap`, etc.) erase at compile time and are covered by `tsc`, not here. Barrels
 * themselves report `0/0/0/0` coverage — that is expected, not a gap.
 */

import { describe, expect, it } from 'vitest';

import * as reactUi from './index.js';

describe('@filter-enginez/react-ui barrel', () => {
	it('re-exports every presentational component', () => {
		for (const componentName of [
			'CheckboxList',
			'ChipToggleGroup',
			'DevtoolsPanelView',
			'FilterDrawer',
			'HierarchicalPicker',
			'NumberField',
			'RangeHistogram',
			'RangeSlider',
			'ResultsHeaderView',
			'SearchInput',
			'SelectMenu',
		] as const) {
			expect(typeof reactUi[componentName]).toBe('function');
		}
	});

	it('re-exports every pure helper', () => {
		for (const helperName of [
			'applyRulesExcept',
			'clampToBounds',
			'computeHistogram',
			'deriveBaselineBounds',
			'deriveBounds',
		] as const) {
			expect(typeof reactUi[helperName]).toBe('function');
		}
	});
});
