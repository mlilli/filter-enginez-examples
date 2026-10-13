/**
 * Reading the result count, and knowing when the number has actually arrived.
 *
 * @remarks
 * A sibling of `filterFlow.ts`, split out to keep that file under its 500-line `max-lines` cap, as
 * `panelGeometry.ts` is. Every symbol here is re-exported from `./filterFlow.js`, so **specs keep ONE
 * import seam**.
 *
 * ### 🔴 Why "two reads agree" is not enough
 *
 * Two consecutive equal reads are not the same as the number having arrived: the count eases to its
 * new value over ~600ms while `WINE_SETTLED` probes every 200ms, so two reads can both land on a
 * plateau *inside* one animation. That fails in two shapes which look unrelated and are one race:
 *
 * | latched at | what happens |
 * | ---------- | ------------ |
 * | the **start** | an ease-in barely moves for its first frames, so the old value reads twice and looks stable — a miss of thousands |
 * | the **end** | the last frames round to the same integer, one short of the settled value — a miss of one |
 *
 * ⚠ **A 3,000-record miss and a 1-record miss are the same race.** Neither is diagnosable from its
 * own message, and "off by one" actively misleads: it invites a hunt for an inclusive/exclusive
 * boundary in the engine, or a float-precision story about the URL round-trip. Neither exists.
 *
 * 🟢 **The animation's own idle flag is in the DOM.** Every shell publishes it from the same
 * `isFetching || isTicking` union: React's `ResultsHeaderView.tsx`, vanilla's `resultsView.ts`,
 * Svelte and Vue's `brand/ResultCount.*`, and Angular's `results-header.component.ts`. Five
 * independent implementations, one class name — so depending on it is not a React-specific
 * shortcut, and {@link isCountIdle} gates every probe.
 *
 * @packageDocumentation
 */

import { expect, type Page } from '@playwright/test';

/** The result-count readout (react-ui `ResultsHeaderView`, and its shared-CSS twin in every vertical). */
export const RESULT_COUNT = '.fe-result-count__number';

/**
 * The result-count element while it is still fetching or animating.
 *
 * @remarks
 * A modifier on the same element {@link RESULT_COUNT} selects, so the two differ only by suffix.
 */
export const RESULT_COUNT_COMPUTING = '.fe-result-count__number--computing';

/** {@link settledCount}'s probe cadence when a caller names none — the tempo most specs use. */
const DEFAULT_POLL_INTERVALS = [150];

/** {@link settledCount}'s ceiling when a caller names none. */
const DEFAULT_SETTLE_TIMEOUT_MS = 20_000;

/**
 * Has the result count stopped both fetching and animating?
 *
 * @remarks
 * ⚠ **Absence of the element counts as idle, deliberately.** A shell that stopped rendering the
 * class would otherwise wedge every settle in a timeout, and this predicate's job is to make a
 * settled read trustworthy rather than to police markup. A missing class belongs to
 * `winePanelFacetParity` as a failure.
 *
 * @param page - The page under test.
 * @returns `true` when no count element is mid-computation.
 */
export async function isCountIdle(page: Page): Promise<boolean> {
	return (await page.locator(RESULT_COUNT_COMPUTING).count()) === 0;
}

/** Knobs for {@link settledCount}. Every one of them exists because a spec needs it; see each field. */
export interface SettledCountOptions {
	/**
	 * Probe cadence handed to `expect.poll`, in ms. Defaults to a flat 150ms (Playwright repeats the
	 * last entry forever, so a one-element array is a constant tempo). Server-backed and worker-backed
	 * routes slow this to 200–250ms: there, a probe pair can otherwise land entirely inside the window
	 * before a round-trip returns. Pass `PLAYWRIGHT_POLL_INTERVALS` (from `./filterFlow.js`) for
	 * Playwright's own cadence.
	 */
	intervals?: number[];

	/**
	 * An extra per-probe gate ANDed onto "two consecutive reads agree".
	 *
	 * @remarks
	 * Exists for Angular's `/books-server`, where two equal reads are genuinely not enough: a commit is
	 * an HTTP request, so both reads can land BEFORE the response does and the count looks settled at
	 * its pre-commit value. That spec gates additionally on its status pill reading "Engine idle", which
	 * stays lit from `markUserAction()` until a `lastChange` snapshot resolves it — precisely the window
	 * the naive check samples straight through. The predicate lives at the call site because what
	 * "also settled" means is a per-vertical DOM contract, not a filter-flow concept.
	 */
	isAlsoSettled?: (page: Page) => Promise<boolean>;

