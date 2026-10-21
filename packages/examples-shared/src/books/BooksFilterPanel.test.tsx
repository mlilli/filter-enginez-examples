/**
 * Rendering tests for the shared books filter panel: the copy every app's books panel shares, and
 * what each search and checkbox writes.
 *
 * @remarks
 * Books keeps its own dataset conventions in all six apps, so these pin them rather than wine's: the
 * description and author searches write a rule with an empty query when cleared, while the ISBN
 * pattern removes its rule. Each checkbox asks predictive disable through `useIsToggleDisabled`, and a
 * disabled one says why in its title.
 *
 * `commitFilterMutation` calls the engine a couple of frames after the input, so engine assertions
 * wait for it.
 */

import { createFilterEngine, regex, text } from '@filter-enginez/core';
import { type Book, books } from '@filter-enginez/mock-data/books';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
	BOOKS_CHIP_SECTION_LABELS,
	BOOKS_ISBN_INVALID_MESSAGE,
	BOOKS_SEARCH_COPY,
	BOOKS_SLIDER_COPY,
	BOOKS_TOGGLE_LABELS,
} from './books-domain/panelCopy.js';
import { BooksFilterPanel } from './BooksFilterPanel.js';

beforeAll(() => {
	// The panel mounts Radix range sliders, which observe their thumbs; jsdom has no ResizeObserver
	// or pointer capture. Same shim as `react-ui`'s RangeSlider suite.
	globalThis.ResizeObserver = class {
		disconnect = (): void => undefined;
		observe = (): void => undefined;
		unobserve = (): void => undefined;
	};
	HTMLElement.prototype.hasPointerCapture = () => false;
	HTMLElement.prototype.setPointerCapture = () => undefined;
	HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterEach(cleanup);

/** The synchronous books engine core. */
type BooksCore = ReturnType<typeof createFilterEngine<Book>>;

/** A small deterministic slice of the corpus. */
const CORPUS: readonly Book[] = books.slice(0, 400);

/**
 * Mount the panel over a real engine.
 *
 * @param seed - Optional callback to apply rules before mounting.
 * @returns The engine core.
 */
function renderPanel(seed?: (core: BooksCore) => void): BooksCore {
	const core = createFilterEngine<Book>({ sourceData: CORPUS });

	seed?.(core);
	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<BooksFilterPanel />
		</FilterEngineProvider>,
	);

	return core;
}

describe('<BooksFilterPanel /> copy', () => {
	it('heads the chip sections, names the sliders and labels the checkboxes from the shared copy', () => {
		renderPanel();

		for (const heading of Object.values(BOOKS_CHIP_SECTION_LABELS)) {
			expect(screen.getByText(heading, { selector: 'h3' })).toBeDefined();
		}
		for (const { ariaLabel, label } of Object.values(BOOKS_SLIDER_COPY)) {
			expect(screen.getByText(label, { selector: '.fe-range-slider__label' })).toBeDefined();
			expect(screen.getByRole('slider', { name: `${ariaLabel} lower bound` })).toBeDefined();
		}
		for (const label of Object.values(BOOKS_TOGGLE_LABELS)) {
			expect(screen.getByRole('checkbox', { name: label })).toBeDefined();
		}
	});

	it('words the three searches from the shared copy', () => {
		renderPanel();

		for (const { ariaLabel, label, placeholder } of Object.values(BOOKS_SEARCH_COPY)) {
			expect(screen.getByText(label, { selector: 'h3' })).toBeDefined();
			expect((screen.getByLabelText<HTMLInputElement>(ariaLabel)).placeholder).toBe(placeholder);
		}
	});
});

describe('<BooksFilterPanel /> searches keep the books conventions', () => {
	it('writes an empty-query rule when the description search is cleared', async () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'sea' }));
		});
		const field = screen.getByLabelText<HTMLInputElement>(BOOKS_SEARCH_COPY.description.ariaLabel);

		fireEvent.change(field, { target: { value: '' }});
		fireEvent.blur(field);

		await waitFor(() => {
			expect((core.getRule('text-search') as { config: { query: string }} | undefined)?.config.query).toBe('');
		});
	});

	it('removes the ISBN rule when the pattern is cleared, and flags an invalid pattern', async () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('isbn-pattern', regex('isbn13', { pattern: /^978/u }));
		});
		const field = screen.getByLabelText<HTMLInputElement>(BOOKS_SEARCH_COPY.isbn.ariaLabel);

		fireEvent.change(field, { target: { value: '[' }});
		fireEvent.blur(field);
		expect(screen.getByRole('alert').textContent).toBe(BOOKS_ISBN_INVALID_MESSAGE);

		fireEvent.change(field, { target: { value: '' }});
		fireEvent.blur(field);

		await waitFor(() => {
			expect(core.getRule('isbn-pattern')).toBeUndefined();
		});
	});
});

describe('<BooksFilterPanel /> checkboxes ask predictive disable', () => {
	it('disables every unchecked toggle once nothing matches, with the shared title', async () => {
		// A description no book carries empties the results, so turning any toggle on would too.
		renderPanel((seeded) => {
			seeded.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'zzzz-no-such-text' }));
		});

		await waitFor(() => {
			for (const label of Object.values(BOOKS_TOGGLE_LABELS)) {
				const box = screen.getByRole<HTMLInputElement>('checkbox', { name: label });

				expect(box.disabled).toBe(true);
				expect(box.closest('label')?.getAttribute('title')).toBe('No matches given your other filters');
			}
		});
	});

	it('leaves the toggles enabled while they would still match', () => {
		renderPanel();

		for (const label of Object.values(BOOKS_TOGGLE_LABELS)) {
			expect((screen.getByRole<HTMLInputElement>('checkbox', { name: label })).disabled).toBe(false);
		}
	});
});

describe('<BooksFilterPanel /> checkboxes tick in the click', () => {
	// The boxes are controlled, and React puts a controlled box back to its `checked` prop as soon as
	// the change handler returns, while the rule reaches the engine two frames later. A box fed the
	// engine's state therefore stays clear through the click, which a browser test reads as
	// "clicking the checkbox did not change its state". Every other app's box ticks at once.
	it.each(Object.entries(BOOKS_TOGGLE_LABELS))('ticks "%s" before its rule reaches the engine, then commits the rule', async (_key, label) => {
		const core = renderPanel();
		const box = screen.getByRole<HTMLInputElement>('checkbox', { name: label });
		const rulesBefore = core.getRules().size;

		fireEvent.click(box);

		expect(box.checked).toBe(true);
		expect(core.getRules().size).toBe(rulesBefore);
		await waitFor(() => {
			expect(core.getRules().size).toBe(rulesBefore + 1);
		});
		expect(box.checked).toBe(true);
		expect(box.disabled).toBe(false);
	});

	it.each(Object.entries(BOOKS_TOGGLE_LABELS))('clears "%s" in the click, and the engine lets the filter go', async (_key, label) => {
		const core = renderPanel();
		const box = screen.getByRole<HTMLInputElement>('checkbox', { name: label });
		const countBefore = core.getResultCount();

		fireEvent.click(box);
		await waitFor(() => {
			expect(core.getResultCount()).toBeLessThan(countBefore);
		});

		fireEvent.click(box);

		expect(box.checked).toBe(false);
		await waitFor(() => {
			expect(core.getResultCount()).toBe(countBefore);
		});
		expect(box.checked).toBe(false);
	});
});
