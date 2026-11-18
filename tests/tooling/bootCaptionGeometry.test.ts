/**
 * The hero boot caption's box, pinned in the stylesheet that owns it: it never changes size.
 *
 * @remarks
 * The full-viewport boot screen centers the caption with the figure above it, and the caption's
 * wording changes as the corpus streams in ("Loaded 5,000 of 150,000 bottles" … "150,000 bottles loaded
 * · constructing filter engine…"). A box sized to its text moved sideways as the count grew, and the
 * last wording wraps to a second line at a phone width, which moved the caption and the figure up
 * 9px: a layout shift of 0.007 on a phone, measured on `/wine` in all six apps without the prerendered
 * snapshot. So the caption spans its column and holds two lines from its first frame.
 *
 * `min-height` is in `em`, so it is two lines only against the line height declared beside it; both
 * are pinned together.
 *
 * Inside it, the streamed count holds the width of a seven-character total ("150,000") from its first
 * frame. Centered, a count that grew a digit at a time re-centered the line and moved the words around
 * it (0.0004 at a desktop width on `/wine` without the snapshot).
 *
 * Deliberately in `tests/tooling`, like `uiStylesHistogram.test.ts`: jsdom never loads the sheet.
 */

import { describe, expect, it } from 'vitest';

import { readUiStyles } from './support/uiStylesSheet.js';

/** The whole `ui-styles` sheet, its partials inlined in cascade order, comment-stripped. */
const SHEET = readUiStyles().replace(/\/\*[\s\S]*?\*\//gu, '');

/**
 * The declarations of the one standalone rule for the hero caption.
 *
 * @returns The rule's body.
 */
function heroCaptionBlock(): string {
	const match = /(?<![\w-])\.fe-boot-caption--hero\s*\{([^}]*)\}/u.exec(SHEET);

	expect(match, 'no standalone rule found for .fe-boot-caption--hero').not.toBeNull();

	return match?.[1] ?? '';
}

describe('the hero boot caption', () => {
	it('spans its column, so a longer wording never moves its box sideways', () => {
		expect(heroCaptionBlock()).toContain('width: 100%;');
	});

	it('holds two lines from its first frame: a 3em minimum against a 1.5 line height', () => {
		const block = heroCaptionBlock();

		expect(block).toContain('line-height: 1.5;');
		expect(block).toContain('min-height: 3em;');
	});

	it('holds the streamed count at the width of a seven-character total, each character with the caption’s letter-spacing', () => {
		const match = /(?<![\w-])\.fe-boot-caption--hero \.fe-boot-caption__value\s*\{([^}]*)\}/u.exec(SHEET);
		const block = match?.[1] ?? '';

		expect(heroCaptionBlock()).toContain('letter-spacing: 0.16em;');
		expect(block).toContain('display: inline-block;');
		expect(block).toContain('min-width: calc(7ch + 7 * 0.16em);');
		expect(block).toContain('text-align: end;');
	});
});
