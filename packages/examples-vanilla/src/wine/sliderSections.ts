/**
 * `wine/sliderSections` — the four numeric facets and the one that contrasts with them.
 *
 * @remarks
 * Price, points and ABV are the same `RangeRule` facet three times, differing only in field, label,
 * formatter and drag step, so they come from a table. Vintage looks like a fourth and is not: its
 * rule is an `InSetRule<number>` and only its CONTROL is a slider. The score comparison is a
 * `NumericComparisonRule` and lives here because it sits directly under Points in the panel, which
 * is the whole reason it exists — one facet contrasting a rule type with the one above it.
 *
 * ## The drag steps are not `SLIDER_STEPS`
 *
 * `SLIDER_STEPS` is the grid the BASELINE BOUNDS round outward onto, and it is all zeros
 * deliberately: padding price by 5 would turn a $4 corpus minimum into a displayed $0. Conflating
 * the two — via a `|| 1` fallback — would snap the price slider to $1 where React snaps to $5.
 * {@link DRAG_STEPS} is the other quantity, and the two are never interchangeable.
 *
 * ## Every handler paints before it commits
 *
 * See `facetState.ts`. On this route the engine's own value lags a full worker round trip, so a
 * handler that waited for the recompute would snap the handle backwards mid-drag.
 *
 * @packageDocumentation
 */

import {
	inSet,
	type InSetRule,
	numCompare,
	type NumericComparisonOp,
	type NumericComparisonRule,
	range,
	type RangeRule,
	type RuleId,
} from '@filter-enginez/core';
import { el } from '@filter-enginez/examples-shared/dom';
import {
	clearRule,
	commitRule,
	fieldBounds,
	fieldHistogram,
	type NumericBounds,
	type SliderFieldId,
	vintageBoundsFromSet,
	vintageYearsFromRange,
} from '@filter-enginez/examples-shared/wine-domain';

import type { WineSection, WineSectionContext } from './sections.js';

import { createNumberField } from '../controls/numberField.js';
import { createRangeSlider } from '../controls/rangeSlider.js';
import { section } from '../controls/sections.js';
import { createSelectMenu } from '../controls/selectMenu.js';
import { createFacetAdopter, sameSpan } from './facetState.js';

/** Per-slider drag granularity. NOT `SLIDER_STEPS` — see the module docblock. */
const DRAG_STEPS: Record<SliderFieldId, number> = { abv: 0.1, points: 1, price: 5, vintage: 1 };

/** Shown before an operator is picked — the low end of a "great" score, matching every vertical. */
const DEFAULT_THRESHOLD = 90;

/**
 * Math glyphs rather than `>=`, matching React: they read faster in a control this narrow.
 *
 * @remarks
 * `''` is the off state and is the placeholder rather than an option, so "no comparison" cannot be
 * mistaken for a seventh operator.
 */
const OPERATORS: readonly { readonly label: string; readonly value: string }[] = [
	{ label: '≥', value: '>=' },
	{ label: '>', value: '>' },
	{ label: '=', value: '==' },
	{ label: '≤', value: '<=' },
	{ label: '<', value: '<' },
	{ label: '≠', value: '!=' },
];

/** One `RangeRule` slider's fixed properties. */
interface RangeFacetConfig {
	/** The `Wine` property the rule constrains — `priceUsd` for the `price` rule. */
	readonly field: string;
	/** Value → display string. Omitted for points, which reads as a bare number. */
	readonly format?: (value: number) => string;
	/** The slider's own header label. */
	readonly label: string;
	/** Rule id — also the key into the baselines and the bundle's field metadata. */
	readonly ruleId: SliderFieldId;
	/** Accessible name for the slider group. */
	readonly sliderLabel: string;
}

/** Price, points and ABV — identical but for these five values. */
const RANGE_FACETS: Record<'abv' | 'points' | 'price', RangeFacetConfig> = {
	abv: {
		field: 'abv',
		format: (abv) => `${abv.toFixed(1)}%`,
		label: 'ABV (%)',
		ruleId: 'abv',
		sliderLabel: 'Filter by ABV',
	},
	points: { field: 'points', label: 'Points', ruleId: 'points', sliderLabel: 'Filter by points' },
	price: {
		field: 'priceUsd',
		format: (price) => `$${String(Math.round(price))}`,
		label: 'Price (USD)',
		ruleId: 'price',
		sliderLabel: 'Filter by price',
	},
};

