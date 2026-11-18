/**
 * The prerender hand-over: which snapshot the inlined picker shows, when it shows none, and the app's
 * side (`hasPrerender` / `releasePrerender`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissPrerender, hasPrerender, pickPrerender, PRERENDER, prerenderPickerScript, type PrerenderWindow, releasePrerender } from './index.js';

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
	// Undo `loadFonts`: jsdom itself has no font loading API.
	Reflect.deleteProperty(document, 'fonts');
});

/**
 * Give the document a font loading API whose webfonts are still loading.
 *
 * @param outcome - Whether they arrive or fail to load.
 * @returns A function that settles them, and the fonts each `load` call asked for.
 */
function loadFonts(outcome: 'arrive' | 'fail' = 'arrive'): { readonly asked: string[]; readonly settle: () => Promise<void> } {
	let settle = (): void => undefined;
	const loaded = new Promise<void>((resolve, reject) => {
		settle = outcome === 'arrive' ? resolve : () => {
			reject(new Error('network'));
		};
	});
	const asked: string[] = [];

	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: {
			load: async (font: string) => {
				asked.push(font);
				await loaded;
			},
		},
	});

	return {
		asked,
		settle: async () => {
			settle();
			await flushMicrotasks();
		},
	};
}

/**
 * Let `releasePrerender`'s continuations and mutation records run: a few microtasks after a change.
 */
async function flushMicrotasks(): Promise<void> {
	for (let turn = 0; turn < 10; turn += 1) {
		await Promise.resolve();
	}
}

/**
 * The live page's count under the snapshot.
 *
 * @returns Its element.
 */
function liveCountElement(): Element {
	const live = document.querySelector('#root .fe-result-count__number');

	if (live === null) {
		throw new Error('the shell has no live count');
	}

	return live;
}

/** The options a case varies. */
interface ShellOptions {
	/** Attributes on both page templates. */
	readonly attributes?: readonly string[];
	/** Leave the cards templates out. */
	readonly withoutCards?: boolean;
	/** Leave the desktop page template out. */
	readonly withoutDesktop?: boolean;
	/** The count the live page under the snapshot shows (the snapshot's by default); `null` for none yet. */
	readonly liveCount?: string | null;
	/** Leave the count out of the page templates. */
	readonly withoutCount?: boolean;
}

/**
 * Write a prerendered shell's body: the two page templates, the two cards templates, then the root.
 *
 * @param options - What the case varies.
 */
function writeShell(options: ShellOptions = {}): void {
	const attributes = (options.attributes ?? []).join(' ');
	const page = (width: string): string =>
		`<template id="fe-prerender-${width}" ${attributes}><header>${options.withoutCount === true ? '' : `<span class="fe-result-count__number" style="font-family: 'JetBrains Mono', 'JetBrains Mono Fallback Android', monospace" ${PRERENDER.countAttribute}> 10,000 </span>`}<em>${width}</em></header><div role="list" ${PRERENDER.cardsSlotAttribute}></div></template>`;
	const liveCount = options.liveCount === undefined ? '10,000' : options.liveCount;
	const cards = (width: string): string => `<template id="fe-prerender-cards-${width}"><article role="listitem">${width} card</article></template>`;

	document.body.innerHTML = [
		page('phone'),
		options.withoutDesktop === true ? '' : page('desktop'),
		options.withoutCards === true ? '' : `${cards('phone')}${cards('desktop')}`,
		`<div id="root">${liveCount === null ? '' : `<span class="fe-result-count__number">${liveCount}</span>`}</div>`,
	].join('');
}

/**
 * A window stand-in.
 *
 * @param overrides - The address's query, whether the desktop query matches, the device memory.
 * @param overrides.search - `location.search`.
 * @param overrides.isDesktop - Whether {@link PRERENDER.desktopQuery} matches.
 * @param overrides.deviceMemory - `navigator.deviceMemory`.
 * @returns It.
 */
