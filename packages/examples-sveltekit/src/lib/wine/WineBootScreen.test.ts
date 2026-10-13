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
 * @param loaded - Records parsed so far.
 * @param total - Expected total.
 * @returns The snapshot, with the tier the worker route reports.
 */
function progressOf(loaded: number, total: number): WineBootProgress {
	return { loaded, source: 'full-corpus-ndjson', total };
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

	it('counts bottles against the tier total while streaming', () => {
		const { container } = render(WineBootScreen, { progress: progressOf(40_000, 130_000) });

		expect(caption(container)).toBe('Loaded 40,000 of ~130,000 bottles');
	});

	it('names the indexing pause once the last row lands', () => {
		// The third state, which Vue and Angular still do without: a caption frozen on the final count
		// reads as a hang at the moment a user reaches for reload.
		const { container } = render(WineBootScreen, { progress: progressOf(130_000, 130_000) });

		expect(caption(container)).toBe('130,000 bottles loaded · constructing filter index');
	});

	it('puts the live count in the accent span, and nothing else', () => {
		// The half of the caption that is this component's business. The shared module marks which
		// segment is a live number; what an accent looks like is Svelte's decision, and this is the only
		// place that records it.
		const { container } = render(WineBootScreen, { progress: progressOf(40_000, 130_000) });
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

	it('warns when the worker landed on the bundled tier instead of the full corpus', () => {
		// Unrelated to the caption and unique to this vertical, but it sits in the same component and had
		// the same amount of test coverage as everything else here, which was none.
		const { container } = render(WineBootScreen, {
			progress: { loaded: 10_000, source: 'default-tier', total: 10_000 },
		});

		expect(container.querySelector('.fe-wine-boot__warn')?.textContent).toContain('bundled 10k tier');
	});

	it('does not warn on the full corpus', () => {
		const { container } = render(WineBootScreen, { progress: progressOf(130_000, 130_000) });

		expect(container.querySelector('.fe-wine-boot__warn')).toBeNull();
	});
});
