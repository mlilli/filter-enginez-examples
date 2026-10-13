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

import { bootCaptionParts, bootCaptionText, DEFAULT_IDLE_CAPTION } from './index.js';

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
		it('counts records against the tier total', () => {
			expect(caption({ loaded: 40_000, total: 130_000 })).toBe('Loaded 40,000 of ~130,000 bottles');
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
			// stuck on "Loaded 130,000 of ~130,000" reads as a hang at the exact moment a user reaches for
			// reload — which is what Vue's and Angular's two-state screens still do.
			expect(caption({ loaded: 130_000, total: 130_000 })).toBe(
				'130,000 bottles loaded · constructing filter index',
			);
		});

		it('holds when a stream overshoots its estimate', () => {
			// `total` is documented best-effort and may shift when the parse completes, so `loaded` can
			// exceed it. That is finished, not still streaming.
			expect(caption({ loaded: 130_001, total: 130_000 })).toBe(
				'130,001 bottles loaded · constructing filter index',
			);
		});
	});

	it.each([
		['bottles', 'Loaded 500 of ~1,000 bottles'],
		['books', 'Loaded 500 of ~1,000 books'],
		['listings', 'Loaded 500 of ~1,000 listings'],
	])('interpolates the %s noun', (recordNoun, expected) => {
		expect(caption({ loaded: 500, total: 1000 }, recordNoun)).toBe(expected);
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
