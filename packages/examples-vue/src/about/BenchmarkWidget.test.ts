/**
 * Component test for the Vue `BenchmarkWidget` — parity with the SvelteKit `BenchmarkWidget.test.ts`
 * and the React `AboutPage.test.tsx`.
 *
 * @remarks
 * The heavy engine workload (`loadWineCorpus` + `measureConfig`) is mocked so the test never loads the
 * corpus or runs the real simulate sweep. What's under test is the Vue shell: the reference-timing
 * first paint, the three acceleration toggles, and that toggling flips a switch's `aria-checked`. The
 * timing math + reference data are framework-free and covered by `examples-shared`'s own unit tests.
 */

import type * as AboutCore from '@filter-enginez/examples-shared/about-core';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@filter-enginez/examples-shared/about-core', async (importActual) => {
	const actual = await importActual<typeof AboutCore>();

	return {
		...actual,
		loadWineCorpus: async (): Promise<readonly unknown[]> => {
			await Promise.resolve();

			return [];
		},
		measureConfig: async (): Promise<{ resultCount: number; samples: number[] }> => {
			await Promise.resolve();

			return { resultCount: 0, samples: []};
		},
	};
});

// Imported AFTER the mock so the widget picks up the stubbed workload.
const { default: BenchmarkWidget } = await import('./BenchmarkWidget.vue');

describe('BenchmarkWidget', () => {
	it('renders the three acceleration toggles + the reference timing headline', () => {
		const wrapper = mount(BenchmarkWidget);

		expect(wrapper.findAll('[role="switch"]')).toHaveLength(3);
		expect(wrapper.text()).toContain('faster than naive scan');
		// The result count is the constant-data half (cyan) — shown even before any live measurement.
		expect(wrapper.text()).toContain('2 rules active');
	});

	it('toggling a layer flips its aria-checked (config is client state)', async () => {
		const wrapper = mount(BenchmarkWidget);
		const [firstSwitch] = wrapper.findAll('[role="switch"]');

		if (firstSwitch === undefined) {
			throw new Error('expected three acceleration switches');
		}
		expect(firstSwitch.attributes('aria-checked')).toBe('true');

		await firstSwitch.trigger('click');

		expect(firstSwitch.attributes('aria-checked')).toBe('false');
	});
});
