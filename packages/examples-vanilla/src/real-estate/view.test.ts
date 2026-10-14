/**
 * Functional-parity tests for the framework-less real-estate view.
 *
 * @remarks
 * Mirrors `books/view.test.ts`, the Vue `RealEstateView.test.ts` and the Svelte parity suite: mount
 * the real view over a mini corpus of `Listing`-shaped rows and prove the headline interactions behave
 * identically to the other verticals. They drive the REAL engine through the same write path the app
 * uses (`core.addRule` / `core.removeRule`, via the panel's single commit helper), so a green run
 * means the hand-written DOM commits and reads the same engine state React / Vue / Svelte / Angular
 * do — no framework, no adapter.
 *
 * ### What these are really guarding
 *
 * The clear-to-remove contract. A facet that writes an EMPTY rule instead of removing it filters to
 * zero on deselect-everything and looks, on screen, exactly like a filter that works — until the count
 * hits zero with no chip to explain it. Three cases below deselect the last selected value and assert
 * the corpus comes back, which is the only way that bug shows up in a test.
 *
 * ### Leaflet is stubbed, not loaded
 *
 * The geo section reaches the map only through a dynamic `import()` fired on the first ENABLE, and one
 * case here does enable it. The shared controller module is mocked so that import resolves to an inert
 * handle: a real Leaflet map under jsdom is a different test with different value, and the
 * controller's own lifecycle (double-init, use-after-destroy, `invalidateSize`) already has a suite
 * next to it plus the geo e2e. What is asserted here is the SEAM — that enabling mounts and disabling
 * clears the rule.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createFilterEngine, type FilterEngine } from '@filter-enginez/core';
import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMatchMedia, type MediaQueryController } from '../test-support/matchMedia.js';
import { createRealEstateView, type RealEstateView } from './view.js';

/**
 * What the stubbed map controller recorded.
 *
 * @remarks
 * `measuredWhileHidden` is the interesting field and it is not a call counter: it records, for each
 * `invalidateSize`, whether the panel was STILL hidden at the moment Leaflet was asked to measure it.
 * That is the property `view.ts`'s ordering comment is about — "asking it to measure a container that
 * is still `hidden` reads 0×0 all over again" — rather than the call order that happens to produce it.
 * Asserting the property instead of the sequence means a later refactor that reveals the panel some
 * other way keeps passing, and a plausible-looking line swap still fails.
 *
 * Hoisted because `vi.mock`'s factory is hoisted above the imports; a plain `const` would not exist
 * yet when the factory runs.
 */
const mapLog = vi.hoisted(() => ({
	createdCount: 0,
	destroyedCount: 0,
	measuredWhileHidden: [] as boolean[],
}));

// Stubbed at the module boundary the app itself uses — see the file docblock.
vi.mock('@filter-enginez/examples-shared/real-estate-map', () => ({
	createRadiusMapController: () => {
		mapLog.createdCount += 1;

		return {
			destroy: () => {
				mapLog.destroyedCount += 1;
			},
			invalidateSize: () => {
				const collapse = document.querySelector('.fe-filter-collapse');

				// Throwing rather than defaulting to `false`: a missing wrapper would otherwise record the
				// PASSING value and the ordering case would go green having measured nothing, which is the
				// exact shape of the vacuous check the mutation harness's own self-check exists to catch.
				if (collapse === null) {
					throw new Error('no .fe-filter-collapse — the ordering probe cannot answer');
				}
				mapLog.measuredWhileHidden.push(collapse.hasAttribute('hidden'));
			},
			isDestroyed: () => false,
			setCenter: () => undefined,
			setRadius: () => undefined,
		};
	},
}));

/**
 * A `Listing`-shaped row carrying every field the panel + card touch. Cast through `unknown` at the
 * boundary — the mini corpus stands in for a full `Listing`.
 */
