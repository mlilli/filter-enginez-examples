/**
 * `wine/choiceSections` — the six set-shaped facets: four chip groups, the exact-color select, and
 * the origin hierarchy.
 *
 * @remarks
 * ## The rule id doubles as the field name
 *
 * `color`, `body`, `sweetness` and `varietal` are each both the engine's key for the rule and the
 * `Wine` property the `InSetRule` constrains, which is what lets four facets share one builder. A
 * facet where the two diverge needs its own section rather than a second argument here —
 * {@link createSingleColorSection} is that case: rule id `color-value` over field `color`.
 *
 * ## The vocabularies are ordered here, not in the panel
 *
 * Color, body and sweetness render in their canonical order filtered by what the corpus actually
 * contains (`orderedPresentOptions`, as every vertical does) — never raw vocabulary order, which is derivation order and would put `dessert` between
 * `red` and `white` depending on which wine streamed first. Varietal shows the
 * `VARIETAL_CHIP_LIMIT` most-reviewed varieties (the vocabulary arrives ranked by wine count) and
 * scrolls; the full vocabulary runs to hundreds, and its label carries the true count so the limit is
 * visible rather than silent. A selected varietal beyond the limit keeps its chip, so a rare grape
 * selected through a shared link can still be cleared where it is shown.
 *
 * ## A click paints at once
 *
 * Every section here repaints its own control from its local value the moment it is clicked, using
 * the last bundle it was handed, and only then writes. On the worker tier the engine's answer is a
 * round trip away; waiting for it would light the chip — or the tick — late. The settle then repaints
 * again, adopting the engine's value only if it genuinely changed (`facetState.ts`).
 *
 * @packageDocumentation
 */

import { inSet, type InSetofSetsRule, type InSetRule, type RuleId, value, type ValueRule } from '@filter-enginez/core';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import {
	BODY_ORDER,
	chipDisabledSet,
	chipExclusionMap,
	chipProjectedCounts,
	clearRule,
	COLOR_ORDER,
	commitOriginSelection,
	commitRule,
	commitSelection,
	deriveOriginSelection,
	orderedPresentOptions,
	sameSelection,
	SWEETNESS_ORDER,
	visibleVarietalChips,
	WINE_ORIGIN_TREE,
	type WineFacets,
} from '@filter-enginez/examples-shared/wine-domain';

import type { WineFacetState, WineSection, WineSectionContext } from './sections.js';

import { createChipToggleGroup } from '../controls/controls.js';
import { createHierarchicalPicker } from '../controls/hierarchicalPicker.js';
import { section } from '../controls/sections.js';
import { createSelectMenu } from '../controls/selectMenu.js';
import { createFacetAdopter } from './facetState.js';

/** What a section paints from before the first settle: no bundle, the rules it was seeded from. */
const NO_STATE: WineFacetState = { bundle: null, rules: new Map() };

/** The four chip facets. */
export type WineChipFacetId = 'body' | 'color' | 'sweetness' | 'varietal';

/**
 * The chip options for one facet, in display order.
 *
 * @remarks
 * Varietal's depend on the selection — `visibleVarietalChips` appends a selected varietal ranked
 * beyond the limit — so its options are recomputed on every repaint; the other three are fixed by
 * the corpus.
 *
 * @param facetId - Which chip facet.
 * @param facets - The corpus-derived vocabularies.
 * @param selected - The facet's current selection.
 * @returns The candidate values.
 */
function chipOptions(facetId: WineChipFacetId, facets: WineFacets, selected: readonly string[]): readonly string[] {
	const { vocabularies } = facets;

	switch (facetId) {
		case 'body':
			return orderedPresentOptions(BODY_ORDER, vocabularies.body);
		case 'color':
			return orderedPresentOptions(COLOR_ORDER, vocabularies.color);
		case 'sweetness':
			return orderedPresentOptions(SWEETNESS_ORDER, vocabularies.sweetness);
		default:
			return visibleVarietalChips(vocabularies.varietal, selected);
	}
}

/**
 * The section heading for one chip facet.
 *
 * @remarks
 * Varietal's carries its FULL vocabulary size rather than the shown list's length, so a user seeing
 * sixty chips under a heading that says several hundred knows the list is a sample. That is why the
 * label is not simply derivable from the facet id.
 *
 * @param facetId - Which chip facet.
 * @param facets - The corpus-derived vocabularies.
 * @returns The heading.
 */
function chipLabel(facetId: WineChipFacetId, facets: WineFacets): string {
	switch (facetId) {
		case 'body':
			return 'Body';
		case 'color':
			return 'Color';
		case 'sweetness':
			return 'Sweetness';
		default:
			return `Varietal (${String(facets.vocabularies.varietal.length)})`;
	}
}

/**
 * Build one exclusion-aware `InSetRule` chip section.
 *
 * @param facetId - Which chip facet — also the rule id and the `Wine` field.
 * @param context - The panel's shared write path and derived facets.
 * @returns The mounted section.
 */
