/**
 * Tests for `<fe-real-estate-filter-panel>` — the fourteen-section panel.
 *
 * @remarks
 * These run over a REAL engine (`createRxJsEngine(buildRealEstateEngine(fixture))`) rather than a
 * mocked one. A mock would let the panel write any shape it liked and still pass; the value here is
 * the assertion that a control produces a specific, correctly-typed rule on a real engine, so a wiring
 * slip (right rule, wrong field; right field, wrong rule id) fails loudly.
 *
 * Four things are pinned deliberately. **The control → rule table** — fourteen sections, eight rule
 * types, the panel's actual contract with the engine. **Deselecting the last value REMOVES the rule**,
 * the most valuable group in the file: an `InSetRule` with an empty set still participates in the AND
 * and matches nothing, so a panel that wrote one would filter to zero the moment a user deselected their
 * last chip, while every control on screen looked cleared. **Selection is derived, not mirrored** —
 * `engine.core.clearRules()` is performed behind the panel's back and the controls must come back
 * empty anyway. **The listed-date presets go through `coerceDatePreset`**, because the engine accepts
 * presets this panel does not render and a rule can arrive from a `?f` link rather than from a click.
 *
 * The fixture is six hand-written listings rather than the real corpus so every assertion is exact.
 * The geo section sits in a `@defer` block, and `DeferBlockBehavior.Manual` keeps it deterministically
 * unrendered — it would otherwise mount Leaflet under jsdom. Nothing below asserts on it.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	type ComponentFixture,
	DeferBlockBehavior,
	TestBed,
} from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	dateRange,
	DateRangeRule,
	InSetofSetsRule,
	InSetRule,
	RangeRule,
	text,
	TextSearchRule,
} from '@filter-enginez/core';
import { buildRealEstateEngine } from '@filter-enginez/examples-shared/real-estate-core';
import { ContainsAllRule } from '@filter-enginez/examples-shared/real-estate-domain';
import {
	createEngineBusyStream,
	createRxJsEngine,
	type EngineBusyStream,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveRealEstateFacets, REAL_ESTATE_FACETS } from './real-estate-facets.js';
import { RealEstateFilterPanelComponent } from './real-estate-filter-panel.component.js';

/** Index of each chip group in template order. The geo section carries none. */
const CHIP_GROUP = { feature: 2, propertyType: 0, status: 1 } as const;

/** Index of each slider bound input in template order — lower then upper, six sliders. */
const SLIDER = { priceMax: 1, priceMin: 0, squareFeetMin: 2, yearBuiltMin: 8 } as const;

/**
 * Six listings across two states, four metros and four school districts, one row each, in column
 * order: `[state, metro, neighborhood, schoolDistrict, propertyType, status, features, priceUsd,
 * squareFeet, bedrooms, bathrooms, yearBuilt, lotSizeAcres, description]`.
 *
 * @remarks
 * `as const` rather than a hand-written fourteen-element tuple type: the literal types it infers are
 * exactly what `Listing`'s unions want, and the `readonly Listing[]` annotation below checks them.
 *
 * Prices, areas and lot sizes are all exact multiples of their slider `step`, so
 * `deriveBaselineBounds`' outward snap is a no-op and every baseline is exactly the corpus extent —
 * which is what lets the "a slider at its baseline extent writes no rule" assertion name a literal.
 *
 * `multi-family` and `off-market` belong to Houston alone, and `Boulder Valley` to one listing, which
 * is what gives the predictive-disable assertions something unambiguous to go dim.
 */
