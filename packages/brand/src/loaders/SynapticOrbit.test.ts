/**
 * Tests for `<SynapticOrbit />` — the ambient/passive loader (acid | phosphor themed).
 *
 * @remarks
 * jsdom render (see `../Mark.test.ts` for the environment / `createElement` rationale). Theme is
 * asserted via the inline `<style>` text (the loader is self-contained — colors live there).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SynapticOrbit } from './SynapticOrbit.js';

afterEach(cleanup);

/** The loader's self-contained inline `<style>` block text. */
function styleText(container: HTMLElement): string {
	return container.querySelector('style')?.textContent ?? '';
}

describe('SynapticOrbit', () => {
	it('renders an accessible square svg with the default size + label', () => {
		render(createElement(SynapticOrbit, {}));
		const svg = screen.getByRole('img', { name: 'Loading' });

		expect(svg.tagName.toLowerCase()).toBe('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
		expect(svg.getAttribute('width')).toBe('96');
		expect(svg.getAttribute('height')).toBe('96');
	});

	it('defaults to the acid theme', () => {
		const { container } = render(createElement(SynapticOrbit, {}));

		expect(styleText(container)).toContain('#A3E635'); // acid loader color
		expect(styleText(container)).not.toContain('#F97316');
	});

	it('switches to the phosphor theme', () => {
		const { container } = render(createElement(SynapticOrbit, { theme: 'phosphor' }));

		expect(styleText(container)).toContain('#F97316'); // phosphor loader color
		expect(styleText(container)).not.toContain('#A3E635');
	});

	it('scopes its CSS classes per instance so two loaders never collide', () => {
		const { container } = render(
			createElement(
				'div',
				null,
				createElement(SynapticOrbit, {}),
				createElement(SynapticOrbit, {}),
			),
		);
		const svgs = [...container.querySelectorAll('svg')];

		expect(svgs).toHaveLength(2);
		const scopeA = svgs[0]?.querySelector('g')?.getAttribute('class');
		const scopeB = svgs[1]?.querySelector('g')?.getAttribute('class');

		expect(scopeA).toBeTruthy();
		expect(scopeA).not.toBe(scopeB);
	});

	it('honors size, aria-label, and className overrides', () => {
		const { container } = render(
			createElement(SynapticOrbit, { ariaLabel: 'Warming up', className: 'ld', size: 48 }),
		);
		const svg = screen.getByRole('img', { name: 'Warming up' });

		expect(svg.getAttribute('width')).toBe('48');
		expect(svg).toBe(container.querySelector('svg.ld'));
	});
});
