/**
 * The wine cold-boot screen's caption.
 *
 * @remarks
 * The wording comes from `examples-shared/boot-caption`, which has its own suite — including the
 * zero-total guard that keeps `{ loaded: 0, total: 0 }` from announcing a finished load. What is left
 * for this file is the half that is Svelte's: that the parts are rendered in order, that a `value`
 * part lands in the accent span and a `text` part does not, and that the `idleCaption` override
 * reaches the shared builder.
 *
 * ⚠ **Assertions normalize whitespace, and that is a property of the template rather than a
 * looseness.** The caption's spacing is carried inside the segments so every vertical can join them
 * by concatenation; Svelte's `{#each}` adds its own indentation between them, which collapses to a
 * single space on screen and shows up in `textContent`. Normalizing reproduces exactly what a reader
 * sees. The React and vanilla suites assert the raw string because neither renderer interposes
 * markup between segments.
 */

import type { WineBootProgress } from '@filter-enginez/examples-shared/wine-core';

import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import WineBootScreen from './WineBootScreen.svelte';

// Not automatic in this app's vitest setup — without it each render stacks another copy in the same
// document and the caption query finds every previous case's too.
afterEach(cleanup);

/**
 * A wine boot-progress snapshot.
 *
 * @param loaded - Records generated so far.
 * @param total - The tier's exact total.
 * @returns The snapshot, with the tier the worker route reports by default: the 150,000 synthetic
 *   wines, whose total is known before the first one is generated.
 */
function progressOf(loaded: number, total: number): WineBootProgress {
	return { isTotalEstimated: false, loaded, source: 'synthetic-full-tier', total };
}

/**
 * The caption as a reader sees it.
 *
 * @param container - The render container.
 * @returns The caption text, whitespace-normalized — see the file docblock.
 */
function caption(container: HTMLElement): string {
	return (container.querySelector('.fe-boot-caption')?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('WineBootScreen', () => {
	it('says the worker is spinning up before the stream reports anything', () => {
		const { container } = render(WineBootScreen, { progress: null });

		expect(caption(container)).toBe('Spinning up worker thread');
	});

	it('says the worker is spinning up while the total is still zero', () => {
		// 🔴 The key case. `{ loaded: 0, total: 0 }` is not `null` and does not satisfy `0 < 0`, so
		// without the guard this screen would announce "0 bottles loaded · constructing filter index" —
		// a finished load that had not started.
		const { container } = render(WineBootScreen, { progress: progressOf(0, 0) });

		expect(caption(container)).toBe('Spinning up worker thread');
		expect(caption(container)).not.toContain('constructing filter index');
	});

	it('counts bottles against the exact tier total while generating', () => {
		const { container } = render(WineBootScreen, { progress: progressOf(40_000, 150_000) });

		expect(caption(container)).toBe('Loaded 40,000 of 150,000 bottles');
	});

	it('marks the total as an estimate only when the snapshot says it is one', () => {
		// The local real corpus streams without knowing its length, so its total is a guess. The flag
		// has to survive the trip from the progress stream to the shared builder; a component that
		// rebuilt the snapshot without it would drop the tilde here and pass every exact-total case.
		const { container } = render(WineBootScreen, {
			progress: { isTotalEstimated: true, loaded: 40_000, source: 'full-corpus-ndjson', total: 130_000 },
		});

		expect(caption(container)).toBe('Loaded 40,000 of ~130,000 bottles');
	});

	it('names the indexing pause once the last row lands', () => {
		// The third state, which Vue and Angular still do without: a caption frozen on the final count
		// reads as a hang at the moment a user reaches for reload.
		const { container } = render(WineBootScreen, { progress: progressOf(150_000, 150_000) });

		expect(caption(container)).toBe('150,000 bottles loaded · constructing filter index');
	});

	it('puts the live count in the accent span, and nothing else', () => {
		// The half of the caption that is this component's business. The shared module marks which
		// segment is a live number; what an accent looks like is Svelte's decision, and this is the only
		// place that records it.
		const { container } = render(WineBootScreen, { progress: progressOf(40_000, 150_000) });
		const values = [...container.querySelectorAll('.fe-boot-caption__value')].map((node) => node.textContent);

		expect(values).toEqual(['40,000']);
	});

	it('lets /wine-server name its own cold start', () => {
		// That route has no worker and no progress stream, so announcing a spin-up would describe
		// something that is not happening. The override has to reach the shared builder, not just the
		// markup.
		const { container } = render(WineBootScreen, {
			idleCaption: 'Connecting to the filter server',
			progress: null,
		});

		expect(caption(container)).toBe('Connecting to the filter server');
	});

	it('names the switch when the 10,000-wine tier booted on the main thread', () => {
		// Unrelated to the caption and unique to this vertical, but it sits in the same component. The
		// `'default-tier'` source only happens when `VITE_WINE_TIER=default` is set, so the warning
		// names that variable rather than a missing file.
		const { container } = render(WineBootScreen, {
			progress: { isTotalEstimated: false, loaded: 10_000, source: 'default-tier', total: 10_000 },
		});
		const warning = container.querySelector('.fe-wine-boot__warn')?.textContent ?? '';

		expect(warning).toContain('10,000-wine default tier');
		expect(warning).toContain('VITE_WINE_TIER');
	});

	it('does not warn on the full tier', () => {
		const { container } = render(WineBootScreen, { progress: progressOf(150_000, 150_000) });

		expect(container.querySelector('.fe-wine-boot__warn')).toBeNull();
	});

	it('does not warn on the low-memory tier, which the device chose rather than a setting', () => {
		const { container } = render(WineBootScreen, {
			progress: { isTotalEstimated: false, loaded: 10_000, source: 'low-memory-tier', total: 10_000 },
		});

		expect(container.querySelector('.fe-wine-boot__warn')).toBeNull();
	});
});
