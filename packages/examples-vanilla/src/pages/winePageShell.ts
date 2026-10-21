/**
 * Everything a wine route does once its engine exists — shared by `/wine` and `/wine-server`.
 *
 * @remarks
 * Only a handful of a wine route's lines are about its transport; the rest — URL hydration, the `?f`
 * sync, the header controls, the devtools surface, the six subscriptions and the teardown — is
 * transport-agnostic, and a copy per tier would be two copies free to disagree.
 *
 * **The seam is the ENGINE, not the transport.** `SignalsEngine<Wine>` is what
 * `createSignalsEngineFromAsync` returns over a Comlink worker and what `bootWineServerEngine`
 * returns over `fetch`, so this module never learns which it has — which is the same claim the
 * React apps make when `/books-server` renders the exact same `<BooksApp>`.
 *
 * ## What stays with the CALLER, and why the split falls here
 *
 * The boot itself and the boot screen's words. A worker streams a corpus and publishes progress
 * events; an HTTP tier makes one request. Those produce genuinely different captions, and a shell
 * that tried to own both would need a progress abstraction neither tier wants. The caller boots,
 * narrates, and hands over a live engine.
 *
 * ## The read wiring is `/books`', unchanged
 *
 * One subscription per engine field. That is the whole point of the comparison this app exists to
 * make, and it survives the transport changing underneath.
 *
 * **What DOES differ from the main-thread routes is that reads lag a round trip.** Engine state
 * arrives after the far side confirms, so a control that derived its painted state from
 * `engine.core` synchronously would snap backwards. That is why this is the one panel in the app
 * holding local state — see `../wine/facetState.ts`, and `../real-estate/panel.ts` for the
 * main-thread contrast. It is true of BOTH tiers, which is part of why they share this file.
 *
 * ## Busy is marked by every write and resolved on the bundle's settle
 *
 * The shared wine commit helpers, the pills, the presets and the devtools controls all mark
 * `wineBusyCore` before they write, so the header's computing indicator and the panel body's
 * `--busy` light in the click's own frame. The bundle fetcher captures the tracker's version when a
 * fetch STARTS and resolves to it when that fetch settles (after one painted frame — see
 * `../busy/engineBusy.ts`), so on the 150k worker tier the state holds for the whole round trip, and
 * a click landing mid-trip keeps it lit until its own fetch lands.
 *
 * ## The panel repaints on the BUNDLE's settle, not on `activeRules`
 *
 * Same shape as `/real-estate`: the rule change requests a bundle, and the repaint happens once, on
 * the fetch's terminal outcome. Repainting on `activeRules` as well would paint the thirteen
 * sections twice per change — once without predictive-disable hints and once with — which reads as a
 * flicker on every click.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterRule, RuleId } from '@filter-enginez/core';
import type { AppHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import type { CompareDataset } from '@filter-enginez/examples-shared/compare-core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { createBundleFetcher, wineBusyCore } from '@filter-enginez/examples-shared/wine-domain';

import type { RouteTeardown } from '../router.js';

import { resolveAfterPaint } from '../busy/engineBusy.js';
import { createDevtoolsSurface, type DevtoolsCursor } from '../controls/devtools.js';
import { createCompareLinkButton, createCopyLinkButton, createUrlFormatToggle } from '../url/urlControls.js';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';
import { createWineView } from '../wine/view.js';

/** What a wine route tells the shell about itself. Deliberately small — that is the point. */
export interface WineRouteChrome {
	/**
	 * Which comparison the header's Compare button offers.
	 *
	 * @remarks
	 * Per-tier rather than hardcoded, because the two tiers compare against different sets: `/wine`
	 * against the five other browser-tier wine routes, `/wine-server` against SvelteKit's in-process
	 * server tier — the only other vertical serving that route.
	 *
	 * It rides here with `footnote` and `subtitle` for a reason worth stating: all three are the
	 * places this shell's ONE body of behavior has to describe itself differently per tier, and a
	 * fourth will belong here too. Reaching for the route path instead would make the shell learn
	 * which transport it has, which is precisely what the extraction was for.
	 */
	readonly compareDataset: CompareDataset;
	/** The booted engine. Identical surface whether it came from a worker or from `fetch`. */
	readonly engine: SignalsEngine<Wine>;
	/** Footer caption — spells out the wiring, so the two tiers are distinguishable at a glance. */
	readonly footnote: string;
	/** Subtitle under the wordmark — names the dataset and the tier driving this route. */
	readonly subtitle: AppHeaderSubtitle;
}

