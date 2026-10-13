/**
 * Regression guard for the `$state.raw` engine holder in `/books/+page.svelte`.
 *
 * @remarks
 * The engine must be held in `$state.raw`, not `$state` — plain `$state` deep-proxies the object and
 * breaks its `@preact/signals-core` signals, so filtering silently stops. This renders the harness
 * (which mirrors the route's holder pattern) over a mini engine and asserts a chip toggle still narrows
 * the reactive count + grid. If someone "simplifies" the holder to `$state`, this fails.
 */

import { createFilterEngine } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import BootHarness from './BootHarness.svelte';

const DATA = [
	{ genre: 'fantasy', id: 'a', publicationYear: 2001, title: 'A' },
	{ genre: 'mystery', id: 'b', publicationYear: 2002, title: 'B' },
	{ genre: 'fantasy', id: 'c', publicationYear: 2003, title: 'C' },
];

describe('BootHarness ($state.raw engine holder)', () => {
	it('preserves engine reactivity through the parent state holder (filtering works)', async () => {
		// The mini corpus stands in for the corpus; the annotation widens it to the harness's prop type.
		const engine: SignalsEngine<unknown> = createSignalsEngine(createFilterEngine({ sourceData: DATA }));
		const { container, getByRole } = render(BootHarness, { props: { injected: engine }});

		expect(container.querySelector('.fe-result-count__number')?.textContent).toBe('3');

		await fireEvent.click(getByRole('button', { name: 'fantasy' }));

		// Grid updates synchronously; the count rolls to its new value over ~600ms (ticking animation).
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(2);
		await waitFor(() => expect(container.querySelector('.fe-result-count__number')?.textContent).toBe('2'));

		engine.dispose();
	});
});
