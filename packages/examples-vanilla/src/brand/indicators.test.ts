/**
 * Tests for the engine-status indicator.
 *
 * @remarks
 * It matches React's "engine · idle" — subject, separator, state word. A bare "idle" with no subject
 * is the same class of regression as a copy-link button without its icon (see
 * `../url/urlControls.test.ts`): visible on screen, invisible to a suite that only asserts behavior.
 * The three parts are separate nodes precisely so the swap touches one of them, and these tests pin
 * that.
 */

import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_QUIET_NODES,
} from '@filter-enginez/brand/loaders/brain-synapse-geometry';
import { describe, expect, it } from 'vitest';

import { bootCaptionValue, createBootLoader, createComputingIndicator } from './indicators.js';

describe('bootCaptionValue', () => {
	it('carries the shared accent class rather than an inline color', () => {
		// The brand's dual-accent contract is load-bearing rather than decorative: phosphor means
		// the engine is firing right now, and during a corpus stream it is not computing — it is
		// waiting. The color lives in `ui-styles`' `.fe-boot-caption__value` so that all six verticals
		// state it once; what this asserts is that vanilla reaches for that class rather than spelling
		// the color itself.
		expect(bootCaptionValue('1,234').className).toBe('fe-boot-caption__value');
	});

	it('renders the segment it is given, without reformatting it', () => {
		// ⚠ Number grouping is asserted in `examples-shared/src/boot-caption/index.test.ts`, with a
		// locale-tolerant shape ("contains a non-digit" rather than the literal `129,907`, because the
		// separator depends on the machine). This function does no formatting of its own.
		//
		// What is left to assert is that it does NOT second-guess the segment, since a helper that
		// re-formatted an already-formatted string is exactly how a shared caption drifts back apart.
		expect(bootCaptionValue('129,907').textContent).toBe('129,907');
	});
});

describe('createComputingIndicator', () => {
	it('reads "engine · idle" at rest', () => {
		const { element } = createComputingIndicator();

		expect(element.textContent.replace(/\s+/gu, ' ').trim()).toBe('engine · idle');
		expect(element.getAttribute('aria-label')).toBe('Engine idle');
	});

	it('swaps only the STATE word when computing', () => {
		// The subject and separator are separate nodes precisely so they survive the swap. Asserting
		// the full string catches a regression that replaces the whole label with "computing".
		const indicator = createComputingIndicator();

		indicator.setComputing(true);

		expect(indicator.element.textContent.replace(/\s+/gu, ' ').trim()).toBe('engine · computing');
		expect(indicator.element.getAttribute('aria-label')).toBe('Engine computing');

		indicator.setComputing(false);

		expect(indicator.element.textContent.replace(/\s+/gu, ' ').trim()).toBe('engine · idle');
	});

	it('keeps the separator in its own element so it can dim independently', () => {
		const { element } = createComputingIndicator();

		expect(element.querySelector('.fe-computing-indicator__sep')?.textContent).toBe('·');
	});
});

describe('createBootLoader', () => {
	it('renders every node and edge the shared geometry declares', () => {
		// Counted from the imported module rather than written as literals. Written as literals, this
		// test would go red on a deliberate geometry change and stay green on the failure it exists to
		// catch — a consumer that drops elements while transcribing.
		const element = createBootLoader('Loading wine reviews');
		const circles = element.querySelectorAll('circle').length;

		expect(element.querySelectorAll('line')).toHaveLength(BRAIN_SYNAPSE_EDGES.length);
		expect(circles).toBe(BRAIN_SYNAPSE_FIRING_NODES.length + BRAIN_SYNAPSE_QUIET_NODES.length + 5);
	});

	it('scopes its keyframes per instance', () => {
		// Two loaders on one page sharing keyframe names fire in lockstep rather than independently —
		// the reason `buildBrainSynapseCss` takes a scope at all. Nothing else in this app would notice.
		const first = createBootLoader('First');
		const second = createBootLoader('Second');
		const scopeOf = (element: HTMLElement): string =>
			/bs-v\d+/u.exec(element.querySelector('style')?.textContent ?? '')?.[0] ?? '';

		expect(scopeOf(first)).not.toBe('');
		expect(scopeOf(first)).not.toBe(scopeOf(second));
		// The class prefixes must move with the keyframes, or the scoping is cosmetic.
		expect(first.querySelector('line')?.getAttribute('class')).toBe(`${scopeOf(first)}-edge`);
	});

	it('announces itself as an image and takes the responsive cap class', () => {
		const element = createBootLoader('Loading wine reviews');

		expect(element.getAttribute('role')).toBe('img');
		expect(element.getAttribute('aria-label')).toBe('Loading wine reviews');
		// `fe-boot-loader` is what caps the fixed 520px stage at the viewport width on a phone.
		expect(element.className).toBe('fe-boot-loader');
		expect(element.style.width).toBe('520px');
	});
});
