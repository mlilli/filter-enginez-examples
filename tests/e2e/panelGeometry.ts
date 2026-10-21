/**
 * Panel scroll geometry — the measurement that proves a capped filter panel can be used.
 *
 * @remarks
 * A sibling of `filterFlow.ts`, split out to keep that file under the 500-line cap. The house standard
 * says to decompose rather than suppress, and this is the natural seam: everything here is about
 * LAYOUT, measured against the DOM, while the rest of `filterFlow` is about flow and state.
 *
 * **Re-exported from `filterFlow.ts` rather than imported directly by the nine specs that use it.**
 * That keeps one seam for spec authors — `filterFlow.js` is the shared-helper barrel every spec
 * already reaches for, and `e2eDrawerChipClicks.test.ts` asserts as much for the chip clicks.
 *
 * @packageDocumentation
 */

import { expect, type Page } from '@playwright/test';

/** The filter panel's scroll container — the element that must actually overflow and scroll. */
const PANEL_SCROLLER = '.fe-filter-panel__scroller';

/**
 * The probe cadence for the reachability poll below.
 *
 * @remarks
 * **Deliberately NOT `filterFlow`'s `PLAYWRIGHT_POLL_INTERVALS`, and not only because importing it
 * would make these two modules circular.** That constant is documented as being about the ~600 ms
 * result-count roll, and about two specific specs that need probes coarse enough not to sample
 * inside it. This poll is waiting for a LAYOUT to stop growing, which is a different question with a
 * different answer: probe fast, because a repaint that has landed is visible immediately and every
 * extra interval is dead time on a case that usually passes on the first probe.
 *
 * Sharing a value because the two arrays would look alike is the DRY trap — reuse follows meaning,
 * not shape.
 */
const SCROLL_PROBE_INTERVALS = [50, 100, 200, 400];

/**
 * Assert that the filter panel is height-capped, scrolls, and can actually reach its last control.
 *
 * @remarks
 * **Three assertions, because the bug has three ways to hide.** The panel can stop being
 * height-constrained (nothing overflows, so nothing needs to scroll); it can overflow with no scroll
 * range (the scroller regression — a wrapper with no class severs the flex height chain, so the
 * scroller renders at full content height and the page scrolls instead); or it can scroll and still
 * leave the last control outside the visible box.
 *
 * **The middle one is why this helper exists.** Its symptom is not a broken layout — the content is
 * still reachable, because the PAGE scrolls in the panel's place. Nothing throws, nothing looks
 * obviously wrong in a screenshot, and no other assertion in any spec notices. That is why the
 * non-React books, real-estate and wine specs all run this measurement.
 *
 * Measured against the scroller's own rect rather than with `toBeInViewport()`: the sticky card starts
 * below the app header, so its bottom edge sits below the fold until the PAGE scrolls, and a viewport
 * assertion fails on a page-scroll position that has nothing to do with this test.
 *
 * Desktop only — the caller skips on mobile, where the panel is an inline collapse rather than a
 * capped card.
 *
 * @param page - The page under test.
 * @param lastControlSelector - A CSS selector, relative to the scroller, for the control that sits
 *   last in the panel. Naming it explicitly is deliberate: "the last section" is a per-dataset fact,
 *   and a helper that guessed (`:last-child`) could pass against a spacer.
 */
export async function expectPanelScrollsToLastControl(page: Page, lastControlSelector: string): Promise<void> {
	const scroller = page.locator(PANEL_SCROLLER);
	const overflow = await scroller.evaluate((element) => ({
		client: element.clientHeight,
		scroll: element.scrollHeight,
	}));

	expect(overflow.scroll, 'the panel should overflow its capped card').toBeGreaterThan(overflow.client);

	const scrolled = await scroller.evaluate((element) => {
		element.scrollTop = element.scrollHeight;

		return { range: element.scrollHeight - element.clientHeight, top: element.scrollTop };
	});

	expect(scrolled.range, 'the panel should have a scroll range').toBeGreaterThan(0);
	expect(scrolled.top, 'scrolling to the end should reach the end').toBe(scrolled.range);

	// **This last check RE-SCROLLS on every probe, and that is the whole point of it being a poll.**
	//
	// As a single-shot measurement it fails at four Playwright workers and passes at two (see
	// `measure-e2e-parallelism.sh`), while the three assertions above all pass — the panel overflows,
	// has a range, and scrolls to its very end — so the failure is not about scrolling. It is about WHEN.
	//
	// The wine panel repaints on the filter bundle's settle, and that repaint makes sections TALLER:
	// chip count badges and slider histograms arrive with it. Under CPU contention the order inverts —
	// scroll to the bottom, the bundle lands, `scrollHeight` grows, and the control that was at the
	// bottom is now below it. A single measurement is correct about a layout that has already moved.
	//
	// Re-scrolling inside the poll makes it self-correcting against exactly that: each probe asks the
	// live question ("scroll to the end — is the last control reachable?") rather than trusting a
	// scroll position taken before the panel finished growing.
	//
	// **It does not weaken the guard this helper exists for.** The scroller regression — a severed
	// flex height chain, so the panel renders at full content height and the PAGE scrolls instead —
	// fails the two single-shot assertions above, which are deliberately left un-polled. A panel that
	// never scrolls still fails immediately and for the right reason; only the reachability question
	// waits.
	await expect
		.poll(
			async () =>
				scroller.evaluate((element, selector) => {
					element.scrollTop = element.scrollHeight;

					const control = element.querySelector(selector);

					if (control === null) {
						return false;
					}
					const controlRect = control.getBoundingClientRect();
					const panelRect = element.getBoundingClientRect();

					// A pixel of tolerance each way: sub-pixel layout rounding at the boundary is not a failure.
					return controlRect.top >= panelRect.top - 1 && controlRect.bottom <= panelRect.bottom + 1;
				}, lastControlSelector),
			{
				intervals: SCROLL_PROBE_INTERVALS,
				message: 'the last control should be inside the scrolled panel',
				timeout: 10_000,
			},
		)
		.toBe(true);
}