function makeListing(overrides: { readonly id: string } & Partial<Listing>): Listing {
	return {
		addressLine1: '1 Test Way',
		bathrooms: 2,
		bedrooms: 3,
		city: 'Denver',
		coordinates: { lat: 39.7392, lon: -104.9903 },
		description: 'A remodeled home near the park.',
		features: ['garage'],
		lastUpdated: '2024-01-01T00:00:00.000Z',
		listedDate: '2024-01-01T00:00:00.000Z',
		locationId: 'CO/Greater Denver/Capitol Hill',
		lotSizeAcres: 0.25,
		metroArea: 'Greater Denver',
		mlsId: 'MLS-1',
		neighborhood: 'Capitol Hill',
		openHouseDates: [],
		photos: [],
		priceUsd: 500_000,
		propertyType: 'single-family',
		schoolDistrict: 'Denver Public Schools',
		squareFeet: 1800,
		state: 'CO',
		status: 'active',
		tier: 'default',
		title: 'A test listing',
		yearBuilt: 2000,
		zip: '80203',
		...overrides,
	} as unknown as Listing;
}

/** Four listings across three property types, two statuses and two districts, so the facets bite. */
const DATA: readonly Listing[] = [
	makeListing({ id: 'a', priceUsd: 400_000 }),
	makeListing({ id: 'b', priceUsd: 600_000, propertyType: 'condo', status: 'pending' }),
	makeListing({ features: ['garage', 'pool'], id: 'c', priceUsd: 800_000 }),
	makeListing({
		id: 'd',
		locationId: 'CO/Greater Denver/Highlands',
		neighborhood: 'Highlands',
		priceUsd: 900_000,
		propertyType: 'townhouse',
		schoolDistrict: 'Jeffco Public Schools',
	}),
];

/**
 * Mount the view over a fresh engine, repainting from one coarse subscription.
 *
 * @remarks
 * The route wires per-field signal subscriptions plus the shared bundle fetcher; this drives the
 * shared view directly, so the assertions exercise the panel and grid rather than either wiring. The
 * bundle is `null` throughout — predictive disable is an ENHANCEMENT, and every control must render
 * all-enabled without one.
 *
 * @param data - The corpus to boot over. Defaults to {@link DATA}.
 * @returns The engine and the mounted root.
 */
