/**
 * The boot caption, recorded from the first frame and asserted in a browser.
 *
 * @remarks
 * ## What this guards
 *
 * What a cold-start screen says while a corpus loads is spelled once, in
 * `examples-shared/boot-caption`, and rendered through `.fe-boot-caption` in `ui-styles` by all six
 * verticals. Its characteristic failure: `{ loaded: 0, total: 0 }` is not `null` and does not satisfy
 * `0 < 0`, so a caption that guards on either alone renders "0 books loaded · constructing filter
 * index" — a completed-load claim about a load that has not started, shown at the exact moment a user
 * is deciding whether the page has hung. No other e2e assertion reads the caption, so without this
 * module a wrong caption passes the suite exactly as a right one does.
 *
 * ## Why a RECORDER rather than an assertion after navigation
 *
 * The defect's whole character is that it appears in the **first frame** and is replaced by the first
 * progress event a few milliseconds later. A spec that navigates and then looks has already missed
 * it, and one that tries to look fast enough is a race that fails in CI and passes locally — the
 * least useful kind of test.
 *
 * So {@link installBootCaptionRecorder} runs before any page script and records every distinct
 * caption the screen shows, with the computed styles that make it legible. The assertions then read a
 * finished list after the app has booted, which is deterministic: nothing is timed, nothing polls,
 * and the only way to get an empty list is for the caption never to have rendered — which
 * {@link expectBootCaption} treats as a failure rather than as a pass, because "0 captions recorded"
 * and "every caption was correct" are otherwise the same green.
 *
 * A `MutationObserver` rather than an interval, deliberately: a sampling loop can only see states
 * that outlive a tick, and the broken state may not. The observer disconnects the moment
 * the caption leaves the DOM, so it never watches the results grid churn.
 *
 * ## What it asserts that a unit test cannot
 *
 * `boot-caption/index.test.ts` pins the words, and it runs in Node against a function. Three of the
 * four properties below are only true in a browser:
 *
 *   - the caption element **exists in the page these six apps actually build**;
 *   - `.fe-boot-caption--hero` **resolves** — the shared global class reaches the element rather than
 *     being swallowed by a vertical's scoped styling, which is the first question to ask if this goes
 *     red;
 *   - `.fe-boot-caption__value` **is cyan** rather than inheriting the caption's gray, which is the
 *     dual-accent contract's only enforcement outside a comment.
 *
 * ## Why the shapes are derived from the module rather than restated
 *
 * A spec that hardcodes the three sentences is a second copy of the thing the shared module exists to
 * de-duplicate, and it would diverge the same way. The regexes below are checked against the module's
 * own output first, so a wording change fails the cross-check loudly instead of leaving the spec
 * quietly asserting last month's copy.
 *
 * The import is relative for the reason `subtitles.ts` gives: `@filter-enginez/examples-shared` is
 * not a root dependency, and adding it would not help, because the package's exports point at
 * TypeScript source and Playwright does not transform files under `node_modules`. The module imports
 * nothing at all, so following it costs nothing.
 *
 * @packageDocumentation
 */

import { expect, type Page } from '@playwright/test';

import {
	bootCaptionParts,
	bootCaptionText,
} from '../../packages/examples-shared/src/boot-caption/index.js';

/**
 * `--accent` (`#22d3ee`) as a browser reports it.
 *
 * @remarks
 * Cyan is data; phosphor (`--engine`, `#f97316`) is the engine computing. A corpus arriving is data —
 * the engine has not started work yet, it is waiting — so a phosphor count here would be a
 * design-system violation and not merely an odd color. The brand contract calls the pairing load-bearing.
 */
const ACCENT_RGB = 'rgb(34, 211, 238)';

/** One caption the screen showed, with the computed styles that decide whether it reads correctly. */
export interface RecordedCaption {
	/** The caption's whitespace-collapsed text. */
	readonly text: string;
	/** Computed `text-transform` on the caption element. */
	readonly textTransform: string;
	/** Computed `color` on the live-count span, or `null` when this state has no live count. */
	readonly valueColor: string | null;
}

/**
 * Record every caption the boot screen shows, starting before the page's own scripts run.
 *
 * @remarks
 * Must be called BEFORE the navigation whose boot is being recorded — `addInitScript` applies to
 * subsequent page loads, not the current document.
 *
 * @param page - The page under test.
 * @returns Nothing; resolves once the recorder is registered.
 */
