/**
 * The wine filter flow, asserted identically of every vertical that serves `/wine`.
 *
 * @remarks
 * ## What this provides
 *
 * One suite of wine cases, run against every vertical: the same `WINE_SETTLED` tempo, the same
 * `subtitle()` boot signal, and a `bootWineApp` that differs only in which `*Url()` builder it calls.
 * Every vertical runs the same cases — boot and corpus tier, boot caption, facet toggle, chip
 * flicker, pill removal, clear all, smart-filter presets, keyboard undo/redo, panel scroll, the
 * shareable-URL round-trip, the mobile filter collapse, an axe scan, an open-ended price through
 * reload and Back / Forward (`wineOpenRange.ts`), a preset replacing the manual filters
 * (`winePresetTakeover.ts`), and the cross-app parity cases (`wineParity.ts`) — so the question
 * "which cases does this vertical run" has one answer.
 *
 * The precedent is `compare.spec.ts`, which asserts the same thing of all six verticals by iterating
 * the registry, so a new vertical joins it without a new spec file.
 *
 * ## This module owns the CASES; it does not own the ROSTER
 *
 * Each spec file calls {@link describeWineVertical} explicitly, so a vertical cannot join the suite
 * without someone writing its file. That is the opposite of `compare.spec.ts`, which iterates a
 * registry, and it is deliberate: there each vertical contributes one link to follow, while a wine
 * route is a real build with a worker, a thirteen-section panel and its own boot path.
 *
 * ## All SIX verticals
 *
 * Vue, SvelteKit, Angular, vanilla and both React apps each call it, so the shared suite is the
 * definition of "the wine flow".
 *
 * ## What stays in the individual spec files
 *
 * Only what is genuinely unique to one vertical:
 *
 *   - **Angular's boot-loader case**, which cannot move here because the state it asserts is *gone*
 *     by the time the shared `beforeEach` returns — it has to navigate itself.
 *   - **RTK's landing + routing suite**, which is not a wine flow at all, and its check that the
 *     React collapse toggle names the region it discloses (`aria-controls`), which only react-ui's
 *     `<FilterCollapse>` sets.
 *
 * Everything else lives here.
 *
 * @packageDocumentation
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { WINE_SEARCHES } from '../../packages/examples-shared/src/wine/wine-domain/panelCopy.js';
import { expectBootCaption, installBootCaptionRecorder, readBootCaptions } from './bootCaption.js';
import {
	ACTIVE_CHIP,
	chipLabelWithoutCount,
	clickFirstFacetChip,
	expectFilterCollapseKeepsState,
	expectPanelScrollsToLastControl,
	FACET_CHIP,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
} from './filterFlow.js';
import { subtitle, type VerticalId } from './subtitles.js';
import { describeOpenRangeRoundTrips } from './wineOpenRange.js';
import { describeWineParity, wineNotesField } from './wineParity.js';
import { describePresetTakeover } from './winePresetTakeover.js';

/**
 * The wine panel's last control, in every vertical.
 *
 * @remarks
 * **A shared constant rather than a per-vertical field, because it is measurably the same string in
 * all five panels** — the React one, both hand-written non-React ones, Vue's and Angular's — and the
 * winery search really is last in each. `wineSectionOrder` holds them to one order.
 *
 * Named explicitly rather than found with `:last-child`: "what sits last" is a per-dataset fact, and
 * a helper that guessed could pass against a spacer element.
 */
const LAST_PANEL_CONTROL = `input[aria-label="${WINE_SEARCHES.winery.ariaLabel}"]`;

/**
 * A slower probe than the shared default, because every wine route's engine lives in a Web Worker.
 *
 * @remarks
 * Each commit crosses a Comlink boundary and returns asynchronously, so the count can sit unchanged
 * for longer than a tight probe pair without being settled. The main-thread routes get away with
 * 150 ms over 20 s.
 */
export const WINE_SETTLED: SettledCountOptions = { intervals: [200], timeout: 25_000 };