const FIXTURE_ROWS = [
	['CO',
		'Greater Denver',
		'Capitol Hill',
		'Denver ISD',
		'condo',
		'active',
		['garage', 'pool'],
		250_000,
		900,
		1,
		1,
		1960,
		0.1,
		'a compact walk-up with a shared courtyard'],
	['CO',
		'Greater Denver',
		'Highlands',
		'Denver ISD',
		'single-family',
		'pending',
		['garage'],
		400_000,
		1500,
		3,
		2,
		1985,
		0.2,
		'a remodeled bungalow near the park'],
	['CO',
		'Boulder',
		'Chautauqua',
		'Boulder Valley',
		'townhouse',
		'sold',
		['solar'],
		550_000,
		1800,
		3,
		2,
		1995,
		0.3,
		'a quiet townhouse backing onto the trail'],
	['TX',
		'Austin',
		'Hyde Park',
		'Austin ISD',
		'single-family',
		'active',
		['pool', 'solar'],
		700_000,
		2200,
		4,
		3,
		2005,
		0.4,
		'a waterfront lot with mature oaks'],
	['TX',
		'Austin',
		'Riverside',
		'Austin ISD',
		'condo',
		'active',
		['garage', 'solar'],
		850_000,
		2600,
		4,
		3,
		2015,
		0.5,
		'a bright loft over the greenbelt'],
	['TX',
		'Houston',
		'Montrose',
		'Houston ISD',
		'multi-family',
		'off-market',
		[],
		1_000_000,
		3000,
		5,
		4,
		2020,
		0.6,
		'a duplex with separate entrances'],
] as const;

/** The corpus the panel boots over. */
const FIXTURE_LISTINGS: readonly Listing[] = FIXTURE_ROWS.map(
	(
		[
			state,
			metroArea,
			neighborhood,
			schoolDistrict,
			propertyType,
			status,
			features,
			priceUsd,
			squareFeet,
			bedrooms,
			bathrooms,
			yearBuilt,
			lotSizeAcres,
			description,
		],
		index,
	) => ({
		addressLine1: `${String(100 + index)} Fixture Way`,
		bathrooms,
		bedrooms,
		city: metroArea,
		coordinates: { lat: 30 + index, lon: -100 - index },
		coords: { lat: 30 + index, lng: -100 - index },
		description,
		features,
		id: `listing-${String(index)}`,
		lastUpdated: '2026-01-01T00:00:00.000Z',
		listedDate: '2026-01-01T00:00:00.000Z',
		// The BARE path the location rule and the bundle query match; the picker's node ids carry a
		// `neighborhood:` prefix. Two id spaces, and getting either wrong here would silently disable
		// every location row.
		locationId: `${state}/${metroArea}/${neighborhood}`,
		lotSizeAcres,
		metroArea,
		mlsId: `MLS${String(index)}`,
		neighborhood,
		openHouseDates: [],
		photos: [],
		priceUsd,
		propertyType,
		schoolDistrict,
		squareFeet,
		state,
		status,
		tier: 'default',
		title: `Fixture listing ${String(index)}`,
		yearBuilt,
		zip: `8000${String(index)}`,
	}),
);

