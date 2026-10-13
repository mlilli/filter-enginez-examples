/**
 * `ExclusionMap` — the presentational contract for exclusion-aware controls (chip toggles,
 * checkbox lists).
 *
 * @remarks
 * Defined HERE rather than imported from an engine/state package so `@filter-enginez/react-ui`
 * stays free of any engine dependency (the layer rule). It is structurally identical to the map
 * produced by the engine bindings' exclusion hooks (e.g. `react-signals`' `useExclusion` /
 * wine's bundle exclusion), so a container can pass that map straight to these
 * components with no adapter.
 *
 * @packageDocumentation
 */

/**
 * Per-candidate exclusion datum: would selecting this value empty the result set, and how many
 * results would it project to.
 */
export interface ExclusionEntry {
	/** `true` when adding this value to its rule would yield zero results. */
	readonly wouldBeEmpty: boolean;
	/** Projected result count if this value were added. */
	readonly projectedCount: number;
}

/**
 * Map from candidate value → its {@link ExclusionEntry}. Absent keys mean "no exclusion data"
 * (the control renders the value as normally available).
 */
export type ExclusionMap = ReadonlyMap<string, ExclusionEntry>;
