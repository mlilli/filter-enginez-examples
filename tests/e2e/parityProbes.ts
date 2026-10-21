/**
 * Probes for the behavior every app shares beyond one filter click: the action log, the busy marks,
 * the shareable `?f=` link, the results-column copy, the mobile filter collapse and the hub round trip.
 *
 * @remarks
 * A sibling of `filterFlow.ts`, split out to keep that file under its 500-line `max-lines` cap, as
 * `resultCount.ts` and `panelGeometry.ts` are. Every symbol here is re-exported from
 * `./filterFlow.js`, so specs keep ONE import seam.
 *
 * ### Why most of these read the DOM rather than an assertion's retry
 *
 * Three of the things the parity cases pin are moments, not states: the panel body's `--busy` mark
 * while one engine write is in flight, the computing indicator lighting for a keyboard undo, a second
 * action-log row that must NOT appear. A retrying `toHaveClass` either misses a mark that lasted one
 * worker round trip or passes on a mark that came from something else. So {@link installBusyRecorder}
 * records every busy mark the page shows from the moment it is installed, the way `bootCaption.ts`
 * records the boot screen, and the assertions read a finished record.
 *
 * ### Where the words come from
 *
 * The action-log labels are `devtoolsCore.ts`'s own (`actionTypeLabel`), the results-column copy is
 * `RESULT_COPY`, the hub cards are `DATASET_ROUTES`, the header's hub link is `app-header/core.ts`'s,
 * and the origins are the registry's. All of those modules import nothing outside `examples-shared`,
 * so the e2e program stays as small as `./subtitles.ts` describes. The few names no shared module exports (the header's time-travel
 * buttons, the collapse toggle's two labels) are spelled once, below, in {@link SHARED_CONTROL_NAMES}.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page } from '@playwright/test';

import { appHubLabel, BRAND_NAV_LABEL } from '../../packages/examples-shared/src/app-header/core.js';
import { actionTypeLabel } from '../../packages/examples-shared/src/devtools/devtoolsCore.js';
import { DATASET_ROUTES } from '../../packages/examples-shared/src/landing/landingCards.js';
import { RESULT_COPY, RESULT_GRID_WINDOW, resultCapNotice, type ResultDataset, vertical, type VerticalId } from '../../packages/examples-shared/src/verticals/verticals.js';

/** The accessible names of the controls every app renders identically and no shared module exports. */
export const SHARED_CONTROL_NAMES = {
	/** The collapse toggle while the panel is shown. */
	collapseOpen: 'Hide filters',
	/** The collapse toggle while the panel is hidden. */
	collapseShut: 'Filters',
	/** The header button that opens the action log. */
	devtoolsShow: 'Show devtools',
	/** The header redo button. */
	redo: 'Redo (Cmd/Ctrl+Shift+Z)',
	/** The header undo button. */
	undo: 'Undo (Cmd/Ctrl+Z)',
} as const;

/** The action-log labels the parity cases read, from the log's own label table. */
export const ACTION_LOG_LABELS = {
	/** One rule added. */
	added: actionTypeLabel('RULE_ADDED'),
	/** Every rule, group and expression dropped at once. */
	cleared: actionTypeLabel('RULES_CLEARED'),
	/** One rule dropped. */
	removed: actionTypeLabel('RULE_REMOVED'),
} as const;

/** The mobile "Filters" toggle every app renders below the two-column breakpoint. */
export const FILTERS_TOGGLE = '.fe-books-app__filters-toggle';

/** The wrapper the toggle shows and hides with the `hidden` attribute; one per page. */
export const FILTER_COLLAPSE = '.fe-filter-collapse';

/** The results header's computing indicator, the same markup in every app. */
export const COMPUTING_INDICATOR = '.fe-computing-indicator';

/**
 * The filter panel's body in any dataset: `fe-filter-panel__body` for wine and real estate (and the
 * React books panel), `fe-books-panel__body` for the other five books panels.
 */
export const PANEL_BODY = '.fe-filter-panel__body, .fe-books-panel__body';