export function createChipSection(
	facetId: WineChipFacetId,
	context: WineSectionContext,
): WineSection {
	const { facets, host, leaveExpressionMode } = context;
	const selection = createFacetAdopter<readonly string[]>(
		committedSet(host.core.getRules(), facetId),
		sameSelection,
	);
	let latest = NO_STATE;

	/** Repaint the chips from the local selection and the last bundle. */
	const render = (): void => {
		chips.update({
			exclusion: chipExclusionMap(latest.bundle, facetId),
			options: chipOptions(facetId, facets, selection.value()),
			selected: selection.value(),
		});
	};

	const chips = createChipToggleGroup({
		onToggle: (clicked) => {
			leaveExpressionMode();

			const next = toggleSetValue(selection.value(), clicked);

			selection.paint(next);
			render();
			commitSelection(host, facetId, next, (values) => inSet<string>(facetId, values));
		},
		// Color alone shows projected counts. Varietal chips carry none in any vertical — on sixty
		// chips the badges would be noise — and scroll inside a capped group instead.
		scrollable: facetId === 'varietal',
		showCount: facetId === 'color',
	});

	return {
		element: section(chipLabel(facetId, facets), chips.element),
		update: (state) => {
			latest = state;
			selection.adopt(committedSet(state.rules, facetId));
			render();
		},
	};
}

/**
 * Build the exact-color section — a `ValueRule` over the same field the color chips use.
 *
 * @remarks
 * Sits directly beneath those chips, and the adjacency is the point: the facet exists to contrast an
 * exact-match rule with a set-membership one, and that contrast only reads if they are neighbors.
 *
 * `ValueRule` is the one rule whose `config` IS its value rather than an object wrapping it, so an
 * absent rule and a cleared one both read back as the empty placeholder.
 *
 * @param context - The panel's shared write path and derived facets.
 * @returns The mounted section.
 */
export function createSingleColorSection(context: WineSectionContext): WineSection {
	const { facets, host, leaveExpressionMode } = context;
	// Canonical color order, as the chips above it and every other vertical's menu list them.
	const menuOptions = orderedPresentOptions(COLOR_ORDER, facets.vocabularies.color).map((entry) => ({
		label: entry,
		value: entry,
	}));
	const selected = createFacetAdopter<string>(committedValue(host.core.getRules()));

	const menu = createSelectMenu({
		onChange: (next) => {
			leaveExpressionMode();
			selected.paint(next);
			render();

			if (next === '') {
				clearRule(host, 'color-value');

				return;
			}
			commitRule(host, 'color-value', value<string>('color', next));
		},
		placeholder: '— any color —',
		selectLabel: 'Filter by exact wine color',
	});

	/** Repaint the menu from the local value. */
	function render(): void {
		menu.update({ options: menuOptions, value: selected.value() });
	}

	return {
		element: section('Single color (exact)', menu.element),
		update: ({ rules }) => {
			selected.adopt(committedValue(rules));
			render();
		},
	};
}

/**
 * Build the origin section — the cascading country → province → region → subregion picker.
 *
 * @remarks
 * The headline facet of the wine demo, and the only one whose rule is a set OF sets: selecting a
 * country commits the leaf ids beneath it, so one click covers a whole subtree without the rule
 * needing to understand hierarchy.
 *
 * **Selection is COMPACT** — the highest selected node per branch, never the closure.
 * `deriveOriginSelection` recovers that form from the committed leaf sets. Rendering the closure
 * instead would light every descendant of a selected country, and the next click would then
 * de-select one leaf rather than the country the user actually picked.
 *
 * **The counts come from the engine, not the tree.** Only the engine's projection knows how many
 * WINES a node covers; the tree knows its own shape, so a country with one leaf region beneath it
 * would read `1` while producing two hundred results.
 *
 * @param context - The panel's shared write path and derived facets.
 * @returns The mounted section.
 */
export function createOriginSection(context: WineSectionContext): WineSection {
	const { facets, host, leaveExpressionMode } = context;
	const { originSpecs, originTree } = facets;
	/** The compact node selection the engine's committed leaf sets imply. */
	const read = (rules: ReadonlyMap<RuleId, unknown>): readonly string[] => {
		const rule = rules.get('origin') as InSetofSetsRule<string> | undefined;

		return rule === undefined ? [] : deriveOriginSelection(rule.config.set, originSpecs);
	};
	const selection = createFacetAdopter<readonly string[]>(read(host.core.getRules()), sameSelection);
	let latest = NO_STATE;

	/** Repaint the tree from the local selection and the last bundle. */
	const render = (): void => {
		picker.update({
			counts: chipProjectedCounts(latest.bundle, 'origin'),
			disabled: chipDisabledSet(latest.bundle, 'origin'),
			selected: selection.value(),
			tree: originTree,
		});
	};

	// The group's accessible name and viewport height are the shared ones every vertical's origin
	// tree uses.
	const picker = createHierarchicalPicker({
		groupLabel: WINE_ORIGIN_TREE.groupLabel,
		maxHeight: WINE_ORIGIN_TREE.maxHeight,
		// The picker hands back the WHOLE next selection rather than one toggled value: a single click
		// can select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is
		// not expressible.
		onChange: (next) => {
			leaveExpressionMode();
			selection.paint(next);
			render();
			commitOriginSelection(host, next, originSpecs);
		},
	});

	return {
		element: section(WINE_ORIGIN_TREE.groupLabel, picker.element),
		update: (state) => {
			latest = state;
			selection.adopt(read(state.rules));
			render();
		},
	};
}

/** The committed value set of an `InSetRule`, or empty when the facet carries no rule. @internal */
function committedSet(rules: ReadonlyMap<RuleId, unknown>, ruleId: RuleId): readonly string[] {
	return (rules.get(ruleId) as InSetRule<string> | undefined)?.config.set ?? [];
}

/** The committed exact color, or `''` when the facet carries no rule. @internal */
function committedValue(rules: ReadonlyMap<RuleId, unknown>): string {
	return (rules.get('color-value') as ValueRule<string> | undefined)?.config ?? '';
}
