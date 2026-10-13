/**
 * Tests for `<BenchmarkWidget />` — the three layer toggles render, a timing readout shows, and a
 * toggle flips its `aria-checked`. The engine workload is mocked (the pure timing logic is covered by
 * `benchmarkTiming.test.ts`).
 *
 * @packageDocumentation
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BenchmarkWidget } from './BenchmarkWidget.js';

vi.mock('./benchmarkWorkload.js', () => ({
	DEFAULT_TIMED_PASSES: 7,
	DEFAULT_WARMUP_PASSES: 2,
	HEAVY_TIMED_PASSES: 20,
	loadWineCorpus: async () => Promise.resolve([]),
	measureConfig: async () => Promise.resolve({ resultCount: 0, samples: []}),
	toAcceleration: (config: unknown) => config,
}));

afterEach(cleanup);

describe('BenchmarkWidget', () => {
	it('renders three acceleration toggles and a timing readout', () => {
		const { container } = render(<BenchmarkWidget />);

		expect(container.querySelectorAll('[role="switch"]')).toHaveLength(3);
		expect(container.querySelector('.fe-bench__number')?.textContent).toContain('ms');
	});

	it('flips a toggle aria-checked on click', () => {
		render(<BenchmarkWidget />);
		const roaring = screen.getByRole('switch', { name: /roaring/i });

		expect(roaring.getAttribute('aria-checked')).toBe('true');
		fireEvent.click(roaring);
		expect(roaring.getAttribute('aria-checked')).toBe('false');
	});
});
