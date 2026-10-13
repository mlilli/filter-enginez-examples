/**
 * Render test for the reusable `<RuleFigure />` — one row per sample cell, pass/fail styling, the
 * match count, and the six-row cap.
 *
 * @packageDocumentation
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RuleFigure } from './RuleFigure.js';

afterEach(cleanup);

describe('RuleFigure', () => {
	it('renders the predicate, one row per cell, and the match count', () => {
		const { container } = render(
			<RuleFigure spec={{ cells: [{ label: 'a', pass: true }, { label: 'b', pass: false }], predicate: 'x > 0' }} />,
		);
		const figure = container.querySelector('.fe-rulefig');

		expect(figure?.getAttribute('role')).toBe('img');
		expect(container.textContent).toContain('x > 0');
		expect(container.querySelectorAll('.fe-rulefig__row')).toHaveLength(2);
		expect(container.querySelector('.fe-rulefig__row.is-pass')).not.toBeNull();
		expect(container.querySelector('.fe-rulefig__row.is-fail')).not.toBeNull();
		expect(container.textContent).toContain('1 of 2 match');
	});

	it('caps at six rows', () => {
		const cells = Array.from({ length: 9 }, (_unused, position) => ({ label: `c${position}`, pass: position % 2 === 0 }));
		const { container } = render(<RuleFigure spec={{ cells, predicate: 'p' }} />);

		expect(container.querySelectorAll('.fe-rulefig__row')).toHaveLength(6);
	});
});
