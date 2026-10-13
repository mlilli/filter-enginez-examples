/**
 * Tests for `<fe-compare-page>` — the Angular shell over `compare-core`.
 *
 * @remarks
 * Same scope as the Svelte, Vue and vanilla equivalents, deliberately: `compare-core`'s
 * `core.test.ts` owns the link algebra and the state resolution, and re-asserting either through a
 * component is how a shared module's suite grows six-fold across a fan-out. What is left is the seam —
 * did THIS shell wire the shared module up, and does it put the same things on screen.
 *
 * These run through Angular's own `ng test` rather than the root Vitest config, because component
 * specs need the AOT template compile first — the same reason the Vue and SvelteKit apps self-test.
 *
 * ### `provideRouter` with this one route, and why the query is set by navigating
 *
 * The component reads `ActivatedRoute.queryParamMap`, so a fixture with no router has nothing to read.
 * Rather than stubbing `ActivatedRoute` — which would let the component and the test agree on a shape
 * the real router never produces — these navigate a real `Router` over a one-route table. That also
 * exercises the thing the snapshot-versus-observable decision was about: the component instance is
 * REUSED across a query-only navigation, so a shell reading `route.snapshot` would pass the first
 * assertion in each test and fail the second.
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
	COMPARE_PRESETS,
	DATASET_LABELS,
	URL_STATE_PARAM,
} from '@filter-enginez/examples-shared/compare-core';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { beforeEach, describe, expect, it } from 'vitest';

import { ComparePageComponent } from './compare-page.component.js';

/** A tagged value in the readable format, standing in for one a visitor arrived with. */
const INBOUND = 'h~{"version":1,"rules":[]}';

/**
 * A preset that is NOT the default, for the "honors a chosen preset" case.
 *
 * @remarks
 * The `??` is not defensive padding. `COMPARE_PRESETS.books` is typed `[ComparePreset, …ComparePreset[]]`,
 * so index 0 is guaranteed and index 1 falls in the rest portion — possibly `undefined` under
 * `noUncheckedIndexedAccess`. This app compiles `examples-shared` SOURCE (its `tsconfig.json`
 * deliberately drops `references`), and it is the program that enforces that reading; falling back to
 * the first preset keeps the assertion meaningful either way rather than asserting through a `!`.
 */
const ALTERNATE_PRESET = COMPARE_PRESETS.books[1] ?? COMPARE_PRESETS.books[0];

let fixture: ComponentFixture<ComparePageComponent>;
let router: Router;

/** Navigate to `/compare` with the given query, then settle change detection. */
async function goTo(queryParams: Record<string, string> = {}): Promise<HTMLElement> {
	await router.navigate(['/compare'], { queryParams });
	await fixture.whenStable();
	fixture.detectChanges();

	return fixture.nativeElement as HTMLElement;
}

/** Every anchor the vertical list renders. */
function rowLinks(root: HTMLElement): readonly HTMLAnchorElement[] {
	return [...root.querySelectorAll<HTMLAnchorElement>('.fe-compare__list .fe-compare__row-name')];
}

beforeEach(async () => {
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([{ component: ComparePageComponent, path: 'compare' }]),
		],
	});

	router = TestBed.inject(Router);
	fixture = TestBed.createComponent(ComparePageComponent);

	await fixture.whenStable();
});

describe('Angular /compare page', () => {
	it('renders one row per vertical, in registry order, naming each stack', async () => {
		const root = await goTo();

		expect(rowLinks(root).map((link) => link.textContent.trim())).toEqual(
			VERTICALS.map((descriptor) => descriptor.name),
		);
	});

	it('points every row at that vertical, carrying the state it displays', async () => {
		const root = await goTo();
		const serialized = root.querySelector('.fe-compare__state-value')?.textContent ?? '';

		// Non-empty first: an empty readout would render zero rows, and every per-row assertion below
		// would pass vacuously over an empty list while reporting a working page.
		expect(serialized).not.toBe('');

		const parsed = rowLinks(root).map((link) => new URL(link.href));

		expect(parsed.map((url) => url.origin)).toEqual(VERTICALS.map((descriptor) => descriptor.devOrigin));
		expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(VERTICALS.map(() => serialized));
	});

	it('falls back to the first preset on a cold visit, and says so', async () => {
		const root = await goTo();

		expect(root.querySelector('.fe-compare__state-label')?.textContent.trim()).toBe(
			`preset · ${COMPARE_PRESETS.books[0].label}`,
		);
	});

	it('honors a chosen preset over the default', async () => {
		const root = await goTo({ preset: ALTERNATE_PRESET.id });

		expect(root.querySelector('.fe-compare__state-label')?.textContent.trim()).toBe(
			`preset · ${ALTERNATE_PRESET.label}`,
		);
	});

	it('passes an inbound ?f= through VERBATIM rather than re-encoding it', async () => {
		const root = await goTo({ f: INBOUND });

		expect(root.querySelector('.fe-compare__state-value')?.textContent).toBe(INBOUND);
		expect(root.querySelector('.fe-compare__state-label')?.textContent.trim()).toBe('from your link');

		for (const url of rowLinks(root).map((link) => new URL(link.href))) {
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(INBOUND);
		}
	});

	it('hides the preset picker when the visitor arrived with their own state', async () => {
		const withState = await goTo({ f: INBOUND });

		expect(withState.querySelectorAll('.fe-compare__group')).toHaveLength(1);

		const cold = await goTo();

		expect(cold.querySelectorAll('.fe-compare__group')).toHaveLength(2);
	});

	it('re-derives the table when only the query changes', async () => {
		// The assertion the `toSignal(queryParamMap)` decision exists for. A query-only navigation
		// REUSES this component instance, so a shell reading `route.snapshot` would render the books
		// table here and never update — passing the first half of this test and failing the second.
		const books = await goTo();

		expect(rowLinks(books).map((link) => new URL(link.href).pathname)).toEqual(
			VERTICALS.map(() => '/books'),
		);

		const realEstate = await goTo({ dataset: 'real-estate' });

		expect(rowLinks(realEstate).map((link) => new URL(link.href).pathname)).toEqual(
			VERTICALS.map(() => '/real-estate'),
		);

		const selected = [...realEstate.querySelectorAll('.fe-compare__toggle--selected')];
		const dataset = selected.find((toggle) => toggle.textContent.trim() === DATASET_LABELS['real-estate']);

		expect(dataset).toBeDefined();
		expect(dataset?.getAttribute('aria-current')).toBe('true');
	});
});
