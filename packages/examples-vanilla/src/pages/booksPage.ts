/**
 * `/books` — the books demo driven through `@filter-enginez/reactive-signals` (the FINE-GRAINED
 * surface).
 *
 * @remarks
 * Compare this file with `booksRawPage.ts`. Both render the identical `createBooksView` DOM and write
 * through the identical `FilterEngine`; the only difference is how reads arrive — and that difference
 * is the entire argument for a reactive surface:
 *
 *   - **Here:** one subscription per engine field. `engine.resultCount` drives only the count node;
 *     `engine.results` drives only the grid; `engine.activeRules` drives only the panel + pills. A
 *     change repaints exactly the region that read the field that changed, and the engine tells us
 *     *which* field that was.
 *   - **There:** one coarse `core.subscribe()`, then re-read everything and repaint everything,
 *     because a bare `ChangeEvent` doesn't say what to invalidate.
 *
 * Note `.subscribe` fires immediately with the current value, so the first paint is free — no separate
 * "initial render" pass.
 *
 * A boot that rejects (the corpus fetch failing, say) replaces the boot caption with the shared
 * boot-failure screen over `BOOT_FAILURE_COPY.books`, as every app's books page does, and the route
 * still returns a teardown, which the router calls on navigation however the render ended.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { bootBooksEngine } from '@filter-enginez/examples-shared/books-core';
import {
	BOOKS_BOOT_IDLE_CAPTION,
	BOOKS_RECORD_NOUN,
	safeApplyBundle,
} from '@filter-enginez/examples-shared/books-domain';
import { bootCaptionParts, bootCaptionText } from '@filter-enginez/examples-shared/boot-caption';
import { el } from '@filter-enginez/examples-shared/dom';

import type { RouteTeardown } from '../router.js';

import { createBooksView } from '../books/view.js';
import { booksBusyCore } from '../busy/engineBusy.js';
import { createDevtoolsSurface, type DevtoolsCursor } from '../controls/devtools.js';
import { bootFailureMessage, createBootFailure } from '../shell/bootFailure.js';
import { createCompareLinkButton, createCopyLinkButton, createUrlFormatToggle } from '../url/urlControls.js';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';

/**
 * Boot the signals-backed engine and render the books demo with per-field subscriptions.
 *
 * @param container - The route container.
 * @returns A teardown dropping every subscription and disposing the engine.
 */
export async function renderBooksPage(container: HTMLElement): Promise<RouteTeardown> {
	container.append(bootingNotice());

	let booted;

	try {
		booted = await bootBooksEngine();
	} catch (error) {
		console.error('[books] boot failed:', error);
		container.replaceChildren(createBootFailure('books', bootFailureMessage(error)));

		return () => {
			container.replaceChildren();
		};
	}

	const { engine } = booted;

	container.replaceChildren();

	// Hydrate any shared `?f` link BEFORE wiring the write-back, so loading a link doesn't immediately
	// re-serialize the state it just restored.
	const urlConfig = readConfigFromUrl();

	if (urlConfig !== null) {
		try {
			engine.core.loadConfig(urlConfig);
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
		devtools: (engine.core as unknown as { devtools: DevtoolsCursor }).devtools,
		// Undo, redo and every timeline jump are engine writes like any other: the books busy tracker
		// is marked first, and the view resolves it on the change they cause.
		markBusy: booksBusyCore.markUserAction,
	});
	const view = createBooksView(engine.core, {
		footnote: 'filter-enginez · books demo · vanilla + reactive-signals (fine-grained)',
		headerControls: [...devtools.headerControls, formatToggle.element, copyLink.element, compareLink.element],
		resultsInsetElement: devtools.panelElement,
		subtitle: appHeaderSubtitle('Books', 'vanilla', 'signals'),
	});

	container.append(view.element);

	const total = engine.core.getSourceData().length;
	const unsubscribes: (() => void)[] = [startEngineUrlSync(engine)];

	// ── One subscription per field: each updater fires only when ITS field changes ──
	unsubscribes.push(
		engine.resultCount.subscribe((count) => {
			view.setCount(count, total);
		}),
	);
	unsubscribes.push(
		engine.results.subscribe((results) => {
			view.setResults(results);
		}),
	);
	unsubscribes.push(
		engine.activeRules.subscribe((rules) => {
			// The predictive-disable bundle is a function of the committed rules, so it recomputes here
			// (and only here) rather than on every engine event. `lastChangeRuleId` is its own signal —
			// the adapter already tracked which rule moved, so the phosphor "just changed" pill is free.
			view.setRules(rules, safeApplyBundle(engine, view.query), engine.lastChangeRuleId.value);
		}),
	);

	// The devtools surface is the one reader here that is NOT a function of a single field: it reflects
	// the action LOG and the cursor, which move on time travel as well as on a rule change. So it gets
	// a coarse `core.subscribe` rather than riding one of the fine-grained signals above — the same
	// subscription shape `/books-raw` uses for everything, kept to one consumer.
	unsubscribes.push(
		engine.core.subscribe(() => {
			devtools.update();
		}),
	);

	return () => {
		for (const unsubscribe of unsubscribes) {
			unsubscribe();
		}
		devtools.dispose();
		formatToggle.dispose();
		copyLink.dispose();
		compareLink.dispose();
		view.dispose();
		engine.dispose();
	};
}

/**
 * The pre-boot placeholder.
 *
 * @internal
 */
function bootingNotice(): HTMLElement {
	// This route awaits the books engine without subscribing to its boot progress, so it only renders the
	// caption's idle state — but it renders it through the same module the streaming routes use rather
	// than as a literal, so a fourth state or an ARIA affordance added there reaches here too. The
	// sentence comes from `books-domain`, shared with every app's books page.
	// `bootCaptionText` because there is no live number to highlight.
	//
	// The class is the shared boot caption, not a panel SECTION HEADING — `.fe-books-section-label`
	// is 14px and semibold, which reads as a heading rather than as body copy on a boot screen.
	//
	// Inside a `<main>`: until the engine boots, the caption is the page's main content.
	const caption = el('p', {
		className: 'fe-boot-caption fe-boot-caption--inline',
		text: bootCaptionText(
			bootCaptionParts(null, {
				idleCaption: BOOKS_BOOT_IDLE_CAPTION,
				recordNoun: BOOKS_RECORD_NOUN,
			}),
		),
	});

	return el('main', { children: [caption]});
}