describe('RealEstateFilterPanelComponent', () => {
	let busy: EngineBusyStream;
	let engine: RxJsEngine<Listing>;
	let fixture: ComponentFixture<RealEstateFilterPanelComponent>;

	/** The chip buttons of one group, in vocabulary order. */
	const chips = (group: number): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(
			(
				fixture.nativeElement.querySelectorAll('fe-chip-toggle-group')[group] as
					| HTMLElement
					| undefined
			)?.querySelectorAll('button') ?? [],
		);

	/** One chip group's visible labels, comma-joined. */
	const chipLabels = (group: number): string =>
		chips(group)
			.map((button) => button.textContent.trim())
			.join(',');

	/** The school-district checklist's rows, in vocabulary order. */
	const districtRows = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('fe-checkbox-list input'));

	/** The listed-date pills. Index 0 is always the "Any time" escape. */
	const presetChips = (): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(
			fixture.nativeElement.querySelectorAll('fe-date-preset-group button'),
		);

	/** Every visible location row. Collapsed by default, so this is the two top-level states. */
	const treeRows = (): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(
			fixture.nativeElement.querySelectorAll('fe-hierarchical-picker button[role="checkbox"]'),
		);

	/** Every slider bound input, lower-then-upper per slider. */
	const sliderFields = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('.fe-range-slider__input'));

	/** The description search field — the panel's only free-text input. */
	const searchField = (): HTMLInputElement =>
		fixture.nativeElement.querySelector('fe-search-input input') as HTMLInputElement;

	/** Whatever rule currently sits under `ruleId`. */
	const ruleFor = (ruleId: string): unknown => engine.core.getRules().get(ruleId);

	/** Click any button in the panel and settle change detection. */
	const click = (button: HTMLElement | undefined): void => {
		button?.click();
		fixture.detectChanges();
	};

	// Type into the description field and blur it, which is how the panel commits text. The
	// `detectChanges()` between the two events is REQUIRED: `<fe-search-input>` emits `commit` with its
	// own `value()` input signal, which only receives the panel's mirror after change detection runs —
	// without the flush, the blur commits the PREVIOUS text.
	const commitSearch = (value: string): void => {
		const field = searchField();

		field.value = value;
		field.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		field.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
	};

	/** Type into a slider bound input and blur it, which is how the slider commits. */
	const commitSlider = (index: number, value: string): void => {
		const field = sliderFields()[index];

		if (field === undefined) {
			throw new Error(`missing slider field ${String(index)}`);
		}
		field.value = value;
		field.dispatchEvent(new Event('input'));
		field.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
	};

	beforeEach(async () => {
		engine = createRxJsEngine(buildRealEstateEngine(FIXTURE_LISTINGS));
		busy = createEngineBusyStream();

		await TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			imports: [RealEstateFilterPanelComponent],
			providers: [
				provideFilterEngine(engine),
				provideEngineBusy(busy),
				{ provide: REAL_ESTATE_FACETS, useValue: deriveRealEstateFacets(FIXTURE_LISTINGS) },
			],
		}).compileComponents();

		fixture = TestBed.createComponent(RealEstateFilterPanelComponent);
		fixture.componentRef.setInput('isPanelVisible', true);
		fixture.detectChanges();
	});

	afterEach(() => {
		busy.dispose();
	});

	it('renders one control per distinct facet value, sorted', () => {
		expect(chipLabels(CHIP_GROUP.propertyType)).toBe(
			'condo,multi family,single family,townhouse',
		);
		expect(chipLabels(CHIP_GROUP.status)).toBe('active,off market,pending,sold');
		expect(chipLabels(CHIP_GROUP.feature)).toBe('garage,pool,solar');
		expect(districtRows()).toHaveLength(4);
		// Two states (the tree opens collapsed to its top level), then six sliders at two bounds each.
		expect(treeRows()).toHaveLength(2);
		expect(sliderFields()).toHaveLength(12);
	});

	describe('every commit path writes the rule it claims to', () => {
		it('location row → InSetofSetsRule on `locationId`, the rule every app commits', () => {
			click(treeRows()[0]);

			const rule = ruleFor('location');

			expect(rule).toBeInstanceOf(InSetofSetsRule);
			expect((rule as InSetofSetsRule<string>).field).toBe('locationId');
			// One set, for the clicked state: its own id first, then everything beneath it.
			expect((rule as InSetofSetsRule<string>).config.set.map((set) => set[0])).toEqual(['CO']);
			// Three Colorado listings — the rule has to actually match through the hierarchy. That it still
			// does after a `?f=` round trip is pinned for the shared rule by `linkSerializer.test.ts`.
			expect(engine.core.getResultCount()).toBe(3);
		});

		it('school-district row → InSetRule on `schoolDistrict`', () => {
			click(districtRows()[0]);

			const rule = ruleFor('school-district');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).field).toBe('schoolDistrict');
			expect((rule as InSetRule<string>).config.set).toEqual(['Austin ISD']);
			expect(engine.core.getResultCount()).toBe(2);
		});

		it('property-type chip → InSetRule on `propertyType`', () => {
			click(chips(CHIP_GROUP.propertyType)[0]);

			const rule = ruleFor('property-type');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).field).toBe('propertyType');
			expect((rule as InSetRule<string>).config.set).toEqual(['condo']);
		});

		it('status chip → InSetRule on `status`', () => {
			click(chips(CHIP_GROUP.status)[2]);

			const rule = ruleFor('status');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).field).toBe('status');
			expect((rule as InSetRule<string>).config.set).toEqual(['pending']);
		});

		it('must-have-features chip → ContainsAllRule on `features`', () => {
			// The one CONJUNCTIVE facet: two clicks mean "has BOTH", not "has either".
			click(chips(CHIP_GROUP.feature)[0]);
			click(chips(CHIP_GROUP.feature)[2]);

			const rule = ruleFor('must-have-features');

			expect(rule).toBeInstanceOf(ContainsAllRule);
			expect((rule as ContainsAllRule).field).toBe('features');
			expect((rule as ContainsAllRule).config.required).toEqual(['garage', 'solar']);
			expect(engine.core.getResultCount()).toBe(1);
		});

		it('price slider → RangeRule on `priceUsd`', () => {
			commitSlider(SLIDER.priceMin, '$550,000');

			const rule = ruleFor('price');

			expect(rule).toBeInstanceOf(RangeRule);
			expect((rule as RangeRule).field).toBe('priceUsd');
			expect((rule as RangeRule).config.min).toBe(550_000);
			expect(engine.core.getResultCount()).toBe(4);
		});

		it('square-feet and year-built sliders carry their own fields, not the price one', () => {
			// One table renders all six, so a mis-keyed row would give them all the same field. The
			// year is 2005 rather than 1995 on purpose: the first commit narrows the results to four
			// listings, which pulls year-built's AVAILABLE floor up to 1995 — so committing 1995 would
			// land exactly on the handle and correctly emit nothing.
			commitSlider(SLIDER.squareFeetMin, '1,800 sqft');
			commitSlider(SLIDER.yearBuiltMin, '2005');

			expect((ruleFor('square-feet') as RangeRule).field).toBe('squareFeet');
			expect((ruleFor('year-built') as RangeRule).field).toBe('yearBuilt');
			expect((ruleFor('year-built') as RangeRule).config.min).toBe(2005);
		});

		it('listed-date pill → DateRangeRule on `listedDate` carrying the preset', () => {
			click(presetChips()[1]);

			const rule = ruleFor('listed-date');

			expect(rule).toBeInstanceOf(DateRangeRule);
			expect((rule as DateRangeRule).field).toBe('listedDate');
			expect((rule as DateRangeRule).config.preset).toBe('last-7-days');
		});

		it('description search → TextSearchRule on `description`', () => {
			// The query is trimmed on commit — whitespace from a paste must not be searched for.
			commitSearch('  waterfront  ');

			const rule = ruleFor('text-search');

			expect(rule).toBeInstanceOf(TextSearchRule);
			expect((rule as TextSearchRule).field).toBe('description');
			expect((rule as TextSearchRule).config).toMatchObject({
				caseSensitive: false,
				mode: 'substring',
				query: 'waterfront',
			});
			expect(engine.core.getResultCount()).toBe(1);
		});

		it('marks a user action before each commit, so the busy indicator leads the engine', () => {
			expect(busy.getIsBusy()).toBe(false);

			click(chips(CHIP_GROUP.propertyType)[0]);

			expect(busy.getIsBusy()).toBe(true);
		});
	});

	// The single most valuable group in this file. An InSetRule with an empty set still ANDs and matches
	// nothing, so a panel that wrote one would filter to zero the moment the user deselected their last
	// chip — with every control on screen looking cleared.
	describe('clearing a facet REMOVES its rule rather than writing an empty one', () => {
		it('chips: deselecting the last chip of a group drops that group rule', () => {
			// `ContainsAllRule` with an empty `required` IS neutral, so must-have features could get
			// away with writing one. It clears anyway, so all fourteen facets behave identically.
			for (const [group, ruleId] of [
				[CHIP_GROUP.propertyType, 'property-type'],
				[CHIP_GROUP.status, 'status'],
				[CHIP_GROUP.feature, 'must-have-features'],
			] as const) {
				click(chips(group)[0]);
				click(chips(group)[0]);

				expect(ruleFor(ruleId)).toBeUndefined();
			}
			expect(engine.core.getResultCount()).toBe(FIXTURE_LISTINGS.length);
		});

		it('school district: clearing the last row drops the rule', () => {
			click(districtRows()[0]);
			click(districtRows()[0]);

			expect(ruleFor('school-district')).toBeUndefined();
			expect(engine.core.getResultCount()).toBe(FIXTURE_LISTINGS.length);
		});

		it('location: deselecting the last node drops the rule', () => {
			click(treeRows()[0]);
			click(treeRows()[0]);

			expect(ruleFor('location')).toBeUndefined();
			expect(engine.core.getResultCount()).toBe(FIXTURE_LISTINGS.length);
		});

		it('listed-date: the "Any time" pill drops the rule', () => {
			click(presetChips()[1]);
			click(presetChips()[0]);

			expect(ruleFor('listed-date')).toBeUndefined();
		});

		it('description: an emptied field drops the rule rather than committing an empty query', () => {
			commitSearch('waterfront');
			commitSearch('   ');

			expect(ruleFor('text-search')).toBeUndefined();
		});
	});

	it('opens each slider at its baseline, and writes no rule when committed there', () => {
		// The baselines ARE the corpus extents here, so re-committing one is a no-op — and the slider
		// must recognize that rather than registering a rule that constrains nothing but still shows
		// up as an active filter chip.
		expect(sliderFields()[SLIDER.priceMin]?.value).toBe('$250,000');

		commitSlider(SLIDER.priceMin, '$250,000');
		commitSlider(SLIDER.priceMax, '$1,000,000');

		expect(ruleFor('price')).toBeUndefined();
	});

	it('runs the listed-date presets through coerceDatePreset', () => {
		click(presetChips()[3]);

		expect(presetChips()[3]?.getAttribute('aria-pressed')).toBe('true');
		expect((ruleFor('listed-date') as DateRangeRule).config.preset).toBe('last-90-days');

		// `all-time` is in the engine's vocabulary and not in the panel's, and a rule can arrive from a
		// shared `?f` link rather than from a click. Showing nothing active is the honest rendering;
		// highlighting an unrelated pill would not be.
		engine.core.addRule('listed-date', dateRange('listedDate', { preset: 'all-time' }));
		fixture.detectChanges();

		// Only the "Any time" escape reads as active — no other pill claims a preset it cannot render.
		expect(presetChips()[0]?.getAttribute('aria-pressed')).toBe('true');
		expect(presetChips().filter((chip) => chip.ariaPressed === 'true')).toHaveLength(1);
	});

	describe('selection is derived from engine state, never mirrored', () => {
		it('reflects an external clearRules() without being told', () => {
			// Performed behind the panel's back — exactly what "Clear all" and chip removal do from the
			// results header. If any control kept a private copy of its selection, it would still be
			// showing it here.
			click(chips(CHIP_GROUP.propertyType)[0]);
			click(chips(CHIP_GROUP.status)[2]);
			click(districtRows()[0]);
			click(treeRows()[0]);
			commitSearch('waterfront');

			expect(chips(CHIP_GROUP.propertyType)[0]?.getAttribute('aria-pressed')).toBe('true');

			engine.core.clearRules();
			fixture.detectChanges();

			expect(chips(CHIP_GROUP.propertyType)[0]?.getAttribute('aria-pressed')).toBe('false');
			expect(chips(CHIP_GROUP.status)[2]?.getAttribute('aria-pressed')).toBe('false');
			expect(districtRows()[0]?.checked).toBe(false);
			expect(treeRows()[0]?.getAttribute('aria-checked')).toBe('false');
			expect(searchField().value).toBe('');

			// The description input is the one place a local copy exists; the same effect that empties
			// it re-seeds it from a rule written from outside, which is what lets a `?f` restore
			// populate the field.
			engine.core.addRule(
				'text-search',
				text('description', { caseSensitive: false, mode: 'substring', query: 'bungalow' }),
			);
			fixture.detectChanges();

			expect(searchField().value).toBe('bungalow');
		});
	});

	it('dims a chip whose selection would empty the result set, from the first render', () => {
		// The synchronous seed request in the constructor is what makes this true on render zero rather
		// than a tick later. Every fixture value is reachable with no other filter active.
		expect(chips(CHIP_GROUP.propertyType).some((chip) => chip.disabled)).toBe(false);

		// `multi-family` is Houston's alone, so committing Austin ISD makes it unreachable.
		click(districtRows()[0]);

		expect(chips(CHIP_GROUP.propertyType)[1]?.disabled).toBe(true);
		expect(chips(CHIP_GROUP.propertyType)[0]?.disabled).toBe(false);
	});
});