	/**
	 * Whether a settled count must additionally be greater than zero. Defaults to `true`, which is what
	 * most specs want.
	 *
	 * @remarks
	 * This is the one genuine semantic fork between specs, so it is an option rather than a fixed
	 * behavior. With it ON, a count of 0 is never "settled" — the poll keeps going and
	 * eventually fails, which is what a spec wants when zero results can only mean the corpus never
	 * arrived. With it OFF, 0 settles like any other value, which is what a spec wants when it is
	 * asserting on a deliberately-narrowed (possibly empty) set. Flipping the default under a spec would
	 * turn a hard failure into a silent pass, or vice versa, so neither shape gets dropped.
	 */
	requirePositive?: boolean;

	/** How long to keep probing before failing, in ms. Defaults to 20s; HTTP-backed routes need 25–45s. */
	timeout?: number;
}

/**
 * Read the result count as a number, right now.
 *
 * @remarks
 * Strips every non-digit, so the thousands separators the readout formats with (`129,907`) do not have
 * to be locale-guessed. A count element that renders no digits at all parses to `NaN`, which is
 * deliberate: `NaN` never equals itself, so {@link settledCount} cannot mistake "nothing rendered" for
 * a settled value and will fail on the timeout instead of returning a lie.
 *
 * Reading this directly is correct only when the assertion around it is itself a poll (`expect.poll(…)
 * .toBe(total)`). For a bare read, use {@link settledCount} — see its docblock for why.
 *
 * @param page - The page under test.
 * @param selector - The count element; defaults to the shared {@link RESULT_COUNT}.
 * @returns The parsed count, or `NaN` if the element carries no digits.
 */
export async function readCount(page: Page, selector = RESULT_COUNT): Promise<number> {
	const text = (await page.locator(selector).first().textContent()) ?? '';

	return Number.parseInt(text.replace(/\D/gu, ''), 10);
}

/**
 * Read the result count once it has stopped ticking.
 *
 * @remarks
 * **The count animates.** The results header eases the number from its old value to its new one over
 * ~600ms, so a read taken straight after a click captures a meaningless mid-roll frame. Every naive
 * "poll until less than before" latches onto one of those frames and passes for the wrong reason; every
 * exact-value comparison against one is flaky by construction — the "expected" value varies run to run
 * while the actual settled value stays constant.
 *
 * So: probe until two consecutive reads agree **and the count element is no longer marked
 * computing**, then return that value. Callers may tighten it further with
 * {@link SettledCountOptions.requirePositive} and {@link SettledCountOptions.isAlsoSettled}.
 *
 * 🔴 **Both halves are required.** A stability check alone can latch on a plateau inside one
 * animation; see this module's own docblock for the two shapes that takes.
 *
 * The `intervals` array is copied before it reaches Playwright, which `pop()`s and `shift()`s the array
 * it is handed — a module-level cadence constant would be drained by its first caller otherwise.
 *
 * @param page - The page under test.
 * @param options - Per-spec tuning; see {@link SettledCountOptions}.
 * @returns The settled count.
 */
export async function settledCount(page: Page, options: SettledCountOptions = {}): Promise<number> {
	const {
		intervals = DEFAULT_POLL_INTERVALS,
		isAlsoSettled,
		// Renamed on the way in only to carry the repo's boolean-name prefix; the OPTION keeps the name
		// that reads best at a call site (`requirePositive: false`).
		requirePositive: isPositiveRequired = true,
		timeout = DEFAULT_SETTLE_TIMEOUT_MS,
	} = options;
	let previous = -1;

	await expect
		.poll(
			async () => {
				const current = await readCount(page);
				// `current > 0` rather than `!(current <= 0)`: NaN must fail both forms of the check.
				const isStable = current === previous && (!isPositiveRequired || current > 0);

				previous = current;

				if (!isStable) {
					return false;
				}
				// 🟢 Composed with the caller's predicate rather than replacing it, and checked FIRST:
				// `isAlsoSettled` implementations tend to be the expensive ones.
				const isFullySettled
					= (await isCountIdle(page)) && (isAlsoSettled === undefined || (await isAlsoSettled(page)));

				return isFullySettled;
			},
			{ intervals: [...intervals], timeout },
		)
		.toBe(true);

	return previous;
}
