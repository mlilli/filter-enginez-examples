/**
 * The boot-failure screen every dataset route shows when its engine could not start.
 *
 * @remarks
 * Pins the shape every app shares (a `<main>` around a `role="alert"` card holding the title, the
 * error's message, and the hint) and that the words are `BOOT_FAILURE_COPY`'s, per dataset, so the
 * vanilla screens cannot drift from the other five apps' without this file failing.
 *
 * @packageDocumentation
 */

import { BOOT_FAILURE_COPY, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';
import { el } from '@filter-enginez/examples-shared/dom';
import { describe, expect, it } from 'vitest';

import { bootFailureMessage, createBootFailure } from './bootFailure.js';

/** Every dataset a boot can fail for. */
const DATASETS: readonly BootFailureDataset[] = ['books', 'real-estate', 'wine'];

/**
 * The text of each paragraph inside the screen's alert.
 *
 * @param screen - The screen's root.
 * @returns The lines, in order.
 */
function alertLines(screen: HTMLElement): (string | null)[] {
	return [...(screen.querySelector('[role="alert"]')?.querySelectorAll('p') ?? [])].map((line) => line.textContent);
}

describe('createBootFailure', () => {
	it.each(DATASETS)('renders main > [role=alert] with the shared %s title, the message and the hint', (dataset) => {
		const screen = createBootFailure(dataset, 'corpus fetch failed');

		// The alert sits inside the landmark; a role on the `<main>` itself would replace it.
		expect(screen.tagName).toBe('MAIN');
		expect(screen.getAttribute('role')).toBeNull();
		expect(screen.querySelector(':scope > [role="alert"]')).not.toBeNull();
		expect(alertLines(screen)).toEqual([
			BOOT_FAILURE_COPY[dataset].title,
			'corpus fetch failed',
			BOOT_FAILURE_COPY[dataset].hint,
		]);
	});

	it('uses the books and real-estate wording every app shows', () => {
		// Non-vacuous: the cases above would pass over an empty copy record.
		expect(alertLines(createBootFailure('books', 'x'))[0]).toBe('The books engine could not start.');
		expect(alertLines(createBootFailure('real-estate', 'x'))[0]).toBe('The real-estate engine could not start.');
		expect(alertLines(createBootFailure('books', 'x'))[2]).toBe('Refresh the page to retry.');
	});

	it('follows the hint with the extra line, in the same paragraph, after a space', () => {
		const screen = createBootFailure('wine', 'worker never handshook', ['Set ', el('code', { text: 'X=1' }), ' instead.']);

		expect(alertLines(screen)[2]).toBe(`${BOOT_FAILURE_COPY.wine.hint} Set X=1 instead.`);
		expect(screen.querySelector('[role="alert"] code')?.textContent).toBe('X=1');
	});

	it('renders a message as text, never as markup', () => {
		const screen = createBootFailure('books', '<img src=x onerror=alert(1)>');

		expect(screen.querySelector('img')).toBeNull();
		expect(alertLines(screen)[1]).toBe('<img src=x onerror=alert(1)>');
	});
});

describe('bootFailureMessage', () => {
	it('reads an Error’s message', () => {
		expect(bootFailureMessage(new Error('corpus fetch failed'))).toBe('corpus fetch failed');
	});

	it('shows any other rejection reason as text', () => {
		expect(bootFailureMessage('worker script failed to load')).toBe('worker script failed to load');
		expect(bootFailureMessage(404)).toBe('404');
	});
});
