/**
 * The boot caption, asserted as the one implementation every vertical shares.
 *
 * @remarks
 * The strings here are not examples — they pin the exact text every cold-start screen renders, so a
 * wording change is a deliberate edit to this file rather than a silent drift across six apps.
 *
 * The zero-total case is the most important one: it is the edge a per-screen copy most easily gets
 * wrong, and the guard exists once, in this module.
 */

import { describe, expect, it } from 'vitest';

import * as booksDomain from '../books/books-domain/index.js';
import * as realEstateDomain from '../real-estate/real-estate-domain/index.js';
import {
	BOOKS_BOOT_IDLE_CAPTION,
	BOOKS_RECORD_NOUN,
	BOOT_FAILURE_COPY,
	bootCaptionParts,
	bootCaptionText,
	DEFAULT_IDLE_CAPTION,
	REAL_ESTATE_BOOT_IDLE_CAPTION,
	REAL_ESTATE_RECORD_NOUN,
} from './index.js';

/** The caption as a reader sees it. */
function caption(progress: Parameters<typeof bootCaptionParts>[0], recordNoun = 'bottles'): string {
	return bootCaptionText(bootCaptionParts(progress, { recordNoun }));
}

describe('bootCaptionParts', () => {
	describe('the pre-stream state', () => {
		it('reads as spinning up before any progress arrives', () => {
			expect(caption(null)).toBe('Spinning up worker thread');
		});

		it('reads as spinning up while the total is still zero', () => {
			// 🔴 The edge this module exists to hold. `{ loaded: 0, total: 0 }` is not `null` and does not
			// satisfy `0 < 0`, so without the `<= 0` arm it falls through to the third state and announces
			// "0 bottles loaded · constructing filter index" — a finished load that has not started.
			expect(caption({ loaded: 0, total: 0 })).toBe('Spinning up worker thread');
		});

		it('reads as spinning up if a total ever arrives negative', () => {
			// `<= 0` rather than `=== 0`, so a stream reporting a nonsense length degrades to the honest
			// caption instead of to "Loaded 0 of ~-1 bottles".
			expect(caption({ loaded: 0, total: -1 })).toBe('Spinning up worker thread');
		});

		it('lets a route name its own cold start', () => {
			// `/wine-server` has no worker and no progress stream — SvelteKit passes `idleCaption` and
			// vanilla passes a fixed caption, for the same reason: naming a spin-up that is not happening
			// is worse than saying nothing.
			const parts = bootCaptionParts(null, {
				idleCaption: 'Connecting to the filter server',
				recordNoun: 'bottles',
			});

			expect(bootCaptionText(parts)).toBe('Connecting to the filter server');
		});

		it('falls back to the exported default when no override is given', () => {
			expect(caption(null)).toBe(DEFAULT_IDLE_CAPTION);
		});
	});

	describe('the streaming state', () => {
		it('counts records against an exact total without a tilde', () => {
			// The synthetic wine tier, a server's page envelope: totals known before the first record.
			expect(caption({ loaded: 40_000, total: 150_000 })).toBe('Loaded 40,000 of 150,000 bottles');
		});

		it('marks an estimated total with a tilde', () => {
			// The local real wine corpus streams, and cannot know its length until it ends.
			expect(caption({ isTotalEstimated: true, loaded: 40_000, total: 129_907 })).toBe(
				'Loaded 40,000 of ~129,907 bottles',
			);
		});

		it('treats an explicitly exact total like an absent flag', () => {
			expect(caption({ isTotalEstimated: false, loaded: 1, total: 2 })).toBe('Loaded 1 of 2 bottles');
		});

		it('marks the live count as the highlightable segment, and nothing else', () => {
			// The whole reason this returns parts. Four verticals wrap exactly this segment in an accent
			// element; a single string would make each of them find the number again by parsing it back
			// out of the copy.
			const parts = bootCaptionParts({ loaded: 40_000, total: 130_000 }, { recordNoun: 'bottles' });

			expect(parts.filter((part) => part.kind === 'value')).toEqual([{ kind: 'value', text: '40,000' }]);
		});

		it('groups the number, because the count it renders reaches six figures', () => {
			// Asserted as "contains a non-digit" rather than as the literal, matching `bootScreen.test.ts`:
			// the separator is locale-dependent and the property under test is that it IS grouped.
			const [, value] = bootCaptionParts({ loaded: 129_907, total: 130_000 }, { recordNoun: 'bottles' });

			expect(value?.text).toMatch(/\D/u);
			expect(value?.text.replace(/\D/gu, '')).toBe('129907');
		});
	});

	describe('the indexing state', () => {
		it('names the pause once every record has arrived, rather than freezing on the count', () => {
			// After the final row there is still a visible wait while the bitmap index builds. A caption
			// stuck on "Loaded 150,000 of 150,000" reads as a hang at the exact moment a user reaches for
			// reload — which is what Vue's and Angular's two-state screens still do.
			expect(caption({ loaded: 150_000, total: 150_000 })).toBe(
				'150,000 bottles loaded · constructing filter index',
			);
		});

		it('holds when a stream overshoots its estimate', () => {
			// An estimated total can be passed by the stream it estimates, so `loaded` can exceed it. That
			// is finished, not still streaming.
			expect(caption({ isTotalEstimated: true, loaded: 130_001, total: 130_000 })).toBe(
				'130,001 bottles loaded · constructing filter index',
			);
		});
	});

	it.each([
		['bottles', 'Loaded 500 of 1,000 bottles'],
		['books', 'Loaded 500 of 1,000 books'],
		['listings', 'Loaded 500 of 1,000 listings'],
	])('interpolates the %s noun', (recordNoun, expected) => {
		expect(caption({ loaded: 500, total: 1000 }, recordNoun)).toBe(expected);
	});
});

