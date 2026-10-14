/**
 * `/wine` on the Angular app — the worker tier over `reactive-rxjs`.
 *
 * @remarks
 * **The shared flow lives in `./wineFlow.ts`**, run identically by all six verticals — among its
 * cases: boot → narrow with an InSet chip → the chip stays lit across the round trip → remove the
 * pill to restore → apply a preset (expression mode) → the shareable-`?f=` round-trip including the
 * panel CONTROL → a settled-state axe scan.
 *
 * ## What stays here: the boot screen, because it is a real state on this vertical alone
 *
 * `/books` and `/real-estate` resolve their engines before activation, so those routes have no
 * intermediate render at all. Wine's page renders a `<fe-brain-synapse>` loader while the worker
 * builds 150k records, and that loader is the whole justification for skipping the resolver. A
 * spec that only waited for the settled header would go green over a route that showed a blank page
 * for eight seconds.
 *
 * **It cannot move into the shared suite**, and not because of taste: the state it asserts is gone
 * by the time the shared `beforeEach` returns, so it has to navigate itself.
 *
 * ## The "chip stays lit" guard is the worker's, not Angular's
 *
 * `wine-chip-section.component.spec.ts` pins it against a fake engine whose rules map never
 * updates. The shared suite asserts the same property against a REAL worker, which is the only place
 * the round trip has real duration — the unit test proves the state machine, e2e proves the tier.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import { angularUrl } from './angularBase.js';
import { subtitle } from './subtitles.js';
import { describeWineVertical } from './wineFlow.js';

test.describe('Angular · wine', () => {
	test('shows a boot loader before the engine is ready, rather than a blank page', async ({ page }) => {
		// The assertion that justifies this route having no resolver. Navigation completes immediately
		// and the loader carries an accessible name, so it is reachable before the corpus is.
		//
		// Deliberately NOT wrapped in the shared boot helper: by the time that returns, this state is
		// gone.
		await page.goto(angularUrl('/wine'));

		await expect(page.getByRole('img', { name: 'Loading wine reviews' })).toBeVisible({ timeout: 15_000 });
		// And it does resolve — a loader that never goes away is the failure this is otherwise blind to.
		await expect(page.getByText(subtitle('Wine', 'angular', 'worker'))).toBeVisible({ timeout: 60_000 });
	});
});

describeWineVertical({ id: 'angular', label: 'Angular', url: angularUrl });
