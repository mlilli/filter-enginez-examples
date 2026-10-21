/**
 * `test-support/winePanelHarness` — the one wine-panel mount this package's panel suites share.
 *
 * @remarks
 * ### Why this exists
 *
 * `wine/choiceSections.test.ts` and `wine/sliderSections.test.ts` both need to reach controls
 * `wine/view.test.ts` does not click, and the wine panel is the only place its facets are
 * constructed — so both mount it through this one seam rather than through two copies of it.
 *
 * ### What is shared is the FACTORY, not the corpus
 *
 * The precedent is {@link createWineMaker} next door, and the reasoning transfers exactly. The
 * duplicated LOGIC is "build an engine over this corpus, seed it, construct the panel, repaint once,
 * attach it to the document" — and it has one home here. The DATA stays with whoever asserts on it:
 * {@link createWinePanelMounter} takes a suite's own corpus and layers nothing beneath it, so no
 * suite's result counts move because another suite tuned a price.
 *
 * ### Three properties of this seam that every caller depends on
 *
 * **The repaint is driven by hand, never subscribed.** The `/wine` route repaints on the bundle
 * fetch's terminal outcome rather than on every engine change, and driving it by hand is what lets a
 * case repaint with a STALE rule map — the worker-lag shape the whole panel holds local state for.
 *
 * **`seed` runs BEFORE the panel is built.** That is the shared-link shape: the route calls
 * `core.loadConfig(urlConfig)` and only then constructs the panel, so every facet's initial value
 * comes from its constructor read rather than from an adopt. A seed applied after construction would
 * exercise a path the app never takes.
 *
 * **One repaint happens at mount**, because the controls render their contents from `update` — a
 * select with no options and a tree with no rows cannot be clicked.
 *
 * ### Coverage note
 *
 * Everything under `test-support/` is a whole-file coverage exclusion (`vitest.coverage.config.ts`).
 *
 * (Written without the leading glob on purpose — a doc comment containing that pattern ends at its
 * own `*` + `/`, and the remainder parses as code. It reports as `ReferenceError: test is not
 * defined` in three unrelated suites.)
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, type FilterRule, type RuleId } from '@filter-enginez/core';

import { createWinePanel } from '../wine/panel.js';

/** A mounted wine panel: the engine beneath it, a hand-driven repaint, and its attached root. */
export interface MountedWinePanel {
	/** The engine every control writes through, and the one assertions read back from. */
	readonly core: FilterEngine<Wine>;
	/**
	 * Re-apply engine state to every section.
	 *
	 * @remarks
	 * The rule map is a parameter rather than always `core.getRules()` so a case can push the STALE
	 * map a settle in flight would carry. The bundle is always `null`: predictive disable is an
	 * ENHANCEMENT, and every control must render usably without one.
	 */
	readonly repaint: (rules?: ReadonlyMap<RuleId, FilterRule>) => void;
	/** The panel's container, already attached to `document.body`. */
	readonly root: HTMLElement;
}

/** Mounts one wine panel, optionally seeding the engine before the panel is constructed. */
export type WinePanelMounter = (seed?: (core: FilterEngine<Wine>) => void) => MountedWinePanel;

/**
 * Build a panel mounter over one suite's own corpus.
 *
 * @remarks
 * Nothing is layered beneath `data` — what a suite passes is the whole corpus the engine filters.
 * That is the property that keeps two suites' result counts independent of each other.
 *
 * @param data - The corpus this suite's engine boots over.
 * @returns A mounter that builds a fresh engine + panel per call.
 */
export function createWinePanelMounter(data: readonly Wine[]): WinePanelMounter {
	return (seed) => {
		const core = createFilterEngine<Wine>({ sourceData: data });

		seed?.(core);

		const panel = createWinePanel(core);
		const root = document.createElement('div');
		const repaint = (rules: ReadonlyMap<RuleId, FilterRule> = core.getRules()): void => {
			panel.update({ bundle: null, expression: null, rules });
		};

		root.append(panel.element);
		document.body.append(root);
		repaint();

		return { core, repaint, root };
	};
}
