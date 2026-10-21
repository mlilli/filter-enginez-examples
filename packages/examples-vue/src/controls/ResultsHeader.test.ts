/**
 * Tests for the generic `<ResultsHeader>` — the count noun per dataset, and the two emitted gestures.
 *
 * @remarks
 * The word after the count is `RESULT_COPY[dataset].noun` (`bottles`, `results`, `listings`), the
 * same word every app uses. "Clear all" and a chip's × are emitted for the caller, which owns the
 * engine and the busy tracker.
 */

import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ResultsHeader from './ResultsHeader.vue';

describe('<ResultsHeader>', () => {
	it.each(['books', 'real-estate', 'wine'] as const)('puts the %s noun after the count', (dataset) => {
		const wrapper = mount(ResultsHeader, {
			props: { activeFilters: [], dataset, isBusy: false, resultCount: 3, totalCount: 9 },
		});

		expect(wrapper.find('.fe-results-header').text()).toContain(RESULT_COPY[dataset].noun);
	});

	it('emits Clear all and a chip removal for the caller to perform', async () => {
		const wrapper = mount(ResultsHeader, {
			props: {
				activeFilters: [{ label: 'Color', ruleId: 'color', value: 'red' }],
				dataset: 'wine',
				isBusy: false,
				resultCount: 3,
				totalCount: 9,
			},
		});

		await wrapper.find('button[aria-label="Remove Color filter"]').trigger('click');
		await wrapper.find('.fe-active-filters__clear').trigger('click');

		expect(wrapper.emitted('remove')).toEqual([['color']]);
		expect(wrapper.emitted('clearAll')).toEqual([[]]);
	});
});