function mountView(data: readonly Listing[] = DATA): {
	core: FilterEngine<Listing>;
	root: HTMLElement;
} {
	const core = createFilterEngine<Listing>({ sourceData: data });
	const view = createRealEstateView(core, { footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);

	const repaint = (): void => {
		view.setCount(core.getResultCount(), data.length);
		view.setResults(core.getResults());
		view.setRules(core.getRules(), null, null);
	};

	core.subscribe(() => {
		repaint();
	});
	repaint();

	return { core, root };
}

/** The chip button whose visible text matches `label` (throws if absent, so callers avoid `!`). */
function chipByText(root: HTMLElement, label: string): HTMLElement {
	const node = [...root.querySelectorAll<HTMLElement>('.fe-chip')].find(
		(chip) => chip.textContent.trim() === label,
	);

	if (node === undefined) {
		throw new Error(`no chip with text "${label}"`);
	}

	return node;
}

/** The location-tree row whose label matches `label` (throws if absent). */
function treeRowByLabel(root: HTMLElement, label: string): HTMLElement {
	const node = [...root.querySelectorAll<HTMLElement>('.fe-tree__control')].find((row) =>
		row.textContent.includes(label),
	);

	if (node === undefined) {
		throw new Error(`no tree row labelled "${label}"`);
	}

	return node;
}

/** The distance section's enable checkbox (throws if absent). */
function geoToggle(root: HTMLElement): HTMLInputElement {
	const node = root.querySelector<HTMLInputElement>('.fe-geo input[type="checkbox"]');

	if (node === null) {
		throw new Error('expected the distance enable checkbox');
	}

	return node;
}

beforeEach(() => {
	document.body.replaceChildren();
	mapLog.createdCount = 0;
	mapLog.destroyedCount = 0;
	mapLog.measuredWhileHidden.length = 0;
});

afterEach(() => {
	// Only the teardown suite at the foot of this file installs a stub; clearing the stubs unconditionally
	// keeps every case above running against jsdom's real (absent) `matchMedia`, which is the
	// environment they were written under.
	vi.unstubAllGlobals();
});

describe('framework-less real-estate view parity', () => {
	it('renders the full corpus before any filter is applied', () => {
		const { root } = mountView();

		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(4);
		expect(root.querySelector('.fe-result-count__number')?.textContent).toBe('4');
	});

	it('renders every facet section, in panel order', () => {
		const { root } = mountView();
		const labels = [...root.querySelectorAll('.fe-filter-section-label')].map((node) =>
			node.textContent.trim(),
		);

		// Eight labelled headings; the six range sliders label themselves in their own header rows, so
		// they are counted separately — fourteen facets between them.
		expect(labels).toEqual([
			'Location',
			'Distance',
			'School district',
			'Property type',
			'Status',
			'Must-have features',
			'Listed within',
			'Description search',
		]);
		expect(root.querySelectorAll('.fe-range-slider')).toHaveLength(6);
	});

	it('uses the dataset-neutral panel classes, never the books-prefixed ones', () => {
		const { root } = mountView();

		expect(root.querySelector('.fe-filter-panel')).not.toBeNull();
		expect(root.querySelector('.fe-books-panel')).toBeNull();
	});

	it('lays out over the sidebar shell, not the books flex row', () => {
		const { root } = mountView();

		expect(root.querySelector('.fe-sidebar-app__main')).not.toBeNull();
		expect(root.querySelector('.fe-sidebar-app__filters')).not.toBeNull();
	});

	it('narrows the count + grid when a property-type chip is toggled', () => {
		const { core, root } = mountView();

		chipByText(root, 'single family').click();

		expect(core.getResultCount()).toBe(2);
		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(2);
		expect(root.querySelectorAll('.fe-filter-chip')).toHaveLength(1);
	});

	it('REMOVES the rule rather than writing an empty one when the last chip is deselected', () => {
		// The single most likely thing to get wrong in this panel. An `InSetRule` with an empty set
		// still ANDs and matches nothing, so a facet that writes one filters to zero on
		// deselect-everything — and the call looks perfectly reasonable in review.
		const { core, root } = mountView();

		chipByText(root, 'condo').click();
		expect(core.getResultCount()).toBe(1);

		chipByText(root, 'condo').click();

		expect(core.getRules().has('property-type')).toBe(false);
		expect(core.getResultCount()).toBe(4);
		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(4);
	});

	it('clears must-have features by removal too, though an empty ContainsAllRule would be neutral', () => {
		// `ContainsAllRule` with an empty `required` IS permissive — everything contains all of nothing
		// — so this facet could get away with writing one. It clears anyway, so all fourteen behave
		// identically and nobody has to remember which facet is the exception.
		const { core, root } = mountView();

		chipByText(root, 'pool').click();
		expect(core.getResultCount()).toBe(1);

		chipByText(root, 'pool').click();

		expect(core.getRules().has('must-have-features')).toBe(false);
		expect(core.getResultCount()).toBe(4);
	});

	it('commits the location hierarchy through the tree picker and clears it on deselect', () => {
		const { core, root } = mountView();

		treeRowByLabel(root, 'CO').click();
		expect(core.getRules().has('location')).toBe(true);

		treeRowByLabel(root, 'CO').click();

		expect(core.getRules().has('location')).toBe(false);
		expect(core.getResultCount()).toBe(4);
	});

	it('restores the full set when an active-filter pill is removed', () => {
		const { root } = mountView();

		chipByText(root, 'townhouse').click();
		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(1);

		const remove = root.querySelector<HTMLElement>('.fe-filter-chip__remove');

		if (remove === null) {
			throw new Error('expected an active-filter pill with a remove button');
		}
		remove.click();

		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(4);
		expect(root.querySelectorAll('.fe-filter-chip')).toHaveLength(0);
	});

	it('clears every facet via "Clear all"', () => {
		const { core, root } = mountView();

		chipByText(root, 'single family').click();
		chipByText(root, 'pool').click();
		expect(core.getRules().size).toBe(2);

		root.querySelector<HTMLElement>('.fe-active-filters__clear')?.click();

		expect(core.getRules().size).toBe(0);
		expect(root.querySelectorAll('.fe-listing-card')).toHaveLength(4);
	});
});

describe('the distance section', () => {
	it('starts collapsed, with the map frame present but hidden', () => {
		const { root } = mountView();
		const map = root.querySelector<HTMLElement>('.fe-geo__map');

		expect(geoToggle(root).checked).toBe(false);
		// Present in the DOM so enabling does not have to build it, hidden so Leaflet is never asked to
		// measure a container the user has not opened.
		expect(map).not.toBeNull();
		expect(map?.parentElement?.style.display).toBe('none');
	});

	it('writes a GeoProximityRule when enabled and removes it when switched back off', () => {
		const { core, root } = mountView();
		const toggle = geoToggle(root);

		toggle.click();

		expect(core.getRules().has('geo-proximity')).toBe(true);
		expect(toggle.checked).toBe(true);
		expect(root.querySelector<HTMLElement>('.fe-geo__map')?.parentElement?.style.display).toBe('');

		toggle.click();

		expect(core.getRules().has('geo-proximity')).toBe(false);
		expect(toggle.checked).toBe(false);
	});

	it('announces the committed radius and its center, in miles', () => {
		const { root } = mountView();

		geoToggle(root).click();

		// 15 miles is the shared default across every vertical; the center reads as coordinates until
		// the user picks a metro, which is honest rather than degraded.
		expect(root.querySelector('.fe-geo__status')?.textContent).toContain('within 15 miles of');
	});
});

describe('the listing card', () => {
	it('renders the beds · baths · sqft meta line', () => {
		const { root } = mountView([makeListing({ id: 'z' })]);

		expect(root.querySelector('.fe-listing-card__meta')?.textContent).toBe(
			'3 bd · 2 ba · 1,800 sqft',
		);
	});

	it('humanizes kebab-cased vocabulary values', () => {
		const { root } = mountView([makeListing({ id: 'z', propertyType: 'single-family' })]);

		expect(root.querySelector('.fe-listing-card__type')?.textContent).toBe('single family');
	});

	it('renders features as SEPARATE elements, capped at four', () => {
		// Asserting on the element COUNT rather than the text is what distinguishes a correct render
		// from a joined one — a single node containing every word would satisfy any textContent check.
		const { root } = mountView([
			makeListing({
				features: ['pool', 'garage', 'solar', 'fireplace', 'central-ac'],
				id: 'z',
			}),
		]);

		expect(root.querySelectorAll('.fe-listing-card__feature')).toHaveLength(4);
	});

	it('omits the features row entirely for a listing with none', () => {
		const { root } = mountView([makeListing({ features: [], id: 'z' })]);

		expect(root.querySelector('.fe-listing-card__features')).toBeNull();
	});

	it('commits a RangeRule when a slider is stepped from the keyboard', () => {
		// The fourteen sliders on this panel are built by one factory, and its `onChange` — the line
		// that turns a handle movement into an engine rule — was reached by no test: every case above
		// asserts what the panel RENDERS. A slider wired to nothing renders identically.
		//
		// Driven by keyboard rather than pointer on purpose. jsdom reports every element as 0×0, so a
		// pointer drag has no geometry to resolve against, and the arrow keys are a real affordance
		// this control supports (keyboard operability) rather than a testing back door.
		const { core, root } = mountView();
		const thumb = root.querySelector<HTMLElement>('[role="slider"]');

		if (thumb === null) {
			throw new Error('the real-estate panel must render at least one range slider');
		}
		expect(core.getRules().size).toBe(0);

		thumb.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));

		expect(core.getRules().size).toBe(1);
	});
});

