/**
 * `/books-raw` — the identical books demo driven by `@filter-enginez/core` ALONE (the COARSE surface).
 *
 * @remarks
 * The control case for `booksPage.ts`. This route imports **no reactive-surface package at all** — no
 * `reactive-signals`, no adapter, nothing between the DOM and the engine. It builds the engine with
 * `buildBooksEngine` (a bare `FilterEngine`) and drives the UI from the engine's own coarse
 * `subscribe()`.
 *
 * The trade-off, made visible:
 *
 *   - A bare `ChangeEvent` says *that* something changed, not *what*. So `repaint()` re-reads the
 *     count, the results, and the rule map, and calls every updater — even when a single chip toggle
 *     only moved the count. Correct, simple, and does strictly more work than it needs to.
 *   - `subscribe()` here does NOT fire on attach (unlike a signal's), so the initial paint is an
 *     explicit `repaint()` call. That asymmetry is easy to forget and a classic source of
 *     "why is my UI blank until I click something" bugs.
 *
 * Everything else — the view, the panel, the controls, the write path — is byte-identical to `/books`.
 * That is the point: the engine is genuinely framework-agnostic AND reactive-surface-optional; the
 * adapter buys you update granularity and immediate-fire subscriptions, not capability.
 *
 * @packageDocumentation
 */

import { initializeBitmapAcceleration, type RuleId } from '@filter-enginez/core';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import { safeApplyBundleFromCore } from '@filter-enginez/examples-shared/books-domain';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { books as defaultBooks } from '@filter-enginez/mock-data/books';

import type { RouteTeardown } from '../router.js';

import { createBooksView } from '../books/view.js';
import { createDevtoolsSurface, type DevtoolsCursor } from '../controls/devtools.js';
import { el } from '../dom.js';
import { createCompareLinkButton, createCopyLinkButton, createUrlFormatToggle } from '../url/urlControls.js';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';

/**
 * Build a bare engine and render the books demo off one coarse subscription.
 *
 * @param container - The route container.
 * @returns A teardown dropping the subscription.
 */
export async function renderBooksRawPage(container: HTMLElement): Promise<RouteTeardown> {
	container.append(bootingNotice());

	// Same acceleration the shared boot installs, so the two routes are a fair comparison.
	await initializeBitmapAcceleration();

	const core = buildBooksEngine(defaultBooks);

	container.replaceChildren();

	// Hydrate any shared `?f` link before wiring the write-back. Note the URL layer is byte-identical
	// to the signals route's — it only ever needed the bare engine.
	const urlConfig = readConfigFromUrl();

	if (urlConfig !== null) {
		try {
			core.loadConfig(urlConfig);
		} catch {
			// Malformed / incompatible URL state — boot with the neutral corpus instead.
		}
	}

	const formatToggle = createUrlFormatToggle();
	const copyLink = createCopyLinkButton();
	const compareLink = createCompareLinkButton('books');
	// The devtools surface is built BEFORE the view, because its header controls and its panel are
	// both things the view composes. `devtools` is a public core API but is not on the narrowed
	// `FilterEngine` surface this route is typed against, hence the structural cast.
	const devtools = createDevtoolsSurface({
		devtools: (core as unknown as { devtools: DevtoolsCursor }).devtools,
	});
	const view = createBooksView(core, {
		footnote: 'filter-enginez · books demo · vanilla + bare core (coarse subscribe, no adapter)',
		headerControls: [...devtools.headerControls, formatToggle.element, copyLink.element, compareLink.element],
		resultsInsetElement: devtools.panelElement,
		subtitle: verticalSubtitle('Books', 'vanilla', 'bare-core'),
	});

	container.append(view.element);

	const stopUrlSync = startEngineUrlSync({ core });
	const total = core.getSourceData().length;

	/**
	 * Re-read EVERYTHING and repaint EVERYTHING.
	 *
	 * The coarse event carries no field information, so there is nothing smarter to do here without
	 * hand-rolling the change-tracking a reactive surface would give you.
	 */
	/**
	 * The rule that most recently changed, for the phosphor "just changed" pill.
	 *
	 * Without a reactive surface nothing tracks this, so we scrape it off each `ChangeEvent` (only some
	 * variants carry a `ruleId`) and hold it by hand — the signals route reads `engine.lastChangeRuleId`
	 * instead, because the adapter already did this bookkeeping.
	 */
	let recentRuleId: RuleId | null = null;

	function repaint(): void {
		view.setCount(core.getResultCount(), total);
		view.setResults(core.getResults());
		view.setRules(core.getRules(), safeApplyBundleFromCore(core, view.query), recentRuleId);
		devtools.update();
	}

	// `core.subscribe` does NOT fire on attach, so paint the initial state explicitly.
	repaint();

	const unsubscribe = core.subscribe((event) => {
		recentRuleId = 'ruleId' in event ? event.ruleId : null;
		repaint();
	});

	return () => {
		unsubscribe();
		stopUrlSync();
		devtools.dispose();
		formatToggle.dispose();
		copyLink.dispose();
		compareLink.dispose();
		view.dispose();
	};
}

/**
 * The pre-boot placeholder.
 *
 * @internal
 */
function bootingNotice(): HTMLElement {
	// The shared boot caption, not `.fe-books-section-label` — a panel SECTION HEADING would read as
	// a heading rather than as body copy on a boot screen.
	return el('p', {
		className: 'fe-boot-caption fe-boot-caption--inline',
		text: 'Building the bare engine…',
	});
}