/**
 * Build one `RangeRule` slider section.
 *
 * @param facetId - Which of the three.
 * @param context - The panel's shared write path and derived facets.
 * @returns The mounted section.
 */
export function createRangeSection(
	facetId: 'abv' | 'points' | 'price',
	context: WineSectionContext,
): WineSection {
	const config = RANGE_FACETS[facetId];
	const { facets, host, leaveExpressionMode } = context;
	const baseline = facets.baselines[config.ruleId];
	const span = createFacetAdopter<NumericBounds | null>(
		committedSpan(host.core.getRules(), config.ruleId),
		sameSpan,
	);

	const slider = createRangeSlider({
		ariaLabel: config.sliderLabel,
		format: config.format,
		label: config.label,
		onChange: (next) => {
			leaveExpressionMode();
			span.paint(next);
			commitRule(host, config.ruleId, range(config.field, next));
		},
		step: DRAG_STEPS[config.ruleId],
	});

	// A bare `<section>` rather than the `section()` helper: the slider already draws its own label in
	// its header row, and a second `<h3>` above it would render the name twice. The wrapper exists so
	// the panel's section rhythm reaches it, exactly as the other verticals' markup does.
	const element = el('section', { children: [slider.element]});

	return {
		element,
		update: ({ bundle, rules }) => {
			span.adopt(committedSpan(rules, config.ruleId));

			const current = span.value();
			const valueMin = current?.min ?? baseline.min;
			// An infinite maximum only reaches this route through a `?f` link from React's open-ended
			// price slider. It reads back as the baseline edge rather than as an infinite handle.
			const valueMax
				= current !== null && Number.isFinite(current.max) ? current.max : baseline.max;

			slider.update({
				// Falling back to the baseline covers three cases a slider cannot tell apart: no bundle
				// yet, the field was not queried, and no result occupies the field at all. In all three
				// the whole track reads as available — the honest "we don't know yet". Dimming it would
				// claim there is nothing there.
				available: fieldBounds(bundle, config.ruleId) ?? baseline,
				baseline,
				histogram: fieldHistogram(bundle, config.ruleId, valueMin, valueMax),
				valueMax,
				valueMin,
			});
		},
	};
}

/**
 * Build the vintage section — a slider over a `InSetRule<number>` of years.
 *
 * @remarks
 * **The rule type and the control disagree on purpose.** A vintage is a discrete year, so the engine
 * holds an explicit set — but nobody wants to tick sixteen checkboxes to say "2015 to 2020". The two
 * conversions in `wine-domain/vintage.ts` bridge them.
 *
 * That round trip is lossy in one direction, deliberately: a set with a GAP in it — reachable
 * through a hand-written JSON config, never through this control — reads back as its outer bounds.
 * The slider then shows a span wider than the rule, which is the honest rendering of "this control
 * cannot express what is committed", and the next drag replaces it.
 *
 * @param context - The panel's shared write path and derived facets.
 * @returns The mounted section.
 */
export function createVintageSection(context: WineSectionContext): WineSection {
	const { facets, host, leaveExpressionMode } = context;
	const baseline = facets.baselines.vintage;
	/** Recover the committed year SET as a span. */
	const read = (rules: ReadonlyMap<RuleId, unknown>): NumericBounds | null => {
		const rule = rules.get('vintage') as InSetRule<number> | undefined;

		return rule === undefined ? null : vintageBoundsFromSet(rule.config.set, baseline);
	};
	const span = createFacetAdopter<NumericBounds | null>(read(host.core.getRules()), sameSpan);

	const slider = createRangeSlider({
		ariaLabel: 'Filter by vintage year',
		// A year without a thousands separator — `2015`, never `2,015`.
		format: (year) => String(Math.round(year)),
		label: 'Vintage',
		onChange: (next) => {
			leaveExpressionMode();
			span.paint(next);
			commitRule(host, 'vintage', inSet<number>('vintage', vintageYearsFromRange(next, baseline)));
		},
		step: DRAG_STEPS.vintage,
	});

	const element = el('section', { children: [slider.element]});

	return {
		element,
		update: ({ bundle, rules }) => {
			span.adopt(read(rules));

			const current = span.value();
			const valueMin = current?.min ?? baseline.min;
			const valueMax
				= current !== null && Number.isFinite(current.max) ? current.max : baseline.max;

			slider.update({
				available: fieldBounds(bundle, 'vintage') ?? baseline,
				baseline,
				// One bucket per year — the distribution matches the field's actual discreteness.
				histogram: fieldHistogram(bundle, 'vintage', valueMin, valueMax),
				valueMax,
				valueMin,
			});
		},
	};
}

