/**
 * The shared filter-flow helpers every app spec drives the engine through.
 *
 * @remarks
 * Six verticals (React RTK, React plain, SvelteKit, Vue, Angular, framework-less) render the same
 * journey over the same `ui-styles` `fe-*` classes: boot a corpus, reveal the filter panel, toggle a
 * control, read the result count once it stops moving. That flow is uniform enough that every spec
 * shares this handful of helpers, and one copy means one place for the reasoning to live — so **every
 * docblock below names the trap it guards rather than describing the obvious.** (`closeFilterPanel`
 * is the one helper only some callers need — see its docblock.)
 *
 * ### What deliberately does NOT live here
 *
 * Each spec still owns its own boot helper, because "booted" is a per-vertical signal — a subtitle
 * naming that vertical (`subtitle('Books', 'sveltekit', 'server')`, via `./subtitles.js`) and a
 * per-vertical patience (a main-thread books corpus in 30s; a worker streaming 130k wines, or an
 * Angular route resolver pulling a corpus over HTTP, in 45–60s). The subtitle strings are derived
 * rather than written out — see `./subtitles.ts`. Two traps live in those helpers:
 *
 * 1. **A boot signal must live OUTSIDE the filter panel.** Wait on the results header, a subtitle, a
 *    card — anything in the results column. Waiting on something inside the panel conflates "the route
 *    has not booted" with "the drawer is closed", and only one of those is a failure. A spec that asserts
 *    the panel visible straight after navigation passes on desktop, where the panel is always open, and
 *    fails at phone width, where it sits behind the drawer.
 * 2. **A "reload" must not re-navigate.** Split "wait for the boot" from "go to the route". A
 *    `bootXApp()` that opens with `page.goto('/x')` throws away the `?f` query string a URL-round-trip
 *    test exists to restore from — the test then re-measures a neutral engine and passes or fails for
 *    reasons unrelated to serialization. Reload, then wait: `await page.reload(); await waitForXBoot()`.
 *
 * ### And one trap that belongs to no helper at all
 *
 * **`toBeInViewport()` asks about the WINDOW.** When the invariant is really about a scroll container —
 * "the last panel section is reachable" — measure the control's rect against that container's rect, as
 * the two real-estate panel-scroll tests do. The sticky panel is capped at `calc(100vh - 2rem)` but
 * starts BELOW the app header, so its bottom edge sits below the fold until the PAGE scrolls: the last
 * control is correctly placed inside a panel that is itself partly off-screen, and a viewport assertion
 * fails on a page-scroll position it was never about, reporting `viewport ratio 0` against a panel that
 * is scrolling perfectly.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * Re-exported so every spec keeps ONE import seam (`./filterFlow.js`). The implementation lives in
 * `./resultCount.ts`, which holds the count-reading and count-settling helpers so this file stays under
 * the 500-line cap — see that module for the animation race `settledCount` guards against.
 */
export {
	isCountIdle,
	readCount,
	RESULT_COUNT,
	RESULT_COUNT_COMPUTING,
	settledCount,
	type SettledCountOptions,
} from './resultCount.js';

/** The first enabled, not-yet-selected InSet chip in the filter panel. */
export const TOGGLEABLE_CHIP = '.fe-chip:not(.fe-chip--selected):not([disabled])';

/**
 * The same chip, scoped to the panel's BODY.
 *
 * @remarks
 * For the two wine routes, and the reason is not cosmetic. The wine panels render the smart-filter
 * presets ABOVE `.fe-filter-panel__body` — a `topSlot` in React's `<FilterSectionGuard>`, a sibling
 * block in SvelteKit's — and those presets are `.fe-chip`s too. So an unscoped `.first()` lands on
 * **"Bold reds"**, not on a facet: a spec named "toggling an InSet filter" would in fact be exercising
 * EXPRESSION mode.
 *
 * That is not merely a misleading title. It would leave a flat `InSetRule` chip on either wine route
 * uncovered, and it would make an expression-only regression fail specs whose names mention no such
 * thing — a failure pointing three layers away from its cause.
 *
 * Every other vertical's panel has no `topSlot`, so `TOGGLEABLE_CHIP` is already a facet chip there
 * and is deliberately left alone; scoping it globally would assume a `__body` element in six panels
 * this file cannot see.
 */
export const FACET_CHIP = `.fe-filter-panel__body ${TOGGLEABLE_CHIP}`;

/**
 * A panel body that is currently refusing pointer events.
 *
 * @remarks
 * `--busy` (recomputing) and `--expression` (a smart-filter preset is driving the results) both set
 * `opacity` AND `pointer-events: none` in `ui-styles`. The dim is the visible half; the blocked
 * pointer events are the load-bearing half, and they exist so a burst of clicks cannot outrun the
 * engine.
 */
