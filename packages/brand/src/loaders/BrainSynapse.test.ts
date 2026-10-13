/**
 * Tests for `<BrainSynapse />` — the wide-aspect signature loader (locked brand cyan, no theme).
 *
 * @remarks
 * jsdom render (see `../Mark.test.ts` for the environment / `createElement` rationale). The root
 * is a `<div role="img">` stage (the dark radial background is part of the loader) wrapping the SVG.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BrainSynapse } from './BrainSynapse.js';

afterEach(cleanup);

describe('BrainSynapse', () => {
	it('renders an accessible wide-aspect stage at the default width', () => {
		const { container } = render(createElement(BrainSynapse, {}));
		const root = screen.getByRole('img', { name: 'Loading' });

		expect(root.tagName.toLowerCase()).toBe('div');
		expect(root.style.width).toBe('660px');
		expect(root.style.height).toBe('220px'); // 660 * 220 / 660
		expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 660 220');
	});

	it('scales height proportionally (1/3 of width) with the width prop', () => {
		render(createElement(BrainSynapse, { width: 330 }));
		const root = screen.getByRole('img', { name: 'Loading' });

		expect(root.style.width).toBe('330px');
		expect(root.style.height).toBe('110px'); // 330 * 220 / 660
	});

	it('honors aria-label and className overrides', () => {
		const { container } = render(
			createElement(BrainSynapse, { ariaLabel: 'Fetching wines', className: 'hero' }),
		);
		const root = screen.getByRole('img', { name: 'Fetching wines' });

		expect(root).toBe(container.querySelector('div.hero'));
	});
});