describe('the dataset wording re-exported for engine-free screens', () => {
	// A screen drawn before the engine loads (Angular's root component, while a resolver boots) reads
	// these through this module instead of the domain barrels. The two routes must be the SAME
	// constants, not equal copies, so a wording change in a domain reaches that screen too.
	it.each([
		['BOOKS_BOOT_IDLE_CAPTION', BOOKS_BOOT_IDLE_CAPTION, booksDomain.BOOKS_BOOT_IDLE_CAPTION],
		['BOOKS_RECORD_NOUN', BOOKS_RECORD_NOUN, booksDomain.BOOKS_RECORD_NOUN],
		['REAL_ESTATE_BOOT_IDLE_CAPTION', REAL_ESTATE_BOOT_IDLE_CAPTION, realEstateDomain.REAL_ESTATE_BOOT_IDLE_CAPTION],
		['REAL_ESTATE_RECORD_NOUN', REAL_ESTATE_RECORD_NOUN, realEstateDomain.REAL_ESTATE_RECORD_NOUN],
	])('%s is the domain barrel’s constant', (_name, reExported, fromDomain) => {
		expect(reExported).toBe(fromDomain);
		expect(reExported.length).toBeGreaterThan(0);
	});

	it('words each dataset’s idle state with its own sentence, not the worker default', () => {
		for (const [idleCaption, recordNoun] of [
			[BOOKS_BOOT_IDLE_CAPTION, BOOKS_RECORD_NOUN],
			[REAL_ESTATE_BOOT_IDLE_CAPTION, REAL_ESTATE_RECORD_NOUN],
		] as const) {
			expect(bootCaptionText(bootCaptionParts(null, { idleCaption, recordNoun }))).toBe(idleCaption);
			expect(idleCaption).not.toBe(DEFAULT_IDLE_CAPTION);
		}
	});
});

describe('bootCaptionText', () => {
	it('joins by concatenation, with the spacing carried inside the segments', () => {
		// Stated as a case because it is the contract that lets every vertical render parts in its own
		// idiom: no renderer has to know to insert a space, so none of them can disagree about it.
		expect(
			bootCaptionText([
				{ kind: 'text', text: 'Loaded ' },
				{ kind: 'value', text: '7' },
				{ kind: 'text', text: ' of ~9 books' },
			]),
		).toBe('Loaded 7 of ~9 books');
	});

	it('is empty for an empty caption', () => {
		expect(bootCaptionText([])).toBe('');
	});
});

describe('BOOT_FAILURE_COPY', () => {
	it.each([
		['books', 'The books engine could not start.'],
		['real-estate', 'The real-estate engine could not start.'],
		['wine', 'The wine engine could not start.'],
	] as const)('names %s in the headline', (dataset, title) => {
		expect(BOOT_FAILURE_COPY[dataset].title).toBe(title);
	});

	it('explains the worker for wine, and asks for a reload elsewhere', () => {
		expect(BOOT_FAILURE_COPY.wine.hint).toMatch(/Web Worker/u);
		expect(BOOT_FAILURE_COPY.books.hint).toBe('Refresh the page to retry.');
		expect(BOOT_FAILURE_COPY['real-estate'].hint).toBe('Refresh the page to retry.');
	});
});
