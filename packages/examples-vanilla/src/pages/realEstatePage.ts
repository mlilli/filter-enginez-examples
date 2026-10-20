/**
 * `/real-estate` — the framework-less real-estate route: the widest filter panel in the repo, driven
 * through `@filter-enginez/reactive-signals`.
 *
 * @remarks
 * The read wiring is `booksPage.ts`'s — one subscription per engine field, so a change repaints
 * exactly the region that read the field that changed — with one addition real estate needs and books
 * does not: the predictive-disable bundle is fetched through the shared `createBundleFetcher` loop
 * rather than computed inline.
 *
 * ### Why a fetcher and not `safeApplyBundleFromCore`
 *
 * Books computes its bundle synchronously inside the `activeRules` subscription, which is correct for
 * a main-thread engine and only for a main-thread engine. Real estate's panel asks a much larger
 * question — five chip groups, one of them a ~700-node hierarchy, plus six slider fields — and the
 * shared loop is what already answers the three things that come with it: the sync/async transport
 * split, the stale guard for overlapping fetches, and settling on EVERY outcome so nothing strands.
 * Using it here also means this route is one line from a worker or server tier rather than a rewrite.
 *
 * ### The progress readout is subscribed BEFORE the boot call
 *
 * `bootRealEstateCore` starts streaming the corpus the moment it is called and publishes progress from
 * inside that stream. Subscribing afterwards misses every event on a fast connection and shows a
 * counter that never moves, which reads worse than no counter at all. The snapshot getter seeds the
 * initial value for the case where a previous route already warmed the cached boot.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterRule, RuleId } from '@filter-enginez/core';

import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import { el } from '@filter-enginez/examples-shared/dom';
import {
	bootRealEstateEngine,
	getRealEstateBootProgressSnapshot,
	type RealEstateBootProgress,
	subscribeRealEstateBootProgress,
} from '@filter-enginez/examples-shared/real-estate-core';
import {
	createBundleFetcher,
	REAL_ESTATE_BOOT_IDLE_CAPTION,
	REAL_ESTATE_RECORD_NOUN,
} from '@filter-enginez/examples-shared/real-estate-domain';

import type { RouteTeardown } from '../router.js';

import { bootCaptionValue } from '../brand/indicators.js';
import { createDevtoolsSurface, type DevtoolsCursor } from '../controls/devtools.js';
import { createRealEstateView } from '../real-estate/view.js';
import { createCompareLinkButton, createCopyLinkButton, createUrlFormatToggle } from '../url/urlControls.js';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';

/**
 * Boot the real-estate engine and render the demo with per-field subscriptions.
 *
 * @param container - The route container.
 * @returns A teardown dropping every subscription, the map, and the engine.
 */
export async function renderRealEstatePage(container: HTMLElement): Promise<RouteTeardown> {
	const notice = bootingNotice();

	container.append(notice.element);

	// Subscribe FIRST — see the module docblock.
	const stopProgress = subscribeRealEstateBootProgress(notice.setProgress);

	notice.setProgress(getRealEstateBootProgressSnapshot());

	// `.finally` rather than a plain line after the await: a failed boot rejects out of this function,
	// and the listener would otherwise stay in a module-level set for the life of the page.
	const { engine } = await bootRealEstateEngine().finally(stopProgress);

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
	const compareLink = createCompareLinkButton('real-estate');
	// The devtools surface is built BEFORE the view, because its header controls and its panel are
	// both things the view composes. `devtools` is a public core API but is not on the narrowed
	// `FilterEngine` surface this route is typed against, hence the structural cast.
	const devtools = createDevtoolsSurface({
		devtools: (engine.core as unknown as { devtools: DevtoolsCursor }).devtools,
	});
	const view = createRealEstateView(engine.core, {
		footnote: 'filter-enginez · real estate demo · vanilla + reactive-signals (main thread)',
		headerControls: [...devtools.headerControls, formatToggle.element, copyLink.element, compareLink.element],
		resultsInsetElement: devtools.panelElement,
		subtitle: appHeaderSubtitle('Real estate', 'vanilla'),
	});

	container.append(view.element);

	const total = engine.core.getSourceData().length;
	/** The rules the next repaint should render — captured on change, read when the bundle settles. */
	let latestRules: ReadonlyMap<RuleId, FilterRule> = engine.core.getRules();
	/** The last bundle that arrived. Kept across a failure — predictive disable is an ENHANCEMENT. */
	let bundle: FilterBundle | null = null;

	const fetcher = createBundleFetcher(engine, {
		onBundle: (next) => {
			bundle = next;
		},
		onError: (error) => {
			console.error('[real-estate] bundle fetch failed:', error);
		},
		// ONE repaint per change, and it happens on the terminal outcome rather than on the bundle, so a
		// failed round trip still repaints the panel from the new rules with the previous hints. Painting
		// on `onBundle` alone would leave the controls frozen on the old state after a failure.
		onSettled: () => {
			view.setRules(latestRules, bundle, engine.lastChangeRuleId.value);
		},
	});

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
			latestRules = rules;
			fetcher.request(view.query);
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
		fetcher.dispose();
		devtools.dispose();
		formatToggle.dispose();
		copyLink.dispose();
		compareLink.dispose();
		view.dispose();
		engine.dispose();
	};
}

/** The pre-boot placeholder plus its live loaded/total readout. */
interface BootingNotice {
	/** The placeholder element. */
	readonly element: HTMLElement;
	/** Render a progress snapshot, or the idle caption when `null`. */
	readonly setProgress: (progress: RealEstateBootProgress | null) => void;
}

/**
 * The pre-boot placeholder.
 *
 * @remarks
 * Books' pages show a static line, because they do not subscribe to the books boot's progress. Real
 * estate streams ~10k listings over `/api/real-estate`, so this one narrates the stream — in the
 * framework-less idiom of a closure over one node.
 *
 * The wording comes from `examples-shared/boot-caption`, which every vertical renders, so the pause
 * between the last row and a usable index is narrated here exactly as it is on `/wine`.
 *
 * `idleCaption` is overridden because this route has no worker — the default "Spinning up worker
 * thread" would describe something that is not happening.
 *
 * @internal
 */
function bootingNotice(): BootingNotice {
	// `.fe-boot-caption--inline` is the class for what this element actually is, padding included —
	// not `.fe-filter-section-label`, a panel SECTION HEADING that is 14px and semibold and would read
	// as a heading rather than as body copy on a boot screen.
	const caption = el('p', { className: 'fe-boot-caption fe-boot-caption--inline' });
	const notice: BootingNotice = {
		// Inside a `<main>`: until the engine boots, the caption is the page's main content.
		element: el('main', { children: [caption]}),
		setProgress: (progress) => {
			caption.replaceChildren(
				...bootCaptionParts(progress, {
					idleCaption: REAL_ESTATE_BOOT_IDLE_CAPTION,
					recordNoun: REAL_ESTATE_RECORD_NOUN,
				}).map((part) => (part.kind === 'value' ? bootCaptionValue(part.text) : part.text)),
			);
		},
	};

	// Render the idle caption at construction rather than leaving the element empty until the caller's
	// first snapshot read. The two happen in the same tick, so nothing is visible — but an empty
	// `<p>` is a worse default than the right words, and it costs one call to not depend on that.
	notice.setProgress(null);

	return notice;
}
