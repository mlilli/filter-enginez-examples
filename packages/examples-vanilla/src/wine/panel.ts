/**
 * `wine/panel` — the framework-less wine filter panel: thirteen sections plus the preset strip.
 *
 * @remarks
 * ## This panel holds local state, and the other two deliberately do not
 *
 * `books/panel.ts` and `real-estate/panel.ts` repaint every control straight from the engine's
 * committed rule map — no local state at all, which is what makes "clear all", removing a pill and
 * hydrating a shared link the same code path as a click. That is the framework-less dividend, and it
 * is available only because those routes filter on the MAIN THREAD, where a write settles in the
 * same frame.
 *
 * Wine is worker-backed. The rule map lags a full round trip against 130k records, so a control
 * repainted from it would flicker off and snap backwards on every interaction. Each section
 * therefore paints locally and ADOPTS the engine's value when it genuinely changes — see
 * `facetState.ts`, which is where that pattern and its one subtlety live.
 *
 * ## The scroller and the body are TWO elements, and only wine splits them
 *
 * Every other panel in this app composes `.fe-filter-panel__scroller` and `.fe-filter-panel__body`
 * onto one element — `real-estate/panel.ts` says so in its own assembly comment, naming wine as the
 * exception. Wine cannot: the smart-filter preset block has to scroll WITH the panel while staying
 * interactive as everything below it dims and locks. A preset that greyed out its own clear button
 * would be a trap, since the presets are the only way back out of expression mode.
 *
 * The split is therefore structural rather than cosmetic.
 *
 * **Omitting the scroller class does not look broken.** The panel silently stops scrolling and the
 * page scrolls instead, which is easy to miss in review. `fe-filter-panel__scroller` carries the
 * overflow AND the panel's padding.
 *
 * ## Two body modifiers, and they mean different things
 *
 * `--busy` dims and blocks pointer events while a recompute is in flight. `--expression` marks the
 * sections dormant because a preset is driving the results. They are deliberately NOT the same state
 * and never share a class: one is transient and one is chosen.
 *
 * `inert` is applied for expression mode ONLY. It removes descendants from the focus order and
 * **blurs whatever is focused inside**, which on a transient state is user-hostile — committing a
 * filter by keyboard sets busy, and blurring would drop the user at the top of the document. Mouse
 * users would never notice, which is exactly how that bug ships.
 *
 * @packageDocumentation
 */

import type { CompositeRule, FilterBundle, FilterEngine, FilterRule, RuleId } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	buildWineBundleQuery,
	commitExpression,
	deriveWineFacets,
	type WineBundleQuery,
} from '@filter-enginez/examples-shared/wine-domain';

import { panelHeader } from '../controls/sections.js';
import { el } from '../dom.js';
import {
	createChipSection,
	createOriginSection,
	createSingleColorSection,
} from './choiceSections.js';
import { createSearchSection } from './searchSections.js';
import {
	createRangeSection,
	createScoreCompareSection,
	createVintageSection,
} from './sliderSections.js';
import { createWineSmartFilters } from './smartFilters.js';

/** The engine state the panel renders from. */
export interface WinePanelState {
	/** The predictive-disable bundle, or `null` when none has arrived (or the last fetch failed). */
	readonly bundle: FilterBundle | null;
	/**
	 * The engine's committed expression, or `null` in flat-map mode.
	 *
	 * @remarks
	 * Passed in rather than read off the engine here, for the reason the whole panel holds local
	 * state: a synchronous read taken during a settle can still be the pre-write value on this tier.
	 * The page reads it once, at the point the settle is already known to have landed.
	 */
	readonly expression: CompositeRule | null;
	/** Whether a recompute is in flight — dims the sections without touching focus. */
	readonly isComputing: boolean;
	/** The engine's committed rule map. */
	readonly rules: ReadonlyMap<RuleId, FilterRule>;
}

/** A mounted wine panel: its root, the bundle query it needs, and an in-place updater. */
export interface WinePanel {
	/** Drop anything the panel owns. */
	readonly dispose: () => void;
	/** The panel root. */
	readonly element: HTMLElement;
	/** The `applyFiltersAndQuery` query describing every facet this panel predictive-disables. */
	readonly query: WineBundleQuery;
	/** Re-apply engine state to every section and to the body modifiers. */
	readonly update: (state: WinePanelState) => void;
}

