/**
 * Tests for the wine expression-mode presets.
 *
 * @remarks
 * These four presets demonstrate the engine's Boolean algebra — `and`, `or`, `not`
 * and nesting — so they are asserted by RUNNING them through a real engine rather than by inspecting
 * the returned tree. Shape assertions would pass for an expression that composes correctly and selects
 * the wrong wines; the fixture below is built so each preset's boundary is a separate row, and getting
 * an operator wrong changes which rows come back.
 *
 * The negation presets matter most. `not(inSet(...))` is the one place where a mistake is invisible in
 * the UI: the preset still returns wines, just the wrong ones, and nothing about "Crisp whites"
 * showing a dessert wine looks like a filter bug to someone who has not read the expression.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	and,
	type CompositeRule,
	createFilterEngine,
	exportConfig,
	type FilterEngine,
	type FilterEngineConfig,
	inSet,
	loadConfig,
	or,
} from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { deriveSelectedPresetIds, WINE_SMART_FILTERS } from './smartFilters.js';

/**
 * A wine carrying only the fields the presets read.
 *
 * @param overrides - Field values for this row.
 * @returns A `Wine`-shaped fixture row.
 */
function wine(overrides: { id: string } & Partial<Record<string, unknown>>): Wine {
	return {
		color: 'red',
		points: 90,
		priceUsd: 20,
		sweetness: 'dry',
		varietal: 'Merlot',
		...overrides,
	} as unknown as Wine;
}

const corpus: readonly Wine[] = [
	// Bold reds: red, cheap, well-rated.
	wine({ id: 'bold-hit' }),
	// Red and cheap but UNDER the points threshold — isolates the numeric comparison.
	wine({ id: 'red-cheap-low-points', points: 87 }),
	// Red and well-rated but OVER the price cap — isolates the range.
	wine({ id: 'red-pricey', priceUsd: 26 }),
	// Crisp white.
	wine({ color: 'white', id: 'crisp-white', varietal: 'Chardonnay' }),
	// A white that the `not` must exclude.
	wine({ color: 'white', id: 'sweet-white', sweetness: 'dessert', varietal: 'Riesling' }),
	// The three Pinot spellings the `or` unions. The red one is deliberately UNDER the bold-reds
	// points threshold so it belongs to exactly one preset — a fixture row that satisfies two presets
	// makes the strict assertions below untestable without weakening them.
	wine({ id: 'pinot-noir', points: 87, varietal: 'Pinot Noir' }),
	wine({ color: 'white', id: 'pinot-gris', varietal: 'Pinot Gris' }),
	wine({ color: 'white', id: 'pinot-grigio', varietal: 'Pinot Grigio' }),
	// Cellar picks: qualifies on POINTS only, and survives the color negation. Priced just over the
	// bold-reds cap and well under cellar-picks' own $60 arm, so it lands in exactly one preset via
	// exactly one arm.
	wine({ id: 'cellar-by-points', points: 94, priceUsd: 26 }),
	// Qualifies on PRICE only — the other arm of the nested `or`.
	wine({ id: 'cellar-by-price', points: 85, priceUsd: 75 }),
	// Would qualify on points, but the negated color excludes it.
	wine({ color: 'sparkling', id: 'excluded-sparkling', points: 95 }),
];

/**
 * Ids of the wines an engine currently selects.
 *
 * @param engine - Any engine over {@link corpus}.
 * @returns The selected wines' ids, in result order.
 */
function selectedWineIds(engine: FilterEngine<Wine>): string[] {
	return engine.getResults().map((row) => (row as unknown as { id: string }).id);
}

/**
 * Apply a preset by id and return the matching wine ids.
 *
 * @param id - The preset's stable id.
 * @returns Ids of the wines the preset's expression selects.
 */
function idsMatching(id: string): string[] {
	const preset = WINE_SMART_FILTERS.find((entry) => entry.id === id);

	if (!preset) {
		throw new Error(`No preset with id "${id}"`);
	}

	const engine = createFilterEngine<Wine>({ sourceData: [...corpus]});

	engine.setExpression(preset.build());

	return selectedWineIds(engine);
}

