/**
 * Tests for `<fe-wine-smart-filters>` — applying a preset REPLACES the manual filters.
 *
 * @remarks
 * The row writes through the shared `commitSmartFilterSelection`, the same helper every vertical's
 * preset row calls: a non-empty selection clears every flat facet rule before it sets the expression,
 * and each write marks the action busy first. Each facet section adopts its own rule's removal off
 * `activeRules$`, which `wine-chip-section.component.spec.ts` pins; this suite pins what the row
 * writes, over a real engine.
 *
 * It also pins the way back out of a RESTORED preset, from a link written today and from one written
 * by engine 0.0.3 (whose inline rules carry no `inline` mark). A restore registers none of the preset's
 * leaves, so "Clear smart filters" gives back the full corpus: leaves left behind as flat rules would
 * start filtering the moment the expression went, with no chip on screen to explain them.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { createFilterEngine, type FilterEngine, type FilterEngineConfig, inSet } from '@filter-enginez/core';
import {
	buildSmartFilterExpression,
	deriveSelectedPresetIds,
	wineBusyCore,
} from '@filter-enginez/examples-shared/wine-domain';
import { createRxJsEngine, type RxJsEngine } from '@filter-enginez/reactive-rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { WineSmartFiltersComponent } from './wine-smart-filters.component.js';

/** A tiny corpus; the presets only need something to filter. */
const ROWS = [
	{ abv: 14.5, body: 'full', color: 'red', id: 'a', points: 93, priceUsd: 40, varietal: 'Cabernet Sauvignon', vintage: 2018 },
	{ abv: 12, body: 'light', color: 'white', id: 'b', points: 88, priceUsd: 22, varietal: 'Pinot Grigio', vintage: 2021 },
	{ abv: 13, body: 'medium', color: 'red', id: 'c', points: 90, priceUsd: 30, varietal: 'Pinot Noir', vintage: 2019 },
] as unknown as readonly Wine[];

/** The engine of the current test, disposed after it. */
let engine: RxJsEngine<Wine> | null = null;

afterEach(() => {
	engine?.dispose();
	engine = null;
});

/**
 * Mount the row over a real engine, seeded the way a `?f` restore leaves it.
 *
 * @param seed - Applies the pre-existing engine state.
 * @param selected - The lit presets the panel passes in.
 * @returns The fixture and the engine core.
 */
function mountRow(
	seed: (core: FilterEngine<Wine>) => void = () => undefined,
	selected: readonly string[] = [],
): { readonly core: FilterEngine<Wine>; readonly fixture: ComponentFixture<WineSmartFiltersComponent> } {
	const core = createFilterEngine<Wine>({ sourceData: [...ROWS]});

	seed(core);
	engine = createRxJsEngine(core);
	TestBed.configureTestingModule({ providers: [provideFilterEngine(engine)]});

	const fixture = TestBed.createComponent(WineSmartFiltersComponent);

	fixture.componentRef.setInput('selected', selected);
	fixture.detectChanges();

	return { core, fixture };
}

/**
 * The button whose visible text is exactly `label`.
 *
 * @param fixture - The mounted row.
 * @param label - The button text.
 * @returns The button.
 */
function button(fixture: ComponentFixture<WineSmartFiltersComponent>, label: string): HTMLButtonElement {
	const host = fixture.nativeElement as HTMLElement;
	const found = [...host.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === label);

	if (found === undefined) {
		throw new Error(`No button labelled ${label}`);
	}

	return found;
}

describe('<fe-wine-smart-filters> — a preset replaces the manual filters', () => {
	it('clears a manual facet rule before applying, leaving only the expression', () => {
		const { core, fixture } = mountRow((seeded) => {
			seeded.addRule('color', inSet<string>('color', ['white']));
		});

		button(fixture, 'Bold reds').click();

		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds']);
	});

	it('marks the action busy when a preset is applied', () => {
		const { fixture } = mountRow();

		wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());
		expect(wineBusyCore.getIsEngineBusy()).toBe(false);

		button(fixture, 'Bold reds').click();

		expect(wineBusyCore.getIsEngineBusy()).toBe(true);
	});

	it.each([
		['a link written today', (config: FilterEngineConfig): FilterEngineConfig => config],
		['a link written by engine 0.0.3', (config: FilterEngineConfig): FilterEngineConfig => ({ ...config, rules: config.rules.map(({ id, rule }) => ({ id, rule })) })],
	])('"Clear smart filters" on a preset restored from %s gives back the full corpus', (_label, link) => {
		const donor = createFilterEngine<Wine>({ sourceData: [...ROWS]});

		donor.setExpression(buildSmartFilterExpression(['pinot-any']));

		const { core, fixture } = mountRow((seeded) => {
			seeded.loadConfig(link(donor.exportConfig()));
		}, ['pinot-any']);

		expect(core.getRules().size).toBe(0);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['pinot-any']);
		button(fixture, 'Clear smart filters').click();

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResultCount()).toBe(ROWS.length);
	});
});
