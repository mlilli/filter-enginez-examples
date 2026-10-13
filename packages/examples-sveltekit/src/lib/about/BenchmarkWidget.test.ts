/**
 * Component test for the SvelteKit `BenchmarkWidget`.
 *
 * @remarks
 * The heavy engine workload (`loadWineCorpus` + `measureConfig`) is mocked so the test never loads the
 * corpus or runs the real simulate sweep — mirroring the React `AboutPage.test.tsx` mock. What's under
 * test is the Svelte shell: the reference-timing first paint, the three acceleration toggles, and that
 * toggling flips a switch's `aria-checked`. The timing math + reference data are React-free and covered
 * by `examples-shared`'s own unit tests.
 *
 * @packageDocumentation
 */

import type * as AboutCore from '@filter-enginez/examples-shared/about-core';

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const { default: BenchmarkWidget } = await import('./BenchmarkWidget.svelte');

afterEach(cleanup);

describe('BenchmarkWidget', () => {
	it('renders the three acceleration toggles + the reference timing headline', () => {
		render(BenchmarkWidget);

		expect(screen.getAllByRole('switch')).toHaveLength(3);
		expect(screen.getByText(/faster than naive scan/u)).toBeTruthy();
		// The result count is the constant-data half (cyan) — shown even before any live measurement.
		expect(screen.getByText(/2 rules active/u)).toBeTruthy();
	});

	it('toggling a layer flips its aria-checked (config is client state)', async () => {
		render(BenchmarkWidget);
		// `getAllByRole` throws if there are none, so the first element is always present.
		const [firstSwitch] = screen.getAllByRole('switch');

		expect(firstSwitch.getAttribute('aria-checked')).toBe('true');

		await fireEvent.click(firstSwitch);

		expect(firstSwitch.getAttribute('aria-checked')).toBe('false');
	});
});
