/**
 * Tests for `<ScrollRegion>` — the keyboard-focusable, named scroll container.
 *
 * @remarks
 * jsdom render via `createElement` (keeps the file off the jsx-a11y lint surface, matching the
 * react-ui test convention). Covers the accessible role/name/focusability contract plus the optional
 * `className` / `style` pass-through and `ref` forwarding.
 */

import { cleanup, render } from '@testing-library/react';
import { createElement, createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScrollRegion } from './ScrollRegion.js';

afterEach(cleanup);

describe('<ScrollRegion>', () => {
	it('renders a focusable, named group around its children', () => {
		const { getByRole } = render(
			createElement(ScrollRegion, { ariaLabel: 'Results', children: 'child text' }),
		);
		const region = getByRole('group', { name: 'Results' });

		expect(region.tagName).toBe('DIV');
		expect(region.getAttribute('tabindex')).toBe('0');
		expect(region.textContent).toBe('child text');
	});

	it('applies the optional className + style and forwards the ref', () => {
		const ref = createRef<HTMLDivElement>();

		render(
			createElement(ScrollRegion, {
				ariaLabel: 'Grid',
				children: null,
				className: 'overflow-y-auto',
				ref,
				style: { maxHeight: '40vh' },
			}),
		);

		expect(ref.current).not.toBeNull();
		expect(ref.current?.className).toBe('overflow-y-auto');
		expect(ref.current?.style.maxHeight).toBe('40vh');
	});
});
