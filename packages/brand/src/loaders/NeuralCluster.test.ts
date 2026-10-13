/**
 * Tests for `<NeuralCluster />` — the active-computation loader (phosphor by default; acid opt-in).
 *
 * @remarks
 * jsdom render (see `../Mark.test.ts` for the environment / `createElement` rationale).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { NeuralCluster } from './NeuralCluster.js';

afterEach(cleanup);

/** The loader's self-contained inline `<style>` block text. */
function styleText(container: HTMLElement): string {
	return container.querySelector('style')?.textContent ?? '';
}

describe('NeuralCluster', () => {
	it('renders an accessible square svg with the default size + "Computing" label', () => {
		render(createElement(NeuralCluster, {}));
		const svg = screen.getByRole('img', { name: 'Computing' });

		expect(svg.tagName.toLowerCase()).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
		expect(svg.getAttribute('width')).toBe('96');
		expect(svg.getAttribute('height')).toBe('96');
	});

	it('defaults to the phosphor theme (the dual-accent engine-activity accent)', () => {
		const { container } = render(createElement(NeuralCluster, {}));

		expect(styleText(container)).toContain('#F97316'); // phosphor loader color
		expect(styleText(container)).not.toContain('#A3E635');
	});

	it('switches to the acid theme', () => {
		const { container } = render(createElement(NeuralCluster, { theme: 'acid' }));

		expect(styleText(container)).toContain('#A3E635'); // acid loader color
		expect(styleText(container)).not.toContain('#F97316');
	});

	it('honors size, aria-label, and className overrides', () => {
		const { container } = render(
			createElement(NeuralCluster, { ariaLabel: 'Rebuilding filters', className: 'busy', size: 64 }),
		);
		const svg = screen.getByRole('img', { name: 'Rebuilding filters' });

		expect(svg.getAttribute('width')).toBe('64');
		expect(svg).toBe(container.querySelector('svg.busy'));
	});
});
