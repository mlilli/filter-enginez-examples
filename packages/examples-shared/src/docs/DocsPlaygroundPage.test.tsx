/**
 * Tests for the docs playground — running the real engine over a (mocked, tiny) corpus and the
 * invalid-JSON error path.
 *
 * @packageDocumentation
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocsPlaygroundPage } from './DocsPlaygroundPage.js';

vi.mock('@filter-enginez/mock-data/books', () => ({
	books: [{ id: 1, pageCount: 300, publicationYear: 2015, title: 'A Book' }],
}));
vi.mock('@filter-enginez/mock-data/wine', () => ({
	wines: [{ color: 'red', id: 1, points: 95, price: 20, title: 'A Wine' }],
}));

afterEach(cleanup);

describe('DocsPlaygroundPage', () => {
	it('runs the engine and reports a match count', async () => {
		render(<DocsPlaygroundPage />);
		fireEvent.click(screen.getByRole('button', { name: /run/i }));

		expect(await screen.findByText(/of 1 books match/)).toBeTruthy();
	});

	it('switches to the wine dataset and runs against it', async () => {
		render(<DocsPlaygroundPage />);
		fireEvent.change(screen.getByLabelText('dataset'), { target: { value: 'wine' }});
		fireEvent.click(screen.getByRole('button', { name: /run/i }));

		expect(await screen.findByText(/of 1 wine match/)).toBeTruthy();
	});

	it('surfaces an error for invalid JSON', async () => {
		const { container } = render(<DocsPlaygroundPage />);

		fireEvent.change(screen.getByLabelText('FilterEngineConfig JSON'), { target: { value: '{ not json' }});
		fireEvent.click(screen.getByRole('button', { name: /run/i }));

		await waitFor(() => {
			expect(container.querySelector('.fe-pg__error')).not.toBeNull();
		});
	});
});