/**
 * A section of the filter panel, addressed by its exact heading.
 *
 * @remarks
 * Every panel in the six apps wraps a control in a `<section>` whose first child is an `<h3>`
 * heading, so the heading is the one handle all eighteen panels share. Matched exactly, so "Genre"
 * does not also find "Genre super-groups". Pass a pattern for a heading that carries a number
 * (`Varietal (612)`).
 *
 * @param page - The page under test.
 * @param heading - The heading text, or a pattern it must match.
 * @returns The one section under that heading.
 */
export function panelSection(page: Page, heading: RegExp | string): Locator {
	const pattern = typeof heading === 'string' ? new RegExp(`^${literalPattern(heading)}$`, 'u') : heading;

	return page.locator('.fe-filter-panel__scroller section').filter({ has: page.locator('h3', { hasText: pattern }) });
}

/**
 * A results-header pill, addressed by its label.
 *
 * @param page - The page under test.
 * @param label - The pill's label, e.g. `Description`.
 * @returns The pills carrying that label.
 */
export function pillByLabel(page: Page, label: string): Locator {
	return page
		.locator('.fe-filter-chip')
		.filter({ has: page.locator('.fe-filter-chip__label', { hasText: new RegExp(`^${literalPattern(label)}$`, 'u') }) });
}

/**
 * A string with every regular-expression metacharacter escaped, so it matches only itself.
 *
 * @param text - The literal text.
 * @returns The pattern source that matches exactly `text`.
 */
export function literalPattern(text: string): string {
	return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

/**
 * Open the action log from the header and return it.
 *
 * @remarks
 * Every app renders the log only once the header's devtools toggle is pressed (vanilla keeps it in the
 * tree, hidden), as a region named "Devtools action log". It lists every engine action since boot,
 * oldest first, so a case reads the rows it caused as the tail after a count taken before it acted.
 *
 * @param page - The page under test.
 * @returns The log's region.
 */
export async function openActionLog(page: Page): Promise<Locator> {
	await page.getByRole('button', { exact: true, name: SHARED_CONTROL_NAMES.devtoolsShow }).click();

	const log = page.getByRole('region', { exact: true, name: 'Devtools action log' });

	await expect(log).toBeVisible();

	return log;
}

/**
 * The action labels the log shows, oldest first.
 *
 * @param log - The region {@link openActionLog} returned.
 * @returns One label per row, e.g. `['addRule', 'clearRules']`.
 */
export async function actionLogLabels(log: Locator): Promise<string[]> {
	return (await log.locator('.fe-devtools-row__type').allTextContents()).map((text) => text.trim());
}

/** What {@link installBusyRecorder} saw since it was installed. */
export interface BusyRecord {
	/** The panel body carried `aria-busy="true"` at some point. */
	readonly hasBodyBeenAriaBusy: boolean;
	/** The panel body carried its `--busy` modifier at some point. */
	readonly hasBodyBeenBusyClass: boolean;
	/** The computing indicator carried `fe-computing-indicator--computing` at some point. */
	readonly hasIndicatorComputed: boolean;
}

/**
 * Record every busy mark the page shows from now on.
 *
 * @remarks
 * A `MutationObserver` with `attributeOldValue`, so a mark that was set and cleared inside one task —
 * a fast worker round trip — still shows up: the record that clears it carries the marked value as
 * its old value. Install it on an IDLE page; it samples once on install, so a mark already present
 * counts. Reinstalling replaces the previous record.
 *
 * @param page - The page under test, already booted.
 * @returns Nothing; resolves once the observer is attached.
 */
export async function installBusyRecorder(page: Page): Promise<void> {
	await page.evaluate((bodySelector) => {
		const record = { hasBodyBeenAriaBusy: false, hasBodyBeenBusyClass: false, hasIndicatorComputed: false };
		const scope = window as unknown as { __feBusyObserver?: MutationObserver; __feBusyRecord: typeof record };

		scope.__feBusyObserver?.disconnect();
		scope.__feBusyRecord = record;

		/** Fold one element's current or previous attribute value into the record. */
		const note = (element: Element, name: string, value: string | null): void => {
			const isBody = element.matches(bodySelector);

			if (isBody && name === 'aria-busy' && value === 'true') {
				record.hasBodyBeenAriaBusy = true;
			}
			if (isBody && name === 'class' && /__body--busy\b/u.test(value ?? '')) {
				record.hasBodyBeenBusyClass = true;
			}
			if (name === 'class' && element.matches('.fe-computing-indicator') && /fe-computing-indicator--computing\b/u.test(value ?? '')) {
				record.hasIndicatorComputed = true;
			}
		};

		/** Fold the page's current marks into the record. */
		const sample = (): void => {
			for (const element of document.querySelectorAll(`${bodySelector}, .fe-computing-indicator`)) {
				note(element, 'aria-busy', element.getAttribute('aria-busy'));
				note(element, 'class', element.getAttribute('class'));
			}
		};

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.target instanceof Element && mutation.attributeName !== null) {
					note(mutation.target, mutation.attributeName, mutation.oldValue);
				}
			}
			sample();
		});

		observer.observe(document.body, {
			attributeFilter: ['aria-busy', 'class'],
			attributeOldValue: true,
			childList: true,
			subtree: true,
		});
		scope.__feBusyObserver = observer;
		sample();
	}, PANEL_BODY);
}

