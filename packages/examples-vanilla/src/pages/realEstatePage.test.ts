/**
 * `/real-estate` when its engine cannot start: the shared boot-failure screen, and the progress
 * listener released.
 *
 * @remarks
 * The boot and its progress pub/sub are mocked: the boot rejects, and the pub/sub is a real `Set`, so
 * whether the route's listener is still REGISTERED is answered by the registry itself rather than by
 * asserting that an unsubscribe function was called. The rest of `real-estate-core` is the real module.
 *
 * @packageDocumentation
 */

import type * as RealEstateCore from '@filter-enginez/examples-shared/real-estate-core';
import type { RealEstateBootProgress } from '@filter-enginez/examples-shared/real-estate-core';

import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The mocked progress registry. */
const progressListeners = new Set<(progress: RealEstateBootProgress | null) => void>();

/** What the mocked boot rejects with in the current case. */
let bootRejection: unknown = new Error('listings fetch failed');

vi.mock('@filter-enginez/examples-shared/real-estate-core', async (importOriginal) => ({
	...(await importOriginal<typeof RealEstateCore>()),
	bootRealEstateEngine: async (): Promise<never> => {
		await Promise.resolve();

		throw bootRejection;
	},
	getRealEstateBootProgressSnapshot: (): RealEstateBootProgress | null => null,
	subscribeRealEstateBootProgress: (listener: (progress: RealEstateBootProgress | null) => void): (() => void) => {
		progressListeners.add(listener);

		return () => {
			progressListeners.delete(listener);
		};
	},
}));

const { renderRealEstatePage } = await import('./realEstatePage.js');

/** The route container, fresh per case. */
let container: HTMLElement;

beforeEach(() => {
	progressListeners.clear();
	bootRejection = new Error('listings fetch failed');
	container = document.createElement('div');
	document.body.replaceChildren(container);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the /real-estate page — a boot that fails', () => {
	it('subscribes to boot progress while the boot is in flight, so the release below is not vacuous', async () => {
		const pending = renderRealEstatePage(container);

		expect(progressListeners.size).toBe(1);

		await pending;
	});

	it('replaces the boot caption with main > [role=alert]: the real-estate title, the message, the hint', async () => {
		await expect(renderRealEstatePage(container)).resolves.toBeTypeOf('function');

		const alert = container.querySelector(':scope > main > [role="alert"]');
		const lines = [...(alert?.querySelectorAll('p') ?? [])].map((line) => line.textContent);

		expect(container.querySelector('.fe-boot-caption')).toBeNull();
		expect(lines).toEqual([
			BOOT_FAILURE_COPY['real-estate'].title,
			'listings fetch failed',
			BOOT_FAILURE_COPY['real-estate'].hint,
		]);
		expect(console.error).toHaveBeenCalledWith('[real-estate] boot failed:', expect.any(Error));
	});

	it('releases the progress listener when the boot rejects', async () => {
		await renderRealEstatePage(container);

		expect(progressListeners.size).toBe(0);
	});

	it('shows a rejection that is not an Error as its text', async () => {
		bootRejection = 'offline';
		await renderRealEstatePage(container);

		expect(container.querySelector('[role="alert"]')?.querySelectorAll('p')[1]?.textContent).toBe('offline');
	});

	it('still returns a teardown, which clears the failure screen on navigation', async () => {
		const teardown = await renderRealEstatePage(container);

		teardown();

		expect(container.childElementCount).toBe(0);
	});
});