/**
 * Build the wine filter panel over a bare engine.
 *
 * @remarks
 * Nothing about this dataset is defined here. The vocabularies, baselines, origin hierarchy, bundle
 * query, presets and rule summaries all come from `@filter-enginez/examples-shared/wine-domain`. Six
 * verticals render this dataset; the moment one of them inlines "just this one formatter", a chip
 * reads `medium-full` while the card beside it reads `medium full` over the same corpus.
 *
 * @param core - The engine every control writes through.
 * @returns The mounted panel + the bundle query its predictive-disable needs.
 */
export function createWinePanel(core: FilterEngine<Wine>): WinePanel {
	// The commit helpers take the structural minimum — `{ core }` — so the same functions serve the
	// signals verticals, Angular's RxJS facade and this one unchanged.
	const host = { core };
	// The corpus is resident and immutable post-boot, so the facets and the query are derived once.
	// From the ENGINE's corpus, never a fresh import: `buildOriginTree()` defaults to the bundled 10k
	// tier, which would build an origin picker for a corpus the engine is not filtering.
	const facets = deriveWineFacets(core.getSourceData());
	const query = buildWineBundleQuery(facets.baselines, facets.vocabularies, facets.originSpecs);

	const smartFilters = createWineSmartFilters({ host });
	/**
	 * Drop any active preset — every facet edit means the user is back in flat-map mode.
	 *
	 * @remarks
	 * Guarded, because an unconditional `setExpression(null)` would put a no-op mutation on the action
	 * log for every slider drag on a route that is not in expression mode at all.
	 */
	const leaveExpressionMode = (): void => {
		if (smartFilters.selected().length === 0) {
			return;
		}
		smartFilters.update(null);
		commitExpression(host, null);
	};

	const context = { facets, host, leaveExpressionMode };
	// The thirteen, in render order. Most-used first; the two rule-type demos sit BESIDE their
	// relatives — score comparison under Points, single color under Color — because each is there to
	// contrast a rule type with the one above it, and that contrast only reads if they are adjacent.
	const sections = [
		createRangeSection('price', context),
		createRangeSection('points', context),
		createScoreCompareSection(context),
		createChipSection('color', context),
		createSingleColorSection(context),
		createChipSection('varietal', context),
		createOriginSection(context),
		createVintageSection(context),
		createRangeSection('abv', context),
		createChipSection('body', context),
		createChipSection('sweetness', context),
		createSearchSection('notes', context),
		createSearchSection('winery', context),
	];

	const sectionsElement = el('div', {
		children: sections.map((entry) => entry.element),
		className: 'fe-filter-panel__body',
	});
	// The presets sit inside the scroller but OUTSIDE the body, with no wrapper: that is the one
	// position where they scroll with the panel and stay interactive while the sections dim.
	// `ui-styles` has no class for such a slot, and inventing one would add an unstyled div whose name
	// described a position rather than a component.
	const scrollerElement = el('div', {
		children: [smartFilters.element, sectionsElement],
		className: 'fe-filter-panel__scroller',
	});
	const element = el('div', {
		children: [panelHeader(), scrollerElement],
		className: 'fe-filter-panel',
	});

	return {
		dispose: () => {
			// Every listener this panel owns is bound to an element inside `element`, and the route drops
			// that subtree wholesale. Present so the view's teardown contract does not change shape if a
			// section ever acquires something that outlives its node — the geo map is real estate's.
		},
		element,
		query,
		update: ({ bundle, expression, isComputing, rules }) => {
			const isExpressionMode = expression !== null;

			smartFilters.update(expression);
			for (const entry of sections) {
				entry.update({ bundle, rules });
			}
			// `--busy` only while NOT in expression mode: a dormant panel is already dimmed, and
			// stacking both reads as a recompute that never ends.
			sectionsElement.classList.toggle(
				'fe-filter-panel__body--busy',
				isComputing && !isExpressionMode,
			);
			sectionsElement.classList.toggle('fe-filter-panel__body--expression', isExpressionMode);
			// See the docblock: expression mode only, never for computing.
			sectionsElement.toggleAttribute('inert', isExpressionMode);
		},
	};
}