/**
 * Read what {@link installBusyRecorder} collected.
 *
 * @param page - The page under test.
 * @returns The record; all `false` when nothing was marked busy.
 */
export async function readBusyRecord(page: Page): Promise<BusyRecord> {
	return page.evaluate(() => (window as unknown as { __feBusyRecord: BusyRecord }).__feBusyRecord);
}

/** One entry of a shareable config's `rules`, as the engine exports it. */
export interface SharedRuleEntry {
	/** The rule id. */
	readonly id: string;
	/** Present and `true` on an expression's inline rules. */
	readonly inline?: boolean;
	/** The serialized rule. */
	readonly rule: { readonly config?: Record<string, unknown>; readonly field?: string; readonly type: string };
}

/** A shareable config, as the engine exports it into `?f=`. */
export interface SharedConfig {
	/** The expression tree, while a smart filter drives the results. */
	readonly expression?: unknown;
	/** Every serialized rule. */
	readonly rules: readonly SharedRuleEntry[];
	/** The config format version. */
	readonly version: number;
}

/**
 * The tag the readable link format puts before its JSON.
 *
 * @remarks
 * Every app starts in the readable format (`human-readable` in `url-state-router`'s tagged serializer),
 * and a fresh browser context has no stored format choice, so the parity cases only ever read this
 * one. The tag is the serializer's; the engine package is not a root dependency, so it is spelled
 * here and {@link readSharedConfig} fails loudly on any other.
 */
const READABLE_LINK_TAG = 'h~';

/**
 * The config the page's `?f=` carries right now.
 *
 * @param page - The page under test.
 * @returns The decoded config, or `null` when the page carries no `?f=`.
 * @throws When the link is in a format other than the readable one.
 */
export function readSharedConfig(page: Page): SharedConfig | null {
	const raw = new URL(page.url()).searchParams.get('f');

	if (raw === null) {
		return null;
	}
	if (!raw.startsWith(READABLE_LINK_TAG)) {
		throw new Error(`?f= is not in the readable format: ${raw.slice(0, 12)}…`);
	}

	return JSON.parse(raw.slice(READABLE_LINK_TAG.length)) as SharedConfig;
}

/**
 * The rule ids the page's `?f=` carries right now; empty when there is no `?f=`.
 *
 * @param page - The page under test.
 * @returns The ids, in the link's order.
 */
export function sharedRuleIds(page: Page): string[] {
	return (readSharedConfig(page)?.rules ?? []).map((entry) => entry.id);
}

/**
 * A URL for the same page carrying `config` as its `?f=`, in the readable format.
 *
 * @param page - The page under test.
 * @param config - The config to carry.
 * @returns The absolute URL.
 */
