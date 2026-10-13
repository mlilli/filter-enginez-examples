/**
 * Rendering test for real-estate predictive disable.
 *
 * @remarks
 * `predictiveDisable.test.ts` asserts the ENGINE computes the right exclusion data. That is
 * necessary but not sufficient: a correct engine is no help to a panel that never asks it. This file
 * closes that gap by rendering the section and asserting the checkbox is really `disabled`.
 *
 * A passing engine test alone would not catch a panel that leaves the field out of its query.
 */

import { createFilterEngine, type FilterBundleQuery, geo } from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterBundleContext, useFetchFilterBundle } from '../filter-bundle/index.js';
import { extractListingCoords } from './real-estate-domain/extractors.js';
import { CheckboxSection } from './RealEstateFilterSections.js';

/** A 15-mile commute radius (the panel default), in km. */
const FIFTEEN_MILES_KM = 24.14;

/** Districts the panel would derive from the corpus. */
const districts = Array.from(new Set(listings.map((l) => l.schoolDistrict))).sort();

/**
 * Mount `<CheckboxSection />` under a real engine plus the same bundle plumbing the panel uses.
 *
 * @param withDenverRadius - Whether to pre-apply the Denver geo rule.
 */
function renderSection(withDenverRadius: boolean): void {
	const core = createFilterEngine<Listing>({ sourceData: listings });

	if (withDenverRadius) {
		const denver = listings.filter((l) => l.metroArea === 'Greater Denver');

		core.addRule('geo-proximity', geo(extractListingCoords, {
			center: {
				lat: denver.reduce((sum, l) => sum + l.coordinates.lat, 0) / denver.length,
				lng: denver.reduce((sum, l) => sum + l.coordinates.lon, 0) / denver.length,
			},
			radiusKm: FIFTEEN_MILES_KM,
		}));
	}

	const engine = createSignalsEngine(core);

	/** Mirrors the panel: fetch one bundle, provide it, render the section beneath. */
	const Harness = (): React.ReactElement => {
		// Memoized to mirror the panel, not because the hook requires it — `useFetchFilterBundle`
		// keys on the query's serialized value, so an inline literal would settle too. See
		// `filter-bundle/useFetchFilterBundle.test.tsx`, which pins exactly that.
		const query = useMemo<FilterBundleQuery>(() => ({
			chipGroups: [{
				candidates: districts,
				field: 'schoolDistrict',
				kind: 'inSet' as const,
				ruleId: 'school-district',
			}],
		}), []);
		const bundle = useFetchFilterBundle<Listing>(query);
		// Memoized for the same reason the panel memoizes it: a fresh object each render would
		// re-render every consumer of the context on every render.
		const value = useMemo(() => ({ bundle }), [bundle]);

		return (
			<FilterBundleContext value={value}>
				<CheckboxSection
					ruleId="school-district"
					field="schoolDistrict"
					label="School district"
					options={districts}
				/>
			</FilterBundleContext>
		);
	};

	render(
		<FilterEngineProvider engine={engine}>
			<Harness />
		</FilterEngineProvider>,
	);
}

/**
 * The rendered checkbox for one district.
 *
 * @remarks
 * Deliberately not `getByLabelText` / `getByRole('checkbox', {name})`: the row's `<label>` wraps both
 * the district name AND the projected-count badge, so the accessible name changes from `Austin ISD`
 * to `Austin ISD 0` the moment exclusion data arrives — the query would silently stop matching
 * exactly when the behavior under test switches on. Anchoring on the name span and walking up to the
 * row keeps the lookup stable across both states.
 *
 * `jest-dom` matchers aren't wired up in this workspace, so the assertion reads `.disabled` directly.
 *
 * @param district - The district's displayed name.
 * @returns Its checkbox input.
 */
function checkboxFor(district: string): HTMLInputElement {
	const nameSpan = screen.getByText(district, { selector: '.fe-checkbox-list__label' });
	const input = nameSpan.closest('label')?.querySelector('input[type="checkbox"]');

	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`No checkbox found for district "${district}"`);
	}

	return input;
}

// This workspace doesn't enable Testing Library's auto-cleanup (no `globals: true`), so mounted
// trees would otherwise accumulate across cases and every query would match N copies.
afterEach(cleanup);

describe('<CheckboxSection /> predictive disable', () => {
	it('leaves every district enabled with no other filter active', () => {
		renderSection(false);

		expect(checkboxFor('Austin ISD').disabled).toBe(false);
		expect(checkboxFor('Denver Public').disabled).toBe(false);
	});

	it('disables an out-of-radius district once a Denver radius is active', () => {
		// At the rendering layer: an enabled checkbox here would be a click that produces zero results.
		renderSection(true);

		expect(checkboxFor('Austin ISD').disabled).toBe(true);
	});

	it('leaves in-radius districts enabled', () => {
		// Guards the opposite failure — a panel that disabled everything would pass the test above.
		renderSection(true);

		expect(checkboxFor('Denver Public').disabled).toBe(false);
	});
});
