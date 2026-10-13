/**
 * Tests for `<Mark />` — the canonical logomark.
 *
 * @remarks
 * Renders under jsdom (the root `vitest.config.ts` assigns the `brand` package to the jsdom
 * project). Uses `createElement` rather than JSX so the file stays off the react / jsx-a11y lint
 * surface (which scopes to `.tsx` / `.jsx`), matching the react-* packages' test convention.
 * Assertions target the SVG structure each prop branch produces — attribute-based (not inline-CSS
 * serialization, which jsdom handles unevenly).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Mark } from './Mark.js';

afterEach(cleanup);

/** The three crescent arcs are the only paths carrying `stroke-linecap="round"`. */
function arcCount(container: HTMLElement): number {
	return container.querySelectorAll('path[stroke-linecap="round"]').length;
}

describe('Mark', () => {
	it('renders an accessible svg with the default size, label, and viewBox', () => {
		render(createElement(Mark, {}));
		const svg = screen.getByRole('img', { name: 'Filter EngineZ logo' });

		expect(svg.tagName.toLowerCase()).toBe('svg');
		expect(svg.getAttribute('width')).toBe('200');
		expect(svg.getAttribute('height')).toBe('200');
		expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
	});

	it('honors the size prop on width + height', () => {
		render(createElement(Mark, { size: 48 }));
		const svg = screen.getByRole('img', { name: 'Filter EngineZ logo' });

		expect(svg.getAttribute('width')).toBe('48');
		expect(svg.getAttribute('height')).toBe('48');
	});

	it('renders the three crescent arcs by default and suppresses them with noRings', () => {
		const withRings = render(createElement(Mark, {}));

		expect(arcCount(withRings.container)).toBe(3);
		cleanup();

		const noRings = render(createElement(Mark, { noRings: true }));

		expect(arcCount(noRings.container)).toBe(0);
	});

	it('primary mode paints the cyan Z and a filled synapse core', () => {
		const { container } = render(createElement(Mark, { mode: 'primary' }));

		// The cyan Z fill is unique to primary mode.
		expect(container.querySelector('path[fill="#22D3EE"]')).not.toBeNull();
		// Primary core is two FILLED circles (glow halo + cream core), never outline-only.
		const circles = [...container.querySelectorAll('circle')];

		expect(circles).toHaveLength(2);
		expect(circles.every((c) => c.getAttribute('fill') !== 'none')).toBe(true);
	});

	it('subdued mode is outline-only — gray strokes, a single outline core, no cyan fill', () => {
		const { container } = render(createElement(Mark, { mode: 'subdued' }));

		expect(container.querySelector('path[fill="#22D3EE"]')).toBeNull();
		const circles = [...container.querySelectorAll('circle')];

		expect(circles).toHaveLength(1);
		expect(circles[0]?.getAttribute('fill')).toBe('none');
		// The subdued Z strokes use the mono-gray token.
		const grayStroked = [...container.querySelectorAll('path')].filter(
			(p) => p.getAttribute('stroke') === '#56524A',
		);

		expect(grayStroked.length).toBeGreaterThan(0);
	});

	it('drops the Z outline at favicon size (<= 16) in primary mode', () => {
		const big = render(createElement(Mark, { noRings: true, size: 200 }));

		// noRings -> only Z paths remain: 3 fill + 3 outline = 6 at full size.
		expect(big.container.querySelectorAll('path')).toHaveLength(6);
		cleanup();

		const fav = render(createElement(Mark, { noRings: true, size: 16 }));

		// Outline dropped -> only the 3 fill paths survive.
		expect(fav.container.querySelectorAll('path')).toHaveLength(3);
	});

	it('zeroes the outline stroke-width at favicon size in subdued mode', () => {
		const { container } = render(createElement(Mark, { mode: 'subdued', noRings: true, size: 16 }));
		const zPaths = [...container.querySelectorAll('path')];

		expect(zPaths).toHaveLength(3);
		expect(zPaths.every((p) => p.getAttribute('stroke-width') === '0')).toBe(true);
	});

	it('adds the breathing-synapse class only when animated', () => {
		const off = render(createElement(Mark, {}));

		expect(off.container.querySelector('.fez-synapse-breathe')).toBeNull();
		cleanup();

		const on = render(createElement(Mark, { animated: true }));

		expect(on.container.querySelector('.fez-synapse-breathe')).not.toBeNull();
	});

	it('applies an aria-label override and a className', () => {
		const { container } = render(createElement(Mark, { ariaLabel: 'Home', className: 'logo' }));
		const svg = screen.getByRole('img', { name: 'Home' });

		expect(svg).toBe(container.querySelector('svg.logo'));
	});
});