function windowLike({ deviceMemory, isDesktop = false, search = '' }: { deviceMemory?: number; isDesktop?: boolean; search?: string } = {}): PrerenderWindow {
	return {
		getComputedStyle: () => ({ backgroundColor: 'rgb(11, 10, 9)' }),
		location: { search },
		matchMedia: (query) => ({ matches: query === PRERENDER.desktopQuery && isDesktop }),
		navigator: deviceMemory === undefined ? {} : { deviceMemory },
	};
}

/**
 * The host the picker created, if any.
 *
 * @returns It, or `null`.
 */
function host(): HTMLElement | null {
	return document.getElementById(PRERENDER.hostId);
}

describe('pickPrerender', () => {
	it('shows the phone snapshot with its cards, as an opaque layer over the top of the page', () => {
		writeShell({ liveCount: null });

		expect(pickPrerender(document, windowLike(), PRERENDER)).toBe(true);
		expect(host()?.querySelector('em')?.textContent).toBe('phone');
		expect(host()?.querySelector(`[${PRERENDER.cardsSlotAttribute}]`)?.textContent).toBe('phone card');
		// Out of the flow at the page's top, where the app's root lays its page out, and above it.
		expect(host()?.style.position).toBe('absolute');
		expect([host()?.style.top, host()?.style.left, host()?.style.right]).toEqual(['0px', '0px', '0px']);
		expect(host()?.style.zIndex).toBe('2147483647');
		expect(host()?.style.backgroundColor).toBe('rgb(11, 10, 9)');
		expect(host()?.nextElementSibling?.id).toBe(PRERENDER.phoneTemplateId);
		expect(document.getElementById('root')?.childElementCount).toBe(0);
	});

	it('shows the desktop snapshot where the desktop query matches', () => {
		writeShell();
		pickPrerender(document, windowLike({ isDesktop: true }), PRERENDER);

		expect(host()?.querySelector('em')?.textContent).toBe('desktop');
		expect(host()?.querySelector(`[${PRERENDER.cardsSlotAttribute}]`)?.textContent).toBe('desktop card');
	});

	it('shows nothing on an address with a query, which names a state the snapshot does not hold', () => {
		writeShell();

		expect(pickPrerender(document, windowLike({ search: '?f=h~%7B%7D' }), PRERENDER)).toBe(false);
		expect(host()).toBeNull();
	});

	it('treats a bare "?" as no query', () => {
		writeShell();

		expect(pickPrerender(document, windowLike({ search: '?' }), PRERENDER)).toBe(true);
	});

	it('shows a page the server rewrote for the query, without the cards it dropped', () => {
		writeShell({ attributes: [PRERENDER.filteredAttribute], withoutCards: true });

		expect(pickPrerender(document, windowLike({ search: '?f=h~%7B%7D' }), PRERENDER)).toBe(true);
		expect(host()?.querySelector(`[${PRERENDER.cardsSlotAttribute}]`)?.childElementCount).toBe(0);
	});

	it('shows nothing on a low-memory device when the snapshot holds the full tier', () => {
		writeShell({ attributes: [PRERENDER.fullTierAttribute]});

		expect(pickPrerender(document, windowLike({ deviceMemory: PRERENDER.lowMemoryGigabytes }), PRERENDER)).toBe(false);
		expect(host()).toBeNull();
	});

	it('shows a full-tier snapshot above the low-memory line, and where the browser does not say', () => {
		writeShell({ attributes: [PRERENDER.fullTierAttribute]});
		expect(pickPrerender(document, windowLike({ deviceMemory: 2 }), PRERENDER)).toBe(true);

		writeShell({ attributes: [PRERENDER.fullTierAttribute]});
		expect(pickPrerender(document, windowLike(), PRERENDER)).toBe(true);
	});

	it('ignores device memory for a snapshot that is not a corpus tier', () => {
		writeShell();

		expect(pickPrerender(document, windowLike({ deviceMemory: 0.5 }), PRERENDER)).toBe(true);
	});

	it('shows nothing on a shell that holds no snapshot, or not the one the viewport needs', () => {
		document.body.innerHTML = '<div id="root"></div>';
		expect(pickPrerender(document, windowLike(), PRERENDER)).toBe(false);

		writeShell({ withoutDesktop: true });
		expect(pickPrerender(document, windowLike({ isDesktop: true }), PRERENDER)).toBe(false);
		expect(host()).toBeNull();
	});
});

