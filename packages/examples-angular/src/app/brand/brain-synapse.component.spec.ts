/**
 * Tests for `<fe-brain-synapse>`.
 *
 * @remarks
 * Two things are worth pinning, and neither is what the component looks like.
 *
 * **The geometry is READ, not transcribed.** A hand-copied coordinate can be mistyped, and a mistyped
 * coordinate is invisible to every gate in this repo — nothing typechecks a `cx`. So the assertions
 * compare rendered element counts against the shared constants: drop a node from the template and
 * the count disagrees.
 *
 * **Two instances must not share a CSS scope.** Shared `@keyframes` names make two loaders on one page
 * fire in lockstep instead of independently, which looks like a deliberate effect rather than a bug
 * and would never be reported.
 *
 * @packageDocumentation
 */

import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_PULSE_INDICES,
	BRAIN_SYNAPSE_QUIET_NODES,
} from '@filter-enginez/brand/loaders/brain-synapse-geometry';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrainSynapseComponent } from './brain-synapse.component.js';

/** Host rendering two loaders, so the per-instance scope can be compared. */
@Component({
	imports: [BrainSynapseComponent],
	template: `
		<fe-brain-synapse loaderLabel="Loading wine reviews" [width]="520" />
		<fe-brain-synapse loaderLabel="Second loader" [width]="240" />
	`,
})
class HostComponent {}

describe('<fe-brain-synapse>', () => {
	let fixture: ComponentFixture<HostComponent>;

	/** The first loader's root element. */
	const firstLoader = (): HTMLElement =>
		fixture.nativeElement.querySelectorAll('.fe-boot-loader')[0] as HTMLElement;

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		fixture.detectChanges();
	});

	it('renders every edge, node and pulse the shared geometry declares', () => {
		const loader = firstLoader();

		expect(loader.querySelectorAll('line')).toHaveLength(BRAIN_SYNAPSE_EDGES.length);
		expect(loader.querySelectorAll('circle')).toHaveLength(
			BRAIN_SYNAPSE_FIRING_NODES.length
				+ BRAIN_SYNAPSE_QUIET_NODES.length
				+ BRAIN_SYNAPSE_PULSE_INDICES.length,
		);
	});

	it('places the first node where the geometry says it is', () => {
		// One coordinate, checked against its source. A template that drifted would still render the
		// right NUMBER of circles, so the count assertion above cannot catch a transcription error.
		const circle = firstLoader().querySelector('circle');
		const first = BRAIN_SYNAPSE_FIRING_NODES[0];

		expect(circle?.getAttribute('cx')).toBe(String(first?.cx));
		expect(circle?.getAttribute('cy')).toBe(String(first?.cy));
	});

	it('carries the accessible name as an image role', () => {
		expect(firstLoader().getAttribute('role')).toBe('img');
		expect(firstLoader().getAttribute('aria-label')).toBe('Loading wine reviews');
	});

	it('scopes its CSS per instance, so two loaders do not fire in lockstep', () => {
		const [first, second] = Array.from<HTMLElement>(
			fixture.nativeElement.querySelectorAll('.fe-boot-loader'),
		);
		const scopeOf = (loader: HTMLElement | undefined): string =>
			loader?.querySelector('line')?.getAttribute('class') ?? '';

		expect(scopeOf(first)).not.toBe('');
		expect(scopeOf(first)).not.toBe(scopeOf(second));
	});

	it('emits its instance stylesheet into the SVG defs', () => {
		// `[innerHTML]` needs `bypassSecurityTrustHtml`, because Angular strips `<style>` from bound
		// HTML by default. Without the bypass this renders empty and the loader is simply static.
		const defs = firstLoader().querySelector('defs');

		expect(defs?.innerHTML).toContain('@keyframes');
	});
});
