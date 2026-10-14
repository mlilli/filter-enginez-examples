/**
 * Tests for `<LabRoute />` — and one of them is the reason this file exists.
 *
 * @remarks
 * ### The guard
 *
 * `<DatasetRoute>`'s boot effect is keyed on entry identity, and the books entry's `boot` returns a
 * fresh `{ engine }` object on every call. So an entry synthesized IN JSX re-boots forever: effect
 * fires → boot resolves → `setBooted` → render → new identity → effect fires again. React throws
 * nothing, because the cycle turns on a resolved promise rather than a synchronous setState; the
 * symptom is a tab spinning at 100% CPU with a clean console.
 *
 * `LabRoute` avoids it by holding the entry at module scope — one line, which the next person can
 * undo in the name of readability. **"Boot is invoked exactly once across re-renders" is what
 * survives that**, where "the lab renders" would not: the looping version renders perfectly well.
 *
 * ### Why both suites mock
 *
 * `labEntry` is computed at module load from the real registry, so the `null` arm and the boot
 * counter both need the registry replaced BEFORE the module is imported — hence `vi.mock` plus a
 * dynamic import in each block rather than a static one at the top.
 *
 * @packageDocumentation
 */

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatasetEntry } from '../datasets.js';

/** Boot spy, reassigned per test so the mock factory can close over a stable reference. */
let bootSpy = vi.fn(async () => {
	await Promise.resolve();

	return { engine: {} as never };
});

/** What the mocked registry answers with — set per test before importing `LabRoute`. */
let registryEntry: DatasetEntry | undefined;

vi.mock('../datasets.js', () => ({
	findDataset: (): DatasetEntry | undefined => registryEntry,
}));

vi.mock('./LabPage.js', () => ({
	LabPage: (): React.ReactElement => <p>lab page</p>,
}));

beforeEach(() => {
	vi.resetModules();
	bootSpy = vi.fn(async () => {
		await Promise.resolve();

		return { engine: {} as never };
	});
	registryEntry = {
		id: 'books',
		label: 'Books',
		load: async () => {
			await Promise.resolve();

			return {
				boot: bootSpy,
				Component: (): null => null,
				getProgressSnapshot: () => null,
				subscribeProgress: () => () => undefined,
			};
		},
		recordNoun: 'books',
		supportsUrlState: true,
		tagline: 'a tagline',
	};
});

afterEach(() => {
	// 🔴 Without this the 404 case finds the PREVIOUS case's render and reports "lab page" present,
	// which looks exactly like the guard failing rather than like the document never being emptied.
	// The root vitest config sets no `globals: true`, so Testing Library registers no auto-cleanup.
	cleanup();
	vi.clearAllMocks();
});

describe('LabRoute', () => {
	it('boots exactly ONCE across re-renders', async () => {
		// 🔴 The guard. An entry rebuilt per render would make this number climb without bound, and
		// nothing else in the suite — or in any gate — would report it.
		const { LabRoute } = await import('./LabRoute.js');
		const { rerender } = render(
			<MemoryRouter>
				<LabRoute />
			</MemoryRouter>,
		);

		expect(await screen.findByText('lab page')).toBeDefined();

		rerender(
			<MemoryRouter>
				<LabRoute />
			</MemoryRouter>,
		);
		rerender(
			<MemoryRouter>
				<LabRoute />
			</MemoryRouter>,
		);

		expect(bootSpy).toHaveBeenCalledTimes(1);
	});

	it('renders the shared 404 when the books dataset is absent', async () => {
		// The REAL branch the route design insists on: a typo'd dataset id would otherwise render a lab over no
		// engine, which fails as a blank pane rather than as an error.
		registryEntry = undefined;

		const { LabRoute } = await import('./LabRoute.js');

		render(
			<MemoryRouter>
				<LabRoute />
			</MemoryRouter>,
		);

		expect(bootSpy).not.toHaveBeenCalled();
		expect(screen.queryByText('lab page')).toBeNull();
	});
});