export async function installBootCaptionRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const recorded: RecordedCaption[] = [];

		(window as unknown as { __feBootCaptions: RecordedCaption[] }).__feBootCaptions = recorded;

		/** Sample the caption, appending only when the text has changed. */
		const sample = (): HTMLElement | null => {
			const element = document.querySelector<HTMLElement>('.fe-boot-caption');

			if (element === null) {
				return null;
			}

			// No `?? ''`: on an `HTMLElement` — as opposed to a bare `Node` — `textContent` is typed
			// non-nullable, and the repo's typed-lint rejects the fallback as an impossible branch.
			const text = element.textContent.replace(/\s+/gu, ' ').trim();
			const previous = recorded[recorded.length - 1];

			if (text.length > 0 && text !== previous?.text) {
				const value = element.querySelector<HTMLElement>('.fe-boot-caption__value');

				recorded.push({
					text,
					textTransform: window.getComputedStyle(element).textTransform,
					valueColor: value === null ? null : window.getComputedStyle(value).color,
				});
			}

			return element;
		};

		const observer = new MutationObserver(() => {
			// Disconnect once the caption has been seen and then gone: the app has booted, and everything
			// after this point is the results grid mutating, which this observer has no business watching.
			if (sample() === null && recorded.length > 0) {
				observer.disconnect();
			}
		});

		observer.observe(document, { characterData: true, childList: true, subtree: true });
		sample();
	});
}

/**
 * Read what the recorder collected.
 *
 * @param page - The page under test.
 * @returns Every distinct caption the boot screen showed, in order.
 */
export async function readBootCaptions(page: Page): Promise<RecordedCaption[]> {
	return page.evaluate(
		() => (window as unknown as { __feBootCaptions?: RecordedCaption[] }).__feBootCaptions ?? [],
	);
}

/**
 * Assert a recorded boot sequence, for a route whose caption uses the module's default idle wording.
 *
 * @remarks
 * Written for the **hero** variant — the full-viewport screen behind a 520px loader, which is what
 * every `/wine` route renders and what every caller uses. The uppercase assertion is that
 * variant's, not the caption's; the `--inline` boots on `/books` and `/real-estate` are not uppercase,
 * so a caller from there wants the variant as a parameter rather than this function as-is.
 *
 * @param captions - What {@link readBootCaptions} returned.
 * @param recordNoun - The dataset's plural noun, e.g. `bottles`.
 */
export function expectBootCaption(captions: readonly RecordedCaption[], recordNoun: string): void {
	const idle = bootCaptionText(bootCaptionParts(null, { recordNoun }));
	// `~` only before an estimated total: the local real corpus streams without knowing its length,
	// while the synthetic tier's 150,000 is exact.
	const streaming = new RegExp(`^Loaded [\\d,]+ of ~?[\\d,]+ ${recordNoun}$`, 'u');
	const indexing = new RegExp(`^[\\d,]+ ${recordNoun} loaded · constructing filter index$`, 'u');

	// The cross-check, and it runs first on purpose. Everything below asserts a rendered page against
	// these three shapes; if a shape has diverged from the module the whole case becomes an elaborate
	// way of asserting last month's copy, and it would do so silently.
	expect(bootCaptionText(bootCaptionParts({ loaded: 40_000, total: 150_000 }, { recordNoun }))).toMatch(streaming);
	expect(
		bootCaptionText(bootCaptionParts({ isTotalEstimated: true, loaded: 40_000, total: 129_907 }, { recordNoun })),
	).toMatch(streaming);
	expect(bootCaptionText(bootCaptionParts({ loaded: 150_000, total: 150_000 }, { recordNoun }))).toMatch(indexing);

	// The vacuity guard. An empty list means the caption never rendered — a real failure, and one that
	// would otherwise sail through every assertion below without evaluating any of them.
	expect(captions.length, 'the boot caption never rendered; nothing below was asserted').toBeGreaterThan(0);

	// 🔴 THE regression, asserted where it lives: a first frame reading "0 <noun> loaded · constructing
	// filter index" — a finished load reported before the stream has started. It is the first caption
	// or it is nowhere.
	expect(captions[0]?.text, 'the first caption is not the pre-stream one').toBe(idle);

	for (const caption of captions) {
		expect(
			caption.text === idle || streaming.test(caption.text) || indexing.test(caption.text),
			`"${caption.text}" is not one of the caption's three states`,
		).toBe(true);

		// `--hero` reaching the element, in the built app, through whatever the vertical's own styling
		// does. A scoped rule swallowing the shared class — or a class defined in NO stylesheet — is
		// invisible to every gate that does not render.
		expect(caption.textTransform, `${caption.text}: .fe-boot-caption--hero did not resolve`).toBe('uppercase');

		if (caption.valueColor !== null) {
			expect(caption.valueColor, `${caption.text}: the live count is not the cyan accent`).toBe(ACCENT_RGB);
		}
	}

	// Without the indexing state `/wine` sits frozen on `150,000 / 150,000` for the whole bitmap-index
	// build — the hang-reading failure the third state exists to prevent. Asserted as "reached", because
	// the pause is real on a 150k worker boot.
	expect(
		captions.some((caption) => indexing.test(caption.text)),
		'the caption never reached its indexing state — nothing narrates the pause before a usable index',
	).toBe(true);
}
