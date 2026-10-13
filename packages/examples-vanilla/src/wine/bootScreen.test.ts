/**
 * The wine routes' cold-boot screen — the parts of it that carry a DECISION rather than a layout.
 *
 * @remarks
 * ## Why this file exists at all, given the module is 40 lines of `el()` calls
 *
 * Its two cases pin claims the module's own docblock argues for: that the loader's accessible name
 * reaches the loader, and that replacing a caption replaces it. Each is the kind of defect that
 * type-checks, lints and passes every other gate in this repo, and is visible only to an eye on a
 * rendered page — which is exactly the category `../brand/indicators.test.ts` is written for. The
 * live count's color (CYAN, not phosphor — a corpus arriving is data, not the engine computing) is
 * asserted there, beside `bootCaptionValue`.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { bootCaptionValue } from '../brand/indicators.js';
import { createWineBootScreen } from './bootScreen.js';

// `bootCaptionValue`'s own cases live in `../brand/indicators.test.ts`, beside the function. It is
// imported here because the caption-replacement case below asserts the mixed text-and-element call
// both routes make.

describe('createWineBootScreen', () => {
	it('passes the loader label through, so the graphic is not announced unnamed', () => {
		// `createBootLoader` is a `role="img"`, so an empty name announces an unlabelled graphic where
		// the entire page content should be — for the several seconds a 130k stream takes.
		// `indicators.test.ts` asserts the loader honors a name it is given; this asserts the screen
		// gives it one, which is the half that could regress here.
		const { element } = createWineBootScreen('Loading wine reviews');

		expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Loading wine reviews');
	});

	it('REPLACES the caption rather than appending to it', () => {
		// The screen is narrated once per progress event — a few hundred times across a full stream. An
		// `append` here would grow the caption into a paragraph rather than update it, which is a defect
		// that looks like nothing on the first event and like a wall of text on the fiftieth.
		const screen = createWineBootScreen('Loading wine reviews');
		const caption = (): string => screen.element.querySelector('p')?.textContent ?? '';

		screen.setCaption('Spinning up worker thread');

		expect(caption()).toBe('Spinning up worker thread');

		screen.setCaption('Loaded ', bootCaptionValue('500'), ' of 1,000 bottles');

		// The mixed text-and-element call is the signature both wine routes use to highlight a live
		// number, so the interleaving is part of the contract rather than incidental to this case.
		expect(caption()).toBe('Loaded 500 of 1,000 bottles');
	});
});