export const INERT_PANEL_BODY = '.fe-filter-panel__body--busy, .fe-filter-panel__body--expression';

/**
 * Click the first facet chip, once the panel body will actually accept the click.
 *
 * @remarks
 * **Why this is not just `page.locator(FACET_CHIP).first().click()`.** While the engine is
 * recomputing, `.fe-filter-panel__body--busy` sets `pointer-events: none` on the whole body — so every
 * chip inside it stops being a hit-test target, the hit falls through to whatever DOES accept pointer
 * events, and the click is refused. The reported interceptor alternates between the presets
 * `<section>` and `<div class="fe-filter-drawer__header">` purely because those are what sit at that
 * viewport point at different scroll offsets; neither is overlapping anything.
 *
 * **A preset click never has to wait; a facet click does.** The smart-filter presets are rendered
 * OUTSIDE the dimmed body specifically so they stay interactive while it locks — `<FilterSectionGuard>`
 * says so in as many words. An unscoped `TOGGLEABLE_CHIP` matches a preset, which is why `FACET_CHIP`
 * needs this wait and `TOGGLEABLE_CHIP` on the wine routes would not.
 *
 * So this is not a workaround. Waiting for the body to become interactive is the test respecting a
 * deliberate product contract.
 *
 * **If that assertion is what fails, read it as a product bug, not a flaky test.** A body that never
 * leaves `--busy` is a panel a real user cannot touch either, and the message says which state it is
 * stuck in — strictly more diagnostic than `<section> intercepts pointer events` naming an element
 * that is not the problem.
 *
 * ### Every React drawer spec calls this
 *
 * A raw `TOGGLEABLE_CHIP.first().click()` passes only when something before it happens to wait — a
 * test that opens with `const before = await settledCount(page)` inherits that wait for free, and one
 * with no `before` to capture clicks straight into a `--busy` body. Calling this everywhere removes the
 * dependence on that accident, and `tests/tooling/e2eDrawerChipClicks.test.ts` keeps raw clicks out.
 *
 * ### The forced click, and exactly what it does and does not skip
 *
 * The drawer body is a flex column with `overflow: hidden` in `ui-styles`, so the panel's own
 * `.fe-filter-panel__scroller` is the only scroll container — its comment carries the derivation. Two
 * nested `overflow-y: auto` containers would make Playwright re-run `scrollIntoViewIfNeeded` on every
 * retry without converging, the click point landing outside the visible box each time.
 *
 * **The click is still forced.** Removing `{ force: true }` would restore Playwright's hit-test, the
 * one check this helper skips.
 *
 * So this asserts the things that actually matter, by hand, and skips only the hit-test:
 *
 *   - the panel body accepts pointer events (above — the check that would otherwise be silent),
 *   - the chip exists, is visible, and is enabled.
 *
 * **What that could hide:** a real overlay genuinely covering the chip for a user. That is the one
 * failure this cannot see, and it is covered deliberately by a manual smoke test — tap a color chip
 * in the drawer by hand and confirm it applies on the first tap. Automate what is automatable; put
 * the rest in front of a person rather than pretending it is covered.
 *
 * @param page - The page under test.
 * @returns The chip that was clicked, so a caller can read its label back.
 */
export async function clickFirstFacetChip(page: Page): Promise<Locator> {
	await expect(
		page.locator(INERT_PANEL_BODY),
		'the filter panel body is dimmed and refusing pointer events (--busy / --expression); a facet chip cannot be clicked until that clears',
	).toHaveCount(0, { timeout: 30_000 });

	const chip = page.locator(FACET_CHIP).first();

	await expect(chip, 'no enabled, unselected facet chip in the panel body').toBeVisible();
	await expect(chip, 'the facet chip is present but disabled').toBeEnabled();
	// With one scroller in the drawer this converges everywhere. It costs nothing, and because the
	// click below is forced, a non-converging scroll would otherwise go unnoticed.
	await chip.scrollIntoViewIfNeeded();
	await chip.click({ force: true });

	return chip;
}

/** Active-filter chips (pills) in the results header — one per constraining rule. */
export const ACTIVE_CHIP = '.fe-filter-chip';

/** An enabled, unselected row in a hierarchy picker (the location tree). */
export const TREE_ROW = '.fe-tree__control:not([disabled]):not(.fe-tree__control--checked)';

/** One distribution bar in a range slider's histogram overlay. */
export const HISTOGRAM_BAR = '.fe-range-histogram__bar';