/** How one vertical differs from the others. Deliberately small — that is the point of the file. */
export interface WineVerticalSpec {
	/**
	 * The vertical's registry id, used for the header subtitle this route paints on boot.
	 *
	 * @remarks
	 * **Typed as `VerticalId` rather than `string`, and that is load-bearing.** SvelteKit's id is
	 * `sveltekit` while its spec file, its URL helper and its package are all called `svelte` — so
	 * the plausible wrong value is very plausible indeed. It would not fail loudly: the boot wait
	 * would simply never match, and every case in the suite would time out reporting that the app
	 * never booted, about an app that booted fine. The union turns that into a compile error.
	 */
	readonly id: VerticalId;
	/** Human label for the test-suite title, e.g. `'Vue'`. */
	readonly label: string;
	/**
	 * That app's absolute-URL builder.
	 *
	 * @remarks
	 * **Optional, because exactly one vertical does not need one.** Playwright's single `baseURL` is
	 * the React RTK app, so the other five navigate away from it with absolute URLs — and RTK's own
	 * builder would be a function returning its argument unchanged. A `reactRtkBase.ts` existing
	 * solely to export that identity would be a file whose entire content is a lie about doing
	 * something. Omitting the field says the true thing instead: this is the vertical `baseURL`
	 * already points at.
	 */
	readonly url?: (path: string) => string;
}

/**
 * Wait for the worker boot to replace the loader with the live page.
 *
 * @remarks
 * **Separate from {@link bootWineApp} because the round-trip case needs it after a `page.reload()`,
 * where navigating again would be actively wrong** — it would throw away the `?f` query string that
 * case just produced. It waits on the subtitle AND the result count, so a reload is held to the same
 * boot signal as a first navigation.
 *
 * Exported because a spec's own vertical-specific cases need the same boot, and re-implementing it
 * there would put the duplication straight back — three lines at a time.
 *
 * @param page - The page under test.
 * @param id - The vertical's registry id, for the header subtitle it paints.
 * @returns Nothing; resolves once the live header and result count are painted.
 */