describe('prerenderPickerScript', () => {
	it('runs standalone: the inlined source picks a snapshot with nothing else in scope', () => {
		writeShell();

		// The shell runs it as a classic script, with only `document` and `window` around it.
		// eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the inlined source is the test
		const run = new Function('document', 'window', prerenderPickerScript()) as (doc: Document, win: PrerenderWindow) => void;

		run(document, windowLike({ isDesktop: true }));

		expect(host()?.querySelector('em')?.textContent).toBe('desktop');
	});
});

describe('hasPrerender / releasePrerender', () => {
	it('hands the page over: clicks go through, assistive technology reads the live page', () => {
		writeShell();
		expect(hasPrerender()).toBe(false);

		pickPrerender(document, windowLike(), PRERENDER);
		expect(hasPrerender()).toBe(true);

		releasePrerender();
		releasePrerender();
		expect(hasPrerender()).toBe(false);
		expect(host()?.hasAttribute(PRERENDER.releasedAttribute)).toBe(true);
		expect(host()?.style.pointerEvents).toBe('none');
		expect(host()?.getAttribute('aria-hidden')).toBe('true');
		expect(host()?.inert).toBe(true);
	});

	it('removes a released snapshot once the count’s webfont is in, and not before', async () => {
		// Revealed sooner, the app's count could paint first in the loaded face, larger than the snapshot's
		// fallback one, and the browser would record it as the page's largest contentful paint.
		const fonts = loadFonts();

		writeShell();
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await Promise.resolve();
		expect(host(), 'removed while the webfonts were loading').not.toBeNull();
		// The count's own webfont, asked for outright: `document.fonts.ready` would not wait for a face no text
		// has asked for yet, and the whole stack would fail on a platform's missing local fallback.
		expect(fonts.asked).toHaveLength(1);
		expect(fonts.asked[0]).toMatch(/ ["']JetBrains Mono["']$/u);

		await fonts.settle();
		expect(host()).toBeNull();
	});

	it('removes a released snapshot once the count’s webfont has failed to load: the fallback stays', async () => {
		const fonts = loadFonts('fail');

		writeShell();
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await fonts.settle();

		expect(host()).toBeNull();
	});

	it('keeps a released snapshot until the live page shows its count: a server-backed route’s filtered address', async () => {
		// The engine applies the address's state a round trip after its first render; the Worker wrote that
		// state's count into the snapshot. Revealed sooner, the page would count from the unfiltered total.
		const fonts = loadFonts();

		writeShell({ liveCount: null });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await fonts.settle();
		expect(host(), 'removed before the live page had a count').not.toBeNull();

		document.getElementById('root')?.insertAdjacentHTML('beforeend', '<span class="fe-result-count__number fe-result-count__number--computing">12,000</span>');
		await flushMicrotasks();
		expect(host(), 'removed while the live count was another').not.toBeNull();

		liveCountElement().textContent = '10,000';
		await flushMicrotasks();
		expect(host()).toBeNull();
	});

	it('removes a released snapshot without input once a live count that differs has held still, idle: the live page is the truth', async () => {
		// Data that changed since the build, say: the snapshot must not stand over a wrong number until a touch.
		vi.useFakeTimers();

		const fonts = loadFonts();

		writeShell({ liveCount: '12,000' });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await fonts.settle();
		await vi.advanceTimersByTimeAsync(999);
		expect(host(), 'removed before the live count had held still').not.toBeNull();

		await vi.advanceTimersByTimeAsync(1);
		expect(host()).toBeNull();
	});

	it('waits out a live count that is fetching, rolling or changing before it takes it as the truth', async () => {
		vi.useFakeTimers();

		const fonts = loadFonts();

		writeShell({ liveCount: '12,000' });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await fonts.settle();
		await vi.advanceTimersByTimeAsync(600);

		// Fetching (or rolling): not settled, however long.
		liveCountElement().classList.add('fe-result-count__number--computing');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(host(), 'removed while the live count was computing').not.toBeNull();

		// Idle again, then another number: each restarts the wait.
		liveCountElement().classList.remove('fe-result-count__number--computing');
		await vi.advanceTimersByTimeAsync(600);
		liveCountElement().textContent = '11,000';
		await vi.advanceTimersByTimeAsync(600);
		// A change elsewhere in the page is not the count's.
		document.getElementById('root')?.append('·');
		await vi.advanceTimersByTimeAsync(399);
		expect(host(), 'removed before the new number had held still').not.toBeNull();

		await vi.advanceTimersByTimeAsync(1);
		expect(host()).toBeNull();
	});

	it('takes an empty live count, one not bound yet, as no count', async () => {
		vi.useFakeTimers();

		const fonts = loadFonts();

		writeShell({ liveCount: '' });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await fonts.settle();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(host()).not.toBeNull();
	});

	it('removes a released snapshot with no count once its font question is moot', async () => {
		loadFonts();
		writeShell({ liveCount: '3', withoutCount: true });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await Promise.resolve();
		await Promise.resolve();

		expect(host()).toBeNull();
	});

	it('removes a released snapshot right away where the document has no font loading API', async () => {
		writeShell();
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();
		await Promise.resolve();
		await Promise.resolve();

		expect(host()).toBeNull();
	});

	it('keeps an unreleased snapshot when the webfonts arrive: the app has not rendered under it yet', async () => {
		const fonts = loadFonts();

		writeShell();
		pickPrerender(document, windowLike(), PRERENDER);
		await fonts.settle();

		expect(hasPrerender()).toBe(true);
	});

	it('removes a released snapshot on a resize to another width, and only then', () => {
		loadFonts();
		writeShell({ liveCount: null });
		pickPrerender(document, windowLike(), PRERENDER);
		releasePrerender();

		// A phone's first layout, say: the height changes, the width the snapshot was laid out at does not.
		window.dispatchEvent(new Event('resize'));
		expect(host(), 'removed on a resize to the same width').not.toBeNull();

		vi.stubGlobal('innerWidth', window.innerWidth + 1);
		try {
			window.dispatchEvent(new Event('resize'));
		} finally {
			vi.unstubAllGlobals();
		}
		expect(host()).toBeNull();
	});

	it.each(['keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel'])('removes a released snapshot at the visitor’s first %s, fonts and count or not', (type) => {
		loadFonts();
		writeShell({ liveCount: null });
		pickPrerender(document, windowLike(), PRERENDER);

		window.dispatchEvent(new Event(type));
		expect(host(), 'input before the release leaves the snapshot alone').not.toBeNull();

		releasePrerender();
		window.dispatchEvent(new Event(type));
		expect(host()).toBeNull();
	});

	it('dismisses a snapshot at once, for a screen that replaces the page', () => {
		writeShell();
		pickPrerender(document, windowLike(), PRERENDER);

		dismissPrerender();
		expect(host()).toBeNull();
		expect(hasPrerender()).toBe(false);
		expect(() => {
			dismissPrerender();
		}).not.toThrow();
	});

	it('answers false and does nothing where there is no document (a server render)', () => {
		vi.stubGlobal('document', undefined);
		try {
			expect(hasPrerender()).toBe(false);
			expect(() => {
				releasePrerender();
				dismissPrerender();
			}).not.toThrow();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