describe('preset catalog', () => {
	it('exposes four presets with unique ids', () => {
		const ids = WINE_SMART_FILTERS.map((preset) => preset.id);

		expect(ids).toEqual(['bold-reds', 'crisp-whites', 'pinot-any', 'cellar-picks']);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every preset a label and a description', () => {
		// Both are user-visible — the label on the button, the description as the gloss beneath it. An
		// empty one renders a nameless button rather than an error.
		for (const preset of WINE_SMART_FILTERS) {
			expect(preset.label.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeGreaterThan(0);
		}
	});

	it('builds a FRESH expression on every call', () => {
		// Rules are mutable and the engine takes ownership. A preset that returned a cached instance
		// would let one route's engine mutate the tree the next boot hands to another.
		for (const preset of WINE_SMART_FILTERS) {
			expect(preset.build()).not.toBe(preset.build());
		}
	});
});

describe('bold-reds — a flat AND of three rule types', () => {
	it('keeps only the wine satisfying all three conjuncts', () => {
		expect(idsMatching('bold-reds')).toEqual(['bold-hit']);
	});

	it('excludes rows failing exactly one conjunct', () => {
		// Named explicitly because an `and` degraded to `or` would ADMIT both of these while still
		// returning the expected hit — the positive assertion above alone would not notice.
		const ids = idsMatching('bold-reds');

		expect(ids).not.toContain('red-cheap-low-points');
		expect(ids).not.toContain('red-pricey');
	});
});

describe('crisp-whites — AND with a NOT', () => {
	it('keeps the dry white and drops the dessert one', () => {
		const ids = idsMatching('crisp-whites');

		expect(ids).toContain('crisp-white');
		expect(ids).not.toContain('sweet-white');
	});

	it('admits the Pinot whites, which are dry', () => {
		// Confirms the negation excludes by SWEETNESS rather than incidentally by varietal.
		expect(idsMatching('crisp-whites')).toEqual(expect.arrayContaining(['pinot-gris', 'pinot-grigio']));
	});

	it('excludes every red', () => {
		expect(idsMatching('crisp-whites').some((id) => id.startsWith('bold'))).toBe(false);
	});
});

describe('pinot-any — an OR of value rules', () => {
	it('unions all three spellings', () => {
		expect(idsMatching('pinot-any').sort()).toEqual(['pinot-grigio', 'pinot-gris', 'pinot-noir']);
	});

	it('returns nothing else', () => {
		// An `or` mistakenly written as `and` would return the empty set here, which reads on screen as
		// "no matches" rather than as a broken expression.
		expect(idsMatching('pinot-any')).toHaveLength(3);
	});
});

describe('cellar-picks — a nested OR inside an AND, with a NOT', () => {
	it('admits a wine qualifying on points alone', () => {
		expect(idsMatching('cellar-picks')).toContain('cellar-by-points');
	});

	it('admits a wine qualifying on price alone', () => {
		// The two arms of the nested `or` asserted separately: a preset that had accidentally ANDed them
		// would still return `cellar-by-points` if that row happened to satisfy both.
		expect(idsMatching('cellar-picks')).toContain('cellar-by-price');
	});

	it('excludes a sparkling wine that would otherwise qualify', () => {
		// The outer `not` doing its job. This row clears the points threshold comfortably, so its
		// absence is attributable to the negation and nothing else.
		expect(idsMatching('cellar-picks')).not.toContain('excluded-sparkling');
	});

	it('excludes a wine that clears neither OR arm', () => {
		expect(idsMatching('cellar-picks')).not.toContain('red-cheap-low-points');
	});
});

describe('deriveSelectedPresetIds', () => {
	/** An expression on both sides of a shared link, and the wines each side selects. */
	interface ShareLinkRoundTrip {
		/** The JSON the link carries, as `JSON.stringify` wrote it. */
		readonly linkJson: string;
		/** The expression rebuilt from the link. */
		readonly restoredExpression: CompositeRule | null;
		/** Ids of the wines the rebuilt expression selects. */
		readonly restoredWineIds: readonly string[];
		/** Ids of the wines the expression selects before it is shared. */
		readonly sourceWineIds: readonly string[];
	}

	/**
	 * Push an expression through the real share-link path: `exportConfig` → JSON → `loadConfig`.
	 *
	 * @remarks
	 * A plain `build()` comparison would prove far less. What has to survive is the ROUND TRIP — the
	 * expression is serialized into `?f`, parsed back, and rebuilt through the rule registry, and it is
	 * that rebuilt tree the panel must recognize AND filter by. `cellar-picks` is the reason to be
	 * careful: it carries `Number.POSITIVE_INFINITY`, which `JSON.stringify` writes as `null`. The
	 * structural key alone cannot see whether that `null` loads back as open, because an open bound and
	 * a `null` left as it arrived stringify alike; the selected wines can.
	 *
	 * @param expression - What the panel would commit.
	 * @returns Both sides of the link: the JSON, the rebuilt expression, and each side's selection.
	 */
	function shareLinkRoundTrip(expression: CompositeRule): ShareLinkRoundTrip {
		const source = createFilterEngine<Wine>({ sourceData: corpus });

		source.setExpression(expression);

		const linkJson = JSON.stringify(exportConfig(source));
		const restored = createFilterEngine<Wine>({ sourceData: corpus });

		loadConfig(restored, JSON.parse(linkJson) as FilterEngineConfig);

		return {
			linkJson,
			restoredExpression: restored.getExpression(),
			restoredWineIds: selectedWineIds(restored),
			sourceWineIds: selectedWineIds(source),
		};
	}

	/**
	 * The expression as it comes back out of a shared link.
	 *
	 * @param expression - What the panel would commit.
	 * @returns The rebuilt expression.
	 */
	function throughShareLink(expression: CompositeRule): CompositeRule | null {
		return shareLinkRoundTrip(expression).restoredExpression;
	}

	/** Build one preset by id. */
	function buildPreset(id: string): CompositeRule {
		const preset = WINE_SMART_FILTERS.find((candidate) => candidate.id === id);

		if (preset === undefined) {
			throw new Error(`no preset ${id}`);
		}

		return preset.build();
	}

	it('reads no presets from a null expression — flat-map mode', () => {
		expect(deriveSelectedPresetIds(null)).toEqual([]);
	});

	it.each(WINE_SMART_FILTERS.map((preset) => preset.id))('recovers %s from a shared link, with the same matches', (id) => {
		// Every preset, not a sample: the recovery is a structural match, so a preset whose tree
		// serializes differently after a round trip fails alone and silently.
		const { restoredExpression, restoredWineIds, sourceWineIds } = shareLinkRoundTrip(buildPreset(id));

		expect(deriveSelectedPresetIds(restoredExpression)).toEqual([id]);
		// The chip can light over a filter that matches the wrong wines, so the selection is compared
		// too: the count first, for a failure that names it, then the wines themselves.
		expect(sourceWineIds.length, `${id} selects nothing in the fixture`).toBeGreaterThan(0);
		expect(restoredWineIds.length, `${id} lost matches through the link`).toBe(sourceWineIds.length);
		expect(restoredWineIds).toEqual(sourceWineIds);
	});

	it('keeps cellar-picks\' open price bound open through the link', () => {
		const { linkJson, restoredWineIds } = shareLinkRoundTrip(buildPreset('cellar-picks'));

		// The link really carries the open bound as `null` ...
		expect(linkJson).toContain('"max":null');
		// ... and the wine only that open bound admits ($75, 85 points) is still selected after it.
		expect(restoredWineIds).toContain('cellar-by-price');
	});

	it('recovers a multi-select OR of presets, in order', () => {
		const multi = or(buildPreset('bold-reds'), buildPreset('crisp-whites'));

		expect(deriveSelectedPresetIds(throughShareLink(multi))).toEqual(['bold-reds', 'crisp-whites']);
	});

	it('reads a single OR-shaped preset as ITSELF, not as a multi-select of its arms', () => {
		// The ordering trap. `pinot-any` is an `or` of three ValueRules, so a decompose-first
		// implementation would try to read those three as presets, match none, and report an empty
		// selection for a preset that is plainly active. Whole-expression match has to be tried first.
		expect(deriveSelectedPresetIds(throughShareLink(buildPreset('pinot-any')))).toEqual(['pinot-any']);
	});

	it('reads nothing from an OR that mixes a preset with something else', () => {
		// All-or-nothing. Lighting only the chip that matched would describe the results as "Bold reds",
		// which is not what this expression selects — a partial answer is worse than none here.
		const mixed = or(buildPreset('bold-reds'), inSet<string>('varietal', ['Merlot']));

		expect(deriveSelectedPresetIds(throughShareLink(mixed))).toEqual([]);
	});

	it('reads nothing from a hand-authored expression no preset built', () => {
		// A JSON config can carry any expression. The honest rendering is no chip lit, not a crash and
		// not a wrong chip.
		const handAuthored = and(inSet<string>('color', ['red']), inSet<string>('varietal', ['Merlot']));

		expect(deriveSelectedPresetIds(throughShareLink(handAuthored))).toEqual([]);
	});

	it('reads nothing from a WIRE-SHAPED expression rather than throwing', () => {
		// The shape that would take a whole panel down. An expression crossing a Comlink or HTTP
		// boundary arrives as a structured-clone copy — right `.config`, no prototype — and keying it
		// calls `rule.serialize()`, which a plain object does not have. `createAsyncMirrorRefreshers`
		// rehydrates the expression so this should never be reached in production; it is here because
		// a helper called inside a reactive derivation must not be able to THROW. A throw there is not
		// a caught error anywhere, it is a panel that silently stops updating.
		const wireShaped = JSON.parse(JSON.stringify(buildPreset('bold-reds').serialize())) as CompositeRule;

		expect(() => deriveSelectedPresetIds(wireShaped)).not.toThrow();
		expect(deriveSelectedPresetIds(wireShaped)).toEqual([]);
	});

	it('reads nothing from an OR whose CHILD is wire-shaped', () => {
		// The same guard one level down, which is the level `structuralKey` is called from in a loop.
		// A live `or` wrapping dead children is exactly what a partial rehydration produces.
		const liveOr = or(buildPreset('bold-reds'), buildPreset('crisp-whites'));
		// The cast IS the fixture. `config.rules` is readonly and typed as live rules; this shape exists
		// only at runtime, on a tier where the children crossed a wire and the root did not. Building it
		// honestly through the type system is impossible, which is exactly why the guard is needed.
		const mutableConfig = liveOr.config as unknown as { rules: unknown[] };

		mutableConfig.rules = liveOr.config.rules.map((child) => JSON.parse(JSON.stringify(child.serialize())) as unknown);

		expect(() => deriveSelectedPresetIds(liveOr)).not.toThrow();
		expect(deriveSelectedPresetIds(liveOr)).toEqual([]);
	});
});