/**
 * One range slider, addressed by the label in its header row.
 *
 * @remarks
 * **Scoped on purpose.** A bare `.fe-range-slider` matches six of them on the real-estate panel, so
 * `.first()` would silently measure whichever happens to render first — the same trap as an unscoped
 * `.fe-chip--selected` assertion, which passes while testing nothing. `hasText` would be
 * a substring match, which collides on this panel ("Price" inside "Price per square foot" if one is
 * ever added), so the label is matched exactly.
 *
 * @param page - The page under test.
 * @param label - The slider's visible label, matched exactly.
 * @returns A locator for the single matching `.fe-range-slider`.
 */
export function rangeSliderByLabel(page: Page, label: string): Locator {
	return page
		.locator('.fe-range-slider')
		.filter({ has: page.locator('.fe-range-slider__label', { hasText: new RegExp(`^${label}$`, 'u') }) });
}

/**
 * One bar per entry: its tier modifier and its inline height.
 *
 * @remarks
 * The overlay is `aria-hidden` — deliberately, since eighty bars would be eighty screen-reader
 * announcements — so it is unreachable through the accessibility tree and has to be read off the DOM.
 * The returned strings are the two things a panel can get wrong independently: the TIER (which comes
 * from the shared classifier, against the slider's own displayed handles) and the HEIGHT (which comes
 * from the bundle's counts). A signature that changes proves the overlay repainted; one that is empty
 * proves the query, the reader or the prop never reached the control.
 *
 * The base class is stripped from each entry, so a bar reads `--selected|100%` rather than repeating
 * `fe-range-histogram__bar` twice per bucket across eighty of them. {@link isPaintedHistogramBar} is
 * the matching predicate — use it rather than writing the shape out at a call site, where it is easy
 * to assert a prefix this function removes.
 *
 * @param slider - A locator resolving to one `.fe-range-slider`, ideally from
 *   {@link rangeSliderByLabel}.
 * @returns `['--selected|100%', '--outside --empty|4%', …]`, in left-to-right order.
 */
export async function histogramSignature(slider: Locator): Promise<readonly string[]> {
	// The element generic is named explicitly: `evaluateAll` defaults it to `SVGElement | HTMLElement`,
	// and TS 6's `lib.dom.d.ts` declares `SVGElement.className` as `readonly className: any` (it is
	// deprecated). So the union's `.className` is `any`, which degrades this whole expression.
	//
	// 🔴 THREE type arguments, and this site is why the rule is worth pinning. Playwright 1.63 collapsed
	// `evaluateAll`'s two overloads into one — `<R, Arg, E>(fn, arg?)` — removing the no-arg `<R, E>(fn)`
	// form (1.60 had both), so a two-argument call binds the element type to `Arg` and `E` falls back to
	// the union. At a call site that reads `href` that fails LOUDLY, because `href` is absent from
	// `SVGElement`. Here it would not: `any` type-checks fine, and only typed lint
	// (`no-unsafe-member-access`) would catch the silent degradation. Pinned by
	// `tests/tooling/evaluateAllGenerics.test.ts`.
	return slider.locator(HISTOGRAM_BAR).evaluateAll<string[], undefined, HTMLElement>((bars) =>
		bars.map((bar) => {
			const modifiers = bar.className.replaceAll('fe-range-histogram__bar', '').replace(/\s+/gu, ' ').trim();

			return `${modifiers}|${bar.style.height}`;
		}),
	);
}


/**
 * Whether one {@link histogramSignature} entry describes a bar the shared classifier actually
 * painted.
 *
 * @remarks
 * Lives here, next to the function whose output shape it encodes: an inlined regex expecting the
 * `fe-range-histogram__bar` prefix that `histogramSignature` strips fails on a feature that is working.
 * A predicate beside its producer cannot diverge from it the way a copied regex two files away can.
 *
 * A bar failing this is one that reached the DOM without a tier or without a height — invisible or
 * untiered, and in neither case an error anything else would report.
 *
 * @param entry - One entry from {@link histogramSignature}.
 * @returns `true` when it carries at least one tier modifier and a numeric height.
 */
export function isPaintedHistogramBar(entry: string): boolean {
	const [modifiers = '', height = ''] = entry.split('|');

	return modifiers.startsWith('--') && /^\d/u.test(height);
}

/**
 * Playwright's own probe cadence, spelled out.
 *
 * @remarks
 * `expect.poll` uses `[100, 250, 500, 1000]` (last value repeating) when handed no `intervals`, and two
 * specs — `angular-books` and `vanilla-books` — settle their counts on exactly that cadence. They pass
 * it explicitly rather than inherit {@link settledCount}'s tighter default, because the difference is
 * not cosmetic: coarser probes straddle the ~600ms count roll instead of sampling inside it, which makes
 * a false "two equal reads" settle LESS likely. Pinning the values also means a change to Playwright's
 * default can't silently retune those two specs.
 */
