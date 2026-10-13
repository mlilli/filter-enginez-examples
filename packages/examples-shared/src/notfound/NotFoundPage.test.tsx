/**
 * Render test for `<NotFoundPage />` — the "filtered to zero" 404.
 *
 * @remarks
 * Confirms the reimagined count renders, the dead-end chips are present, toggling a chip keeps the
 * count at zero (the whole gag), and the CTA links back to the hub. Wrapped in `MemoryRouter` because
 * the component uses `useLocation` + `<Link>`.
 *
 * @packageDocumentation
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { NOT_FOUND_CHIPS, NOT_FOUND_COPY } from './core.js';
import { NotFoundPage } from './NotFoundPage.js';

afterEach(cleanup);

/** Render the page at a given (unmatched) path. */
function renderAt(path: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<NotFoundPage />
		</MemoryRouter>,
	);
}

describe('NotFoundPage', () => {
	it('renders the zero count, heading, and every dead-end chip', () => {
		const { container } = renderAt('/nope/nope');

		// Target the count by class — "0" also appears in every chip badge.
		expect(container.querySelector('.fe-notfound__count')?.textContent).toBe(NOT_FOUND_COPY.count);
		expect(screen.getByText(NOT_FOUND_COPY.heading)).toBeTruthy();
		for (const chip of NOT_FOUND_CHIPS) {
			expect(screen.getByRole('button', { name: new RegExp(chip.label, 'u') })).toBeTruthy();
		}
	});

	it('weaves the offending path into the body copy', () => {
		const { container } = renderAt('/deep/dead/end');

		expect(container.textContent).toContain('/deep/dead/end');
	});

	it('keeps the result count at zero when a chip is toggled', () => {
		const [firstChip] = NOT_FOUND_CHIPS;

		if (firstChip === undefined) {
			throw new Error('expected at least one chip');
		}
		const { container } = renderAt('/x/y');
		const chip = screen.getByRole('button', { name: new RegExp(firstChip.label, 'u') });

		fireEvent.click(chip);

		expect(chip.getAttribute('aria-pressed')).toBe('true');
		// The count is unmoved — every filter here returns the empty set.
		expect(container.querySelector('.fe-notfound__count')?.textContent).toBe(NOT_FOUND_COPY.count);
	});

	it('offers a CTA back to the dataset hub', () => {
		renderAt('/x/y');
		const cta = screen.getByRole('link', { name: NOT_FOUND_COPY.ctaLabel });

		expect(cta.getAttribute('href')).toBe(NOT_FOUND_COPY.ctaHref);
	});
});