/**
 * Mount a wine route over an already-booted engine.
 *
 * @remarks
 * Synchronous: the awaiting happened in the caller's boot, and pretending otherwise would put a
 * `Promise` in the signature that never has anything to wait for.
 *
 * Clears the container first, which is what removes the caller's boot screen.
 *
 * @param container - The route container, still holding the boot screen.
 * @param chrome - The engine and this tier's labels.
 * @returns A teardown dropping every subscription and disposing the engine.
 */
export function mountWineRoute(container: HTMLElement, chrome: WineRouteChrome): RouteTeardown {
	const { compareDataset, engine, footnote, subtitle } = chrome;

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
	const compareLink = createCompareLinkButton(compareDataset);
	const devtools = createDevtoolsSurface({
		devtools: (engine.core as unknown as { devtools: DevtoolsCursor }).devtools,
		// Undo, redo and every timeline jump are engine writes like any other.
		markBusy: wineBusyCore.markUserAction,
	});
	const view = createWineView(engine.core, {
		busy: wineBusyCore,
		footnote,
		headerControls: [...devtools.headerControls, formatToggle.element, copyLink.element, compareLink.element],
		resultsInsetElement: devtools.panelElement,
		subtitle,
	});

	container.append(view.element);

	const total = engine.core.getSourceData().length;
	/** The rules the next repaint should render — captured on change, read when the bundle settles. */
	let latestRules: ReadonlyMap<RuleId, FilterRule> = engine.core.getRules();
	/** The last bundle that arrived. Kept across a failure — predictive disable is an ENHANCEMENT. */
	let bundle: FilterBundle | null = null;

	const fetcher = createBundleFetcher(engine, {
		captureVersion: wineBusyCore.captureCurrentVersion,
		onBundle: (next) => {
			bundle = next;
		},
		onError: (error) => {
			console.error('[wine] bundle fetch failed:', error);
		},
		// ONE repaint per change, on the terminal outcome rather than on the bundle, so a failed round
		// trip still repaints the panel from the new rules with the previous hints. Painting on
		// `onBundle` alone would leave the controls frozen on the old state after a failure.
		onSettled: (version) => {
			const expression = engine.core.getExpression();

			view.setRules(latestRules, engine.lastChangeRuleId.value, expression !== null);
			view.setPanelState({ bundle, expression, rules: latestRules });
			resolveAfterPaint(wineBusyCore, version);
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

	// ── The expression is a SECOND repaint trigger, and it is not optional ──
	//
	// `createSignalsEngineFromAsync` routes an `expression` ChangeEvent to `refreshExpressionAndResults`,
	// which updates the expression, mode, results and result-count mirrors — and deliberately NOT the
	// active-rules mirror, because the rule map genuinely did not change. So applying a smart-filter
	// preset from a clean panel would move the count and nothing else: the results header would still
	// read "No filters active" over a visibly narrowed corpus, because the summaries are repainted only
	// from `onSettled`, and without this subscription only a rule change reaches `onSettled`.
	//
	// **The other five verticals cannot have this problem.** Each of them DERIVES its summaries over
	// both inputs at once — Vue's
	// `computed(() => buildWineRuleSummaries(activeRules.value, mode.value === 'expression'))`, Svelte's
	// `$derived`, Angular's `computed` — so a mode change with an unchanged rule map recomputes for
	// free. With no framework, the second dependency has to be subscribed by hand.
	//
	// It would only show from a CLEAN panel: with any facet rule active, `clearAllFacetRules` emits
	// `rule:removed` and the subscription above repaints as a side effect — so a manual pass that tries
	// a filter before a preset never sees it.
	//
	// **The first emission is SKIPPED, and that is not a micro-optimization.** `@preact/signals-core`
	// invokes a subscriber immediately with the current value, so without this guard boot issues a
	// SECOND bundle fetch for a state the `activeRules` subscription above has already requested —
	// a redundant round trip against 150k records, whose settle then repaints every section a few
	// hundred milliseconds after the page looks ready. In `tests/e2e` that shows as a chip detaching
	// from the DOM mid-click, because the repaint lands between locating it and clicking. The
	// user-visible version is a panel that flickers once, shortly after it appears interactive.
	//
	// It matters at least as much on the SERVER tier, where the redundant fetch is an HTTP round trip
	// rather than a `postMessage`.
	let hasSeenInitialExpression = false;

	unsubscribes.push(
		engine.expression.subscribe(() => {
			if (!hasSeenInitialExpression) {
				hasSeenInitialExpression = true;

				return;
			}
			fetcher.request(view.query);
		}),
	);

	// The devtools surface reflects the action LOG and the cursor, which move on time travel as well
	// as on a rule change — so it gets a coarse `core.subscribe` rather than riding a fine-grained
	// signal. On these tiers it also proves the shared async devtools shim end to end.
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
