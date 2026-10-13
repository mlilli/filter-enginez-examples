/**
 * Tests for `<Wordmark />` — FILTER ENGINEZ in Orbitron with the trailing Z as the inlined mark.
 *
 * @remarks
 * jsdom render (see `Mark.test.ts` for the environment / `createElement` rationale). The type
 * color is read from the inline style; jsdom's CSSOM normalizes hex to `rgb(...)`, so the color
 * assertions use that form.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Wordmark } from './Wordmark.js';

afterEach(cleanup);

/** The inner span carrying the FILTER ENGINE lettering (the mark supplies the trailing Z). */
function typeSpan(): HTMLElement {
	return screen.getByText('FILTER ENGINE');
}

describe('Wordmark', () => {
	it('renders the accessible lockup: FILTER ENGINE type + the inlined Z mark', () => {
		render(createElement(Wordmark, {}));

		expect(screen.getByRole('img', { name: 'Filter EngineZ' })).not.toBeNull();
		expect(typeSpan().textContent).toBe('FILTER ENGINE');
		// The trailing Z is the real Mark, inlined with its own label + no rings.
		const mark = screen.getByRole('img', { name: 'Z' });

		expect(mark.querySelectorAll('path[stroke-linecap="round"]')).toHaveLength(0);
	});

	it('primary mode uses cream type and the cyan (primary) mark', () => {
		const { container } = render(createElement(Wordmark, { mode: 'primary' }));

		expect(typeSpan().style.color).toBe('rgb(241, 236, 223)'); // #F1ECDF
		expect(container.querySelector('path[fill="#22D3EE"]')).not.toBeNull();
	});

	it('subdued mode uses gray type and the subdued (no cyan) mark', () => {
		const { container } = render(createElement(Wordmark, { mode: 'subdued' }));

		expect(typeSpan().style.color).toBe('rgb(124, 118, 105)'); // #7C7669
		expect(container.querySelector('path[fill="#22D3EE"]')).toBeNull();
	});

	it('monochrome mode uses the provided color for the type (and a subdued mark)', () => {
		const { container } = render(createElement(Wordmark, { color: '#123456', mode: 'monochrome' }));

		expect(typeSpan().style.color).toBe('rgb(18, 52, 86)'); // #123456
		expect(container.querySelector('path[fill="#22D3EE"]')).toBeNull();
	});

	it('monochrome mode falls back to currentColor when no color is given', () => {
		render(createElement(Wordmark, { mode: 'monochrome' }));

		expect(typeSpan().style.color.toLowerCase()).toBe('currentcolor');
	});

	it('scales with the size prop and applies an aria-label override + className', () => {
		const { container } = render(
			createElement(Wordmark, { ariaLabel: 'Brand', className: 'wm', size: 128 }),
		);
		const root = screen.getByRole('img', { name: 'Brand' });

		expect(root).toBe(container.querySelector('span.wm'));
		expect(typeSpan().style.fontSize).toBe('128px');
	});
});
