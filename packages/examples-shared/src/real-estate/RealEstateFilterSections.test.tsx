/**
 * Rendering tests for the real-estate sections' shared behavior: what a clear writes, and the markup
 * every app's panel shares.
 *
 * @remarks
 * Each section is mounted under a real engine and the same bundle plumbing the panel uses, so the
 * assertions are about what reaches the engine (a removal, never an empty rule) and what a user or a
 * screen reader meets (named groups, counts, pressed chips).
 *
 * `commitFilterMutation` calls the engine a couple of frames after the click, so engine assertions
 * wait for it.
 */

import { createFilterEngine, type FilterBundleQuery, inSet, text } from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterBundleContext, useFetchFilterBundle } from '../filter-bundle/index.js';
import { ListedDateSection } from './ListedDateSection.js';
import { LocationSection } from './LocationSection.js';
import { buildListingLocationTree, buildLocationNodeSpecs } from './real-estate-domain/extractors.js';
import { DATE_PRESET_OPTIONS } from './real-estate-domain/filterConfig.js';
import { LOCATION_RULE_ID } from './real-estate-domain/locationLinks.js';
import {
	REAL_ESTATE_DESCRIPTION_SEARCH,
	REAL_ESTATE_LISTED_DATE_LABEL,
	REAL_ESTATE_LOCATION_TREE,
	REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
} from './real-estate-domain/panelCopy.js';
import { CheckboxSection, ChipSection, TextSection } from './RealEstateFilterSections.js';

afterEach(cleanup);

/** The synchronous real-estate engine core. */
type ListingCore = ReturnType<typeof createFilterEngine<Listing>>;

const LOCATION_TREE = buildListingLocationTree(listings);
const LOCATION_SPECS = buildLocationNodeSpecs(LOCATION_TREE);
const DISTRICTS = [...new Set(listings.map((listing) => listing.schoolDistrict))].sort();
const PROPERTY_TYPES = [...new Set(listings.map((listing) => listing.propertyType))].sort();

/**
 * Mount the sections under a real engine plus the panel's bundle plumbing.
 *
 * @param seed - Optional callback to apply rules before mounting.
 * @returns The engine core.
 */
function renderSections(seed?: (core: ListingCore) => void): ListingCore {
	const core = createFilterEngine<Listing>({ sourceData: listings });

	seed?.(core);

	/** Mirrors the panel: fetch one bundle, provide it, render the sections beneath. */
	const Harness = (): React.ReactElement => {
		const query = useMemo<FilterBundleQuery>(() => ({
			chipGroups: [
				{ candidates: LOCATION_SPECS, field: 'locationId', kind: 'inSetOfSets' as const, ruleId: LOCATION_RULE_ID },
				{ candidates: DISTRICTS, field: 'schoolDistrict', kind: 'inSet' as const, ruleId: 'school-district' },
				{ candidates: PROPERTY_TYPES, field: 'propertyType', kind: 'inSet' as const, ruleId: 'property-type' },
			],
		}), []);
		const bundle = useFetchFilterBundle<Listing>(query);
		const value = useMemo(() => ({ bundle }), [bundle]);

		return (
			<FilterBundleContext value={value}>
				<LocationSection locationNodeSpecs={LOCATION_SPECS} locationTree={LOCATION_TREE} />
				<CheckboxSection ruleId="school-district" field="schoolDistrict" label="School district" options={DISTRICTS} />
				<ChipSection ruleId="property-type" field="propertyType" label="Property type" options={PROPERTY_TYPES} />
				<ListedDateSection />
				<TextSection
					ruleId="text-search"
					field="description"
					label="Description search"
					placeholder={REAL_ESTATE_DESCRIPTION_SEARCH.placeholder}
					ariaLabel={REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel}
				/>
			</FilterBundleContext>
		);
	};

	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<Harness />
		</FilterEngineProvider>,
	);

	return core;
}