export const PLAYWRIGHT_POLL_INTERVALS = [100, 250, 500, 1_000];


/**
 * True when the current project runs at phone width, where the filter controls are behind a "Filters"
 * trigger rather than in an always-open sidebar.
 *
 * @remarks
 * Keyed on the project NAME (`mobile-chrome` in `playwright.config.ts`) rather than on a measured
 * viewport, so it stays a compile-time-ish fact about the run instead of a race with layout.
 *
 * @param testInfo - The per-test info Playwright passes as the second callback argument.
 * @returns `true` on the mobile project, `false` on every desktop project.
 */
export function isMobileProject(testInfo: TestInfo): boolean {
	return testInfo.project.name === 'mobile-chrome';
}

/**
 * Reveal the filter controls: clicks the "Filters" trigger on mobile, and does nothing on desktop,
 * where the sidebar is always in the tree.
 *
 * @remarks
 * **`whenReady` is a required argument on purpose.** What "open" means is the one real difference
 * between the specs, and it is not a flag: the React apps render react-ui's off-canvas drawer,
 * so they wait for `page.getByRole('dialog', { name: 'Book filters' })` (or `'Wine filters'`, or
 * `'Listing filters'`); the non-React apps expand an inline collapse, which has no dialog role and no
 * accessible name, so they wait for the content it reveals — `page.locator(TOGGLEABLE_CHIP).first()`,
 * or Angular's `page.locator('.fe-books-panel')`. Hiding that behind a boolean or a config object would
 * mean a spec could no longer state its own contract, and the drawer-vs-collapse distinction is exactly
 * the thing a reader of one of these specs needs to know.
 *
 * Note what this is NOT for: it must never be a spec's boot signal (trap 1 in the module header). Boot
 * first, on something in the results column, and only then open the panel.
 *
 * @param page - The page under test.
 * @param testInfo - The per-test info; a desktop project makes this a no-op.
 * @param whenReady - The locator that proves this vertical's panel is open and interactable.
 */
export async function openFilterPanel(page: Page, testInfo: TestInfo, whenReady: Locator): Promise<void> {
	if (!isMobileProject(testInfo)) {
		return;
	}
	await page.getByRole('button', { name: 'Filters' }).click();
	await expect(whenReady).toBeVisible();
}

/**
 * Dismiss the filter drawer so the results column is interactable again. Mobile-only; a no-op on
 * desktop.
 *
 * @remarks
 * The mirror of {@link openFilterPanel}, and it takes its locator explicitly for the same reason: only
 * the five React specs have anything to close. react-ui's off-canvas drawer overlays the results column
 * and traps focus, so a chip click has to be followed by a dismissal before the results header — and its
 * "Clear all" — can be reached. The nine non-React specs never call this: their panel is an inline
 * collapse that pushes the results down rather than covering them, so there is nothing to dismiss and
 * the flow reads correctly without it.
 *
 * @param page - The page under test.
 * @param testInfo - The per-test info; a desktop project makes this a no-op.
 * @param whenClosed - The locator that must fall to zero matches once the panel is gone.
 */
export async function closeFilterPanel(page: Page, testInfo: TestInfo, whenClosed: Locator): Promise<void> {
	if (!isMobileProject(testInfo)) {
		return;
	}
	await page.getByRole('button', { name: 'Close filters' }).click();
	await expect(whenClosed).toHaveCount(0);
}

/**
 * A chip's label with its projected-count badge stripped out.
 *
 * @remarks
 * **The badge renders only while the chip is UNSELECTED.** A selected chip contributes its own records,
 * so a projection for it is meaningless and the panel drops it. That makes a label captured off an
 * unselected chip unmatchable against the same chip after a click: the test reads `Austin ISD(412)`,
 * clicks, and then waits forever for a selected chip reading `Austin ISD(412)` that can never exist.
 * That fails in the most expensive way — a timeout on an assertion that looks correct.
 *
 * Clones the element rather than editing the live DOM, so the page under test is untouched.
 *
 * @param chip - A `.fe-chip` locator resolving to exactly one element.
 * @returns The trimmed label text, count badge removed.
 */
export async function chipLabelWithoutCount(chip: Locator): Promise<string> {
	return chip.evaluate((element) => {
		const withoutCount = element.cloneNode(true) as HTMLElement;

		withoutCount.querySelector('.fe-chip__count')?.remove();

		return withoutCount.textContent.trim();
	});
}

/**
 * Re-exported so every spec keeps ONE import seam (`./filterFlow.js`). The implementation lives in
 * `./panelGeometry.ts`, which holds the layout measurements so this file stays under the 500-line cap
 * — see that module for why the last assertion polls.
 */
export { expectPanelScrollsToLastControl } from './panelGeometry.js';