/**
 * Mount over a controllable `matchMedia`, handing back the view itself so a test can tear it down.
 *
 * @remarks
 * Separate from `mountView` because these cases need two things it deliberately does not provide: a
 * stub installed BEFORE construction (`trackDesktopBreakpoint` reads `matchMedia` once, at
 * construction, so a stub installed afterwards is invisible to it) and a handle on `dispose()`.
 *
 * @param isDesktopInitially - What the media query reports at construction.
 * @returns The media controller, the mounted root, and the view.
 */
function mountForTeardown(isDesktopInitially: boolean): {
	media: MediaQueryController;
	root: HTMLElement;
	view: RealEstateView;
} {
	const media = installMatchMedia(DESKTOP_MEDIA_QUERY, isDesktopInitially);
	const core = createFilterEngine<Listing>({ sourceData: DATA });
	const view = createRealEstateView(core, { footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);

	const repaint = (): void => {
		view.setCount(core.getResultCount(), DATA.length);
		view.setResults(core.getResults());
		view.setRules(core.getRules(), null, null);
	};

	core.subscribe(() => {
		repaint();
	});
	repaint();

	return { media, root, view };
}

/**
 * Enable the distance facet and wait for the lazily-imported controller to exist.
 *
 * @remarks
 * The await is not optional. `radiusMap.mount` fires a dynamic `import()` and `invalidateSize` is a
 * no-op until it settles (`controller?.invalidateSize()`), so a test that crossed the breakpoint
 * synchronously after the click would record nothing and pass for the wrong reason.
 *
 * @param root - The mounted root.
 */
async function enableMapAndWait(root: HTMLElement): Promise<void> {
	geoToggle(root).click();

	await vi.waitFor(() => {
		expect(mapLog.createdCount).toBe(1);
	});
}

/** The panel's collapse wrapper (throws if absent, so callers avoid `!`). */
function collapseIn(root: HTMLElement): HTMLElement {
	const node = root.querySelector<HTMLElement>('.fe-filter-collapse');

	if (node === null) {
		throw new Error('expected the panel collapse wrapper');
	}

	return node;
}

describe('route teardown + the breakpoint subscription', () => {
	// The six lines of `view.ts` the suite above does not reach, each pinned by a mutant that
	// survives without this block: the whole `dispose` body, the breakpoint callback, and — as its
	// own mutant — the ORDER of the two calls inside it.

	it('destroys the Leaflet controller and detaches the matchMedia listener on dispose', async () => {
		// A leaked map is the one teardown failure with a visible symptom: revisit the route and the
		// second Leaflet instance initializes over a container the first still owns. It is also the one
		// that unit tests routinely miss, because a leak looks like nothing until the second visit.
		const { media, root, view } = mountForTeardown(true);

		await enableMapAndWait(root);

		expect(media.listenerCount()).toBe(1);
		expect(mapLog.destroyedCount).toBe(0);

		view.dispose();

		expect(media.listenerCount()).toBe(0);
		expect(mapLog.destroyedCount).toBe(1);
	});

	it('reveals the panel and re-measures the map when the viewport crosses to desktop', async () => {
		const { media, root } = mountForTeardown(false);

		await enableMapAndWait(root);

		// Mobile with the drawer shut: the panel is hidden, and Leaflet has never been asked to measure.
		expect(collapseIn(root).hasAttribute('hidden')).toBe(true);
		expect(mapLog.measuredWhileHidden).toHaveLength(0);

		media.setMatches(true);

		expect(collapseIn(root).hasAttribute('hidden')).toBe(false);
		expect(mapLog.measuredWhileHidden).toHaveLength(1);
	});

	it('never measures the map while the panel is still hidden', async () => {
		// 🔴 The case the load-bearing comment in `view.ts` exists for, and the reason this block is
		// worth having beyond a percentage. Leaflet measures its container when told to and caches the
		// answer; told while the container is `hidden` it reads 0×0 and the map renders as a sliver
		// until something else invalidates it. Swapping the two calls is a one-line, entirely
		// reasonable-looking edit that no other assertion in this repo would notice — and it reproduces
		// only in a real browser, at one viewport, on one route.
		//
		// Deliberately separate from the case above: "the callback never fires" and "the callback fires
		// in the wrong order" are different defects, and one mutant tests one of them.
		const { media, root } = mountForTeardown(false);

		await enableMapAndWait(root);
		media.setMatches(true);

		expect(mapLog.measuredWhileHidden).not.toContain(true);
	});
});
