/**
 * `wineCommit` — this app's alias for the shared wine commit helpers.
 *
 * @remarks
 * The implementations live in `@filter-enginez/examples-shared/wine-domain`, shared with the Vue,
 * Angular and vanilla wine routes. `WINE_FACET_RULE_IDS` is the important part — a thirteen-entry list
 * that has to stay in step with the panel; a mismatch shows up as a preset switch that leaves one
 * facet quietly ANDed against the expression.
 *
 * This module is a re-export so the thirteen section components import `./wineCommit`. It is the same
 * seam `booksCommit` uses, one dataset over.
 *
 * `markUserAction` bumps the tracker in `examples-shared/src/wine/engineBusyCore.ts`, and
 * `./wineBusy.ts` binds its Svelte store to that same tracker rather than making its own — see its
 * docblock. Two trackers is the failure mode here, and it is silent.
 *
 * @packageDocumentation
 */

export {
	clearAllFacetRules,
	clearAllWineFilters,
	clearRule,
	commitExpression,
	commitRule,
	commitSelection,
	removeFacet,
	WINE_FACET_RULE_IDS,
	type WineEngineHost,
} from '@filter-enginez/examples-shared/wine-domain';