export function urlWithSharedConfig(page: Page, config: SharedConfig): string {
	const url = new URL(page.url());

	url.searchParams.set('f', `${READABLE_LINK_TAG}${JSON.stringify(config)}`);

	return url.href;
}

/**
 * Assert the results column reads the dataset's shared copy: the count noun, the list's and the
 * scroller's accessible names, and no cap notice below the cap.
 *
 * @param page - The page under test, with its count settled.
 * @param dataset - Which dataset's copy to expect.
 * @param count - The settled result count.
 */
export async function expectResultsColumnCopy(page: Page, dataset: ResultDataset, count: number): Promise<void> {
	const copy = RESULT_COPY[dataset];
	// Formatted by the browser, as the app formats it, so the name does not depend on the test
	// runner's locale. The suffix is the shared label with its number taken off.
	const formatted = await page.evaluate((value) => value.toLocaleString(), count);
	const suffix = copy.listLabel(0).replace(/^0/u, '');

	await expect(page.locator('.fe-result-count__label')).toHaveText(copy.noun);
	await expect(page.getByRole('group', { exact: true, name: copy.scrollerLabel })).toBeVisible();
	await expect(page.getByRole('list', { exact: true, name: `${formatted}${suffix}` })).toBeVisible();
	// The grid starts at `RESULT_GRID_WINDOW.initial` cards, far below the cap, so no notice belongs.
	expect(RESULT_GRID_WINDOW.initial).toBeLessThan(RESULT_GRID_WINDOW.cap);
	await expect(page.getByText(resultCapNotice(0, 0).suffix)).toHaveCount(0);
}

/**
 * Assert the results column shows the dataset's shared empty state.
 *
 * @param page - The page under test, filtered to nothing.
 * @param dataset - Which dataset's copy to expect.
 */
export async function expectEmptyResults(page: Page, dataset: ResultDataset): Promise<void> {
	await expect(page.getByText(RESULT_COPY[dataset].emptyTitle, { exact: true })).toBeVisible();
	await expect(page.getByText(RESULT_COPY[dataset].emptyHint, { exact: true })).toBeVisible();
}

/**
 * Assert the mobile filter collapse: shut on arrival, shown and hidden by its toggle, and keeping a
 * control's local state while hidden.
 *
 * @remarks
 * The panel is hidden with the `hidden` attribute, never unmounted, in every app, so a half-typed
 * search must still be in its field after a close and a reopen. Call it on a freshly booted page on
 * the mobile project.
 *
 * @param page - The page under test.
 * @param field - A text field inside the panel.
 * @param text - What to type into it.
 */
export async function expectFilterCollapseKeepsState(page: Page, field: Locator, text: string): Promise<void> {
	const toggle = page.locator(FILTERS_TOGGLE);
	const region = page.locator(FILTER_COLLAPSE);

	await expect(toggle).toHaveText(SHARED_CONTROL_NAMES.collapseShut);
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(region).toHaveAttribute('hidden');
	await expect(field).toBeHidden();

	await toggle.click();
	await expect(toggle).toHaveText(SHARED_CONTROL_NAMES.collapseOpen);
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(region).not.toHaveAttribute('hidden');
	await field.fill(text);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(region).toHaveAttribute('hidden');

	await toggle.click();
	await expect(field).toHaveValue(text);
}

/**
 * An app's own landing-hub card for a dataset route.
 *
 * @remarks
 * The two React apps name their cards `Explore <label>`; the other four name them by the label alone.
 * Both read the label from the same catalog entry, so the route's `DATASET_ROUTES` label is the one
 * fact this needs.
 *
 * @param page - The page under test, on the hub.
 * @param id - The app.
 * @param href - The dataset route, e.g. `/books`.
 * @returns The card's link.
 */
export function hubCardLink(page: Page, id: VerticalId, href: string): Locator {
	const card = DATASET_ROUTES.find((entry) => entry.href === href);

	if (card === undefined) {
		throw new Error(`No landing card for ${href}`);
	}
	const name = vertical(id).framework.startsWith('React') ? `Explore ${card.label}` : card.label;

	return page.getByRole('main').getByRole('link', { exact: true, name });
}

