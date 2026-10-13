/**
 * `wine/smartFilters` — the expression-mode presets, and the only control in the panel not backed by
 * a rule.
 *
 * @remarks
 * Each preset commits a curated `CompositeRule` through `setExpression`, which is the whole point of
 * the facet: it is the one place in this app where a user drives the engine's expression algebra
 * rather than its flat-map mode.
 *
 * ## It lives OUTSIDE the panel body, and that is structural
 *
 * The strip scrolls with the panel while staying interactive as every section below dims and locks.
 * A preset that greyed out its own clear button would be a trap, since the presets are the only way
 * back out of expression mode.
 *
 * ## "Match any (OR)" is the section, not a garnish
 *
 * Single-select applies one canned expression; OR mode unions the selected presets. The expression
 * comes from `buildSmartFilterExpression`, whose single-selection special case has to agree exactly
 * with `deriveSelectedPresetIds` reading the chips back — which is why both live in `wine-domain`
 * rather than in five panels.
 *
 * **The mode flag is seeded AND adopted, and the adopt is one-way.** More than one preset can only
 * have been committed through OR mode, so a `?f` link carrying two must restore the checkbox on —
 * otherwise the chips come back multi-selected while the control claims single-select, and the next
 * click silently drops the others. Deriving `selected.length > 1` outright would be worse: it would
 * flip the checkbox OFF the moment a user in OR mode deselected down to one preset, silently
 * changing the mode they chose. Turning it on when the selection proves it must already be on cannot
 * be wrong.
 *
 * ## Applying a preset does not blank the manual controls
 *
 * `clearAllFacetRules` removes the flat rules and every section adopts its own rule's removal. There
 * is no reset handshake; each section adopting its own rule's removal is what makes one unnecessary.
 *
 * @packageDocumentation
 */

import type { CompositeRule } from '@filter-enginez/core';

import {
	buildSmartFilterExpression,
	clearAllFacetRules,
	commitExpression,
	deriveSelectedPresetIds,
	sameSelection,
	WINE_SMART_FILTERS,
	type WineEngineHost,
} from '@filter-enginez/examples-shared/wine-domain';

import { createChipToggleGroup } from '../controls/controls.js';
import { section } from '../controls/sections.js';
import { el, setHidden } from '../dom.js';
import { createFacetAdopter } from './facetState.js';

/** The mounted preset strip. */
export interface WineSmartFilters {
	/** The `<section>` to prepend inside the panel's scroller, above the body. */
	readonly element: HTMLElement;
	/** The preset ids currently lit — the panel reads this to decide what "leave expression mode" does. */
	readonly selected: () => readonly string[];
	/** Adopt the engine's committed expression and repaint. */
	readonly update: (expression: CompositeRule | null) => void;
}

/** Construction options. */
export interface WineSmartFiltersOptions {
	/** The engine facade the shared commit helpers write through. */
	readonly host: WineEngineHost;
}

/**
 * Build the smart-filter preset strip.
 *
 * @param options - The engine facade to write through.
 * @returns The mounted strip.
 */
export function createWineSmartFilters(options: WineSmartFiltersOptions): WineSmartFilters {
	const { host } = options;
	const presetIds = WINE_SMART_FILTERS.map((preset) => preset.id);
	const selection = createFacetAdopter<readonly string[]>(
		deriveSelectedPresetIds(host.core.getExpression()),
		sameSelection,
	);
	/** Whether "Match any (OR)" is on. Seeded, then adopted one-way — see the docblock. */
	let isMulti = selection.value().length > 1;

	const modeInput = el('input', {
		attrs: { type: 'checkbox' },
		on: {
			change: (event) => {
				isMulti = (event.currentTarget as HTMLInputElement).checked;
				// Switching modes clears the selection: the two modes mean different things by the same
				// chips, and carrying a selection across would apply an expression the user did not build.
				apply([]);
			},
		},
	});

	const chips = createChipToggleGroup({
		/* v8 ignore next -- defensive: the `?? id` arm is unreachable. The chip group only ever
		   formats values from `presetIds`, which IS `WINE_SMART_FILTERS.map((preset) => preset.id)`,
		   so the lookup always resolves. */
		formatLabel: (id) => WINE_SMART_FILTERS.find((preset) => preset.id === id)?.label ?? id,
		onToggle: (id) => {
			const current = selection.value();

			if (current.includes(id)) {
				apply(current.filter((entry) => entry !== id));

				return;
			}
			apply(isMulti ? [...current, id] : [id]);
		},
	});

	const clearButton = el('button', {
		attrs: { type: 'button' },
		className: 'fe-wine-smart__clear',
		on: {
			click: () => {
				apply([]);
			},
		},
		text: 'Clear smart filters',
	});

	const pausedNotice = el('div', {
		children: [el('span', { text: 'Manual filters are paused.' }), clearButton],
		className: 'fe-wine-smart__paused',
	});

	const element = section(
		'Smart filters',
		el('div', {
			children: [
				el('label', {
					children: [modeInput, el('span', { text: 'Match any (OR)' })],
					className: 'fe-wine-smart__mode',
				}),
				chips.element,
				pausedNotice,
			],
		}),
		'(expression mode)',
	);

	element.className = 'fe-filter-panel__section--divided';

	/**
	 * Apply a selection as an expression, or clear it.
	 *
	 * @param next - The preset ids to apply.
	 */
	function apply(next: readonly string[]): void {
		// Painted before the engine confirms, like every facet: on the worker tier the expression lands
		// a round trip after the write, so waiting would blank the chips between click and settle.
		selection.paint(next);
		repaint();

		if (next.length === 0) {
			commitExpression(host, null);

			return;
		}
		// Clear the flat facets FIRST. An expression and a leftover flat rule would both apply, so the
		// results would be narrower than the preset describes with no control on screen explaining why.
		clearAllFacetRules(host);
		commitExpression(host, buildSmartFilterExpression(next));
	}

	/** Repaint the chips, the mode box and the paused notice from local state. */
	function repaint(): void {
		const selected = selection.value();

		chips.update({ options: presetIds, selected });
		modeInput.checked = isMulti;
		setHidden(pausedNotice, selected.length === 0);
	}

	repaint();

	return {
		element,
		selected: selection.value,
		update: (expression) => {
			if (!selection.adopt(deriveSelectedPresetIds(expression))) {
				return;
			}
			// One-way: more than one preset proves OR mode was on, and nothing turns it back off but the
			// user. See the docblock.
			if (selection.value().length > 1) {
				isMulti = true;
			}
			repaint();
		},
	};
}