describe('deselecting the last value removes the rule', () => {
	it('for a chip group', async () => {
		const [first] = PROPERTY_TYPES as [string, ...string[]];
		const core = renderSections((seeded) => {
			seeded.addRule('property-type', inSet<string>('propertyType', [first]));
		});
		const chip = screen.getByText(first, { selector: '.fe-chip' });

		expect(chip.getAttribute('aria-pressed')).toBe('true');

		fireEvent.click(chip);

		expect(chip.getAttribute('aria-pressed')).toBe('false');
		await waitFor(() => {
			expect(core.getRule('property-type')).toBeUndefined();
		});
	});

	it('for the school-district list, which scrolls at the shared height', async () => {
		const [first] = DISTRICTS as [string, ...string[]];
		const core = renderSections((seeded) => {
			seeded.addRule('school-district', inSet<string>('schoolDistrict', [first]));
		});
		const label = screen.getByText(first, { selector: '.fe-checkbox-list__label' });
		const box = label.closest('label')?.querySelector('input') as HTMLInputElement;

		expect((label.closest('.fe-checkbox-list') as HTMLElement).style.maxHeight).toBe(REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT);

		fireEvent.click(box);

		await waitFor(() => {
			expect(core.getRule('school-district')).toBeUndefined();
		});
	});

	it('still writes the rule for a non-empty selection', async () => {
		const [first] = PROPERTY_TYPES as [string, ...string[]];
		const core = renderSections();

		fireEvent.click(screen.getByText(first, { selector: '.fe-chip' }));

		await waitFor(() => {
			expect((core.getRule('property-type') as { config: { set: readonly string[] }} | undefined)?.config.set).toEqual([first]);
		});
	});
});

describe('the description search', () => {
	it('removes the rule when the field is cleared', async () => {
		const core = renderSections((seeded) => {
			seeded.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'pool' }));
		});
		const field = screen.getByLabelText<HTMLInputElement>(REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel);

		expect(field.placeholder).toBe(REAL_ESTATE_DESCRIPTION_SEARCH.placeholder);
		expect(field.value).toBe('pool');

		fireEvent.change(field, { target: { value: '' }});
		fireEvent.blur(field);

		await waitFor(() => {
			expect(core.getRule('text-search')).toBeUndefined();
		});
	});

	it('writes a substring rule for a query', async () => {
		const core = renderSections();
		const field = screen.getByLabelText<HTMLInputElement>(REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel);

		fireEvent.change(field, { target: { value: 'pool' }});
		fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => {
			expect((core.getRule('text-search') as { config: { query: string }} | undefined)?.config.query).toBe('pool');
		});
	});
});

describe('the location tree', () => {
	it('is a named group at the shared height, with a listing count on every top-level row', async () => {
		renderSections();

		const tree = screen.getByRole('group', { name: REAL_ESTATE_LOCATION_TREE.groupLabel });

		expect(tree.style.getPropertyValue('--fe-tree-max-height')).toBe(REAL_ESTATE_LOCATION_TREE.maxHeight);

		const topLevel = LOCATION_TREE.children ?? [];

		await waitFor(() => {
			expect(tree.querySelectorAll(':scope > .fe-tree__branch > .fe-tree__row .fe-tree__count, :scope > .fe-tree__row .fe-tree__count')).toHaveLength(topLevel.length);
		});

		// With nothing else active, a state's count is every listing in it.
		const [state] = topLevel as [(typeof topLevel)[number], ...typeof topLevel];
		const stateRow = screen.getByText(state.label, { selector: '.fe-tree__label' }).closest('.fe-tree__control') as HTMLElement;
		const expected = listings.filter((listing) => listing.locationId === state.label || listing.locationId.startsWith(`${state.label}/`)).length;

		expect(stateRow.querySelector('.fe-tree__count')?.textContent).toBe(String(expected));
	});
});

describe('the listed-date presets', () => {
	it('render as pressed-state chips inside a named group', async () => {
		const core = renderSections();
		const group = screen.getByRole('group', { name: REAL_ESTATE_LISTED_DATE_LABEL });
		const chips = [...group.querySelectorAll('button')];

		expect(chips.map((chip) => chip.textContent)).toEqual(['Any time', ...DATE_PRESET_OPTIONS.map((preset) => preset.label)]);
		expect(chips.every((chip) => chip.className.split(' ').includes('fe-chip'))).toBe(true);
		expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
		expect(chips[0]?.className).toContain('fe-chip--selected');

		fireEvent.click(chips[1] as HTMLButtonElement);

		expect(chips[1]?.getAttribute('aria-pressed')).toBe('true');
		expect(chips[1]?.className).toContain('fe-chip--selected');
		expect(chips[0]?.className).not.toContain('fe-chip--selected');
		await waitFor(() => {
			expect(core.getRule('listed-date')).toBeDefined();
		});
	});
});