export async function waitForWineBoot(page: Page, id: VerticalId): Promise<void> {
	// The worker builds 150,000 records behind the boot screen; the live header appears
	// only once the view mounts.
	await expect(page.getByText(subtitle('Wine', id, 'worker'))).toBeVisible({ timeout: 60_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/**
 * Navigate to a vertical's wine route and wait for the lazy chunk plus the worker corpus boot.
 *
 * @param page - The page under test.
 * @param spec - The vertical to boot.
 * @returns Nothing; resolves once the live header and result count are painted.
 */
export async function bootWineApp(page: Page, spec: Pick<WineVerticalSpec, 'id' | 'url'>): Promise<void> {
	// A vertical with no `url` builder IS Playwright's `baseURL` — see the field's remarks. A bare
	// root-relative path is exactly what that means.
	await page.goto(spec.url === undefined ? '/wine' : spec.url('/wine'));
	await waitForWineBoot(page, spec.id);
}

/**
 * Register the shared wine filter-flow suite for one vertical.
 *
 * @param spec - What differs about this vertical.
 */
export function describeWineVertical(spec: WineVerticalSpec): void {
	const { id, label } = spec;

	/**
	 * This vertical's proof that the filter controls are open and interactable: the first facet chip
	 * turning VISIBLE. Every app keeps its closed panel mounted under `hidden`, so the chip exists the
	 * whole time and only its visibility says the collapse is open.
	 */
	const panelReady = (page: Page): Locator => page.locator(FACET_CHIP).first();

	/** Reveal the filter controls. A no-op on desktop, where every panel is already in the tree. */
	const openPanel = async (page: Page, testInfo: TestInfo): Promise<void> => {
		await openFilterPanel(page, testInfo, panelReady(page));
	};

	test.describe(`${label} wine app — filter flow`, () => {
		test.beforeEach(async ({ page }) => {
			// Installed for EVERY case, not just the caption one, and it costs nothing: the recorder is a
			// `MutationObserver` that disconnects the moment the caption leaves the DOM, which is before
			// the results grid exists to churn. Installing it here rather than inside the caption case is
			// what keeps that case from needing a second navigation — `addInitScript` only applies to
			// loads that have not happened yet, so a case that installed it itself would have to re-boot
			// a 150k worker to be able to look, and the suite is already the slow half of `test:e2e`.
			await installBootCaptionRecorder(page);
			await bootWineApp(page, spec);
		});

		test('boots and renders a non-empty result set', async ({ page }) => {
			expect(await settledCount(page, WINE_SETTLED)).toBeGreaterThan(0);
		});

		test('boots the FULL tier rather than a 10,000-wine one', async ({ page }) => {
			// **This assertion exists because a smaller tier looks healthy.** Every `/wine` route must boot
			// the full tier — the local real corpus where linked, otherwise the 150,000 synthetic wines —
			// so `/compare` shows the same counts in all six apps. A route left on the 10,000-wine default
			// tier (`VITE_WINE_TIER=default`, or the low-memory tier on a small device) filters correctly,
			// and every other gate stays green, because a working app over a smaller corpus looks exactly
			// like a working app.
			//
			// **Asserted POSITIVELY, and that is the whole design.** A negative assertion on the 10k label
			// passes just as happily against an app that stopped reporting a tier at all — and
			// `describeBootedWineCorpusTier` returns `''` when it has nothing to say, so that is a
			// reachable state rather than a hypothetical one. Requiring the string that means success
			// fails on both the wrong tier and on silence. Every full-tier label contains `full corpus`
			// and no 10k label does (`wineCorpusLoader.test.ts` pins both).
			//
			// `getByRole('contentinfo')`, NOT `locator('footer')`: the devtools surface renders its own
			// `<footer class="fe-devtools-timeline">` inside a labelled region, so the bare tag selector
			// resolves to two elements and dies on strict mode — an assertion that never evaluates is
			// not a stricter test, it is an absent one. Only a top-level `<footer>` carries the role.
			await expect(page.getByRole('contentinfo')).toContainText('full corpus');
		});

		test('narrates the boot in the caption states the shared module defines', async ({ page }) => {
			// The boot caption comes from one shared module in every vertical, and its failure mode is a
			// first frame announcing "0 bottles loaded · constructing filter index" — a finished load
			// reported before the stream started, at the moment a user is deciding whether the page has
			// hung. No other assertion reads the caption, so without this a wrong one passes
			// `pnpm test:e2e` exactly as a right one does. One shared module, so one shared case.
			//
			// The recorder installed in `beforeEach` is what makes this deterministic rather than a race —
			// see `bootCaption.ts`, which also explains why the assertions read a finished list instead of
			// trying to catch a frame that lasts milliseconds.
			expectBootCaption(await readBootCaptions(page), 'bottles');
		});

		test('toggling an InSet filter narrows the results and shows an active-filter pill', async ({ page }, testInfo) => {
			const before = await settledCount(page, WINE_SETTLED);

			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

			expect(await settledCount(page, WINE_SETTLED)).toBeLessThan(before);
		});

		test('a clicked chip STAYS lit across the worker round trip', async ({ page }, testInfo) => {
			// The browser-side twin of each vertical's own flicker guard. Those simulate the mid-flight
			// engine; this drives a real Comlink round trip against 150,000 records, which is the only
			// place the actual latency exists. A read-only derivation would un-tick the chip here for a
			// few hundred milliseconds — long enough to see, short enough that a spec asserting only the
			// final state would never notice.
			//
			// SvelteKit's panel uses the same writable-derived pattern the case is about.
			await openPanel(page, testInfo);

			const chipLabel = await chipLabelWithoutCount(page.locator(FACET_CHIP).first());

			await clickFirstFacetChip(page);

			// Immediately, with no settle wait: the point is the state DURING the round trip.
			await expect(page.locator('.fe-chip--selected').filter({ hasText: chipLabel }).first()).toBeVisible();
		});

		test('removing the active-filter pill restores the full set', async ({ page }, testInfo) => {
			const before = await settledCount(page, WINE_SETTLED);

			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);
			// The pill's × sits in the results column, below the open collapse at phone width; the
			// click scrolls it into view, and nothing covers it.
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
			expect(await settledCount(page, WINE_SETTLED)).toBeLessThan(before);

			await page.locator('.fe-filter-chip__remove').first().click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await settledCount(page, WINE_SETTLED)).toBe(before);
		});

		test('clear all resets every active filter', async ({ page }, testInfo) => {
			// "Clear all" is rendered by every vertical (`react-ui/ResultsHeaderView`, vanilla's
			// `resultsView.ts`, and the Vue / Svelte / Angular results headers).
			//
			// It is not a duplicate of the case above: removing a pill clears ONE rule through the
			// chip's own ×, while this clears the whole map through a single link, and those are
			// different code paths in every vertical (`commit.ts`'s `clearAll` in the shared wine
			// domain, versus a per-rule removal).
			const before = await settledCount(page, WINE_SETTLED);

			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
			expect(await settledCount(page, WINE_SETTLED)).toBeLessThan(before);

			await page.getByRole('button', { name: 'Clear all' }).click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await settledCount(page, WINE_SETTLED)).toBe(before);
		});

		test('applying a smart-filter preset switches the engine into expression mode', async ({ page }, testInfo) => {
			const before = await settledCount(page, WINE_SETTLED);

			await openPanel(page, testInfo);

			// A PRESET chip, which lives ABOVE the panel body — deliberately NOT `FACET_CHIP`, which is
			// scoped to the body so the facet cases cannot click one of these by accident.
			const preset = page.getByRole('button', { name: 'Bold reds' });

			await preset.click();
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
			expect(await settledCount(page, WINE_SETTLED)).toBeLessThan(before);
			// The panel's own chip too: the header pill alone would still light if the preset derivation
			// were stuck empty, since that chip is synthetic and keys off the engine's MODE.
			await expect(preset).toHaveAttribute('aria-pressed', 'true');

			// **The sections must be LOCKED, not merely dimmed — asserted of every vertical.** All six
			// panels set `inert` on the body, gated on expression mode alone. `pointer-events: none`
			// removes a hit-test target and leaves the focus order untouched, so without `inert` a
			// keyboard user could Tab into the dormant sections and drive controls the engine is
			// ignoring — a WCAG 2.1 gap no other gate sees. See `FilterSectionGuard.tsx`.
			//
			// The dim is the mouse half and this is the keyboard half; asserting the CLASS instead
			// would pass over exactly that gap. The preset strip stays reachable because
			// it sits outside this element — the one structural rule every wine panel obeys.
			await expect(page.locator('.fe-filter-panel__body')).toHaveAttribute('inert', '');
		});

		test('keyboard undo restores the previous result set; redo re-applies', async ({ page }, testInfo) => {
			// **Every vertical attaches the SAME binding** — `attachUndoRedoKeyboard` from
			// `@filter-enginez/core/keyboard/browser`, via its `TimeTravelControls` (the two React apps
			// share one from `examples-shared`) — so one case covers every vertical's controls.
			const before = await settledCount(page, WINE_SETTLED);

			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);
			// **The panel is left OPEN.** The hook declines only inside `input` / `textarea` /
			// `[contenteditable]`, and focus is on the chip button that was just clicked, so the
			// shortcut reaches it in every app at every width.
			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);

			const narrowed = await settledCount(page, WINE_SETTLED);

			expect(narrowed).toBeLessThan(before);

			// The global hook fires because focus is on a button — the chip just clicked — and not on an
			// input/textarea, which the hook passes through to the browser's native undo.
			//
			// **The assertions are on the ENGINE, not on the cursor.** A devtools shim that moved its
			// own cursor without moving the engine would satisfy any check of the control's state.
			await page.keyboard.press('Control+z');
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await settledCount(page, WINE_SETTLED)).toBe(before);

			// `Control+Shift+z` re-applies. Worth knowing: a shifted key reports UPPERCASE, so a unit
			// suite firing a synthetic `{ key: 'z', shiftKey: true }` event — which no browser sends —
			// can stay green over a dead redo. Playwright presses the real key.
			await page.keyboard.press('Control+Shift+z');
			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
			expect(await settledCount(page, WINE_SETTLED)).toBe(narrowed);
		});

		test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
			test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

			await openPanel(page, testInfo);
			// The measurement is the shared helper's. Omitting `fe-filter-panel__scroller` does not look
			// broken — the panel silently stops scrolling and the PAGE scrolls instead.
			//
			// **Angular is why this runs everywhere.** `<fe-wine-filter-panel>` is a host element the other
			// five do not have, and an unknown element defaults to `display: inline`, severing the
			// bounded-height chain. Its `:host` rule restores it, and jsdom cannot see that, so this case
			// is the only instrument that can.
			await expectPanelScrollsToLastControl(page, LAST_PANEL_CONTROL);
		});

		test('shareable-URL round-trip: a filter writes ?f= and a reload restores it', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);

			// Captured for the post-reload CONTROL assertion, and WITHOUT the projected-count badge so it
			// still matches once the chip is selected. Read BEFORE the click.
			const chipLabel = await chipLabelWithoutCount(page.locator(FACET_CHIP).first());

			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

			const narrowed = await settledCount(page, WINE_SETTLED);

			// The engine → URL sync writes the serialized config to `?f=` (debounced), even over the
			// worker tier — where it must read through `asyncEngine.exportConfig()` rather than the sync
			// shim, which throws by design.
			await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();

			await page.reload();
			// `waitForWineBoot`, NOT `bootWineApp`: navigating again here would throw away the `?f` this
			// case just produced, which is the whole point of the two helpers being separate.
			await waitForWineBoot(page, id);
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
			expect(await settledCount(page, WINE_SETTLED)).toBe(narrowed);

			// Reopen the collapse — a reload closes it at phone width — because the panel's CONTROLS must
			// reflect the restored state too, not only the pill and the count. Asserting the pill and
			// count alone is a blind spot: the route hydrates `loadConfig(urlConfig)` before the view
			// renders, so an unselected chip here means the panel is ignoring rules the engine holds.
			//
			// Matched by LABEL, not by position: an unscoped `.fe-chip--selected` first-match can go
			// green on a panel that seeded nothing.
			await openPanel(page, testInfo);

			await expect(page.locator('.fe-chip--selected').filter({ hasText: chipLabel }).first()).toBeVisible();
		});

		test('mobile: the "Filters" toggle shows and hides the panel, which keeps a half-typed search', async ({ page }, testInfo) => {
			test.skip(!isMobileProject(testInfo), 'The toggle only exists below the two-column breakpoint.');

			// Every app hides the closed panel with `hidden` and keeps it mounted, so the text typed
			// before a close is still in the field after a reopen.
			await expectFilterCollapseKeepsState(page, wineNotesField(page), 'cherry');
		});

		test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			// Scan the SETTLED visual state — reduced motion so axe evaluates final colors, not a
			// transient card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast
			// fail).
			await page.emulateMedia({ reducedMotion: 'reduce' });

			const { violations } = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
			const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

			expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
		});
	});

	// An open-ended price through `?f=`: a reload, Back / Forward, and an in-app Back. In its own module
	// for `max-lines`, and handed what it needs rather than importing it back, which would be a cycle.
	describeOpenRangeRoundTrips({
		id,
		label,
		openPanel,
		settled: WINE_SETTLED,
		urlOf: (path) => (spec.url === undefined ? path : spec.url(path)),
		waitForBoot: async (page) => waitForWineBoot(page, id),
	});

	// A preset applied over a manual filter, and a restored preset cleared. Its own module for the same
	// reasons as the open-range cases.
	describePresetTakeover({
		boot: async (page) => bootWineApp(page, spec),
		label,
		openPanel,
		settled: WINE_SETTLED,
		waitForBoot: async (page) => waitForWineBoot(page, id),
	});

	// The cases every app must answer identically: the action log, busy marks, search timing, typed
	// slider bounds, the shared copy and the hub round trip. Its own module for the same reasons.
	describeWineParity({
		boot: async (page) => bootWineApp(page, spec),
		id,
		label,
		openPanel,
		settled: WINE_SETTLED,
		waitForBoot: async (page) => waitForWineBoot(page, id),
	});
}