/**
 * Build the score-comparison section — the `NumericComparisonRule` facet.
 *
 * @remarks
 * The panel's only facet built from two controls that must agree, and the only consumer of the
 * number field. Not a hardcoded "≥ 90" checkbox: the facet exists to demonstrate the rule type, and
 * one fixed operator demonstrates very little of it.
 *
 * **The two pieces of state adopt differently.** The operator follows the panel's usual pattern. The
 * threshold does not: with the facet off there is no committed value to adopt, so an adopter that
 * fired anyway would reset the box to the default every time the user cleared the operator, losing a
 * number they had just typed. It is therefore seeded eagerly (a rule may already be on the engine
 * from a `?f` restore, which no default can supply) and only ever overwritten by a real committed
 * value.
 *
 * **Editing the threshold must not switch the facet on.** With no operator there is no rule, and
 * typing a number is not a request to create one — the user has not said *how* to compare yet.
 *
 * @param context - The panel's shared write path.
 * @returns The mounted section.
 */
export function createScoreCompareSection(context: WineSectionContext): WineSection {
	const { host, leaveExpressionMode } = context;
	const seed = host.core.getRules().get('points-compare') as NumericComparisonRule | undefined;
	const operator = createFacetAdopter<string>(seed?.config.op ?? '');
	/** Not an adopter: it has no "absent" value to adopt, and its guard is conditional. See above. */
	let threshold = seed?.config.value ?? DEFAULT_THRESHOLD;

	/** Write the rule for the current pair. */
	const commit = (op: string, value: number): void => {
		leaveExpressionMode();
		commitRule(host, 'points-compare', numCompare('points', { op: op as NumericComparisonOp, value }));
	};

	const operatorMenu = createSelectMenu({
		onChange: (next) => {
			leaveExpressionMode();
			operator.paint(next);

			if (next === '') {
				clearRule(host, 'points-compare');

				return;
			}
			commit(next, threshold);
		},
		placeholder: '— off —',
		selectLabel: 'Points comparison operator',
	});

	const thresholdField = createNumberField({
		fieldLabel: 'Points comparison threshold',
		max: 100,
		min: 80,
		onChange: (next) => {
			threshold = next;

			// See the docblock: editing the threshold with the facet off must not silently switch it on.
			if (operator.value() === '') {
				return;
			}
			commit(operator.value(), next);
		},
		step: 1,
	});

	const element = section(
		'Score comparison',
		el('div', {
			children: [
				el('div', { children: [operatorMenu.element], className: 'fe-operator-row__op' }),
				el('div', { children: [thresholdField.element], className: 'fe-operator-row__value' }),
			],
			className: 'fe-operator-row',
		}),
	);

	return {
		element,
		update: ({ rules }) => {
			const rule = rules.get('points-compare') as NumericComparisonRule | undefined;

			operator.adopt(rule?.config.op ?? '');

			// Conditional by design — only a real committed value overwrites what the user typed.
			if (rule !== undefined) {
				threshold = rule.config.value;
			}
			operatorMenu.update({ options: OPERATORS, value: operator.value() });
			thresholdField.update({ value: threshold });
		},
	};
}

/** The committed span for a `RangeRule` facet, or `null` when it carries no rule. @internal */
function committedSpan(
	rules: ReadonlyMap<RuleId, unknown>,
	ruleId: RuleId,
): NumericBounds | null {
	const rule = rules.get(ruleId) as RangeRule | undefined;

	return rule === undefined ? null : { max: rule.config.max, min: rule.config.min };
}