/**
 * An absolute URL into one app.
 *
 * @param id - The app.
 * @param path - A root-relative path.
 * @returns The URL on that app's development origin.
 */
export function appUrl(id: VerticalId, path: string): string {
	return `${vertical(id).devOrigin}${path}`;
}

/**
 * The app's own hub link, inside the header brand on every viewport.
 *
 * @param page - The page under test.
 * @param id - The app.
 * @returns The link named `<App> dataset hub`.
 */
export function hubLink(page: Page, id: VerticalId): Locator {
	return page
		.getByRole('navigation', { exact: true, name: BRAND_NAV_LABEL })
		.getByRole('link', { exact: true, name: appHubLabel(id) });
}

/**
 * Leave a dataset route for the hub by the header link, and come back by the hub's card for it.
 *
 * @remarks
 * Both are in-app links in every app, so the route is torn down and built again inside one document —
 * the path a cached engine has to survive. Back would restore a history entry instead, which is a
 * different path and already covered by the URL round-trip cases.
 *
 * @param page - The page under test, on the dataset route.
 * @param id - The app.
 * @param href - The dataset route, e.g. `/books`.
 * @param waitForBoot - The route's own boot wait.
 */
export async function revisitThroughHub(page: Page, id: VerticalId, href: string, waitForBoot: (page: Page) => Promise<void>): Promise<void> {
	await hubLink(page, id).click();
	await page.waitForURL(appUrl(id, '/'));
	await hubCardLink(page, id, href).click();
	await page.waitForURL((url) => url.pathname === href);
	await waitForBoot(page);
}

/** The busy marks a keyboard undo and the Undo button each left behind. */
export interface UndoBusyMarks {
	/** What the Undo button marked. */
	readonly button: BusyRecord;
	/** What `ControlOrMeta+Z` marked. */
	readonly keyboard: BusyRecord;
}

/**
 * Undo one filter by the keyboard and once by the header button, recording the busy marks of each.
 *
 * @remarks
 * Call it with exactly one filter applied (one pill) and focus outside a text field, on the control
 * just clicked. The keyboard undo is a real `ControlOrMeta+Z` press (Meta on macOS, Control
 * elsewhere), which every app's shortcut accepts. Between the two, the header's Redo button puts the
 * filter back. The caller compares the two records: a shortcut that writes to the engine without the
 * busy mark the button sets leaves the indicator dark while the engine works.
 *
 * @param page - The page under test.
 * @param settle - The vertical's settle wait, for any count.
 * @returns The two records.
 */
export async function undoByKeyboardAndButton(page: Page, settle: (page: Page) => Promise<unknown>): Promise<UndoBusyMarks> {
	const pills = page.locator('.fe-filter-chip');

	await expect(pills).toHaveCount(1);
	await settle(page);
	await installBusyRecorder(page);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(pills).toHaveCount(0);
	await settle(page);

	const keyboard = await readBusyRecord(page);

	await page.getByRole('button', { exact: true, name: SHARED_CONTROL_NAMES.redo }).click();
	await expect(pills).toHaveCount(1);
	await settle(page);
	await installBusyRecorder(page);
	await page.getByRole('button', { exact: true, name: SHARED_CONTROL_NAMES.undo }).click();
	await expect(pills).toHaveCount(0);
	await settle(page);

	return { button: await readBusyRecord(page), keyboard };
}

/**
 * The action-log rows one step adds.
 *
 * @param log - The region {@link openActionLog} returned.
 * @param act - The step; resolve it only once the engine has settled.
 * @returns The labels of the rows that step added, oldest first.
 */
export async function actionLogRowsAddedBy(log: Locator, act: () => Promise<void>): Promise<string[]> {
	const before = (await actionLogLabels(log)).length;

	await act();

	return (await actionLogLabels(log)).slice(before);
}
